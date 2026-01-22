# Terminal Kanban & tmux Workflow Design

## Overview

Add a terminal-based kanban view to ohno-cli for use in tmux development sessions, complementing the existing web-based kanban UI.

## Goals

- **Session persistence** - Terminals survive IDE/terminal crashes
- **Split pane visibility** - See kanban alongside Claude Code in tmux
- **Lighter resources** - Replace IntelliJ-as-terminal-manager with tmux
- **Flexible project management** - Support both parallel projects and quick switching

## Non-Goals

- Replacing the web kanban (it's part of the ohno product)
- Multi-user / remote sync
- Complex filtering (keep that in web UI)
- Themeable colors

---

## Design

### 1. tmux + tmuxinator Setup

Use tmuxinator to manage project-specific layouts with named tmux sessions.

**Installation:**
```bash
brew install tmux tmuxinator
```

**Example config (`~/.config/tmuxinator/ohno.yml`):**
```yaml
name: ohno
root: ~/Projects/stevestomp/ohno
windows:
  - main:
      layout: main-horizontal
      panes:
        - # main terminal (Claude Code runs here)
        - ohno kanban --watch  # terminal kanban
  - secondary:
      - # git, tests, logs
```

**Flexibility modes:**
- **Small projects:** Add as window within existing session
- **Big projects:** Dedicated session via `tmuxinator start <project>`
- **Parallel work:** Multiple sessions, switch with `Ctrl-b s`

### 2. Terminal Kanban Command

**CLI interface:**
```bash
ohno kanban           # Display board state and exit
ohno kanban --watch   # Live TUI with interactivity
```

**Display format:**
```
┌─ Pending ──────┬─ In Progress ──┬─ Completed ─────┐
│ #3 Fix auth    │▶#7 Add stories │ #1 Setup DB     │
│ #4 API docs    │                │ #2 Core schema  │
│                │                │ #5 MCP tools    │
└────────────────┴────────────────┴─────────────────┘
[←→] Column  [↑↓] Select  [Enter] Details  [m] Move  [q] Quit
```

**Keyboard controls:**
| Key | Action |
|-----|--------|
| `←` `→` | Move between columns |
| `↑` `↓` | Navigate tasks within column |
| `Enter` | Open task detail panel |
| `m` | Move task to next status |
| `M` | Move task to previous status |
| `e` | Quick edit task subject |
| `q` / `Esc` | Quit |

### 3. Typical Pane Layout

```
┌─────────────────────────────────┬──────────────────┐
│                                 │                  │
│     Main terminal               │  Terminal Kanban │
│     (Claude Code / dev work)    │  (ohno kanban    │
│                                 │   --watch)       │
│                                 │                  │
├─────────────────────────────────┴──────────────────┤
│  Secondary terminal (git, tests, logs)             │
└────────────────────────────────────────────────────┘
```

### 4. Session Workflow

**Starting:**
```bash
tmuxinator start ohno          # Start dedicated session
tmux attach -t ohno            # Attach from another terminal
```

**Switching:**
```bash
Ctrl-b s                       # Session picker (fuzzy search)
Ctrl-b w                       # Window picker across sessions
tmux switch-client -t <name>   # Direct jump
```

**Cleanup:**
```bash
tmux ls                        # List running sessions
tmux kill-session -t <name>    # Remove session
```

---

## Implementation

### New Dependencies

```json
{
  "ink": "^4.x",
  "ink-use-stdout-dimensions": "^1.x"
}
```

### Files to Create/Modify

| File | Description |
|------|-------------|
| `packages/ohno-cli/src/commands/kanban.ts` | New CLI command with --watch flag |
| `packages/ohno-cli/src/tui/KanbanBoard.tsx` | Ink-based TUI component |
| `packages/ohno-cli/src/tui/TaskDetail.tsx` | Detail panel component |

### Technical Approach

- **TUI framework:** `ink` (React-based terminal UI, fits TypeScript stack)
- **Live updates:** Poll SQLite every 1s or watch DB file for changes
- **Minimum width:** ~40 characters for compact pane usage
- **Data source:** Same SQLite database as web kanban

---

## Effort Estimate

| Component | Size |
|-----------|------|
| `ohno kanban --watch` base command | Medium |
| Interactivity (navigation, status changes) | Medium |
| Detail view panel | Small |
| tmuxinator config templates | Small |

---

## Open Questions

None - design validated through brainstorming session.
