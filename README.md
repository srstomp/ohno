# Ohno

> *Named after [Taiichi Ohno](https://en.wikipedia.org/wiki/Taiichi_Ohno), the father of the Toyota Production System and inventor of Kanban.*

**Task management for AI agent workflows** - enables session continuity across context compaction, new sessions, and agent handoffs.

## The Problem

AI agents lose context. When:
- Context window fills up and gets compacted
- A new session starts
- One agent hands off to another

The agent forgets what it was working on, what's done, and what's blocked.

## The Solution

Ohno provides two tools that share a common task database:

| Tool | Purpose | Consumer |
|------|---------|----------|
| **ohno-mcp** | Query/update task state | AI agents (via MCP) |
| **kanban.py** | Visual kanban board | Humans (via browser) |

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Code                             │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    ohno-mcp                           │   │
│  │                                                       │   │
│  │  get_session_context()  ← Resume after compaction    │   │
│  │  update_task_status()   ← Mark done/in_progress      │   │
│  │  set_handoff_notes()    ← Leave notes for next       │   │
│  └───────────────────────────┬──────────────────────────┘   │
│                              │                               │
└──────────────────────────────┼───────────────────────────────┘
                               │ read/write
                  ┌────────────┴────────────┐
                  │    .ohno/tasks.db       │
                  └────────────┬────────────┘
                               │ read + watch
                  ┌────────────┴────────────┐
                  │      kanban.py          │  → browser (human)
                  └─────────────────────────┘
```

## Quick Start

### For Agents (MCP Server)

Add to Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "ohno": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/srstomp/ohno.git#subdirectory=ohno-mcp", "ohno-mcp"]
    }
  }
}
```

Or install manually:
```bash
pip install git+https://github.com/srstomp/ohno.git#subdirectory=ohno-mcp
```

### For Humans (Visual Board)

```bash
# Download to your project (zero dependencies, single file)
curl -o kanban.py https://raw.githubusercontent.com/srstomp/ohno/master/kanban.py

# Run it
python kanban.py serve
```

Open http://localhost:3333/kanban.html to see your tasks.

### Both Tools Together

```bash
# Clone the repo
git clone https://github.com/srstomp/ohno.git
cd ohno

# Install MCP server
pip install -e ohno-mcp/

# Run visual board
python kanban.py serve
```

## CLAUDE.md Example

Add this to your project's `CLAUDE.md` to enable agent workflow:

```markdown
## Task Management (Ohno)

This project uses Ohno for task tracking across sessions.

### Session Start
Always call `get_session_context()` at session start to:
- See tasks currently in progress
- Check for blocked tasks
- Read handoff notes from previous session
- Get suggested next task

### During Work
- Use `update_task_status(task_id, "in_progress")` when starting a task
- Use `add_task_activity(task_id, "note", "...")` to log decisions/progress
- Use `update_task_progress(task_id, percent)` for incremental progress

### Before Ending Session
Always call before session ends or context compaction:
- `set_handoff_notes(task_id, "what's done, what's next, gotchas")`
- `update_task_progress(task_id, percent)`

### Task Management
- `create_task(title, ...)` - When you discover new work needed
- `archive_task(task_id, reason)` - When a task is no longer needed
- `set_blocker(task_id, reason)` - When blocked on something

### Visual Board
```bash
curl -o kanban.py https://raw.githubusercontent.com/srstomp/ohno/master/kanban.py
python kanban.py serve
```
View tasks at http://localhost:3333/kanban.html
```

## MCP Tools Reference

### Query Tools

| Tool | Description |
|------|-------------|
| `get_session_context()` | **Start here** - in-progress tasks, blockers, recent activity |
| `get_project_status()` | Overall progress statistics |
| `get_tasks(status?, priority?)` | List tasks with filtering |
| `get_task(task_id)` | Full details for a specific task |
| `get_next_task()` | Recommended task based on priority |
| `get_blocked_tasks()` | All blocked tasks with reasons |

### Update Tools

| Tool | Description |
|------|-------------|
| `update_task_status(task_id, status)` | Change status (todo/in_progress/review/done/blocked) |
| `update_task_progress(task_id, percent)` | Update completion percentage |
| `set_handoff_notes(task_id, notes)` | Leave notes for next session |
| `add_task_activity(task_id, type, desc)` | Log activity (note/decision/progress) |
| `set_blocker(task_id, reason)` | Mark task as blocked |
| `resolve_blocker(task_id)` | Clear blocker, resume work |

### CRUD Tools

| Tool | Description |
|------|-------------|
| `create_task(title, ...)` | Create new task discovered during work |
| `update_task(task_id, ...)` | Modify task details |
| `archive_task(task_id, reason)` | Archive task no longer needed |

## Kanban CLI Reference

### Commands

```bash
python kanban.py serve              # Start visual board server
python kanban.py serve --port 8080  # Custom port
python kanban.py status             # Show project stats
python kanban.py status --json      # Machine-readable output
python kanban.py sync               # One-time HTML generation (for CI/CD)
python kanban.py init               # Initialize .ohno/ folder
```

### Features

- **Zero dependencies** - Pure Python stdlib
- **Single file** - Copy anywhere and run
- **Live reload** - Watches tasks.db, auto-refreshes browser
- **Self-contained HTML** - No external assets
- **Detail panel** - Click any task for full details, files, activity history

## Database Schema

Both tools share the same SQLite database (`.ohno/tasks.db`):

```sql
-- Core tables (created by prd-analyzer or other skills)
projects (id, name, ...)
epics    (id, title, priority, audit_level, ...)
stories  (id, epic_id, title, status, ...)
tasks    (id, story_id, title, status, task_type, estimate_hours,
          description, context_summary, working_files, blockers,
          handoff_notes, progress_percent, ...)

-- Extended tables (for activity tracking)
task_activity    (id, task_id, activity_type, description, ...)
task_files       (id, task_id, file_path, file_type, ...)
task_dependencies (id, task_id, depends_on_task_id, ...)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for full schema details.

## Installation Options

| You want... | Install |
|-------------|---------|
| Visual board only | `curl -o kanban.py https://raw.githubusercontent.com/srstomp/ohno/master/kanban.py && python kanban.py serve` |
| Agent continuity only | Add MCP config (see Quick Start) |
| Full experience | Clone repo, install both |

## Related Projects

Ohno is designed to work with Claude Code skills:
- **prd-analyzer** - Parse PRDs and create tasks in tasks.db
- **project-harness** - Orchestrate multi-session development
- **product-manager** - Audit feature completeness

## License

MIT License - see [LICENSE](LICENSE) for details.
