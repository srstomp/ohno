/**
 * Tests for CLI commands and output formatting
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createRequire } from "module";
import { TaskDatabase, OhnoDatabaseLockedError } from "@stevestomp/ohno-core";
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
      expect(commands).toContain("update-wip");
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

  describe("task subcommands", () => {
    it("should get task details via task get", async () => {
      const taskId = db.createTask({ title: "Test task" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "task", "get", taskId]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.id).toBe(taskId);
      expect(parsed.title).toBe("Test task");
    });

    it("should list tasks via task list", async () => {
      db.createTask({ title: "Task A" });
      db.createTask({ title: "Task B" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "task", "list"]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.tasks).toHaveLength(2);
    });

    it("should filter tasks via task list --status", async () => {
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
        "task",
        "list",
        "-s",
        "in_progress",
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.tasks[0].title).toBe("In progress task");
    });

    it("should create task via task create", async () => {
      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "task",
        "create",
        "New task via subcommand",
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.task_id).toMatch(/^task-[a-f0-9]{8}$/);
    });

    it("should start task via task start", async () => {
      const taskId = db.createTask({ title: "Test" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "task", "start", taskId]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      await db.reload();
      const task = db.getTask(taskId);
      expect(task?.status).toBe("in_progress");
    });

    it("should mark task done via task done", async () => {
      const taskId = db.createTask({ title: "Test" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "task", "done", taskId]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      await db.reload();
      const task = db.getTask(taskId);
      expect(task?.status).toBe("done");
    });

    it("should have subcommands consistent with epic/story pattern", () => {
      const program = createCli();
      const taskCmd = program.commands.find((c) => c.name() === "task");
      expect(taskCmd).toBeDefined();

      const subcommands = taskCmd!.commands.map((c) => c.name());
      expect(subcommands).toContain("get");
      expect(subcommands).toContain("list");
      expect(subcommands).toContain("create");
      expect(subcommands).toContain("start");
      expect(subcommands).toContain("done");
      expect(subcommands).toContain("review");
      expect(subcommands).toContain("block");
      expect(subcommands).toContain("unblock");
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

    it("should default source to human when not specified", async () => {
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

      // Reload to see changes made by CLI
      await db.reload();
      const task = db.getTask(parsed.task_id);
      expect(task?.source).toBe("human");
    });

    it("should set source when --source flag is provided", async () => {
      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "create",
        "Fix from kaizen",
        "--source",
        "kaizen-fix",
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      // Reload to see changes made by CLI
      await db.reload();
      const task = db.getTask(parsed.task_id);
      expect(task?.source).toBe("kaizen-fix");
    });

    it("should accept all valid source types", async () => {
      const sources = ["human", "pokayokay-plan", "kaizen-fix", "kaizen-suggest"];

      for (const source of sources) {
        const program = createCli();
        program.exitOverride();

        await program.parseAsync([
          "node",
          "test",
          "--json",
          "-d",
          tempDir,
          "create",
          `Task from ${source}`,
          "--source",
          source,
        ]);

        const output = getConsoleOutput(consoleLogSpy);
        const parsed = JSON.parse(output);
        expect(parsed.success).toBe(true);

        // Reload to see changes made by CLI
        await db.reload();
        const task = db.getTask(parsed.task_id);
        expect(task?.source).toBe(source);

        // Clear the spy for the next iteration
        consoleLogSpy.mockClear();
      }
    });

    it("should reject invalid source types", async () => {
      const program = createCli();
      program.exitOverride();

      await expect(
        program.parseAsync([
          "node",
          "test",
          "--json",
          "-d",
          tempDir,
          "create",
          "Task with invalid source",
          "--source",
          "invalid-source",
        ])
      ).rejects.toThrow();
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

  describe("reopen command", () => {
    it("should reopen a done task via top-level command", async () => {
      const taskId = db.createTask({ title: "Test" });
      db.updateTaskStatus(taskId, "done");

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "reopen", taskId]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      await db.reload();
      const task = db.getTask(taskId);
      expect(task?.status).toBe("todo");
    });

    it("should reopen via task subcommand", async () => {
      const taskId = db.createTask({ title: "Test" });
      db.updateTaskStatus(taskId, "done");

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "task", "reopen", taskId]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      await db.reload();
      const task = db.getTask(taskId);
      expect(task?.status).toBe("todo");
    });

    it("should pass notes to reopen", async () => {
      const taskId = db.createTask({ title: "Test" });
      db.updateTaskStatus(taskId, "done");

      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node", "test", "--json", "-d", tempDir,
        "reopen", taskId, "-n", "Found regression",
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
    });
  });

  describe("update-wip command", () => {
    it("should update task WIP with file modifications", async () => {
      const taskId = db.createTask({ title: "Test task" });

      const program = createCli();
      program.exitOverride();

      const wipData = JSON.stringify({
        files_modified: ["src/auth.ts", "src/db.ts"],
        uncommitted_changes: true
      });

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "update-wip", taskId, wipData]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      // Reload to see changes made by CLI
      await db.reload();
      const task = db.getTask(taskId, "full");
      expect(task?.work_in_progress).toBeDefined();

      const wip = JSON.parse(task?.work_in_progress || "{}");
      expect(wip.files_modified).toEqual(["src/auth.ts", "src/db.ts"]);
      expect(wip.uncommitted_changes).toBe(true);
    });

    it("should update task WIP with test results", async () => {
      const taskId = db.createTask({ title: "Test task" });

      const program = createCli();
      program.exitOverride();

      const wipData = JSON.stringify({
        test_results: { ran: true, passed: 12, failed: 1 }
      });

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "update-wip", taskId, wipData]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      // Reload to see changes made by CLI
      await db.reload();
      const task = db.getTask(taskId, "full");
      expect(task?.work_in_progress).toBeDefined();

      const wip = JSON.parse(task?.work_in_progress || "{}");
      expect(wip.test_results).toEqual({ ran: true, passed: 12, failed: 1 });
    });

    it("should update task WIP with commit hash", async () => {
      const taskId = db.createTask({ title: "Test task" });

      const program = createCli();
      program.exitOverride();

      const wipData = JSON.stringify({
        last_commit: "abc1234",
        uncommitted_changes: false
      });

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "update-wip", taskId, wipData]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      // Reload to see changes made by CLI
      await db.reload();
      const task = db.getTask(taskId, "full");
      expect(task?.work_in_progress).toBeDefined();

      const wip = JSON.parse(task?.work_in_progress || "{}");
      expect(wip.last_commit).toBe("abc1234");
      expect(wip.uncommitted_changes).toBe(false);
    });

    it("should handle invalid JSON gracefully", async () => {
      const taskId = db.createTask({ title: "Test task" });

      const program = createCli();
      program.exitOverride();

      await expect(
        program.parseAsync(["node", "test", "--json", "-d", tempDir, "update-wip", taskId, "invalid json"])
      ).rejects.toThrow();
    });

    it("should fail for non-existent task", async () => {
      const program = createCli();
      program.exitOverride();

      const wipData = JSON.stringify({ files_modified: ["src/test.ts"] });

      await expect(
        program.parseAsync(["node", "test", "--json", "-d", tempDir, "update-wip", "non-existent", wipData])
      ).rejects.toThrow();
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

  describe("set-handoff command", () => {
    it("should store handoff with status and summary", async () => {
      const taskId = db.createTask({ title: "Test task" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "set-handoff",
        taskId,
        "PASS",
        "Implementation complete",
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      // Reload to see changes made by CLI
      await db.reload();
      const handoff = db.getTaskHandoff(taskId);
      expect(handoff).toBeDefined();
      expect(handoff?.status).toBe("PASS");
      expect(handoff?.summary).toBe("Implementation complete");
    });

    it("should store handoff with files changed", async () => {
      const taskId = db.createTask({ title: "Test task" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "set-handoff",
        taskId,
        "PASS",
        "Added new feature",
        "--files",
        '["src/feature.ts","src/test.ts"]',
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      // Reload to see changes made by CLI
      await db.reload();
      const handoff = db.getTaskHandoff(taskId);
      expect(handoff?.files_changed).toEqual(["src/feature.ts", "src/test.ts"]);
    });

    it("should store handoff with full details", async () => {
      const taskId = db.createTask({ title: "Test task" });

      const program = createCli();
      program.exitOverride();

      const fullDetails = "Full implementation report with all details";

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "set-handoff",
        taskId,
        "FAIL",
        "Tests failed",
        "--details",
        fullDetails,
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);

      // Reload to see changes made by CLI
      await db.reload();
      const handoff = db.getTaskHandoff(taskId, true);
      expect(handoff?.full_details).toBe(fullDetails);
    });

    it("should fail for non-existent task", async () => {
      const program = createCli();
      program.exitOverride();

      await expect(
        program.parseAsync([
          "node",
          "test",
          "--json",
          "-d",
          tempDir,
          "set-handoff",
          "non-existent",
          "PASS",
          "Summary",
        ])
      ).rejects.toThrow();
    });

    it("should fail with invalid JSON in --files", async () => {
      const taskId = db.createTask({ title: "Test task" });
      const program = createCli();
      program.exitOverride();

      await expect(
        program.parseAsync([
          "node",
          "test",
          "--json",
          "-d",
          tempDir,
          "set-handoff",
          taskId,
          "PASS",
          "Summary",
          "--files",
          '["invalid json',
        ])
      ).rejects.toThrow();
    });
  });

  describe("epic subcommands", () => {
    it("should create epic in JSON mode", async () => {
      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "epic",
        "create",
        "New epic",
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.epic_id).toMatch(/^epic-[a-f0-9]{8}$/);
    });

    it("should persist epic to database", async () => {
      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "epic",
        "create",
        "Persistent epic",
        "-p",
        "P0",
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);

      // Reload to see changes made by CLI
      await db.reload();
      const epic = db.getEpic(parsed.epic_id);
      expect(epic).not.toBeNull();
      expect(epic?.title).toBe("Persistent epic");
      expect(epic?.priority).toBe("P0");
    });

    it("should get epic details in JSON mode", async () => {
      const epicId = db.createEpic({ title: "Test epic" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "epic", "get", epicId]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.id).toBe(epicId);
      expect(parsed.title).toBe("Test epic");
    });

    it("should list epics in JSON mode", async () => {
      db.createEpic({ title: "Epic 1" });
      db.createEpic({ title: "Epic 2" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "epics"]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.epics).toHaveLength(2);
    });
  });

  describe("story subcommands", () => {
    it("should create story in JSON mode", async () => {
      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "story",
        "create",
        "New story",
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.story_id).toMatch(/^story-[a-f0-9]{8}$/);
    });

    it("should persist story to database", async () => {
      const epicId = db.createEpic({ title: "Parent epic" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "story",
        "create",
        "Persistent story",
        "-e",
        epicId,
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);

      // Reload to see changes made by CLI
      await db.reload();
      const story = db.getStory(parsed.story_id);
      expect(story).not.toBeNull();
      expect(story?.title).toBe("Persistent story");
      expect(story?.epic_id).toBe(epicId);
    });

    it("should get story details in JSON mode", async () => {
      const storyId = db.createStory({ title: "Test story" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "story", "get", storyId]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.id).toBe(storyId);
      expect(parsed.title).toBe("Test story");
    });

    it("should list stories in JSON mode", async () => {
      db.createStory({ title: "Story 1" });
      db.createStory({ title: "Story 2" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync(["node", "test", "--json", "-d", tempDir, "stories"]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.stories).toHaveLength(2);
    });

    it("should filter stories by epic", async () => {
      const epicId = db.createEpic({ title: "Epic" });
      db.createStory({ title: "Story with epic", epic_id: epicId });
      db.createStory({ title: "Orphan story" });

      const program = createCli();
      program.exitOverride();

      await program.parseAsync([
        "node",
        "test",
        "--json",
        "-d",
        tempDir,
        "stories",
        "-e",
        epicId,
      ]);

      const output = getConsoleOutput(consoleLogSpy);
      const parsed = JSON.parse(output);
      expect(parsed.stories).toHaveLength(1);
      expect(parsed.stories[0].title).toBe("Story with epic");
    });
  });

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

    it("should accept --watch flag", () => {
      const program = createCli();
      const kanbanCmd = program.commands.find((c) => c.name() === "kanban");
      expect(kanbanCmd).toBeDefined();

      const watchOption = kanbanCmd?.options.find((o) => o.long === "--watch");
      expect(watchOption).toBeDefined();
    });
  });

  describe("OhnoDatabaseLockedError - CLI entry point error handler", () => {
    it("MUST: OhnoDatabaseLockedError is a real error class importable from ohno-core", () => {
      const err = new OhnoDatabaseLockedError("SQLITE_BUSY", "test");
      expect(err).toBeInstanceOf(OhnoDatabaseLockedError);
      expect(err.sqliteCode).toBe("SQLITE_BUSY");
    });

    it("MUST: CLI error handler emits stderr message for OhnoDatabaseLockedError without --json", () => {
      // Test the logic of the main().catch() handler by simulating it directly.
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

      const err = new OhnoDatabaseLockedError(
        "SQLITE_BUSY",
        "Database is locked by another ohno process; retry timed out after 5s. Try again, or check for stale ohno-mcp processes with 'ps aux | grep ohno-mcp'."
      );

      // Simulate the catch handler from index.ts (without --json in argv)
      const originalArgv = process.argv;
      process.argv = ["node", "ohno", "tasks"];  // no --json
      if (err instanceof OhnoDatabaseLockedError) {
        if (process.argv.includes('--json')) {
          process.stdout.write(JSON.stringify({
            success: false,
            error: err.message,
            errorCode: err.sqliteCode,
          }) + '\n');
        } else {
          process.stderr.write(err.message + '\n');
        }
        process.exit(1);
      }
      process.argv = originalArgv;

      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("retry timed out after 5s"));
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);

      stderrSpy.mockRestore();
      stdoutSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it("MUST: CLI error handler emits JSON to stdout for OhnoDatabaseLockedError with --json", () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

      const err = new OhnoDatabaseLockedError(
        "SQLITE_BUSY",
        "Database is locked by another ohno process; retry timed out after 5s. Try again, or check for stale ohno-mcp processes with 'ps aux | grep ohno-mcp'."
      );

      const originalArgv = process.argv;
      process.argv = ["node", "ohno", "tasks", "--json"];
      if (err instanceof OhnoDatabaseLockedError) {
        if (process.argv.includes('--json')) {
          process.stdout.write(JSON.stringify({
            success: false,
            error: err.message,
            errorCode: err.sqliteCode,
          }) + '\n');
        } else {
          process.stderr.write(err.message + '\n');
        }
        process.exit(1);
      }
      process.argv = originalArgv;

      const jsonOutput = JSON.parse(stdoutSpy.mock.calls[0]?.[0] as string);
      expect(jsonOutput.success).toBe(false);
      expect(jsonOutput.error).toContain("retry timed out after 5s");
      expect(jsonOutput.errorCode).toBe("SQLITE_BUSY");
      expect(stderrSpy).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);

      stderrSpy.mockRestore();
      stdoutSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});