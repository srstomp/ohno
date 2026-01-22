/**
 * Tests for terminal kanban TUI
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { TaskDatabase } from "@stevestomp/ohno-core";
import { render } from "ink-testing-library";
import React from "react";
import type { KanbanData } from "./kanban-data.js";

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
      db.createTask({ title: "Todo task" });
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

describe("KanbanBoard component", () => {
  it("should render column headers", async () => {
    const { KanbanBoard } = await import("./KanbanBoard.js");
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

  it("should render tasks in correct columns", async () => {
    const { KanbanBoard } = await import("./KanbanBoard.js");
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

describe("Keyboard navigation", () => {
  it("should highlight selected task with indicator", async () => {
    const { KanbanBoard } = await import("./KanbanBoard.js");
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
    expect(lastFrame()).toContain("First");
  });

  it("should move selection with InteractiveKanban", async () => {
    const { InteractiveKanban } = await import("./InteractiveKanban.js");
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

    // Initial state - first task selected
    expect(lastFrame()).toContain("▶");

    // Press down arrow
    stdin.write("\x1B[B"); // Down arrow escape sequence

    // Now second task should be selected
    const frame = lastFrame();
    expect(frame).toContain("▶");
  });
});
