# Ohno Architecture

This document describes the architecture and design decisions for the Ohno task management system.

## Overview

Ohno is a TypeScript monorepo providing task management for AI agent workflows with multiple integration options.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   prd-analyzer  │     │ product-manager │     │ project-harness │
│     (skill)     │     │     (skill)     │     │     (skill)     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │ write via MCP/CLI
                                 ▼
                    ┌─────────────────────────┐
                    │    .ohno/tasks.db       │
                    │   (SQLite database)     │
                    └────────────┬────────────┘
                                 │ read + watch
                                 ▼
                    ┌─────────────────────────┐
                    │   ohno serve (CLI)      │
                    │   HTTP + file watcher   │
                    └────────────┬────────────┘
                                 │ generate
                                 ▼
                    ┌─────────────────────────┐
                    │   .ohno/kanban.html     │
                    │  (self-contained board) │
                    └─────────────────────────┘
```

## Key Decisions

### 1. Monorepo Architecture

**Decision: TypeScript monorepo with shared core package**

**Structure:**
```
packages/
├── ohno-core/       # Shared database layer (better-sqlite3)
├── ohno-mcp/        # MCP server (19 tools)
└── ohno-cli/        # CLI tool (17 commands)
```

**Rationale:**
- **Code Reuse**: Database logic shared across MCP server and CLI
- **Type Safety**: TypeScript ensures type consistency across packages
- **Maintainability**: Single codebase, unified build system (Turborepo)
- **NPM Publishing**: Each package published independently to npm
- **Testability**: Shared test infrastructure (Vitest workspace)

**Packages:**

| Package | Description | Published As | Dependencies |
|---------|-------------|--------------|--------------|
| `ohno-core` | SQLite database layer, schema, utilities | `@stevestomp/ohno-core` | better-sqlite3 |
| `ohno-mcp` | MCP server for Claude Code | `@stevestomp/ohno-mcp` | @modelcontextprotocol/sdk, zod, ohno-core |
| `ohno-cli` | CLI + HTTP server + kanban generator | `@stevestomp/ohno-cli` | commander, chokidar, ohno-core |

### 2. Language and Runtime Choice

**Decision: Node.js + TypeScript**

**Rationale:**
| Criterion | Rating | Notes |
|-----------|--------|-------|
| Distribution | 9/10 | NPM + npx provides zero-install experience |
| Type Safety | 10/10 | Full type checking across packages |
| Ecosystem | 10/10 | Rich ecosystem (Commander, Chokidar, better-sqlite3) |
| MCP Support | 10/10 | Official MCP SDK available for TypeScript |
| Cross-Platform | 10/10 | Works on macOS, Linux, Windows |
| Developer Experience | 9/10 | Excellent tooling (tsc, Vitest, tsx) |

**Key factors:**
- MCP SDK officially supports TypeScript/Node.js
- better-sqlite3 provides native performance with Node.js bindings
- Commander.js simplifies CLI development
- Chokidar provides cross-platform file watching
- Zero-install via `npx @stevestomp/ohno-cli` and `npx @stevestomp/ohno-mcp`

**Previous implementation:** Python (stdlib-only) - rewritten to TypeScript in v0.5.0 for MCP support and better ecosystem integration.

### 3. Database Layer (ohno-core)

**Decision: SQLite via better-sqlite3 with shared schema**

**Exports:**
- `TaskDatabase` class (CRUD operations)
- Type definitions (Task, TaskActivity, ProjectStatus, etc.)
- Utility functions (findOhnoDir, generateTaskId, etc.)
- Schema constants (CREATE_* SQL statements)

**Key Features:**
- Synchronous API (better-sqlite3) - simpler than async
- Automatic schema migration (adds columns if missing)
- Transaction support for consistency
- Prepared statements for performance
- Type-safe query results

**Schema tables:**
```sql
projects              -- Root container
epics                 -- High-level features (P0-P3 priority)
stories               -- User stories under epics
tasks                 -- Individual work items
task_activity         -- Activity log (audit trail)
task_files            -- Associated files
task_dependencies     -- Task relationships (blocks, requires, relates_to)
```

**Design Philosophy:**
- Read-only for visualizations (ohno-cli serve/sync)
- Read-write for task management (ohno-mcp, ohno-cli CRUD)
- Skills write via MCP tools or CLI commands
- Database acts as source of truth

### 4. MCP Server (ohno-mcp)

**Decision: Model Context Protocol server with 19 tools**

**Tool Categories:**

| Category | Tools | Purpose |
|----------|-------|---------|
| **Query** | get_project_status, get_session_context, get_tasks, get_task, get_next_task, get_blocked_tasks | Read task state |
| **Status Updates** | update_task_status, update_task_progress, set_blocker, resolve_blocker | Track progress |
| **Activity Logging** | add_task_activity, set_handoff_notes, summarize_task_activity | Session continuity |
| **CRUD** | create_task, update_task, archive_task | Manage tasks |
| **Dependencies** | add_dependency, remove_dependency, get_task_dependencies | Task relationships |

**Key Features:**
- Zod schema validation for all tool parameters
- Automatic database discovery (walks up to find `.ohno/`)
- Rich return types with joined epic/story info
- Error handling with descriptive messages

**Usage:**
```json
{
  "mcpServers": {
    "ohno": {
      "command": "npx",
      "args": ["@stevestomp/ohno-mcp"]
    }
  }
}
```

### 5. CLI Tool (ohno-cli)

**Decision: Commander.js CLI with 17 commands**

**Command Categories:**

| Category | Commands | Purpose |
|----------|----------|---------|
| **Visualization** | serve, sync, status, init | Kanban board + setup |
| **Task Management** | tasks, task, create, start, done, review, block, unblock | CRUD operations |
| **Dependencies** | dep add, dep rm, dep list | Relationship management |
| **AI Agent** | context, next | Session continuity |

**Key Features:**
- `--json` flag on all commands for machine parsing
- Global `--no-color` and `--dir` flags
- Exit codes for CI/CD integration (0=success, 1=error)
- Colored output with chalk (respects NO_COLOR env var)
- Automatic directory discovery (walks up to find `.ohno/`)

**HTTP Server (serve command):**
- Express-based HTTP server on port 3333 (configurable)
- Serves self-contained HTML (inline CSS/JS)
- File watcher (chokidar) monitors tasks.db changes
- Auto-regenerates kanban.html on change
- Live reload via client-side polling

**Distribution:**
```bash
# Zero install
npx @stevestomp/ohno-cli serve

