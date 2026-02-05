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

## MCP Tools (28 total)

### Query Tools
| Tool | Description |
|------|-------------|
| `get_session_context` | **Start here** - in-progress tasks, blockers, recent activity |
| `get_project_status` | Overall progress statistics |
| `get_tasks` | List tasks with optional filtering. Accepts `fields` param: `"minimal"` (default), `"standard"`, or `"full"` |
| `get_task` | Full details for a specific task |
| `get_next_task` | Recommended task based on priority |
| `get_blocked_tasks` | All blocked tasks with reasons |
| `get_kanban_board` | Tasks organized by status columns |

#### Field Selection for `get_tasks`

The `fields` parameter controls response size:

| Value | Fields Returned | Use Case |
|-------|-----------------|----------|
| `"minimal"` (default) | id, title, status, priority, story_id | Task selection, listing |
| `"standard"` | + description, task_type, estimate_hours, progress_percent | Task overview |
| `"full"` | All fields including handoff_notes, context_summary, etc. | Detailed inspection |

Using `"minimal"` reduces response size by ~75% compared to `"full"`.

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
| `create_task` | Create new task. Accepts `source` param: `"human"` (default), `"pokayokay-plan"`, `"kaizen-fix"`, `"kaizen-suggest"` |
| `update_task` | Modify task details |
| `archive_task` | Archive task (soft delete) |

### Story Tools
| Tool | Description |
|------|-------------|
| `create_story` | Create new story to organize tasks under |
| `get_story` | Get full details for a specific story |
| `list_stories` | List stories with optional filtering by epic/status |
| `update_story` | Update story fields (title, description, status, epic_id) |

### Epic Tools
| Tool | Description |
|------|-------------|
| `create_epic` | Create new epic to organize stories under |
| `get_epic` | Get full details for a specific epic |
| `get_epics` | List epics with optional filtering by status/priority |
| `update_epic` | Update epic fields (title, description, priority, status) |

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

## Security

The ohno MCP server uses **stdio transport** and has **no built-in authentication**. This is by design — MCP servers running over stdio delegate authentication and access control to the MCP client (e.g., Claude Desktop, Claude Code).

### Key points

- **Local only**: The server communicates exclusively over stdin/stdout. It should never be exposed over a network (HTTP, TCP, etc.).
- **Client responsibility**: The MCP client that spawns this process is responsible for authorizing which users and tools have access.
- **Database file permissions**: The `.ohno/tasks.db` SQLite file should be readable/writable only by the owning user (`chmod 600`). The default location inside your project directory inherits your project's file permissions.
- **No secrets in task data**: Avoid storing credentials, API keys, or other secrets in task descriptions, handoff notes, or activity logs.

### What this means in practice

Any process that can connect to the server's stdio can read, create, modify, and delete all tasks. Since the server is designed to be spawned by an MCP client as a child process, this is expected — the client controls who can interact with it. If you are building a custom integration, ensure you do not expose the server's stdio to untrusted processes.

## Environment Variables

- `OHNO_DB_PATH` - Path to tasks.db (default: walks up to find `.ohno/tasks.db`)

## License

MIT
