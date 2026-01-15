/**
 * Tests for MCP server
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { TaskDatabase } from "@stevestomp/ohno-core";
import { ZodError } from "zod";
import {
  handleTool,
  setDb,
  TOOLS,
  GetTasksSchema,
  TaskIdSchema,
  UpdateStatusSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  ActivitySchema,
  HandoffNotesSchema,
  ProgressSchema,
  BlockerSchema,
  ArchiveSchema,
  DependencySchema,
  RemoveDependencySchema,
  SummarizeSchema,
} from "./server.js";

describe("MCP Server", () => {
  let tempDir: string;
  let dbPath: string;
  let db: TaskDatabase;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ohno-mcp-test-"));
    dbPath = join(tempDir, "tasks.db");
    db = new TaskDatabase(dbPath);
    setDb(db);
  });

  afterEach(() => {
    setDb(null);
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Tool Definitions", () => {
    it("should have 19 tools defined", () => {
      expect(TOOLS.length).toBe(19);
    });

    it("should have unique tool names", () => {
      const names = TOOLS.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it("should have required fields for each tool", () => {
      for (const tool of TOOLS) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }
    });

    it("should include all expected tool names", () => {
      const expectedTools = [
        "get_project_status",
        "get_session_context",
        "get_tasks",
        "get_task",
        "get_next_task",
        "get_blocked_tasks",
        "update_task_status",
        "add_task_activity",
        "set_handoff_notes",
        "update_task_progress",
        "set_blocker",
        "resolve_blocker",
        "create_task",
        "update_task",
        "archive_task",
        "add_dependency",
        "remove_dependency",
        "get_task_dependencies",
        "summarize_task_activity",
      ];

      const toolNames = TOOLS.map((t) => t.name);
      for (const expected of expectedTools) {
        expect(toolNames).toContain(expected);
      }
    });
  });

  describe("Zod Schema Validation", () => {
    describe("GetTasksSchema", () => {
      it("should accept empty object", () => {
        const result = GetTasksSchema.parse({});
        expect(result.limit).toBe(50); // default
      });

      it("should accept valid status", () => {
        const result = GetTasksSchema.parse({ status: "todo" });
        expect(result.status).toBe("todo");
      });

      it("should reject invalid status", () => {
        expect(() => GetTasksSchema.parse({ status: "invalid" })).toThrow(ZodError);
      });

      it("should accept valid priority", () => {
        const result = GetTasksSchema.parse({ priority: "P0" });
        expect(result.priority).toBe("P0");
      });

      it("should reject invalid priority", () => {
        expect(() => GetTasksSchema.parse({ priority: "P5" })).toThrow(ZodError);
      });

      it("should accept valid limit", () => {
        const result = GetTasksSchema.parse({ limit: 10 });
        expect(result.limit).toBe(10);
      });

      it("should reject limit below minimum", () => {
        expect(() => GetTasksSchema.parse({ limit: 0 })).toThrow(ZodError);
      });

      it("should reject limit above maximum", () => {
        expect(() => GetTasksSchema.parse({ limit: 101 })).toThrow(ZodError);
      });
    });

    describe("TaskIdSchema", () => {
      it("should accept valid task_id", () => {
        const result = TaskIdSchema.parse({ task_id: "task-abc123" });
        expect(result.task_id).toBe("task-abc123");
      });

      it("should reject empty task_id", () => {
        expect(() => TaskIdSchema.parse({ task_id: "" })).toThrow(ZodError);
      });

      it("should reject missing task_id", () => {
        expect(() => TaskIdSchema.parse({})).toThrow(ZodError);
      });
    });

    describe("UpdateStatusSchema", () => {
      it("should accept valid status update", () => {
        const result = UpdateStatusSchema.parse({
          task_id: "task-123",
          status: "in_progress",
        });
        expect(result.status).toBe("in_progress");
      });

      it("should accept optional notes", () => {
        const result = UpdateStatusSchema.parse({
          task_id: "task-123",
          status: "done",
          notes: "Completed the work",
        });
        expect(result.notes).toBe("Completed the work");
      });

      it("should reject invalid status", () => {
        expect(() =>
          UpdateStatusSchema.parse({
            task_id: "task-123",
            status: "invalid",
          })
        ).toThrow(ZodError);
      });
    });

    describe("CreateTaskSchema", () => {
      it("should accept minimal task", () => {
        const result = CreateTaskSchema.parse({ title: "New task" });
        expect(result.title).toBe("New task");
        expect(result.task_type).toBe("feature"); // default
      });

      it("should accept all fields", () => {
        const result = CreateTaskSchema.parse({
          title: "Full task",
          story_id: "story-1",
          task_type: "bug",
          description: "Fix the bug",
          estimate_hours: 4,
        });
        expect(result.task_type).toBe("bug");
        expect(result.estimate_hours).toBe(4);
      });

      it("should reject empty title", () => {
        expect(() => CreateTaskSchema.parse({ title: "" })).toThrow(ZodError);
      });

      it("should reject invalid task_type", () => {
        expect(() =>
          CreateTaskSchema.parse({ title: "Task", task_type: "invalid" })
        ).toThrow(ZodError);
      });
    });

    describe("ProgressSchema", () => {
      it("should accept valid progress", () => {
        const result = ProgressSchema.parse({
          task_id: "task-123",
          progress_percent: 50,
        });
        expect(result.progress_percent).toBe(50);
      });

      it("should accept 0 progress", () => {
        const result = ProgressSchema.parse({
          task_id: "task-123",
          progress_percent: 0,
        });
        expect(result.progress_percent).toBe(0);
      });

      it("should accept 100 progress", () => {
        const result = ProgressSchema.parse({
          task_id: "task-123",
          progress_percent: 100,
        });
        expect(result.progress_percent).toBe(100);
      });

      it("should reject progress below 0", () => {
        expect(() =>
          ProgressSchema.parse({
            task_id: "task-123",
            progress_percent: -1,
          })
        ).toThrow(ZodError);
      });

      it("should reject progress above 100", () => {
        expect(() =>
          ProgressSchema.parse({
            task_id: "task-123",
            progress_percent: 101,
          })
        ).toThrow(ZodError);
      });
    });

    describe("DependencySchema", () => {
      it("should accept valid dependency", () => {
        const result = DependencySchema.parse({
          task_id: "task-a",
          depends_on_task_id: "task-b",
        });
        expect(result.dependency_type).toBe("blocks"); // default
      });

      it("should accept dependency_type", () => {
        const result = DependencySchema.parse({
          task_id: "task-a",
          depends_on_task_id: "task-b",
          dependency_type: "requires",
        });
        expect(result.dependency_type).toBe("requires");
      });

      it("should reject invalid dependency_type", () => {
        expect(() =>
          DependencySchema.parse({
            task_id: "task-a",
            depends_on_task_id: "task-b",
            dependency_type: "invalid",
          })
        ).toThrow(ZodError);
      });
    });
  });

  describe("Tool Handlers", () => {
    describe("get_project_status", () => {
      it("should return project status", () => {
        const result = handleTool("get_project_status", {}) as Record<string, unknown>;
        expect(result).toHaveProperty("total_tasks");
        expect(result).toHaveProperty("completion_percent");
      });
    });

    describe("get_session_context", () => {
      it("should return session context", () => {
        const result = handleTool("get_session_context", {}) as Record<string, unknown>;
        expect(result).toHaveProperty("in_progress_tasks");
        expect(result).toHaveProperty("blocked_tasks");
        expect(result).toHaveProperty("recent_activity");
      });
    });

    describe("get_tasks", () => {
      it("should return empty tasks list initially", () => {
        const result = handleTool("get_tasks", {}) as { tasks: unknown[] };
        expect(result.tasks).toEqual([]);
      });

      it("should return created tasks", () => {
        db.createTask({ title: "Test task" });
        const result = handleTool("get_tasks", {}) as { tasks: unknown[] };
        expect(result.tasks.length).toBe(1);
      });

      it("should filter by status", () => {
        db.createTask({ title: "Todo task" });
        const inProgressId = db.createTask({ title: "In progress" });
        db.updateTaskStatus(inProgressId, "in_progress");

        const result = handleTool("get_tasks", { status: "in_progress" }) as {
          tasks: Array<{ title: string }>;
        };
        expect(result.tasks.length).toBe(1);
        expect(result.tasks[0].title).toBe("In progress");
      });
    });

    describe("get_task", () => {
      it("should return task by ID", () => {
        const taskId = db.createTask({ title: "Test task" });
        const result = handleTool("get_task", { task_id: taskId }) as { title: string };
        expect(result.title).toBe("Test task");
      });

      it("should return error for non-existent task", () => {
        const result = handleTool("get_task", { task_id: "non-existent" }) as { error: string };
        expect(result.error).toContain("Task not found");
      });
    });

    describe("get_next_task", () => {
      it("should return message when no tasks", () => {
        const result = handleTool("get_next_task", {}) as { message: string };
        expect(result.message).toBe("No tasks available");
      });

      it("should return next task", () => {
        db.createTask({ title: "Available task" });
        const result = handleTool("get_next_task", {}) as { title: string };
        expect(result.title).toBe("Available task");
      });
    });

    describe("get_blocked_tasks", () => {
      it("should return empty list when no blocked tasks", () => {
        const result = handleTool("get_blocked_tasks", {}) as { tasks: unknown[] };
        expect(result.tasks).toEqual([]);
      });

      it("should return blocked tasks", () => {
        const taskId = db.createTask({ title: "Blocked task" });
        db.setBlocker(taskId, "Waiting for API");
        const result = handleTool("get_blocked_tasks", {}) as {
          tasks: Array<{ blockers: string }>;
        };
        expect(result.tasks.length).toBe(1);
        expect(result.tasks[0].blockers).toBe("Waiting for API");
      });
    });

    describe("create_task", () => {
      it("should create task and return ID", () => {
        const result = handleTool("create_task", { title: "New task" }) as {
          success: boolean;
          task_id: string;
        };
        expect(result.success).toBe(true);
        expect(result.task_id).toMatch(/^task-[a-f0-9]{8}$/);
      });

      it("should create task with all options", () => {
        const result = handleTool("create_task", {
          title: "Full task",
          task_type: "bug",
          description: "Fix something",
          estimate_hours: 4,
        }) as { success: boolean; task_id: string };

        const task = db.getTask(result.task_id);
        expect(task?.task_type).toBe("bug");
        expect(task?.estimate_hours).toBe(4);
      });
    });

    describe("update_task_status", () => {
      it("should update task status", () => {
        const taskId = db.createTask({ title: "Test" });
        const result = handleTool("update_task_status", {
          task_id: taskId,
          status: "in_progress",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        expect(db.getTask(taskId)?.status).toBe("in_progress");
      });

      it("should set handoff notes when provided", () => {
        const taskId = db.createTask({ title: "Test" });
        handleTool("update_task_status", {
          task_id: taskId,
          status: "done",
          notes: "Completed successfully",
        });

        expect(db.getTask(taskId)?.handoff_notes).toBe("Completed successfully");
      });
    });

    describe("update_task", () => {
      it("should update task fields", () => {
        const taskId = db.createTask({ title: "Original" });
        const result = handleTool("update_task", {
          task_id: taskId,
          title: "Updated",
          description: "New description",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        const task = db.getTask(taskId);
        expect(task?.title).toBe("Updated");
        expect(task?.description).toBe("New description");
      });
    });

    describe("add_task_activity", () => {
      it("should add activity to task", () => {
        const taskId = db.createTask({ title: "Test" });
        const result = handleTool("add_task_activity", {
          task_id: taskId,
          activity_type: "note",
          description: "Added a note",
        }) as { success: boolean };

        expect(result.success).toBe(true);
      });
    });

    describe("set_handoff_notes", () => {
      it("should set handoff notes", () => {
        const taskId = db.createTask({ title: "Test" });
        const result = handleTool("set_handoff_notes", {
          task_id: taskId,
          notes: "Continue from step 3",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        expect(db.getTask(taskId)?.handoff_notes).toBe("Continue from step 3");
      });
    });

    describe("update_task_progress", () => {
      it("should update progress", () => {
        const taskId = db.createTask({ title: "Test" });
        const result = handleTool("update_task_progress", {
          task_id: taskId,
          progress_percent: 50,
        }) as { success: boolean };

        expect(result.success).toBe(true);
        expect(db.getTask(taskId)?.progress_percent).toBe(50);
      });

      it("should update progress with context summary", () => {
        const taskId = db.createTask({ title: "Test" });
        handleTool("update_task_progress", {
          task_id: taskId,
          progress_percent: 75,
          context_summary: "Almost done",
        });

        expect(db.getTask(taskId)?.context_summary).toBe("Almost done");
      });
    });

    describe("set_blocker", () => {
      it("should set blocker on task", () => {
        const taskId = db.createTask({ title: "Test" });
        const result = handleTool("set_blocker", {
          task_id: taskId,
          reason: "Waiting for API",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        const task = db.getTask(taskId);
        expect(task?.status).toBe("blocked");
        expect(task?.blockers).toBe("Waiting for API");
      });
    });

    describe("resolve_blocker", () => {
      it("should resolve blocker", () => {
        const taskId = db.createTask({ title: "Test" });
        db.setBlocker(taskId, "Waiting");

        const result = handleTool("resolve_blocker", { task_id: taskId }) as {
          success: boolean;
        };

        expect(result.success).toBe(true);
        expect(db.getTask(taskId)?.status).toBe("in_progress");
      });
    });

    describe("archive_task", () => {
      it("should archive task", () => {
        const taskId = db.createTask({ title: "Test" });
        const result = handleTool("archive_task", { task_id: taskId }) as {
          success: boolean;
        };

        expect(result.success).toBe(true);
        expect(db.getTask(taskId)?.status).toBe("archived");
      });
    });

    describe("add_dependency", () => {
      it("should add dependency between tasks", () => {
        const taskA = db.createTask({ title: "Task A" });
        const taskB = db.createTask({ title: "Task B" });

        const result = handleTool("add_dependency", {
          task_id: taskA,
          depends_on_task_id: taskB,
        }) as { success: boolean; dependency_id: string };

        expect(result.success).toBe(true);
        expect(result.dependency_id).toMatch(/^dep-[a-f0-9]{8}$/);
      });

      it("should return error for invalid tasks", () => {
        const taskA = db.createTask({ title: "Task A" });

        const result = handleTool("add_dependency", {
          task_id: taskA,
          depends_on_task_id: "non-existent",
        }) as { success: boolean; error: string };

        expect(result.success).toBe(false);
        expect(result.error).toContain("Could not add dependency");
      });
    });

    describe("remove_dependency", () => {
      it("should remove dependency", () => {
        const taskA = db.createTask({ title: "Task A" });
        const taskB = db.createTask({ title: "Task B" });
        db.addDependency(taskA, taskB);

        const result = handleTool("remove_dependency", {
          task_id: taskA,
          depends_on_task_id: taskB,
        }) as { success: boolean };

        expect(result.success).toBe(true);
      });
    });

    describe("get_task_dependencies", () => {
      it("should return task dependencies", () => {
        const taskA = db.createTask({ title: "Task A" });
        const taskB = db.createTask({ title: "Task B" });
        db.addDependency(taskA, taskB);

        const result = handleTool("get_task_dependencies", { task_id: taskA }) as {
          dependencies: unknown[];
          blocking: string[];
          is_blocked: boolean;
        };

        expect(result.dependencies.length).toBe(1);
        expect(result.blocking).toContain(taskB);
        expect(result.is_blocked).toBe(true);
      });
    });

    describe("summarize_task_activity", () => {
      it("should return message when not enough activity", () => {
        const taskId = db.createTask({ title: "Test" });
        const result = handleTool("summarize_task_activity", { task_id: taskId }) as {
          success: boolean;
          message: string;
        };

        expect(result.success).toBe(false);
        expect(result.message).toContain("Not enough activity");
      });
    });

    describe("unknown tool", () => {
      it("should throw error for unknown tool", () => {
        expect(() => handleTool("unknown_tool", {})).toThrow("Unknown tool: unknown_tool");
      });
    });
  });

  describe("Error Handling", () => {
    it("should throw ZodError for invalid arguments", () => {
      expect(() =>
        handleTool("update_task_status", {
          task_id: "task-123",
          status: "invalid_status",
        })
      ).toThrow(ZodError);
    });

    it("should throw ZodError for missing required arguments", () => {
      expect(() => handleTool("get_task", {})).toThrow(ZodError);
    });
  });
});