# Global install
npm install -g @stevestomp/ohno-cli
ohno serve
```

### 6. Build System

**Decision: Turborepo + TypeScript compiler**

**Build Pipeline:**
```
turbo build
  → ohno-core (tsc)    # Builds first (dependency)
    → ohno-mcp (tsc)   # Uses ohno-core types
    → ohno-cli (tsc)   # Uses ohno-core types
```

**Configuration:**
- `turbo.json`: Task dependencies and caching
- `tsconfig.json`: Per-package TypeScript config
- `vitest.workspace.ts`: Shared test configuration
- `package.json`: Workspace management (npm workspaces)

**Scripts:**
- `npm run build`: Build all packages
- `npm run test`: Run all tests
- `npm run clean`: Remove build artifacts
- `npm run dev`: Development mode (tsx)

### 7. Directory Discovery

**Decision: Walk-up search with override**

```
Priority (highest to lowest):
1. --dir /explicit/path argument (CLI)
2. OHNO_DIR environment variable (both)
3. Walk up from cwd to find .ohno/
4. Error if not found (suggest 'ohno init')
```

**Rationale:** Follows git's model for finding `.git/`. Works from any subdirectory.

**Implementation:** `findOhnoDir()` in ohno-core/utils.ts

### 8. Configuration Strategy

**Decision: Minimal configuration, convention over configuration**

```
Priority (lowest to highest):
1. Built-in defaults
2. Environment variables (OHNO_*)
3. Command-line flags
```

**Environment variables:**
```bash
OHNO_DIR=/path              # Override directory discovery
OHNO_PORT=3333              # HTTP server port
NO_COLOR=1                  # Disable colored output (standard)
```

**No config file by design:**
- Simplicity: Zero-config works out of the box
- 12-factor: Environment variables for configuration
- Portability: Works in CI/CD without setup

### 9. Security Considerations

| Concern | Mitigation |
|---------|------------|
| XSS in task titles | HTML escaping in template generation |
| SQL injection | Prepared statements (better-sqlite3) |
| Path traversal | HTTP server restricted to .ohno/ directory |
| Network exposure | Bind to 127.0.0.1 by default (localhost only) |
| Dependency vulnerabilities | Regular npm audit, pinned versions |

**Critical:** Server binds to localhost by default. Use `--host 0.0.0.0` for network access.

### 10. Scope Boundaries

**In Scope:**
- Task CRUD via MCP tools and CLI
- Kanban HTML visualization
- Database watching and live reload
- HTTP serving with CORS support
- Project statistics and reporting
- JSON output for programmatic access
- Initialization of .ohno/ structure
- Session context for AI continuity

**Out of Scope:**
- Authentication/authorization (local-only tool)
- Real-time WebSocket updates (uses polling)
- Multi-project management (one .ohno per project)
- Git hooks auto-installation (user configuration)
- Cloud sync/backup (local-first)
- Web-based editing (read-only visualization)

**Design Principle:**
```
Skills ──write──> tasks.db ──read──> kanban board  ✓ Correct
Skills ──write──> tasks.db <──write── kanban board  ✗ Bidirectional coupling
```

CLI commands provide write access for human users and agents, but the visual board remains read-only.

## Database Schema

### Core Schema (v1.0+)

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE epics (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'P2',    -- P0, P1, P2, P3
  status TEXT DEFAULT 'todo',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  epic_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  story_id TEXT,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'todo',           -- todo, in_progress, review, done, blocked
  task_type TEXT,                       -- feature, bug, chore, spike, test
  estimate_hours REAL,

  -- Extended fields (v0.5+)
  description TEXT,
  context_summary TEXT,                 -- AI-generated context
  working_files TEXT,                   -- Comma-separated file paths
  blockers TEXT,                        -- Blocker description
  handoff_notes TEXT,                   -- Notes for next session
  progress_percent INTEGER DEFAULT 0,   -- 0-100
  actual_hours REAL,
  created_at TEXT,
  updated_at TEXT,
  created_by TEXT,
  activity_summary TEXT                 -- Summarized activity log
);
```

