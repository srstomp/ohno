```
 ██████╗ ██╗  ██╗███╗   ██╗ ██████╗
██╔═══██╗██║  ██║████╗  ██║██╔═══██╗
██║   ██║███████║██╔██╗ ██║██║   ██║
██║   ██║██╔══██║██║╚██╗██║██║   ██║
╚██████╔╝██║  ██║██║ ╚████║╚██████╔╝
 ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝

  Task Management for AI Workflows
```

> *Named after [Taiichi Ohno](https://en.wikipedia.org/wiki/Taiichi_Ohno), the father of the Toyota Production System and inventor of Kanban.*

**Ohno enables session continuity across context compaction, new sessions, and agent handoffs.**

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/srstomp/ohno)

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

## Features

### Core Capabilities

| Feature | Description | Technical Details |
|---------|-------------|-------------------|
| **Multi-Channel Access** | Access task state via MCP tools, CLI commands, or visual board | MCP server (36 tools), CLI (26 commands), HTTP server with live reload |
| **Session Continuity** | Survive context compaction and session boundaries | Persistent SQLite database with handoff notes, context summaries, and activity logs |
| **Zero Installation** | Run without install via npx | Published to npm as `@stevestomp/ohno-cli` and `@stevestomp/ohno-mcp` |
| **No Native Dependencies** | Works on any Node.js version without build tools | Pure JavaScript SQLite (sql.js/WebAssembly) - no compilation required |
| **Live Visualization** | Real-time kanban board with edit/delete support | File watcher + self-contained HTML with inline JavaScript |
| **Universal Compatibility** | Works with any AI agent or human | Shell-accessible CLI, MCP protocol, and browser-based UI |

### Task Management

| Feature | Description | Technical Details |
|---------|-------------|-------------------|
| **Rich Task Model** | Epics → Stories → Tasks hierarchy | SQLite schema with projects, epics, stories, tasks, dependencies |
| **Status Tracking** | Track task lifecycle states | Supported states: todo, in_progress, review, done, blocked |
| **Blocker Management** | Record and resolve blockers | Dedicated blocker field with reason tracking |
| **Progress Tracking** | Granular progress reporting | Percentage-based progress (0-100%) with estimate vs actual hours |
| **Priority System** | Task prioritization and smart suggestions | P0-P3 priority levels with get_next_task() recommendation |
| **Dependency Tracking** | Model task dependencies | task_dependencies table with blocks/requires/related types |
| **Activity Logging** | Complete audit trail | task_activity table tracks status changes, notes, file modifications |
| **File Association** | Link tasks to working files | task_files table tracks created/modified/referenced files |

### Developer Experience

| Feature | Description | Technical Details |
|---------|-------------|-------------------|
| **TypeScript Monorepo** | Type-safe, maintainable codebase | Turborepo with shared `@stevestomp/ohno-core` package |
| **JSON Output** | Machine-readable output for scripts | All CLI commands support `--json` flag |
| **Context Recovery** | Resume work after interruptions | `get_session_context()` returns in-progress tasks, blockers, handoff notes |
| **Handoff Notes** | Leave notes for next agent/session | Markdown-formatted notes stored per task |
| **Smart Defaults** | Works out of the box | Convention over configuration, walks up to find `.ohno/` |
| **Cross-Platform** | Works on macOS, Linux, Windows | Node.js-based, uses cross-platform file watching (chokidar) |

### Integration

| Feature | Description | Technical Details |
|---------|-------------|-------------------|
| **MCP Native** | First-class Claude Code integration | Implements Model Context Protocol with 36 tools |
| **GitHub Actions** | Ready for CI/CD | Install script via `/install-github-app` command |
| **CLI Automation** | Scriptable task management | Shell commands with exit codes and JSON output |
| **Local-First** | No cloud dependencies | SQLite database in `.ohno/tasks.db` |
| **Self-Contained UI** | No external assets needed | Inline CSS/JS in generated HTML |

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
| `get_tasks(status?, priority?, fields?)` | List tasks with filtering. `fields`: `"minimal"` (default), `"standard"`, `"full"` |
| `get_task(task_id, fields?)` | Task details. `fields`: `"minimal"`, `"standard"` (default), `"full"` |
| `get_next_task()` | Recommended task based on priority |
| `get_next_batch(batch_size?)` | Batch of ready tasks (1-5, default 3). Includes rework tasks with failure context |
| `get_blocked_tasks()` | All blocked tasks with reasons |
| `get_kanban_board(include_done?, limit_per_column?)` | Tasks organized by status columns |

