/**
 * Tests for CLI commands and output formatting
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createRequire } from "module";
import { TaskDatabase } from "@stevestomp/ohno-core";
import { createCli } from "./cli.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");
import {
  formatTask,
  formatStatus,
  formatPriority,
  formatTableRow,
  Output,
} from "./output.js";

// Helper to get console output
function getConsoleOutput(spy: MockInstance): string {
  return spy.mock.calls[0]?.[0] as string;
}

function getAllConsoleOutput(spy: MockInstance): string {
  return spy.mock.calls.map((c) => c[0]).join("\n");
}

describe("Output Formatting", () => {
  describe("formatStatus", () => {
    it("should format todo status", () => {
      const result = formatStatus("todo");
      expect(result).toContain("todo");
    });

    it("should format done status", () => {
      const result = formatStatus("done");
      expect(result).toContain("done");
    });

    it("should format in_progress status", () => {
      const result = formatStatus("in_progress");
      expect(result).toContain("in_progress");
    });

    it("should format blocked status", () => {
      const result = formatStatus("blocked");
      expect(result).toContain("blocked");
    });

    it("should format review status", () => {
      const result = formatStatus("review");
      expect(result).toContain("review");
    });

    it("should handle unknown status", () => {
      const result = formatStatus("unknown");
      expect(result).toContain("unknown");
    });
  });

  describe("formatPriority", () => {
    it("should format P0 priority", () => {
      const result = formatPriority("P0");
      expect(result).toContain("P0");
    });

    it("should format P1 priority", () => {
      const result = formatPriority("P1");
      expect(result).toContain("P1");
    });

    it("should format P2 priority", () => {
      const result = formatPriority("P2");
      expect(result).toContain("P2");
    });

    it("should format P3 priority", () => {
      const result = formatPriority("P3");
      expect(result).toContain("P3");
    });
  });

  describe("formatTask", () => {
    it("should format minimal task", () => {
      const task = { id: "task-123", title: "Test task", status: "todo" };
      const result = formatTask(task);
      expect(result).toContain("task-123");
      expect(result).toContain("Test task");
      expect(result).toContain("todo");
    });

    it("should format task with description", () => {
      const task = {
        id: "task-123",
        title: "Test",
        status: "todo",
        description: "A detailed description",
      };
      const result = formatTask(task);
      expect(result).toContain("Description:");
      expect(result).toContain("A detailed description");
    });

    it("should format task with progress", () => {
      const task = {
        id: "task-123",
        title: "Test",
        status: "in_progress",
        progress_percent: 50,
      };
      const result = formatTask(task);
      expect(result).toContain("Progress: 50%");
    });

    it("should format task with blocker", () => {
      const task = {
        id: "task-123",
        title: "Test",
        status: "blocked",
        blockers: "Waiting for API",
      };
      const result = formatTask(task);
      expect(result).toContain("Blocker:");
      expect(result).toContain("Waiting for API");
    });

    it("should format task with handoff notes", () => {
      const task = {
        id: "task-123",
        title: "Test",
        status: "todo",
        handoff_notes: "Continue from step 3",
      };
      const result = formatTask(task);
      expect(result).toContain("Handoff:");
      expect(result).toContain("Continue from step 3");
    });

    it("should format task with priority", () => {
      const task = {
        id: "task-123",
        title: "Test",
        status: "todo",
        epic_priority: "P0",
      };
      const result = formatTask(task);
      expect(result).toContain("Priority:");
      expect(result).toContain("P0");
    });

    it("should format task with type", () => {
      const task = {
        id: "task-123",
        title: "Test",
        status: "todo",
        task_type: "bug",
      };
      const result = formatTask(task);
      expect(result).toContain("Type: bug");
    });
  });

  describe("formatTableRow", () => {
    it("should format row with widths", () => {
      const result = formatTableRow(["A", "BB", "CCC"], [5, 5, 5]);
      expect(result).toBe("A      BB     CCC  ");
    });

    it("should handle empty columns", () => {
      const result = formatTableRow([], []);
      expect(result).toBe("");
    });
  });

  describe("Output class", () => {
    it("should toggle JSON mode", () => {
      const output = new Output();
      expect(output.isJsonMode()).toBe(false);
      output.setJsonMode(true);
      expect(output.isJsonMode()).toBe(true);
    });
  });
});

describe("CLI Commands", () => {
  let tempDir: string;
  let ohnoDir: string;
  let dbPath: string;
  let db: TaskDatabase;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ohno-cli-test-"));
    ohnoDir = join(tempDir, ".ohno");
    mkdirSync(ohnoDir);
    dbPath = join(ohnoDir, "tasks.db");
    db = await TaskDatabase.open(dbPath);

    // Spy on console to capture output
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("createCli", () => {
    it("should create CLI program", () => {
      const program = createCli();
      expect(program.name()).toBe("ohno");
      expect(program.version()).toBe(pkg.version);
    });

    it("should have required commands", () => {
      const program = createCli();
      const commands = program.commands.map((c) => c.name());
      expect(commands).toContain("status");
      expect(commands).toContain("init");
      expect(commands).toContain("tasks");
      expect(commands).toContain("task");
      expect(commands).toContain("create");
      expect(commands).toContain("start");
      expect(commands).toContain("done");
      expect(commands).toContain("review");
      expect(commands).toContain("block");
      expect(commands).toContain("unblock");
      expect(commands).toContain("context");
      expect(commands).toContain("next");
      expect(commands).toContain("serve");
      expect(commands).toContain("sync");
      expect(commands).toContain("dep");
    });

    it("should support --json option", () => {
      const program = createCli();
      const options = program.options;
      const jsonOption = options.find((o) => o.long === "--json");
      expect(jsonOption).toBeDefined();
    });

    it("should support -d/--dir option", () => {
      const program = createCli();
      const options = program.options;
      const dirOption = options.find((o) => o.long === "--dir");
      expect(dirOption).toBeDefined();
    });
  });

  describe("status command", () => {
    it("should output project status in JSON mode", async () => {
      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "status"]);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("total_tasks");
      expect(parsed).toHaveProperty("completion_percent");
    });

    it("should output formatted status without --json", async () => {
      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "-d", tempDir, "status"]);

      expect(consoleLogSpy).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(calls).toContain("Project Status");
    });
  });

  describe("tasks command", () => {
    it("should list tasks in JSON mode", async () => {
      db.createTask({ title: "Test task" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "tasks"]);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.tasks[0].title).toBe("Test task");
    });

    it("should filter tasks by status", async () => {
      db.createTask({ title: "Todo task" });
      const inProgressId = db.createTask({ title: "In progress task" });
      db.updateTaskStatus(inProgressId, "in_progress");

      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "tasks",
        "-s",
        "in_progress",
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.tasks[0].title).toBe("In progress task");
    });

    it("should respect limit option", async () => {
      db.createTask({ title: "Task 1" });
      db.createTask({ title: "Task 2" });
      db.createTask({ title: "Task 3" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "tasks",
        "-l",
        "2",
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.tasks).toHaveLength(2);
    });
  });

  describe("task command", () => {
    it("should get task details in JSON mode", async () => {
      const taskId = db.createTask({ title: "Test task" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "task", taskId]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.id).toBe(taskId);
      expect(parsed.title).toBe("Test task");
    });
  });

  describe("create command", () => {
    it("should create task in JSON mode", async () => {
      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "create",
        "New task",
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.task_id).toMatch(/^task-[a-f0-9]{8}$/);
    });

    it("should create task with options", async () => {
      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "create",
        "Bug fix",
        "-t",
        "bug",
        "-e",
        "4",
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      // Reload to see changes made by CLI
      await db.reload();
      const task = db.getTask(parsed.task_id);
      expect(task?.task_type).toBe("bug");
      expect(task?.estimate_hours).toBe(4);
    });
  });

  describe("start command", () => {
    it("should start task", async () => {
      const taskId = db.createTask({ title: "Test" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "start", taskId]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      // Reload to see changes made by CLI
      await db.reload();
      const task = db.getTask(taskId);
      expect(task?.status).toBe("in_progress");
    });
  });

  describe("done command", () => {
    it("should mark task as done", async () => {
      const taskId = db.createTask({ title: "Test" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "done", taskId]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      // Reload to see changes made by CLI
      await db.reload();
      const task = db.getTask(taskId);
      expect(task?.status).toBe("done");
    });
  });

  describe("block command", () => {
    it("should block task", async () => {
      const taskId = db.createTask({ title: "Test" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "block",
        taskId,
        "Waiting for API",
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      // Reload to see changes made by CLI
      await db.reload();
      const task = db.getTask(taskId);
      expect(task?.status).toBe("blocked");
      expect(task?.blockers).toBe("Waiting for API");
    });
  });

  describe("unblock command", () => {
    it("should unblock task", async () => {
      const taskId = db.createTask({ title: "Test" });
      db.setBlocker(taskId, "Waiting");

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "unblock", taskId]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      // Reload to see changes made by CLI
      await db.reload();
      const task = db.getTask(taskId);
      expect(task?.status).toBe("in_progress");
    });
  });

  describe("context command", () => {
    it("should return session context in JSON mode", async () => {
      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "context"]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("in_progress_tasks");
      expect(parsed).toHaveProperty("blocked_tasks");
      expect(parsed).toHaveProperty("recent_activity");
    });
  });

  describe("next command", () => {
    it("should return next task in JSON mode", async () => {
      db.createTask({ title: "Available task" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "next"]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.title).toBe("Available task");
    });

    it("should return message when no tasks", async () => {
      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "next"]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.message).toBe("No tasks available");
    });
  });

  describe("dep subcommands", () => {
    it("should add dependency", async () => {
      const taskA = db.createTask({ title: "Task A" });
      const taskB = db.createTask({ title: "Task B" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "dep",
        "add",
        taskA,
        taskB,
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.dependency_id).toMatch(/^dep-[a-f0-9]{8}$/);
    });

    it("should remove dependency", async () => {
      const taskA = db.createTask({ title: "Task A" });
      const taskB = db.createTask({ title: "Task B" });
      db.addDependency(taskA, taskB);

      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "dep",
        "rm",
        taskA,
        taskB,
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
    });

    it("should list dependencies", async () => {
      const taskA = db.createTask({ title: "Task A" });
      const taskB = db.createTask({ title: "Task B" });
      db.addDependency(taskA, taskB);

      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "dep",
        "list",
        taskA,
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.dependencies).toHaveLength(1);
      expect(parsed.is_blocked).toBe(true);
    });
  });
});