### Extended Schema (v0.5+)

```sql
CREATE TABLE task_activity (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  activity_type TEXT,        -- note, file_change, decision, progress
  description TEXT,
  old_value TEXT,
  new_value TEXT,
  actor TEXT,
  created_at TEXT
);

CREATE TABLE task_files (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,            -- created, modified, referenced
  created_at TEXT
);

CREATE TABLE task_dependencies (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  dependency_type TEXT DEFAULT 'blocks',  -- blocks, requires, relates_to
  created_at TEXT
);
```

### Indexes

```sql
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_story_id ON tasks(story_id);
CREATE INDEX idx_task_activity_task_id ON task_activity(task_id);
CREATE INDEX idx_task_files_task_id ON task_files(task_id);
CREATE INDEX idx_task_deps_task_id ON task_dependencies(task_id);
```

## Distribution Strategy

**Primary: NPM + npx**
```bash
# Zero install (recommended)
npx @stevestomp/ohno-cli serve
npx @stevestomp/ohno-mcp

# Global install
npm install -g @stevestomp/ohno-cli
ohno serve

# Local project install
npm install @stevestomp/ohno-cli
npx ohno serve
```

**MCP Server:**
- Installed via Claude Code settings
- Runs as subprocess communicating via stdio
- Automatic database discovery

**Publishing:**
- Packages published to npm under @stevestomp scope
- Semantic versioning (v0.5.x currently)
- Automated via GitHub Actions (future)

## Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Development mode (auto-rebuild)
npm run dev

# Clean build artifacts
npm run clean
```

### Testing Strategy

- **Unit tests**: Core database operations (db.test.ts)
- **Integration tests**: CLI commands (cli.test.ts), MCP server (server.test.ts)
- **Test framework**: Vitest (fast, ESM-native)
- **Coverage**: Focus on ohno-core (shared logic)

### Publishing Checklist

1. Run tests: `npm run test`
2. Build packages: `npm run build`
3. Update version: `npm version patch/minor/major`
4. Publish to npm: `npm publish --workspace packages/ohno-*`
5. Tag release: `git tag v0.5.x && git push --tags`

## Future Considerations

### Planned Features (v1.0)

- [ ] GitHub Actions workflow for automated publishing
- [ ] Better error messages with suggestions
- [ ] Progress bars for long operations
- [ ] Filtering in kanban board UI
- [ ] Drag-and-drop task reordering

### Possible Enhancements (v2.0+)

- [ ] WebSocket support for real-time updates (replaces polling)
- [ ] Plugin system for custom task types
- [ ] Export to multiple formats (CSV, JSON, Markdown)
- [ ] Import from Jira/Linear/GitHub Issues
- [ ] Native file watching (inotify/FSEvents) for faster updates
- [ ] Docker image for containerized deployment

### Out of Scope (Forever)

- Multi-user/authentication (local-first tool)
- Cloud sync/hosting (use git for sync)
- Complex project management (Gantt charts, resource allocation)
- Time tracking integration (use dedicated tools)

## Version History

- **v0.5.x** (Current): TypeScript rewrite, MCP server, monorepo
- **v0.4.x**: Python implementation (deprecated)
- **v0.1.x**: Initial Python prototype

## Contributing

See main README for contribution guidelines. Key points:

- Use TypeScript strict mode
- Write tests for new features
- Follow existing code style
- Update ARCHITECTURE.md for design decisions
