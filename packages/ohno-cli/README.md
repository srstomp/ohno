# @stevestomp/ohno-cli

CLI and visual kanban board for [Ohno](https://github.com/srstomp/ohno) task management.

## Installation

```bash
# No install needed - just run
npx @stevestomp/ohno-cli init
npx @stevestomp/ohno-cli serve

# Or install globally
npm install -g @stevestomp/ohno-cli
```

## Quick Start

```bash
# Initialize in your project
ohno init

# Create a task
ohno create "Fix the login bug"

# Start working on it
ohno start task-abc123

# View kanban board
ohno serve
# Open http://localhost:3333/kanban.html
```

## Commands

### Visualization
```bash
ohno serve              # Start visual board server
ohno serve --port 8080  # Custom port
ohno status             # Show project stats
ohno sync               # One-time HTML generation
```

### Task Management
```bash
ohno tasks                      # List all tasks
ohno tasks -s todo              # Filter by status
ohno task <id>                  # Get task details
ohno create "Title"             # Create task
ohno start <id>                 # Start working (→ in_progress)
ohno done <id>                  # Mark complete (→ done)
ohno review <id>                # Mark for review
ohno block <id> "reason"        # Set blocker
ohno unblock <id>               # Resolve blocker
```

### Dependencies
```bash
ohno dep add <task> <depends-on>  # Add dependency
ohno dep rm <task> <depends-on>   # Remove dependency
ohno dep list <task>              # Show dependencies
```

### AI Agent Commands
```bash
ohno context --json    # Get session context
ohno next --json       # Get next recommended task
```

## Kanban Board Features

- **Live reload** - Auto-refreshes when tasks change
- **Edit/Delete** - Edit or delete tasks from the UI
- **Detail panel** - Click any task for full details
- **Filters** - Filter by epic, priority
- **Self-contained** - Single HTML file, no external assets

## Options

All commands support:
- `--json` - Machine-readable JSON output
- `-d, --dir <path>` - Specify project directory

## License

MIT
