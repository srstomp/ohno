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

Ohno provides multiple integration options:

| Tool | Purpose | Consumer |
|------|---------|----------|
| **ohno-mcp** | Query/update task state via MCP | Claude Code |
| **ohno-cli** | Query/update task state via shell | Any AI agent, humans |
| **ohno serve** | Visual kanban board | Humans (via browser) |

```
┌─────────────────────────────────────────────────────────────┐
│                  Any AI Agent                               │
│         (Claude, GPT, Gemini, LangChain, etc.)              │
│                                                             │
│    ┌─────────────────┐         ┌─────────────────┐          │
│    │    ohno-mcp     │         │    ohno-cli     │          │
│    │   (MCP tools)   │         │  (shell cmds)   │          │
│    └────────┬────────┘         └────────┬────────┘          │
│             │                           │                   │
└─────────────┼───────────────────────────┼───────────────────┘
              │                           │
              └─────────────┬─────────────┘
                            │ read/write
               ┌────────────┴────────────┐
               │    .ohno/tasks.db       │
               └────────────┬────────────┘
                            │ read + watch
               ┌────────────┴────────────┐
               │      ohno serve         │  → browser (human)
               └─────────────────────────┘
```

## Quick Start

### For Agents (MCP Server)

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

### For Humans (CLI + Visual Board)

```bash
# No install needed - just run
npx @stevestomp/ohno-cli init
npx @stevestomp/ohno-cli serve
```

Open http://localhost:3333/kanban.html to see your tasks.

### Global Install (optional)

```bash
npm install -g @stevestomp/ohno-cli
ohno serve
```

## Integration Capabilities

| Platform | Integration Method |
|----------|-------------------|
| **Claude Code** | MCP Server (native tools) |
| **Claude Marketplace** | MCP Server (ready to publish) |
| **ChatGPT / GPT-4** | CLI via shell/subprocess |
| **Google Gemini** | CLI via shell/subprocess |
| **Local LLMs** | CLI via shell/subprocess |
| **LangChain / LlamaIndex** | CLI via subprocess wrapper |
| **CI/CD pipelines** | CLI with `--json` output |
| **Human developers** | CLI + visual kanban board |

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
Run `npx @stevestomp/ohno-cli serve` to view tasks at http://localhost:3333/kanban.html
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

## CLI Reference

### Visualization Commands

```bash
ohno serve              # Start visual board server
ohno serve --port 8080  # Custom port
ohno status             # Show project stats
ohno status --json      # Machine-readable output
ohno sync               # One-time HTML generation (for CI/CD)
ohno init               # Initialize .ohno/ folder
```

### Task Management Commands

```bash
# List and view tasks
ohno tasks                      # List all tasks
ohno tasks -s todo              # Filter by status
ohno tasks -p P0 --json         # Filter by priority, JSON output
ohno task task-abc123           # Get full task details

# Task lifecycle
ohno create "Fix the bug"       # Create new task
ohno start task-abc             # Start working (-> in_progress)
ohno done task-abc              # Mark complete (-> done)
ohno review task-abc            # Mark for review
ohno block task-abc "reason"    # Set blocker
ohno unblock task-abc           # Resolve blocker

# Dependencies
ohno dep add task-b task-a      # task-b depends on task-a
ohno dep rm task-b task-a       # Remove dependency
ohno dep list task-b            # Show dependencies

# AI Agent commands (for session continuity)
ohno context --json             # Get session context
ohno next --json                # Get next recommended task
```

### Features

- **Zero install** - `npx @stevestomp/ohno-cli` just works
- **Live reload** - Watches tasks.db, auto-refreshes browser
- **Self-contained HTML** - No external assets
- **Detail panel** - Click any task for full details, files, activity history
- **JSON output** - All commands support `--json` for machine parsing
- **Universal** - Works with any AI agent that has shell access

## Database Schema

All tools share the same SQLite database (`.ohno/tasks.db`):

```sql
-- Core tables
projects (id, name, ...)
epics    (id, title, priority, ...)
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

## Package Structure

```
packages/
├── ohno-core/    # Shared database layer (TypeScript)
├── ohno-mcp/     # MCP server with 19 tools
└── ohno-cli/     # CLI with 14 commands
```

## Related Projects

Ohno is designed to work with Claude Code skills:
- **prd-analyzer** - Parse PRDs and create tasks in tasks.db
- **project-harness** - Orchestrate multi-session development
- **product-manager** - Audit feature completeness

## License

MIT License - see [LICENSE](LICENSE) for details.
