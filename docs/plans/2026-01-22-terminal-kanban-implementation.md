# Terminal Kanban TUI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an interactive terminal-based kanban board to ohno-cli that displays live task updates and allows keyboard-driven navigation and status changes.

**Architecture:** New `kanban` CLI command with two modes: static (print and exit) and watch (live TUI). The TUI uses `ink` (React for terminals) to render a columnar board layout with keyboard navigation. Data comes from the existing SQLite database via `@stevestomp/ohno-core`.

**Tech Stack:** TypeScript, ink v4, React 18, vitest for testing

---

## Task 1: Add ink Dependencies

**Files:**
- Modify: `packages/ohno-cli/package.json`

**Step 1: Add ink and React dependencies**

```bash
cd packages/ohno-cli && npm install ink@^4.4.1 react@^18.2.0
```

**Step 2: Add React types as dev dependency**

```bash
cd packages/ohno-cli && npm install -D @types/react@^18.2.0
```

**Step 3: Verify installation**

Run: `cd packages/ohno-cli && npm ls ink react`
Expected: Shows ink@4.x.x and react@18.x.x installed

**Step 4: Commit**

```bash
git add packages/ohno-cli/package.json packages/ohno-cli/package-lock.json
git commit -m "chore(ohno-cli): add ink and React dependencies for terminal kanban TUI"
```

---

## Task 2: Configure TypeScript for JSX

**Files:**
- Modify: `packages/ohno-cli/tsconfig.json`

**Step 1: Read current tsconfig**

Check current `jsx` and `jsxImportSource` settings.

**Step 2: Update tsconfig for React JSX**

Add or update the following compiler options:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd packages/ohno-cli && npm run build`
Expected: Build completes without JSX errors

**Step 4: Commit**

```bash
git add packages/ohno-cli/tsconfig.json
git commit -m "chore(ohno-cli): configure TypeScript for React JSX"
```

---

## Task 3: Create Static Kanban Display Test

**Files:**
- Create: `packages/ohno-cli/src/tui/kanban.test.ts`

**Step 1: Write failing test for static kanban output**

```typescript
/**
 * Tests for terminal kanban TUI
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { TaskDatabase } from "@stevestomp/ohno-core";

describe("Kanban TUI", () => {
  let tempDir: string;
  let ohnoDir: string;
  let dbPath: string;
  let db: TaskDatabase;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ohno-kanban-test-"));
    ohnoDir = join(tempDir, ".ohno");
    mkdirSync(ohnoDir);
    dbPath = join(ohnoDir, "tasks.db");
    db = await TaskDatabase.open(dbPath);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("getKanbanData", () => {
    it("should return tasks grouped by status", async () => {
      // Create tasks in different statuses
      const todoId = db.createTask({ title: "Todo task" });
      const inProgressId = db.createTask({ title: "In progress task" });
      db.updateTaskStatus(inProgressId, "in_progress");
      const doneId = db.createTask({ title: "Done task" });
      db.updateTaskStatus(doneId, "done");

      const { getKanbanData } = await import("./kanban-data.js");
      const data = await getKanbanData(dbPath);

      expect(data.todo).toHaveLength(1);
      expect(data.todo[0].title).toBe("Todo task");
      expect(data.inProgress).toHaveLength(1);
      expect(data.inProgress[0].title).toBe("In progress task");
      expect(data.done).toHaveLength(1);
      expect(data.done[0].title).toBe("Done task");
    });

    it("should include blocked and review tasks", async () => {
      const blockedId = db.createTask({ title: "Blocked task" });
      db.setBlocker(blockedId, "Waiting for API");
      const reviewId = db.createTask({ title: "Review task" });
      db.updateTaskStatus(reviewId, "review");

      const { getKanbanData } = await import("./kanban-data.js");
      const data = await getKanbanData(dbPath);

      expect(data.blocked).toHaveLength(1);
      expect(data.blocked[0].blockers).toBe("Waiting for API");
      expect(data.review).toHaveLength(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/ohno-cli && npm test -- src/tui/kanban.test.ts`
Expected: FAIL with "Cannot find module './kanban-data.js'"

**Step 3: Commit failing test**

```bash
git add packages/ohno-cli/src/tui/kanban.test.ts
git commit -m "test(ohno-cli): add failing test for kanban data grouping"
```

---

## Task 4: Implement Kanban Data Fetching

**Files:**
- Create: `packages/ohno-cli/src/tui/kanban-data.ts`

**Step 1: Create kanban-data module**

```typescript
/**
 * Kanban data fetching and grouping
 */