### Update Tools

| Tool | Description |
|------|-------------|
| `update_task_status(task_id, status)` | Change status (todo/in_progress/review/done/blocked). Returns boundary metadata when completing tasks. |
| `update_task_progress(task_id, percent)` | Update completion percentage |
| `set_handoff_notes(task_id, notes)` | Leave notes for next session |
| `add_task_activity(task_id, type, desc)` | Log activity (note/decision/progress) |
| `set_blocker(task_id, reason)` | Mark task as blocked |
| `resolve_blocker(task_id)` | Clear blocker, resume work |
| `set_needs_rework(task_id, value)` | Mark task for rework or clear the flag |
| `update_task_wip(task_id, wip_data)` | Update work-in-progress metadata |
| `record_task_failure(task_id, failure_type, reason)` | Record failure for pattern learning |

### Completion Boundaries

When marking a task as `done` or `archived`, `update_task_status` returns boundary metadata indicating if the task's story or epic was also completed:

```json
{
  "success": true,
  "boundaries": {
    "story_completed": true,
    "epic_completed": false,
    "story_id": "S-45",
    "epic_id": "E-12"
  }
}
```

This enables Claude Code hooks to trigger appropriate actions at different lifecycle points:
- **Post-task**: sync, commit
- **Post-story**: sync, commit, test, mini-audit
- **Post-epic**: sync, commit, full audit

