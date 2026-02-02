# get_tasks Field Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `fields` parameter to `get_tasks` that returns minimal/standard/full field sets to reduce MCP response token usage by ~75%.

**Architecture:** Add `FieldSet` type and `FIELD_SETS` constant to ohno-core. Update `getTasks()` to build dynamic SELECT clauses. Update MCP schema to accept `fields` parameter with default `"minimal"`.

**Tech Stack:** TypeScript, sql.js, Zod, Vitest

---

## Task 1: Add FieldSet Type to ohno-core

**Files:**
- Modify: `packages/ohno-core/src/types.ts:210-217`

**Step 1: Write the failing test**

Add to `packages/ohno-core/src/types.test.ts`:

```typescript
describe("FieldSet type", () => {
  it("should accept valid field set values", () => {
    const minimal: FieldSet = "minimal";
    const standard: FieldSet = "standard";
    const full: FieldSet = "full";
    expect(minimal).toBe("minimal");
    expect(standard).toBe("standard");
    expect(full).toBe("full");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages && npm run test -- --filter ohno-core`
Expected: FAIL with "FieldSet is not defined"

**Step 3: Write minimal implementation**

Add to `packages/ohno-core/src/types.ts` after line 21:

```typescript
// Field set for get_tasks response size control
export type FieldSet = "minimal" | "standard" | "full";
```

Update `GetTasksOptions` interface (around line 210):

```typescript
export interface GetTasksOptions {
  status?: TaskStatus;
  epic_id?: string;
  priority?: Priority;
  story_status?: TaskStatus;
  epic_status?: TaskStatus;
  limit?: number;
  fields?: FieldSet;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages && npm run test -- --filter ohno-core`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/ohno-core/src/types.ts packages/ohno-core/src/types.test.ts
