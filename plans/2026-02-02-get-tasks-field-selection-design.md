# get_tasks Field Selection Design

**Date:** 2026-02-02
**Status:** Draft
**Problem:** MCP `get_tasks` responses are too large (~16k tokens for 100 tasks), filling up AI agent context quickly.

## Problem Analysis

Each task returned by `get_tasks` includes 24+ fields. With JSON pretty-printing, each task consumes ~200-400 tokens depending on content (descriptions, activity summaries, handoff notes).

The primary use case for `get_tasks` is **task selection** - finding the next task to work on. This only requires a subset of fields: id, title, status, priority, blockers.

## Solution

Add a `fields` parameter to `get_tasks` with predefined field sets:

| Set | Fields | Use Case |
|-----|--------|----------|
| `minimal` (default) | id, title, status, task_type, story_id, story_title, epic_id, epic_priority, epic_status, story_status, blockers, progress_percent | Task selection, kanban views |
| `standard` | minimal + description, handoff_notes, estimate_hours | Quick execution context |
| `full` | All fields (current behavior) | Full context retrieval, debugging |

### Usage Pattern

```
get_tasks(...)  →  Minimal by default (selection fields)
get_task(id)    →  Full details (execution context)
```

This matches how agents actually work:
1. Call `get_tasks` to find/select tasks → lightweight
2. Call `get_task(id)` on the chosen task → full context for that one task

## Schema Changes

### GetTasksSchema (ohno-mcp)

```typescript
const GetTasksSchema = z.object({
  status: z.enum(["todo", "in_progress", "review", "done", "blocked"]).optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  story_status: z.enum(["todo", "in_progress", "review", "done", "blocked"]).optional(),
  epic_status: z.enum(["todo", "in_progress", "review", "done", "blocked"]).optional(),
  limit: z.number().min(1).max(100).default(50),
  fields: z.enum(["minimal", "standard", "full"]).default("minimal"),
});
```

### Field Sets (ohno-core)

```typescript
const FIELD_SETS = {
  minimal: [
    't.id', 't.title', 't.status', 't.task_type', 't.story_id',
    't.blockers', 't.progress_percent',
    's.title as story_title', 's.status as story_status',
    'e.id as epic_id', 'e.title as epic_title',
    'e.priority as epic_priority', 'e.status as epic_status'
  ],
  standard: [
    // minimal fields +
    't.description', 't.handoff_notes', 't.estimate_hours'
  ],
  full: ['t.*', /* all joined fields */]
};
```

### Updated getTasks Method

```typescript
getTasks(opts: GetTasksOptions = {}): Task[] {
  const { status, epic_id, priority, story_status, epic_status,
          limit = 50, fields = 'minimal' } = opts;

  const selectFields = this.buildFieldList(fields);

  let sql = `SELECT ${selectFields} FROM tasks t
    LEFT JOIN stories s ON t.story_id = s.id
    LEFT JOIN epics e ON s.epic_id = e.id`;
  // ... rest of query building
}
```

### MCP Tool Definition

```typescript
{
  name: "get_tasks",
  description: "List tasks with optional filtering. Returns minimal fields by default for efficiency. Use fields='standard' for descriptions, or fields='full' for all data.",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"] },
      priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
      story_status: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"] },
      epic_status: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"] },
      limit: { type: "number", default: 50 },
      fields: { type: "string", enum: ["minimal", "standard", "full"], default: "minimal" },
    },
  },
},
```

## Breaking Change

This is a breaking change - existing callers expecting full fields will get minimal by default.

**Migration approach:**
- Version bump to `0.6.0`
- Document in changelog
- Update pokayokay to explicitly pass `fields` parameter as needed

## Implementation Plan

```
1. ohno-core (packages/ohno-core)
   ├── src/types.ts        - Add 'fields' to GetTasksOptions
   ├── src/schema.ts       - Add FIELD_SETS constant
   └── src/db.ts           - Update getTasks() to use field selection

2. ohno-mcp (packages/ohno-mcp)
   ├── src/server.ts       - Update GetTasksSchema, tool definition
   └── src/server.test.ts  - Add tests for fields parameter

3. ohno-cli (packages/ohno-cli)
   └── Update if CLI uses getTasks internally

4. pokayokay (separate repo)
   └── Update all get_tasks call sites

5. Release
   ├── Bump ohno to 0.6.0
   ├── Update CHANGELOG.md
   └── Update pokayokay dependency
```

## Expected Results

| Scenario | Before | After | Reduction |
|----------|--------|-------|-----------|
| 100 P0 tasks | ~16k tokens | ~4k tokens | **75%** |
| 50 tasks (default) | ~8k tokens | ~2k tokens | **75%** |
