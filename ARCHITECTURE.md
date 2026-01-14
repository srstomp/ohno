# Kanban CLI Architecture

This document captures the architectural decisions for the kanban board CLI tool.

## Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   prd-analyzer  │     │ product-manager │     │ project-harness │
│   (skill)       │     │   (skill)       │     │    (skill)      │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │ write
                                 ▼
                    ┌─────────────────────────┐
                    │    .claude/tasks.db     │
                    │   (SQLite database)     │
                    └────────────┬────────────┘
                                 │ read (watch)
                                 ▼
                    ┌─────────────────────────┐
                    │      kanban.py          │
                    │   (this CLI tool)       │
                    └────────────┬────────────┘
                                 │ generate
                                 ▼
                    ┌─────────────────────────┐
                    │   .claude/kanban.html   │
                    │  (self-contained board) │
                    └─────────────────────────┘
```

## Key Decisions

### 1. Standalone CLI vs Embedded in Skills

**Decision: Standalone CLI**

**Rationale:**
- **Single Responsibility**: Skills focus on task management, kanban focuses on visualization
- **Unix Philosophy**: Do one thing well
- **Clean Integration Boundary**: Database acts as implicit contract between producers (skills) and consumers (kanban)
- **Eliminates Duplication**: No need for sync logic in each skill
- **Independent Testing**: Can test visualization without skill dependencies

**Trade-off Accepted:** Requires separate installation/invocation, but this is minimal friction.

### 2. Language Choice

**Decision: Python (stdlib-only)**

**Rationale:**
| Criterion | Python | Node | Go | Rust |
|-----------|--------|------|-----|------|
| Distribution | 8/10 | 9/10 | 10/10 | 10/10 |
| Contribution | 10/10 | 8/10 | 6/10 | 4/10 |
| Dependencies | 10/10 | 7/10 | 8/10 | 8/10 |
| Developer Experience | 10/10 | 7/10 | 6/10 | 4/10 |
| Ecosystem Fit | 9/10 | 8/10 | 7/10 | 6/10 |
| Implementation Cost | 10/10 | 5/10 | 3/10 | 2/10 |
| **Total** | **57/60** | 44/60 | 40/60 | 34/60 |

**Key factors:**
- stdlib-only implementation is the holy grail - no dependencies
- Target audience (Claude Code users) are Python-literate
- Similar tools (Aider) prove Python works well in this space
- Modern tooling (pipx, uv) solves distribution challenges

**Future consideration:** If scale demands (100k+ users), evaluate Go for single-binary distribution.

### 3. Watch vs On-Demand Sync

**Decision: Support both modes**

| Mode | Use Case | Implementation |
|------|----------|----------------|
| `serve` (watch) | Active development | HTTP server + file watcher |
| `sync` | CI/CD, scripting | One-time generation |
| `status` | Quick check | Read-only query |

**Technical approach:**
- Polling-based file watching (1 second interval)
- Portable across all platforms
- HTML auto-refresh via timestamp comparison

### 4. Scope Boundaries

**In Scope:**
- Kanban HTML visualization
- Database watching and syncing
- HTTP serving with live reload
- Project statistics (status command)
- JSON export for programmatic access
- Initialization of .claude/ structure

**Out of Scope (intentionally):**
- Task CRUD operations (skills own this)
- Git hooks auto-installation (user configuration)
- Database migrations (skills own schema)
- Authentication/multi-user (not needed)
- Configuration file parsing (env vars + flags sufficient)

**Rationale for CRUD exclusion:**
```
Skills ──write──> tasks.db ──read──> kanban.py  ✓ Correct

Skills ──write──> tasks.db <──write── kanban.py  ✗ Bidirectional coupling
```

### 5. Directory Discovery

**Decision: Walk-up search with override**

```
Priority (highest to lowest):
1. --dir /explicit/path argument
2. KANBAN_DIR environment variable
3. Walk up from cwd to find .claude/
4. Default to ./.claude if nothing found
```

**Rationale:** Follows git's model for finding `.git/`. Works from any subdirectory.

### 6. Configuration Strategy

**Decision: Minimal configuration, convention over configuration**

```
Priority (lowest to highest):
1. Built-in defaults
2. Environment variables (KANBAN_*)
3. Command-line flags
```

**No config file by design:**
- Over-engineering for current scope
- Environment variables are 12-factor compliant
- Works well in containerized/CI environments
- Power users understand env vars

**Environment variables:**
```bash
KANBAN_PORT=3333           # HTTP server port
KANBAN_DIR=/path           # Override directory discovery
KANBAN_WATCH_INTERVAL=1.0  # Polling interval
KANBAN_NO_COLOR=1          # Disable colored output
```

### 7. Security Considerations

| Concern | Mitigation |
|---------|------------|
| XSS in task titles | HTML escaping via `esc()` function |
| SQL injection | No user input to SQL (read-only) |
| Path traversal | HTTP server restricted to .claude/ |
| Network exposure | Bind to 127.0.0.1 by default |

**Critical fix applied:** Default bind to localhost only, not all interfaces.

## CLI Interface

### Commands

```
kanban [command] [flags]
├── serve     Start server + watcher (default)
├── sync      One-time sync
├── status    Show project statistics
├── init      Initialize .claude/ folder
└── version   Show version information
```

### Global Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--help` | `-h` | Show help |
| `--version` | | Show version |
| `--quiet` | `-q` | Suppress non-error output |
| `--json` | `-j` | Output in JSON format |
| `--dir` | `-d` | Project directory |
| `--no-color` | | Disable colored output |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Usage error |
| 3 | Configuration error |
| 4 | Database error |
| 5 | Network error |

### Error Message Pattern

```
Error: [What happened]

Context:
  [Why it might have happened]

Suggestions:
  1. [How to fix it]
  2. [Alternative approach]
```

## Database Schema Contract

The tool expects this schema from skills:

```sql
projects     (id, name, ...)
epics        (id, title, priority, audit_level, ...)
stories      (id, epic_id, title, status, ...)
tasks        (id, story_id, title, status, task_type, estimate_hours, ...)
dependencies (...)
```

Skills must maintain backward compatibility with this schema.

## Distribution Strategy

**Primary: PyPI + pipx**
```bash
pipx install kanban-cli
kanban serve
```

**Alternative: Single-file script**
```bash
curl -o ~/.local/bin/kanban https://raw.githubusercontent.com/.../kanban.py
chmod +x ~/.local/bin/kanban
```

**Alternative: Copy to project**
```bash
cp kanban.py .claude/
python .claude/kanban.py serve
```

## Future Considerations

### v1.0 (Current)
- Core serve/sync/status/init commands
- JSON output format
- Environment variable configuration
- Localhost-only binding

### v2.0 (Future)
- `--format` flag for multiple output formats (json, yaml, csv, markdown)
- WebSocket for real-time updates (replaces polling)
- Platform-native file watching (inotify/FSEvents)
- Shell completion generation
- Docker image

### Out of Scope (Forever)
- Task CRUD operations
- Git hooks auto-installation
- Database migrations
- Multi-user/authentication