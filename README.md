# Kanban CLI

A standalone CLI tool for visualizing and serving a kanban board from SQLite databases.

```
$ kanban serve
Syncing...
Loaded 45 tasks (37.5% done)

Kanban board ready!
  URL: http://localhost:3333/kanban.html
  Auto-refreshes when tasks.db changes
  Press Ctrl+C to stop
```

## Features

- **Zero dependencies** - Pure Python stdlib, no pip install needed
- **Single file** - Copy anywhere and run
- **Live reload** - Watches `tasks.db` for changes, auto-regenerates HTML
- **Self-contained HTML** - No external assets, works offline
- **Machine-readable output** - JSON mode for scripting and CI/CD
- **Works from any subdirectory** - Finds `.claude/` by walking up

## Installation

### Option 1: pipx (Recommended)
```bash
pipx install kanban-cli
kanban serve
```

### Option 2: Single file script
```bash
curl -o ~/.local/bin/kanban https://raw.githubusercontent.com/YOUR_USERNAME/kanban-cli/main/kanban.py
chmod +x ~/.local/bin/kanban
kanban serve
```

### Option 3: Copy to project
```bash
cp kanban.py .claude/
python .claude/kanban.py serve
```

## Quick Start

```bash
# Initialize project structure
kanban init

# Start the server (opens http://localhost:3333/kanban.html)
kanban serve

# One-time sync (for CI/CD)
kanban sync

# Check project status
kanban status
```

## Commands

### `kanban serve`

Start HTTP server with file watching.

```bash
kanban serve                    # Default: localhost:3333
kanban serve --port 8080        # Custom port
kanban serve --host 0.0.0.0     # Allow network access
```

| Flag | Short | Description |
|------|-------|-------------|
| `--port` | `-p` | Port to listen on (default: 3333) |
| `--host` | `-H` | Host to bind to (default: 127.0.0.1) |

### `kanban sync`

One-time sync of `tasks.db` to `kanban.html`.

```bash
kanban sync                     # Generate HTML
kanban sync --json              # Output stats as JSON
```

### `kanban status`

Show project statistics.

```bash
kanban status                   # Human-readable
kanban status --json            # Machine-readable
```

Example output:
```
PROJECT STATUS
========================================
Project: My Project

Tasks
  Total:       120
  Done:        45 (37.5%)
  In Progress: 12
  Review:      5
  Blocked:     3
  To Do:       55

Epics
  Total: 8
  P0:    2
  P1:    4

Stories
  Total: 24
  Done:  10
```

### `kanban init`

Initialize `.claude/` folder structure.

```bash
kanban init                     # Create .claude/ folder
kanban init --force             # Overwrite existing
```

Creates:
```
.claude/
├── sessions/
├── checkpoints/
└── kanban.html
```

## Global Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--quiet` | `-q` | Suppress non-error output |
| `--json` | `-j` | Output in JSON format |
| `--no-color` | | Disable colored output |
| `--dir` | `-d` | Override project directory |
| `--version` | `-V` | Show version |
| `--help` | `-h` | Show help |

## Environment Variables

```bash
KANBAN_PORT=3333           # Default port
KANBAN_HOST=127.0.0.1      # Default host
KANBAN_DIR=/path/to/project # Override directory discovery
KANBAN_WATCH_INTERVAL=1.0  # File watch interval (seconds)
KANBAN_NO_COLOR=1          # Disable colored output
NO_COLOR=1                 # Standard no-color env var
```

## Database Schema

The tool expects a SQLite database (`tasks.db`) with these tables:

```sql
projects (id, name, ...)
epics    (id, title, priority, audit_level, ...)
stories  (id, epic_id, title, status, ...)
tasks    (id, story_id, title, status, task_type, estimate_hours, ...)
```

Task statuses: `todo`, `in_progress`, `review`, `done`, `blocked`

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Usage error |
| 3 | Configuration error (.claude/ not found) |
| 4 | Database error (tasks.db not found/corrupted) |
| 5 | Network error (port in use) |

## CI/CD Integration

```yaml
# GitHub Actions example
- name: Generate kanban board
  run: |
    python kanban.py sync --quiet

- name: Check project status
  run: |
    python kanban.py status --json > status.json
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and rationale.

Key design principles:
- **Read-only visualization** - Skills own the database, kanban only reads
- **Database as integration boundary** - Clean contract between components
- **Convention over configuration** - Works out of the box

## Development

```bash
# Run from source
python kanban.py serve

# Run tests (coming soon)
python -m pytest tests/

# Type check (coming soon)
python -m mypy kanban.py
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

Please read [ARCHITECTURE.md](ARCHITECTURE.md) before contributing to understand the design decisions.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related Projects

This tool is designed to work with:
- **prd-analyzer** - Parse PRDs and create tasks
- **product-manager** - Manage product requirements
- **project-harness** - Orchestrate development sessions

All these tools write to `tasks.db`, and kanban visualizes the results.