import { TaskDatabase, type Task, type TaskStatus } from "@stevestomp/ohno-core";

export interface KanbanTask {
  id: string;
  title: string;
  status: TaskStatus;
  blockers?: string;
  epic_priority?: string;
  progress_percent?: number;
}

export interface KanbanData {
  todo: KanbanTask[];
  inProgress: KanbanTask[];
  review: KanbanTask[];
  done: KanbanTask[];
  blocked: KanbanTask[];
}

/**
 * Fetch and group tasks by status for kanban display
 */
export async function getKanbanData(dbPath: string): Promise<KanbanData> {
  const db = await TaskDatabase.open(dbPath);

  const allTasks = db.getTasks({ limit: 500 });
  db.close();

  const data: KanbanData = {
    todo: [],
    inProgress: [],
    review: [],
    done: [],
    blocked: [],
  };

  for (const task of allTasks) {
    const kanbanTask: KanbanTask = {
      id: task.id,
      title: task.title,
      status: task.status,
      blockers: task.blockers,
      epic_priority: task.epic_priority,
      progress_percent: task.progress_percent,
    };

    switch (task.status) {
      case "todo":
        data.todo.push(kanbanTask);
        break;
      case "in_progress":
        data.inProgress.push(kanbanTask);
        break;
      case "review":
        data.review.push(kanbanTask);
        break;
      case "done":
        data.done.push(kanbanTask);
        break;
      case "blocked":
        data.blocked.push(kanbanTask);
        break;
    }
  }

  return data;
}
```

**Step 2: Run test to verify it passes**

Run: `cd packages/ohno-cli && npm test -- src/tui/kanban.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/ohno-cli/src/tui/kanban-data.ts
git commit -m "feat(ohno-cli): add kanban data fetching and grouping"
```

---

## Task 5: Create Basic Kanban Board Component Test

**Files:**
- Modify: `packages/ohno-cli/src/tui/kanban.test.ts`

**Step 1: Add test for KanbanBoard component render**

Add to existing test file:

```typescript
import { render } from "ink-testing-library";
import React from "react";

describe("KanbanBoard component", () => {
  it("should render column headers", () => {
    const { KanbanBoard } = require("./KanbanBoard.js");
    const data: KanbanData = {
      todo: [],
      inProgress: [],
      review: [],
      done: [],
      blocked: [],
    };

    const { lastFrame } = render(<KanbanBoard data={data} />);

    expect(lastFrame()).toContain("Pending");
    expect(lastFrame()).toContain("In Progress");
    expect(lastFrame()).toContain("Done");
  });

  it("should render tasks in correct columns", () => {
    const { KanbanBoard } = require("./KanbanBoard.js");
    const data: KanbanData = {
      todo: [{ id: "task-1", title: "Fix bug", status: "todo" }],
      inProgress: [{ id: "task-2", title: "Add feature", status: "in_progress" }],
      review: [],
      done: [{ id: "task-3", title: "Setup", status: "done" }],
      blocked: [],
    };

    const { lastFrame } = render(<KanbanBoard data={data} />);

    expect(lastFrame()).toContain("Fix bug");
    expect(lastFrame()).toContain("Add feature");
    expect(lastFrame()).toContain("Setup");
  });
});
```

**Step 2: Install ink-testing-library**

```bash
cd packages/ohno-cli && npm install -D ink-testing-library@^3.0.0
```

**Step 3: Run test to verify it fails**

Run: `cd packages/ohno-cli && npm test -- src/tui/kanban.test.ts`
Expected: FAIL with "Cannot find module './KanbanBoard.js'"

**Step 4: Commit**

```bash
git add packages/ohno-cli/src/tui/kanban.test.ts packages/ohno-cli/package.json
git commit -m "test(ohno-cli): add failing tests for KanbanBoard component"
```

---

## Task 6: Implement Basic KanbanBoard Component

**Files:**
- Create: `packages/ohno-cli/src/tui/KanbanBoard.tsx`

**Step 1: Create KanbanBoard component**

```tsx
/**
 * Terminal Kanban Board TUI Component
 */

import React from "react";
import { Box, Text } from "ink";
import type { KanbanData, KanbanTask } from "./kanban-data.js";