See [pokayokay](https://github.com/srstomp/pokayokay) for hook integration examples.

### CRUD Tools

| Tool | Description |
|------|-------------|
| `create_epic(title, priority?, description?)` | Create a new epic |
| `get_epic(epic_id)` | Get epic details |
| `get_epics(status?, priority?)` | List epics with filtering |
| `update_epic(epic_id, ...)` | Update epic fields |
| `create_story(title, epic_id?, description?)` | Create a new story to organize tasks under |
| `get_story(story_id)` | Get story details |
| `list_stories(epic_id?, status?)` | List stories with filtering |
| `update_story(story_id, ...)` | Update story fields |
| `create_task(title, story_id?, source?, ...)` | Create new task with optional source tracking |
| `update_task(task_id, ...)` | Modify task details |
| `archive_task(task_id, reason)` | Archive task no longer needed |

### Dependency Tools

| Tool | Description |
|------|-------------|
| `add_dependency(task_id, depends_on_task_id)` | Create dependency between tasks |
| `remove_dependency(task_id, depends_on_task_id)` | Remove dependency |
| `get_task_dependencies(task_id)` | List dependencies with blocking status |

### Activity & Handoff Tools

| Tool | Description |
|------|-------------|
| `summarize_task_activity(task_id)` | Summarize activity to reduce context size |
| `set_task_handoff(task_id, status, summary)` | Store handoff data from a subagent |
| `get_task_handoff(task_id, include_details?)` | Retrieve task handoff data |
| `compact_story_handoffs(story_id)` | Compact handoffs for a completed story |
| `delete_epic_handoffs(epic_id)` | Delete handoffs for a completed epic |

#### Task Source Tracking

The `source` parameter on `create_task` tracks task origin:

| Source Value | Description |
|--------------|-------------|
| `human` | Created manually by a human (default) |
| `pokayokay-plan` | Created by pokayokay planner from acceptance criteria |
| `kaizen-fix` | Created by kaizen auto-fix system |
| `kaizen-suggest` | Created by kaizen suggestion system |

**Example:**
```bash
# CLI with --source flag
ohno create "Fix memory leak" --source kaizen-fix

# MCP tool call (uses named parameters)
# create_task({ title: "Fix bug", source: "kaizen-fix" })

# Defaults to "human" if source not specified
ohno create "Add authentication"
```

This enables filtering and analytics on how tasks enter the system, particularly useful for tracking AI-generated work.

## CLI Reference

### Visualization Commands

```bash
ohno serve              # Start visual board server
ohno serve --port 8080  # Custom port
ohno kanban             # Display kanban board in terminal
ohno kanban --watch     # Live updating terminal kanban
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
ohno create "Fix the bug"                    # Create new task (defaults to source: human)
ohno create "Fix bug" --source kaizen-fix    # Create task with source tracking
ohno start task-abc                          # Start working (-> in_progress)
ohno done task-abc                           # Mark complete (-> done)
ohno review task-abc                         # Mark for review
ohno block task-abc "reason"                 # Set blocker
ohno unblock task-abc                        # Resolve blocker

# Dependencies
ohno dep add task-b task-a      # task-b depends on task-a
ohno dep rm task-b task-a       # Remove dependency
ohno dep list task-b            # Show dependencies
```

### Epic & Story Commands

```bash
# Epics
ohno epics                          # List all epics
ohno epics -s in_progress -p P0     # Filter by status and priority
ohno epic create "Auth System"      # Create epic
ohno epic get E-abc123              # Get epic details
ohno epic update E-abc --status done  # Update epic
ohno epic delete E-abc              # Delete epic (cascades to stories/tasks)

# Stories
ohno stories                        # List all stories
ohno stories -e E-abc123            # Filter by epic
ohno story create "Login Flow"      # Create story
ohno story get S-abc123             # Get story details
ohno story update S-abc --status done  # Update story
ohno story delete S-abc             # Delete story (cascades to tasks)
```

### AI Agent & Handoff Commands

```bash
ohno context --json                 # Get session context
ohno next --json                    # Get next recommended task
ohno update-wip task-abc '{"key":"value"}'  # Update WIP metadata
ohno set-handoff task-abc PASS "summary"    # Store handoff data
ohno compact-handoffs S-abc         # Compact handoffs for completed story
ohno delete-handoffs E-abc          # Delete handoffs for completed epic
```

### CLI Features

- **Zero install** - `npx @stevestomp/ohno-cli` just works
- **Live reload** - Watches tasks.db, auto-refreshes browser
- **Terminal kanban** - `ohno kanban` for in-terminal board with optional live mode
- **Edit/Delete** - Edit task details or delete tasks directly from the board
- **Self-contained HTML** - No external assets
- **Detail panel** - Click any task for full details, files, activity history
- **JSON output** - All commands support `--json` for machine parsing
- **Full hierarchy** - Manage epics, stories, and tasks via CLI
- **Universal** - Works with any AI agent that has shell access

## Database Schema

All tools share the same SQLite database (`.ohno/tasks.db`):

```sql
-- Core tables
projects (id, name, ...)
epics    (id, title, priority, status, ...)
stories  (id, epic_id, title, status, ...)
tasks    (id, story_id, title, status, task_type, estimate_hours,
          description, context_summary, working_files, blockers,
          handoff_notes, progress_percent, needs_rework,
          work_in_progress, source, ...)

-- Extended tables
task_activity     (id, task_id, activity_type, description, ...)
task_files        (id, task_id, file_path, file_type, ...)
task_dependencies (id, task_id, depends_on_task_id, dependency_type, ...)
task_failures     (id, task_id, failure_type, failure_reason, attempt, ...)
task_handoffs     (task_id, status, summary, files_changed, full_details, ...)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for full schema details.

## Package Structure

```
packages/
├── ohno-core/    # Shared database layer (TypeScript)
├── ohno-mcp/     # MCP server with 36 tools
└── ohno-cli/     # CLI with 26 commands
```

## License

MIT License - see [LICENSE](LICENSE) for details.