git commit -m "feat(ohno-core): add FieldSet type for get_tasks field selection"
```

---

## Task 2: Add FIELD_SETS Constant to schema.ts

**Files:**
- Modify: `packages/ohno-core/src/schema.ts`

**Step 1: Write the failing test**

Add to `packages/ohno-core/src/db.test.ts` in the "getTasks" describe block:

```typescript
describe("field selection", () => {
  it("should return minimal fields by default", () => {
    db.createTask({ title: "Test task", description: "A long description" });
    const tasks = db.getTasks({ fields: "minimal" });
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBeDefined();
    expect(tasks[0].title).toBeDefined();
    expect(tasks[0].status).toBeDefined();
    expect(tasks[0].description).toBeUndefined();
    expect(tasks[0].handoff_notes).toBeUndefined();
    expect(tasks[0].activity_summary).toBeUndefined();
  });

  it("should return standard fields when requested", () => {
    db.createTask({ title: "Test task", description: "A description" });
    const tasks = db.getTasks({ fields: "standard" });
    expect(tasks.length).toBe(1);
    expect(tasks[0].description).toBe("A description");
    expect(tasks[0].activity_summary).toBeUndefined();
  });

  it("should return full fields when requested", () => {
    db.createTask({ title: "Test task", description: "A description" });
    const tasks = db.getTasks({ fields: "full" });
    expect(tasks.length).toBe(1);
    expect(tasks[0].description).toBe("A description");
    // Full includes all columns even if null
    expect("activity_summary" in tasks[0]).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages && npm run test -- --filter ohno-core`
Expected: FAIL - tests fail because fields parameter is not implemented

**Step 3: Write minimal implementation**

Add to `packages/ohno-core/src/schema.ts` after the CREATE_INDEXES array:

```typescript
/**
 * Field sets for controlling response size
 * - minimal: Core fields for task selection/listing
 * - standard: minimal + description and handoff notes
 * - full: All fields (current behavior)
 */
export const FIELD_SETS = {
  minimal: [
    "t.id",
    "t.title",
    "t.status",
    "t.task_type",
    "t.story_id",
    "t.blockers",
    "t.progress_percent",
    "s.title as story_title",
    "s.status as story_status",
    "e.id as epic_id",
    "e.title as epic_title",
    "e.priority as epic_priority",
    "e.status as epic_status",
  ],
  standard: [
    "t.id",
    "t.title",
    "t.status",
    "t.task_type",
    "t.story_id",
    "t.blockers",
    "t.progress_percent",
    "t.description",
    "t.handoff_notes",
    "t.estimate_hours",
    "s.title as story_title",
    "s.status as story_status",
    "e.id as epic_id",
    "e.title as epic_title",
    "e.priority as epic_priority",
    "e.status as epic_status",
  ],
  full: [
    "t.*",
    "s.title as story_title",
    "s.status as story_status",
    "e.id as epic_id",
    "e.title as epic_title",
    "e.priority as epic_priority",
    "e.status as epic_status",
  ],
} as const;

export type FieldSetName = keyof typeof FIELD_SETS;
```

**Step 4: Update db.ts getTasks method**

Modify `packages/ohno-core/src/db.ts` - update the getTasks method:

```typescript
getTasks(opts: GetTasksOptions = {}): Task[] {
  const { status, epic_id, priority, story_status, epic_status, limit = 50, fields = "minimal" } = opts;

  // Build SELECT clause based on fields parameter
  const fieldSet = FIELD_SETS[fields] || FIELD_SETS.minimal;
  const selectClause = fieldSet.join(", ");

  let sql = `SELECT ${selectClause} FROM tasks t
    LEFT JOIN stories s ON t.story_id = s.id
    LEFT JOIN epics e ON s.epic_id = e.id`;

  const conditions: string[] = ["t.status != 'archived'"];
  const params: unknown[] = [];

  if (status) {
    conditions.push("t.status = ?");
    params.push(status);
  }

  if (epic_id) {
    conditions.push("e.id = ?");
    params.push(epic_id);
  }

  if (priority) {
    conditions.push("e.priority = ?");
    params.push(priority);
  }

  if (story_status) {
    conditions.push("s.status = ?");
    params.push(story_status);
  }

  if (epic_status) {
    conditions.push("e.status = ?");
    params.push(epic_status);
  }

  sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += " ORDER BY t.updated_at DESC, t.created_at DESC";
  sql += " LIMIT ?";
  params.push(limit);

  const stmt = this.db.prepare(sql);
  stmt.bind(params as initSqlJs.BindParams);

  const rows: Task[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown as Task;
    rows.push(row);
  }
  stmt.free();

  return rows;
}
```

Add import at top of db.ts:

```typescript
import { FIELD_SETS } from "./schema.js";
```

**Step 5: Run test to verify it passes**

Run: `cd packages && npm run test -- --filter ohno-core`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/ohno-core/src/schema.ts packages/ohno-core/src/db.ts packages/ohno-core/src/db.test.ts
git commit -m "feat(ohno-core): implement field selection in getTasks"
```

---

## Task 3: Export FIELD_SETS from ohno-core

**Files:**
- Modify: `packages/ohno-core/src/index.ts`

**Step 1: Add export**

Add to `packages/ohno-core/src/index.ts`:

```typescript
export { FIELD_SETS } from "./schema.js";
```

**Step 2: Verify build**

Run: `cd packages && npm run build -- --filter ohno-core`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/ohno-core/src/index.ts
git commit -m "feat(ohno-core): export FIELD_SETS constant"
```

---

## Task 4: Update MCP Schema and Tool Definition

**Files:**
- Modify: `packages/ohno-mcp/src/server.ts`

**Step 1: Write the failing test**

Add to `packages/ohno-mcp/src/server.test.ts` in the "Schema Validation" describe block:

```typescript
describe("GetTasksSchema fields parameter", () => {
  it("should accept fields parameter with valid values", () => {
    expect(() => GetTasksSchema.parse({ fields: "minimal" })).not.toThrow();
    expect(() => GetTasksSchema.parse({ fields: "standard" })).not.toThrow();
    expect(() => GetTasksSchema.parse({ fields: "full" })).not.toThrow();
  });

  it("should default to minimal when fields not provided", () => {
    const parsed = GetTasksSchema.parse({});
    expect(parsed.fields).toBe("minimal");
  });

  it("should reject invalid fields values", () => {
    expect(() => GetTasksSchema.parse({ fields: "invalid" })).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages && npm run test -- --filter ohno-mcp`
Expected: FAIL - fields parameter not in schema

**Step 3: Update GetTasksSchema**

Modify `packages/ohno-mcp/src/server.ts` - update GetTasksSchema:

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

**Step 4: Update tool definition**

Find the `get_tasks` tool in the TOOLS array and update:

```typescript
{
  name: "get_tasks",
  description: "List tasks with optional filtering. Returns minimal fields by default for efficiency. Use fields='standard' for descriptions, or fields='full' for all data.",
  inputSchema: {
    type: "object" as const,
    properties: {
      status: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"], description: "Filter by task status" },
      priority: { type: "string", enum: ["P0", "P1", "P2", "P3"], description: "Filter by epic priority" },
      story_status: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"], description: "Filter by parent story status" },
      epic_status: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"], description: "Filter by parent epic status" },
      limit: { type: "number", description: "Maximum tasks to return (1-100)", default: 50 },
      fields: { type: "string", enum: ["minimal", "standard", "full"], description: "Field set to return: minimal (default, for selection), standard (with descriptions), full (all fields)", default: "minimal" },
    },
  },
},
```

**Step 5: Run test to verify it passes**

Run: `cd packages && npm run test -- --filter ohno-mcp`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/ohno-mcp/src/server.ts packages/ohno-mcp/src/server.test.ts
git commit -m "feat(ohno-mcp): add fields parameter to get_tasks tool"
```

---

## Task 5: Add Integration Test for Field Selection

**Files:**
- Modify: `packages/ohno-mcp/src/server.test.ts`

**Step 1: Write the integration test**

Add to the "Tool Handlers" describe block in server.test.ts:

```typescript
describe("get_tasks field selection", () => {
  it("should return minimal fields by default", async () => {
    db.createTask({ title: "Test", description: "Long description here" });
    const result = await handleTool("get_tasks", {}) as { tasks: Array<Record<string, unknown>> };
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0].id).toBeDefined();
    expect(result.tasks[0].title).toBe("Test");
    expect(result.tasks[0].description).toBeUndefined();
  });

  it("should return full fields when requested", async () => {
    db.createTask({ title: "Test", description: "Long description here" });
    const result = await handleTool("get_tasks", { fields: "full" }) as { tasks: Array<Record<string, unknown>> };
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0].description).toBe("Long description here");
  });

  it("should pass fields parameter to database", async () => {
    db.createTask({ title: "Test", description: "Description" });

    const minimal = await handleTool("get_tasks", { fields: "minimal" }) as { tasks: Array<Record<string, unknown>> };
    const standard = await handleTool("get_tasks", { fields: "standard" }) as { tasks: Array<Record<string, unknown>> };

    expect(minimal.tasks[0].description).toBeUndefined();
    expect(standard.tasks[0].description).toBe("Description");
  });
});
```

**Step 2: Run test**

Run: `cd packages && npm run test -- --filter ohno-mcp`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/ohno-mcp/src/server.test.ts
git commit -m "test(ohno-mcp): add integration tests for get_tasks field selection"
```

---

## Task 6: Run Full Test Suite and Verify

**Step 1: Run all tests**

Run: `cd /Users/sis4m4/Projects/stevestomp/ohno/.worktrees/get-tasks-fields && make test`
Expected: All tests pass

**Step 2: Verify minimal response size**

Create a quick manual test:

```bash
cd packages/ohno-mcp
node -e "
const { TaskDatabase } = require('@stevestomp/ohno-core');
(async () => {
  const db = await TaskDatabase.open('/tmp/test-size.db');
  for (let i = 0; i < 10; i++) {
    db.createTask({
      title: 'Task ' + i,
      description: 'A'.repeat(500),
      task_type: 'feature'
    });
  }
  const minimal = db.getTasks({ fields: 'minimal' });
  const full = db.getTasks({ fields: 'full' });
  console.log('Minimal JSON size:', JSON.stringify(minimal).length);
  console.log('Full JSON size:', JSON.stringify(full).length);
  console.log('Reduction:', Math.round((1 - JSON.stringify(minimal).length / JSON.stringify(full).length) * 100) + '%');
  db.close();
})();
"
```

Expected: ~50-75% reduction in response size

**Step 3: Commit verification notes**

No commit needed - verification only.

---

## Task 7: Update Version and Changelog

**Files:**
- Modify: `packages/ohno-core/package.json`
- Modify: `packages/ohno-mcp/package.json`
- Modify: `packages/ohno-cli/package.json`

**Step 1: Bump versions to 0.13.0**

Update all three package.json files to version `0.13.0`.

**Step 2: Create changelog entry**

Add to top of any existing CHANGELOG.md or create one:

```markdown
## [0.13.0] - 2026-02-02

### Added
- `get_tasks` now accepts a `fields` parameter: `"minimal"` (default), `"standard"`, or `"full"`
- Minimal fields reduce response size by ~75% for task selection use cases

### Changed
- **BREAKING**: `get_tasks` now returns minimal fields by default
- Callers expecting full fields should pass `fields: "full"`
```

**Step 3: Commit**

```bash
git add packages/*/package.json CHANGELOG.md
git commit -m "chore: bump version to 0.13.0 for field selection feature"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add FieldSet type | types.ts, types.test.ts |
| 2 | Add FIELD_SETS and implement in db.ts | schema.ts, db.ts, db.test.ts |
| 3 | Export FIELD_SETS | index.ts |
| 4 | Update MCP schema and tool | server.ts, server.test.ts |
| 5 | Add integration tests | server.test.ts |
| 6 | Verify full test suite | - |
| 7 | Bump version and changelog | package.json files |

**Total commits:** 6
**Estimated token reduction:** 75%
