# Ohno Integration Guide

How ohno integrates with pokayokay and kaizen to enable intelligent AI-assisted development workflows.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Integration with pokayokay](#integration-with-pokayokay)
3. [Integration with kaizen](#integration-with-kaizen)
4. [End-to-End Workflow](#end-to-end-workflow)
5. [API Reference](#api-reference)
6. [Related Documentation](#related-documentation)

---

## Architecture Overview

Ohno serves as the task management backbone for AI-assisted development workflows, providing persistent state that survives context compaction and session boundaries.

```
┌─────────┐      ┌─────────────┐      ┌─────────┐
│  ohno   │◄────►│  pokayokay  │◄────►│ kaizen  │
│         │      │             │      │         │
│ • tasks │      │ • orchestr. │      │ • grade │
│ • deps  │      │ • agents    │      │ • track │
│ • state │      │ • hooks     │      │ • learn │
└─────────┘      └─────────────┘      └─────────┘
     │                  │                   │
     │                  │                   │
     └──────────────────┴───────────────────┘
               Integrated Workflow
```

### Component Roles

| Component | Responsibility | How It Uses ohno |
|-----------|---------------|------------------|
| **ohno** | Task management, dependencies, state tracking | Core data store |
| **pokayokay** | Agent orchestration, review workflow, hook execution | Queries tasks, updates status, creates new tasks |
| **kaizen** | Failure pattern capture, grading, confidence-based suggestions | Creates fix tasks via pokayokay |

### Integration Points

Ohno provides multiple interfaces for integration:

| Interface | Protocol | Primary Consumer |
|-----------|----------|------------------|
| **ohno-mcp** | Model Context Protocol | Claude Code, AI agents with MCP support |
| **ohno-cli** | Shell commands | pokayokay hooks, any AI agent, humans |
| **ohno serve** | HTTP + WebSocket | Human visualization via browser |

---

## Integration with pokayokay

Pokayokay uses ohno as its task management backend, querying and updating task state throughout the development workflow.

### Session Context

When a pokayokay work session starts, it retrieves context from ohno:

```bash
# Via MCP (Claude Code)
get_session_context()

# Via CLI (any agent)
npx @stevestomp/ohno-cli context
```

Returns:
- In-progress tasks
- Blocked tasks
- Recent activity
- Suggested next task

### Task Lifecycle

Pokayokay manages task state through ohno:

```
┌──────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────┐
│   todo   │────►│ in_progress  │────►│  review  │────►│   done   │
└──────────┘     └──────────────┘     └──────────┘     └──────────┘
                        │                   │
                        │                   │
                        ▼                   ▼
                 ┌──────────┐        ┌──────────┐
                 │ blocked  │        │ blocked  │
                 └──────────┘        └──────────┘
```

### Common Operations

**Get next task:**
```bash
npx @stevestomp/ohno-cli next
```

**Start working on a task:**
```bash
npx @stevestomp/ohno-cli start <task-id>
```

**Mark task complete:**
```bash
npx @stevestomp/ohno-cli done <task-id> --notes "Implementation complete"
```

**Block a task:**
```bash
npx @stevestomp/ohno-cli block <task-id> "Waiting for API access"
```

### Boundary Detection

Ohno tracks task hierarchy (Epic → Story → Task) and notifies pokayokay when boundaries are crossed:

```json
{
  "success": true,
  "boundaries": {
    "story_completed": true,
    "epic_completed": false,
    "story_id": "story-abc123",
    "epic_id": "epic-xyz789"
  }
}
```

Pokayokay uses this to pause at story/epic boundaries in semi-auto and autonomous modes.

---

## Integration with kaizen

Kaizen creates fix tasks in ohno when it identifies patterns with high confidence. This happens through pokayokay's hook system.

### Fix Task Creation Flow

```
┌─────────────────┐
│  Review Fails   │
│ (pokayokay)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ kaizen analyze  │
│ (via hook)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     HIGH        ┌─────────────────┐
│ Confidence?     │────────────────►│ Create fix task │
└────────┬────────┘  CONFIDENCE     │ in ohno         │
         │                          └─────────────────┘
         │ MEDIUM/LOW
         ▼
┌─────────────────┐
│ Suggest or log  │
└─────────────────┘
```

### Fix Task Structure

When kaizen suggests a fix task, it includes:

```json
{
  "action": "AUTO",
  "fix_task": {
    "title": "Add tests for task-123",
    "description": "Add missing test coverage for API endpoint",
    "type": "test"
  }
}
```

Pokayokay creates this in ohno:

```bash
npx @stevestomp/ohno-cli create "Add tests for task-123" \
  --type test \
  --description "Add missing test coverage for API endpoint" \
  --source "kaizen-fix"
```

### Task Dependencies

Fix tasks are linked to their parent task:

```bash
# Add dependency: fix task blocks parent task
npx @stevestomp/ohno-cli dep add <fix-task-id> <parent-task-id>

# Block parent task until fix is complete
npx @stevestomp/ohno-cli block <parent-task-id> "Blocked by fix task <fix-task-id>"
```

### Source Tracking

Ohno tracks task origin via the `--source` flag:

| Source | Meaning |
|--------|---------|
| `kaizen-fix` | Auto-created by kaizen for high-confidence failures |
| `kaizen-suggest` | User-confirmed suggestion from kaizen |
| `pokayokay-plan` | Created during `/pokayokay:plan` |
| `pokayokay-audit` | Created during `/pokayokay:audit` |
| `manual` | Created manually by user |

---

## End-to-End Workflow

Here's how all three tools work together in a typical development session:

### 1. Session Start

```bash
# pokayokay starts work session
/pokayokay:work semi-auto
```

Pokayokay queries ohno for session context:
- What tasks are in progress?
- Any blockers?
- What's the next task?

### 2. Task Execution

Pokayokay picks up a task from ohno:

```bash
# ohno returns next task
{
  "id": "task-abc123",
  "title": "Implement user authentication",
  "status": "todo",
  "story_title": "User Login Feature",
  "epic_title": "Authentication System"
}
```

Pokayokay marks it in progress and dispatches the implementer.

### 3. Review Failure (kaizen integration)

If the review fails:

1. **Hook executes**: `post-review-fail.sh` calls kaizen
2. **kaizen analyzes**: Detects category, captures pattern, suggests action
3. **Action handling**:
   - **AUTO**: pokayokay creates fix task in ohno, blocks current task
   - **SUGGEST**: pokayokay prompts user, optionally creates task
   - **LOGGED**: pokayokay continues with re-dispatch

### 4. Task Completion

When task passes review:

```bash
# pokayokay marks task done
npx @stevestomp/ohno-cli done task-abc123 --notes "Auth implemented with JWT"
```

Ohno returns boundary info:
```json
{
  "boundaries": {
    "story_completed": true,
    "epic_completed": false
  }
}
```

### 5. Boundary Handling

Pokayokay pauses at story boundary (semi-auto mode):
- Shows summary to user
- Asks to continue, review, or stop

---

## API Reference

### MCP Tools (ohno-mcp)

| Tool | Purpose |
|------|---------|
| `get_session_context` | Get in-progress tasks, blockers, suggested next task |
| `get_next_task` | Get highest priority available task |
| `get_task` | Get full task details by ID |
| `update_task_status` | Change task status (todo/in_progress/review/done/blocked) |
| `create_task` | Create new task |
| `add_task_activity` | Log activity on a task |
| `set_blocker` | Mark task as blocked with reason |
| `resolve_blocker` | Clear blocker and set to in_progress |
| `add_dependency` | Create dependency between tasks |
| `get_project_status` | Get overall completion stats |

### CLI Commands (ohno-cli)

| Command | Purpose |
|---------|---------|
| `npx @stevestomp/ohno-cli next` | Get next task |
| `npx @stevestomp/ohno-cli start <id>` | Start working on task |
| `npx @stevestomp/ohno-cli done <id>` | Mark task complete |
| `npx @stevestomp/ohno-cli block <id> <reason>` | Block task |
| `npx @stevestomp/ohno-cli unblock <id>` | Unblock task |
| `npx @stevestomp/ohno-cli create <title>` | Create task |
| `npx @stevestomp/ohno-cli dep add <from> <to>` | Add dependency |
| `npx @stevestomp/ohno-cli tasks` | List all tasks |
| `npx @stevestomp/ohno-cli serve` | Start kanban board |

---

## Related Documentation

### Ohno
- [README](../README.md) - Full ohno documentation
- [Architecture](../ARCHITECTURE.md) - Technical architecture details

### Kaizen
- [Kaizen Integration Guide](https://github.com/srstomp/kaizen/blob/master/docs/INTEGRATION.md) - How kaizen integrates with the ecosystem
- [Kaizen User Guide](https://github.com/srstomp/kaizen/blob/master/docs/user-guide.md) - Full kaizen documentation

### Pokayokay
- [Pokayokay Integrations](https://github.com/srstomp/pokayokay/blob/master/docs/integrations/README.md) - Integration overview
- [Kaizen Integration Details](https://github.com/srstomp/pokayokay/blob/master/docs/integrations/kaizen.md) - Detailed kaizen integration docs
- [GUIDE.md](https://github.com/srstomp/pokayokay/blob/master/GUIDE.md) - pokayokay command guide