# @stevestomp/ohno-mcp

MCP (Model Context Protocol) server for [Ohno](https://github.com/srstomp/ohno) task management.

Enables AI agents like Claude Code to manage tasks with persistent state across sessions.

## Installation

Add to Claude Code settings (`~/.claude/settings.json`):

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

Or for a specific project (`.claude/settings.local.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "ohno": {
      "command": "npx",
      "args": ["@stevestomp/ohno-mcp"],
      "env": {
        "OHNO_DB_PATH": "/path/to/project/.ohno/tasks.db"
      }
    }
  }
}
```

## MCP Tools (20 total)

### Query Tools
| Tool | Description |
|------|-------------|
| `get_session_context` | **Start here** - in-progress tasks, blockers, recent activity |
| `get_project_status` | Overall progress statistics |
| `get_tasks` | List tasks with optional status/priority filtering |
| `get_task` | Full details for a specific task |
| `get_next_task` | Recommended task based on priority |
| `get_blocked_tasks` | All blocked tasks with reasons |

### Update Tools
| Tool | Description |
|------|-------------|
| `update_task_status` | Change status (todo/in_progress/review/done/blocked) |
| `update_task_progress` | Update completion percentage |
| `set_handoff_notes` | Leave notes for next session |
| `add_task_activity` | Log activity (note/decision/progress) |
| `set_blocker` | Mark task as blocked |
| `resolve_blocker` | Clear blocker, resume work |

### CRUD Tools
| Tool | Description |
|------|-------------|
| `create_story` | Create new story to organize tasks under |
| `create_task` | Create new task, optionally under a story |
| `update_task` | Modify task details |
| `archive_task` | Archive task (soft delete) |

### Dependency Tools
| Tool | Description |
|------|-------------|
| `add_dependency` | Add dependency between tasks |
| `remove_dependency` | Remove dependency |
| `get_task_dependencies` | Get task dependencies |
| `summarize_task_activity` | Summarize activity history |

## Usage in CLAUDE.md

Add to your project's `CLAUDE.md`:

```markdown
## Task Management

### Session Start
Always call `get_session_context()` to see in-progress tasks and handoff notes.

### During Work
- `update_task_status(task_id, "in_progress")` when starting
- `add_task_activity(task_id, "note", "...")` to log progress

### Before Ending
- `set_handoff_notes(task_id, "what's done, what's next")`
- `update_task_progress(task_id, percent)`
```

## Environment Variables

- `OHNO_DB_PATH` - Path to tasks.db (default: walks up to find `.ohno/tasks.db`)

## License

MIT
