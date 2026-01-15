# Ohno Session Handoff

**Date:** 2026-01-15
**Context:** Session ended due to full context window

---

## What Was Done This Session

### 1. Feature Branch: `feature/quick-wins` (MERGED to master)
Added three enhancements comparing ohno to beads:
- **Hash-based IDs** - Content-derived SHA256 instead of random UUIDs
- **Dependency graph** - Wired up existing `task_dependencies` table, filters `get_session_context()`
- **Activity summarization** - Auto-compress activity logs on task completion
- **Performance indexes** - Added indexes on `task_activity` and `task_dependencies`
- **Kanban UI** - Shows "Waiting on dependencies" indicator

**Commits:** `94c626d`, pushed and merged

### 2. Feature Branch: `feature/cli` (PUSHED, not merged)
Added CLI commands for task management:

```bash
ohno tasks              # List tasks
ohno task <id>          # Get task details
ohno create "title"     # Create task
ohno start/done/review  # Update status
ohno block/unblock      # Blocker management
ohno dep add/rm/list    # Dependency management
ohno context --json     # Session context (for AI agents)
ohno next --json        # Next recommended task
```

**Purpose:** Enable any AI agent (GPT, Gemini, LangChain) to use ohno via shell commands, not just Claude Code via MCP.

**Commits:** `e8bfb3c`, `09e9d8a` (README update)

### 3. README Updated
- Added integration capabilities table
- Updated architecture diagram (MCP + CLI)
- Documented all CLI commands
- Updated installation options

---

## Current Decision Point: Distribution Strategy

User wants **maximum reach and ease of use**. Current Python/pip approach requires venv knowledge.

### Options Being Evaluated

| Option | Pros | Cons |
|--------|------|------|
| **npm/npx** | Zero-install (`npx ohno`), ubiquitous Node | Medium rewrite, still needs runtime |
| **Go binary** | Zero deps, fastest, single file | Full rewrite, steeper learning curve |
| **Homebrew** | Easy install | macOS/Linux only, doesn't solve core issue |

### Discussion Summary

**Go Benefits:**
- Zero dependencies (like beads)
- 10-20ms startup vs 200ms Python
- Single binary distribution
- Cross-platform from one codebase

**Go Cons (discussed in detail):**
- Full rewrite required (~1500 lines)
- Two codebases if keeping Python MCP
- Error handling verbosity
- SQLite: pure Go is slower, CGO is complex
- 1-2 weeks learning curve for quality code
- No REPL for debugging

**npm/TypeScript:**
- 80% of Go benefits, 50% effort
- Mature MCP SDK (important for Claude Marketplace)
- `npx ohno` just works

**User's priority:** Maximum reach > speed to ship

---

## Files Changed

```
ohno-mcp/src/ohno_mcp/db.py      # Hash IDs, deps, summarization (+330 lines)
ohno-mcp/src/ohno_mcp/server.py  # New MCP tools (+127 lines)
ohno-cli/src/ohno_cli/main.py    # CLI commands (+485 lines)
ohno-cli/src/ohno_cli/_template.py  # Dependency indicator (+11 lines)
ohno-cli/pyproject.toml          # Version bump, optional deps
README.md                        # Integration docs
```

---

## Git Status

```bash
git branch -a
# * feature/cli          <- Current branch
# master                 <- Has quick-wins merged
# origin/feature/cli
# origin/feature/quick-wins
# origin/master
```

---

## Next Steps

1. **Decide on distribution strategy:** npm/TypeScript vs Go vs stay Python
2. If npm: Prototype TypeScript CLI structure
3. If Go: Prototype Go CLI structure
4. If Python: Improve with pipx/uvx documentation
5. Merge `feature/cli` to master
6. Consider Claude Marketplace submission (MCP server)

---

## Key Files to Read

- `/Users/sis4m4/Projects/public/ohno/README.md` - Current docs
- `/Users/sis4m4/Projects/public/ohno/ohno-cli/src/ohno_cli/main.py` - CLI implementation
- `/Users/sis4m4/Projects/public/ohno/ohno-mcp/src/ohno_mcp/db.py` - Database layer
- `/Users/sis4m4/Projects/public/ohno/ARCHITECTURE.md` - Full schema details

---

## Question to Resume With

> "We were discussing npm/TypeScript vs Go for ohno CLI distribution. Given the trade-offs, which direction do you want to go?"

Or if decided:
> "Let's prototype the [npm/Go] version of ohno CLI"
