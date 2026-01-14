# ohno-cli

> *Named after [Taiichi Ohno](https://en.wikipedia.org/wiki/Taiichi_Ohno), the father of the Toyota Production System and creator of Kanban.*

**Visual kanban board for humans** - see your tasks in a browser with live updates.

## Installation

```bash
pip install git+https://github.com/srstomp/ohno.git#subdirectory=ohno-cli
```

## Usage

```bash
ohno serve              # Start server + watcher
ohno serve --port 8080  # Use custom port
ohno status             # Show project stats
ohno status --json      # Machine-readable output
ohno init               # Initialize .ohno/ folder
ohno sync               # One-time HTML generation
```

Open http://localhost:3333/kanban.html to see your tasks.

## Features

- **Zero dependencies** - Pure Python stdlib
- **Live reload** - Watches tasks.db, auto-refreshes browser
- **Self-contained HTML** - No external assets
- **Detail panel** - Click any task for full details, files, activity history

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OHNO_PORT` | Server port | 3333 |
| `OHNO_HOST` | Server host | 127.0.0.1 |
| `OHNO_DIR` | Project directory | auto-detect |
| `OHNO_NO_COLOR` | Disable colors | false |

## Related

- **ohno-mcp** - MCP server for AI agents
- **prd-analyzer** - Parse PRDs and create tasks
- **project-harness** - Orchestrate development sessions

## License

MIT
