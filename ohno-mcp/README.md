# ohno-mcp

> *Named after [Taiichi Ohno](https://en.wikipedia.org/wiki/Taiichi_Ohno), the father of the Toyota Production System and creator of Kanban.*

**MCP server for AI agent task continuity** - enables agents to maintain context across sessions, compaction events, and handoffs.

## The Problem

AI agents lose context. When:
- Context window fills up and compacts
- A new session starts
- One agent hands off to another

The agent forgets what it was working on, what's done, and what's blocked.

## The Solution

`ohno-mcp` provides a persistent task layer that agents can query:

```python
# After context compaction or new session
context = get_session_context()
# → Returns in-progress tasks, blockers, recent activity, suggested next task

# Before ending a session
set_handoff_notes("task-15", "JWT done, need refresh flow. Watch rate limiter.")
update_task_progress("task-15", 60)
# → Persists for next session
```

This enables **session continuity** - agents can pick up exactly where they (or another agent) left off.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Code                             │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    ohno MCP Server                    │   │
│  │                                                       │   │
│  │  get_session_context()  ← Start here after compaction│   │
│  │  get_next_task()        ← What should I work on?     │   │
│  │  update_task_status()   ← Mark done/in_progress      │   │
│  │  set_handoff_notes()    ← Leave notes for next       │   │
│  └───────────────────────────┬──────────────────────────┘   │
│                              │                               │
└──────────────────────────────┼───────────────────────────────┘
                               │ read/write
                  ┌────────────┴────────────┐
                  │    .ohno/tasks.db       │
                  └────────────┬────────────┘
                               │ read
                  ┌────────────┴────────────┐
                  │      kanban.py          │  (human visualization)
                  └─────────────────────────┘
```

## Installation

```bash
pip install ohno-mcp
```

Or install from source:
```bash
cd ohno-mcp
pip install -e .
```

## Configuration

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "ohno": {
      "command": "ohno-mcp",
      "args": []
    }
  }
}
```

Or with explicit database path:
```json
{
  "mcpServers": {
    "ohno": {
      "command": "ohno-mcp",
      "args": ["--db", "/path/to/project/.ohno/tasks.db"]
    }
  }
}
```

## Tools

### Query Tools (Read)

| Tool | Description |
|------|-------------|
| `get_project_status()` | Overall project progress and statistics |
| `get_session_context()` | Context for resuming work (in-progress, blocked, recent activity) |
| `get_tasks(status?, priority?, limit?)` | List tasks with optional filtering |
| `get_task(task_id)` | Full details for a specific task |
| `get_next_task()` | Recommended next task based on priority |
| `get_blocked_tasks()` | All blocked tasks with reasons |

### Update Tools (Write)

| Tool | Description |
|------|-------------|
| `update_task_status(task_id, status, notes?)` | Change task status |
| `add_task_activity(task_id, type, description)` | Log activity on a task |
| `set_handoff_notes(task_id, notes)` | Set notes for next session |
| `update_task_progress(task_id, percent, context?)` | Update completion percentage |
| `set_blocker(task_id, reason)` | Mark task as blocked |
| `resolve_blocker(task_id)` | Clear blocker and resume |

### CRUD Tools (Create/Update/Archive)

| Tool | Description |
|------|-------------|
| `create_task(title, story_id?, type?, description?, estimate?)` | Create a new task |
| `update_task(task_id, title?, description?, type?, estimate?)` | Update task details |
| `archive_task(task_id, reason?)` | Archive task (no longer needed) |

## Usage Patterns

### Session Start / After Compaction

```
Agent: "Let me check what I was working on..."

→ get_session_context()

Response: {
  "in_progress_tasks": [
    {"id": "task-15", "title": "Implement auth", "progress_percent": 60,
     "handoff_notes": "JWT validation done, need refresh flow"}
  ],
  "blocked_tasks": [],
  "suggested_next_task": null
}

Agent: "I'll continue task-15, picking up at the refresh flow..."
```

### Completing a Task

```
Agent: "Auth implementation is complete, marking done..."

→ update_task_status("task-15", "done", notes="Implemented JWT + refresh tokens")
→ get_next_task()

Response: {"id": "task-20", "title": "Add rate limiting", ...}

Agent: "Next I'll work on task-20 for rate limiting..."
```

### Hitting a Blocker

```
Agent: "I need external API docs to continue..."

→ set_blocker("task-20", "Waiting for third-party API documentation")
→ get_next_task()

Response: {"id": "task-21", "title": "Write unit tests", ...}

Agent: "I'll work on tests while waiting for the docs..."
```

### Leaving Handoff Notes

```
Agent: "Session ending, let me leave context for next time..."

→ set_handoff_notes("task-21",
    "Completed auth tests. Next: add rate limiter tests. "
    "Note: mock the Redis client, see tests/conftest.py for pattern"
  )
→ update_task_progress("task-21", 40)
```

## Task Status Flow

```
        ┌───────────────────────────────────────┐
        │                                       │
        ▼                                       │
     ┌──────┐     ┌─────────────┐     ┌────────┴─┐     ┌──────┐
     │ todo │ ──► │ in_progress │ ──► │  review  │ ──► │ done │
     └──────┘     └─────────────┘     └──────────┘     └──────┘
                        │                   │
                        ▼                   │
                   ┌─────────┐              │
                   │ blocked │ ◄────────────┘
                   └─────────┘
                        │
                        │ resolve_blocker()
                        ▼
                   back to in_progress
```

## Database Schema

The MCP server works with the same SQLite database used by:
- `prd-analyzer` (creates tasks from PRDs)
- `project-harness` (orchestrates work sessions)
- `kanban.py` (visualizes tasks)

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the full schema.

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run server in development mode
python -m ohno_mcp.server --db /path/to/tasks.db
```

## Related

- **kanban.py** - Visual kanban board for humans (HTTP server)
- **prd-analyzer** - Parse PRDs and create tasks
- **project-harness** - Orchestrate development sessions

## License

MIT