interface ColumnProps {
  title: string;
  tasks: KanbanTask[];
  color: string;
}

function Column({ title, tasks, color }: ColumnProps): React.ReactElement {
  return (
    <Box flexDirection="column" width={20} marginRight={1}>
      <Box borderStyle="single" borderColor={color} paddingX={1}>
        <Text bold color={color}>{title}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {tasks.length === 0 ? (
          <Text dimColor>No tasks</Text>
        ) : (
          tasks.map((task) => (
            <Text key={task.id} wrap="truncate">
              {task.title}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

interface KanbanBoardProps {
  data: KanbanData;
}

export function KanbanBoard({ data }: KanbanBoardProps): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Column title="Pending" tasks={[...data.todo, ...data.blocked]} color="gray" />
      <Column title="In Progress" tasks={data.inProgress} color="blue" />
      <Column title="Review" tasks={data.review} color="yellow" />
      <Column title="Done" tasks={data.done} color="green" />
    </Box>
  );
}
```

**Step 2: Run test to verify it passes**

Run: `cd packages/ohno-cli && npm test -- src/tui/kanban.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/ohno-cli/src/tui/KanbanBoard.tsx
git commit -m "feat(ohno-cli): add basic KanbanBoard TUI component"
```

---

## Task 7: Add Kanban CLI Command Test

**Files:**
- Modify: `packages/ohno-cli/src/cli.test.ts`

**Step 1: Add test for kanban command**

Add to CLI commands tests:

```typescript
describe("kanban command", () => {
  it("should have kanban command", () => {
    const program = createCli();
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain("kanban");
  });

  it("should output static kanban in JSON mode", async () => {
    db.createTask({ title: "Test task" });
    const inProgressId = db.createTask({ title: "Active task" });
    db.updateTaskStatus(inProgressId, "in_progress");

    const program = createCli();
    program.exitOverride();

    await program.parseAsync(["node", "test", "--json", "-d", tempDir, "kanban"]);

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = getConsoleOutput(consoleLogSpy);
    const parsed = JSON.parse(output);
    expect(parsed.todo).toHaveLength(1);
    expect(parsed.inProgress).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/ohno-cli && npm test -- src/cli.test.ts`
Expected: FAIL - kanban command not found

**Step 3: Commit failing test**

```bash
git add packages/ohno-cli/src/cli.test.ts
git commit -m "test(ohno-cli): add failing test for kanban CLI command"
```

---

## Task 8: Implement Kanban CLI Command (Static Mode)

**Files:**
- Modify: `packages/ohno-cli/src/cli.ts`

**Step 1: Add kanban command to CLI**

Add after the `sync` command block (~line 105):

```typescript
  program
    .command("kanban")
    .description("Display kanban board in terminal")
    .option("-w, --watch", "Live updating mode with interactivity")
    .action(async (options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const ohnoDir = getOhnoDir(globalOpts.dir);
      const dbPath = `${ohnoDir}/tasks.db`;

      const { getKanbanData } = await import("./tui/kanban-data.js");
      const data = await getKanbanData(dbPath);

      if (globalOpts.json) {
        out.json(data);
        return;
      }

      if (options.watch) {
        // Watch mode - to be implemented
        const { runKanbanTui } = await import("./tui/kanban-app.js");
        await runKanbanTui(dbPath);
      } else {
        // Static mode - print and exit
        const { renderStaticKanban } = await import("./tui/kanban-static.js");
        renderStaticKanban(data);
      }
    });
```

**Step 2: Create static kanban renderer**

Create `packages/ohno-cli/src/tui/kanban-static.ts`:

```typescript
/**
 * Static kanban board renderer (print and exit)
 */

import { colors } from "../output.js";
import type { KanbanData, KanbanTask } from "./kanban-data.js";

function formatColumn(title: string, tasks: KanbanTask[], width: number): string[] {
  const lines: string[] = [];
  const header = `─ ${title} ─`.padEnd(width, "─");
  lines.push(header);

  if (tasks.length === 0) {
    lines.push(colors.dim("  (empty)".padEnd(width)));
  } else {
    for (const task of tasks.slice(0, 10)) {
      const id = colors.dim(`#${task.id.slice(-4)}`);
      const title = task.title.slice(0, width - 8);
      lines.push(`${id} ${title}`);
    }
    if (tasks.length > 10) {
      lines.push(colors.dim(`  +${tasks.length - 10} more`));
    }
  }

  return lines;
}

export function renderStaticKanban(data: KanbanData): void {
  const width = 18;
  const pending = [...data.todo, ...data.blocked];

  const cols = [
    formatColumn("Pending", pending, width),
    formatColumn("In Progress", data.inProgress, width),
    formatColumn("Review", data.review, width),
    formatColumn("Done", data.done, width),
  ];

  // Find max height
  const maxHeight = Math.max(...cols.map((c) => c.length));

  // Pad columns to same height
  for (const col of cols) {
    while (col.length < maxHeight) {
      col.push("".padEnd(width));
    }
  }

  // Print row by row
  for (let i = 0; i < maxHeight; i++) {
    console.log(cols.map((c) => c[i]).join(" │ "));
  }

  console.log("");
  console.log(colors.dim("Use --watch for interactive mode"));
}
```

**Step 3: Run test to verify it passes**

Run: `cd packages/ohno-cli && npm test -- src/cli.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/ohno-cli/src/cli.ts packages/ohno-cli/src/tui/kanban-static.ts
git commit -m "feat(ohno-cli): add kanban CLI command with static display mode"
```

---

## Task 9: Add Keyboard Navigation Test

**Files:**
- Modify: `packages/ohno-cli/src/tui/kanban.test.ts`

**Step 1: Add test for keyboard navigation**

```typescript
describe("Keyboard navigation", () => {
  it("should highlight selected task", () => {
    const { KanbanBoard } = require("./KanbanBoard.js");
    const data: KanbanData = {
      todo: [
        { id: "task-1", title: "First", status: "todo" },
        { id: "task-2", title: "Second", status: "todo" },
      ],
      inProgress: [],
      review: [],
      done: [],
      blocked: [],
    };

    const { lastFrame } = render(
      <KanbanBoard data={data} selectedColumn={0} selectedRow={0} />
    );

    // Selected task should have indicator
    expect(lastFrame()).toContain("▶");
  });

  it("should move selection down with arrow key", () => {
    const { InteractiveKanban } = require("./InteractiveKanban.js");
    const data: KanbanData = {
      todo: [
        { id: "task-1", title: "First", status: "todo" },
        { id: "task-2", title: "Second", status: "todo" },
      ],
      inProgress: [],
      review: [],
      done: [],
      blocked: [],
    };

    const { lastFrame, stdin } = render(<InteractiveKanban initialData={data} />);

    // Press down arrow
    stdin.write("\x1B[B"); // Down arrow escape sequence

    expect(lastFrame()).toContain("▶Second");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/ohno-cli && npm test -- src/tui/kanban.test.ts`
Expected: FAIL - selectedColumn/selectedRow props not implemented

**Step 3: Commit failing test**

```bash
git add packages/ohno-cli/src/tui/kanban.test.ts
git commit -m "test(ohno-cli): add failing tests for keyboard navigation"
```

---

## Task 10: Implement Keyboard Navigation

**Files:**
- Modify: `packages/ohno-cli/src/tui/KanbanBoard.tsx`
- Create: `packages/ohno-cli/src/tui/InteractiveKanban.tsx`

**Step 1: Update KanbanBoard with selection support**

Update Column component and KanbanBoard:

```tsx
interface ColumnProps {
  title: string;
  tasks: KanbanTask[];
  color: string;
  isSelected?: boolean;
  selectedRow?: number;
}

function Column({ title, tasks, color, isSelected, selectedRow }: ColumnProps): React.ReactElement {
  return (
    <Box flexDirection="column" width={20} marginRight={1}>
      <Box
        borderStyle="single"
        borderColor={isSelected ? "cyan" : color}
        paddingX={1}
      >
        <Text bold color={isSelected ? "cyan" : color}>{title}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {tasks.length === 0 ? (
          <Text dimColor>No tasks</Text>
        ) : (
          tasks.map((task, idx) => (
            <Text key={task.id} wrap="truncate">
              {isSelected && idx === selectedRow ? "▶" : " "}
              {task.title}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

interface KanbanBoardProps {
  data: KanbanData;
  selectedColumn?: number;
  selectedRow?: number;
}

export function KanbanBoard({ data, selectedColumn = 0, selectedRow = 0 }: KanbanBoardProps): React.ReactElement {
  const columns = [
    { title: "Pending", tasks: [...data.todo, ...data.blocked], color: "gray" },
    { title: "In Progress", tasks: data.inProgress, color: "blue" },
    { title: "Review", tasks: data.review, color: "yellow" },
    { title: "Done", tasks: data.done, color: "green" },
  ];

  return (
    <Box flexDirection="row">
      {columns.map((col, idx) => (
        <Column
          key={col.title}
          title={col.title}
          tasks={col.tasks}
          color={col.color}
          isSelected={idx === selectedColumn}
          selectedRow={idx === selectedColumn ? selectedRow : undefined}
        />
      ))}
    </Box>
  );
}
```

**Step 2: Create InteractiveKanban with keyboard handling**

```tsx
/**
 * Interactive Kanban with keyboard navigation
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { KanbanBoard } from "./KanbanBoard.js";
import type { KanbanData } from "./kanban-data.js";

interface InteractiveKanbanProps {
  initialData: KanbanData;
  onRefresh?: () => Promise<KanbanData>;
  onMoveTask?: (taskId: string, newStatus: string) => Promise<void>;
}

export function InteractiveKanban({
  initialData,
  onRefresh,
  onMoveTask
}: InteractiveKanbanProps): React.ReactElement {
  const { exit } = useApp();
  const [data, setData] = useState(initialData);
  const [selectedColumn, setSelectedColumn] = useState(0);
  const [selectedRow, setSelectedRow] = useState(0);

  const columns = [
    { tasks: [...data.todo, ...data.blocked], status: "todo" },
    { tasks: data.inProgress, status: "in_progress" },
    { tasks: data.review, status: "review" },
    { tasks: data.done, status: "done" },
  ];

  const currentColumn = columns[selectedColumn];
  const maxRow = Math.max(0, currentColumn.tasks.length - 1);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit();
      return;
    }

    if (key.leftArrow) {
      setSelectedColumn((c) => Math.max(0, c - 1));
      setSelectedRow(0);
    } else if (key.rightArrow) {
      setSelectedColumn((c) => Math.min(3, c + 1));
      setSelectedRow(0);
    } else if (key.upArrow) {
      setSelectedRow((r) => Math.max(0, r - 1));
    } else if (key.downArrow) {
      setSelectedRow((r) => Math.min(maxRow, r + 1));
    } else if (input === "m" && currentColumn.tasks[selectedRow]) {
      // Move to next status
      const task = currentColumn.tasks[selectedRow];
      const nextStatus = selectedColumn < 3 ? columns[selectedColumn + 1].status : "done";
      onMoveTask?.(task.id, nextStatus);
    } else if (input === "M" && currentColumn.tasks[selectedRow]) {
      // Move to previous status
      const task = currentColumn.tasks[selectedRow];
      const prevStatus = selectedColumn > 0 ? columns[selectedColumn - 1].status : "todo";
      onMoveTask?.(task.id, prevStatus);
    }
  });

  // Auto-refresh
  useEffect(() => {
    if (!onRefresh) return;
    const interval = setInterval(async () => {
      const newData = await onRefresh();
      setData(newData);
    }, 1000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  return (
    <Box flexDirection="column">
      <KanbanBoard
        data={data}
        selectedColumn={selectedColumn}
        selectedRow={selectedRow}
      />
      <Box marginTop={1}>
        <Text dimColor>
          [←→] Column  [↑↓] Select  [m/M] Move  [q] Quit
        </Text>
      </Box>
    </Box>
  );
}
```

**Step 3: Run test to verify it passes**

Run: `cd packages/ohno-cli && npm test -- src/tui/kanban.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/ohno-cli/src/tui/KanbanBoard.tsx packages/ohno-cli/src/tui/InteractiveKanban.tsx
git commit -m "feat(ohno-cli): add keyboard navigation to kanban TUI"
```

---

## Task 11: Implement Watch Mode App

**Files:**
- Create: `packages/ohno-cli/src/tui/kanban-app.tsx`

**Step 1: Create kanban app for watch mode**

```tsx
/**
 * Main kanban TUI application (watch mode)
 */

import React from "react";
import { render } from "ink";
import { InteractiveKanban } from "./InteractiveKanban.js";
import { getKanbanData } from "./kanban-data.js";
import { TaskDatabase } from "@stevestomp/ohno-core";

interface KanbanAppProps {
  dbPath: string;
}

function KanbanApp({ dbPath }: KanbanAppProps): React.ReactElement {
  const [data, setData] = React.useState<Awaited<ReturnType<typeof getKanbanData>> | null>(null);

  React.useEffect(() => {
    getKanbanData(dbPath).then(setData);
  }, [dbPath]);

  if (!data) {
    return <></>;
  }

  const handleRefresh = async () => {
    return getKanbanData(dbPath);
  };

  const handleMoveTask = async (taskId: string, newStatus: string) => {
    const db = await TaskDatabase.open(dbPath);
    db.updateTaskStatus(taskId, newStatus as any);
    db.close();
    // Refresh data
    const newData = await getKanbanData(dbPath);
    setData(newData);
  };

  return (
    <InteractiveKanban
      initialData={data}
      onRefresh={handleRefresh}
      onMoveTask={handleMoveTask}
    />
  );
}

export async function runKanbanTui(dbPath: string): Promise<void> {
  const { waitUntilExit } = render(<KanbanApp dbPath={dbPath} />);
  await waitUntilExit();
}
```

**Step 2: Build and test manually**

Run: `cd packages/ohno-cli && npm run build`
Run: `cd packages/ohno-cli && node dist/index.js kanban --watch`
Expected: Interactive kanban appears, responds to arrow keys, q to quit

**Step 3: Commit**

```bash
git add packages/ohno-cli/src/tui/kanban-app.tsx
git commit -m "feat(ohno-cli): add watch mode kanban TUI app"
```

---

## Task 12: Add TUI Module Exports

**Files:**
- Create: `packages/ohno-cli/src/tui/index.ts`

**Step 1: Create module index**

```typescript
/**
 * TUI module exports
 */

export { getKanbanData, type KanbanData, type KanbanTask } from "./kanban-data.js";
export { KanbanBoard } from "./KanbanBoard.js";
export { InteractiveKanban } from "./InteractiveKanban.js";
export { runKanbanTui } from "./kanban-app.js";
export { renderStaticKanban } from "./kanban-static.js";
```

**Step 2: Verify build**

Run: `cd packages/ohno-cli && npm run build`
Expected: Build succeeds

**Step 3: Run all tests**

Run: `cd packages/ohno-cli && npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/ohno-cli/src/tui/index.ts
git commit -m "feat(ohno-cli): add TUI module exports"
```

---

## Task 13: Final Integration Test

**Files:**
- Modify: `packages/ohno-cli/src/cli.test.ts`

**Step 1: Add integration test for kanban --watch flag**

```typescript
describe("kanban --watch mode", () => {
  it("should accept --watch flag", () => {
    const program = createCli();
    const kanbanCmd = program.commands.find((c) => c.name() === "kanban");
    expect(kanbanCmd).toBeDefined();

    const watchOption = kanbanCmd?.options.find((o) => o.long === "--watch");
    expect(watchOption).toBeDefined();
  });
});
```

**Step 2: Run full test suite**

Run: `cd packages/ohno-cli && npm test`
Expected: All tests pass

**Step 3: Build final package**

Run: `cd packages/ohno-cli && npm run build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add packages/ohno-cli/src/cli.test.ts
git commit -m "test(ohno-cli): add integration test for kanban watch mode"
```

---

## Task 14: Update Design Doc with Completion

**Files:**
- Modify: `docs/plans/2026-01-22-terminal-kanban-tmux-workflow-design.md`

**Step 1: Add implementation status**

Add to end of design doc:

```markdown
---

## Implementation Status

**Completed:** 2026-01-22

All components implemented:
- `ohno kanban` - Static display mode
- `ohno kanban --watch` - Interactive TUI with live updates
- Keyboard navigation (←→↑↓)
- Task status changes (m/M keys)
- Auto-refresh (1s polling)
```

**Step 2: Commit**

```bash
git add docs/plans/2026-01-22-terminal-kanban-tmux-workflow-design.md
git commit -m "docs: mark terminal kanban implementation complete"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add ink dependencies |
| 2 | Configure TypeScript for JSX |
| 3 | Create kanban data test |
| 4 | Implement kanban data fetching |
| 5 | Create KanbanBoard component test |
| 6 | Implement KanbanBoard component |
| 7 | Add kanban CLI command test |
| 8 | Implement kanban CLI command (static) |
| 9 | Add keyboard navigation test |
| 10 | Implement keyboard navigation |
| 11 | Implement watch mode app |
| 12 | Add TUI module exports |
| 13 | Final integration test |
| 14 | Update design doc |

Total: 14 tasks following TDD red-green-refactor cycle.
