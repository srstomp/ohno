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
  CreateStorySchema,
  StoryIdSchema,
  UpdateTaskSchema,
  ActivitySchema,
  HandoffNotesSchema,
  ProgressSchema,
  BlockerSchema,
  ArchiveSchema,
  DependencySchema,
  RemoveDependencySchema,
  SummarizeSchema,
  GetStoriesSchema,
  UpdateStorySchema,
  CreateEpicSchema,
  EpicIdSchema,
  UpdateEpicSchema,
  GetEpicsSchema,
  RecordFailureSchema,
} from "./server.js";

describe("MCP Server", () => {
  let tempDir: string;
  let dbPath: string;
  let db: TaskDatabase;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ohno-mcp-test-"));
    dbPath = join(tempDir, "tasks.db");
    db = await TaskDatabase.open(dbPath);
    setDb(db);
  });

  afterEach(() => {
    setDb(null);
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Tool Definitions", () => {
    it("should have 30 tools defined", () => {
      expect(TOOLS.length).toBe(30);
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
        "create_story",
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
        expect(() => GetTasksSchema.parse({ fields: "invalid" })).toThrow(ZodError);
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

    describe("CreateStorySchema", () => {
      it("should accept minimal story", () => {
        const result = CreateStorySchema.parse({ title: "New story" });
        expect(result.title).toBe("New story");
      });

      it("should accept all fields", () => {
        const result = CreateStorySchema.parse({
          title: "Full story",
          epic_id: "epic-1",
          description: "Story description",
        });
        expect(result.epic_id).toBe("epic-1");
        expect(result.description).toBe("Story description");
      });

      it("should reject empty title", () => {
        expect(() => CreateStorySchema.parse({ title: "" })).toThrow(ZodError);
      });
    });

    describe("StoryIdSchema", () => {
      it("should accept valid story_id", () => {
        const result = StoryIdSchema.parse({ story_id: "story-abc123" });
        expect(result.story_id).toBe("story-abc123");
      });

      it("should reject empty story_id", () => {
        expect(() => StoryIdSchema.parse({ story_id: "" })).toThrow(ZodError);
      });

      it("should reject missing story_id", () => {
        expect(() => StoryIdSchema.parse({})).toThrow(ZodError);
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

    describe("GetStoriesSchema", () => {
      it("should accept empty object with defaults", () => {
        const result = GetStoriesSchema.parse({});
        expect(result.limit).toBe(50);
        expect(result.offset).toBe(0);
      });

      it("should accept epic_id filter", () => {
        const result = GetStoriesSchema.parse({ epic_id: "epic-123" });
        expect(result.epic_id).toBe("epic-123");
      });

      it("should accept valid story status", () => {
        const result = GetStoriesSchema.parse({ status: "in_progress" });
        expect(result.status).toBe("in_progress");
      });

      it("should accept all valid story statuses", () => {
        const validStatuses = ["todo", "in_progress", "done"];
        for (const status of validStatuses) {
          const result = GetStoriesSchema.parse({ status });
          expect(result.status).toBe(status);
        }
      });

      it("should reject invalid story status", () => {
        expect(() => GetStoriesSchema.parse({ status: "review" })).toThrow(ZodError);
        expect(() => GetStoriesSchema.parse({ status: "blocked" })).toThrow(ZodError);
        expect(() => GetStoriesSchema.parse({ status: "invalid" })).toThrow(ZodError);
      });

      it("should accept valid limit", () => {
        const result = GetStoriesSchema.parse({ limit: 25 });
        expect(result.limit).toBe(25);
      });

      it("should reject limit below minimum", () => {
        expect(() => GetStoriesSchema.parse({ limit: 0 })).toThrow(ZodError);
      });

      it("should reject limit above maximum", () => {
        expect(() => GetStoriesSchema.parse({ limit: 101 })).toThrow(ZodError);
      });

      it("should accept valid offset", () => {
        const result = GetStoriesSchema.parse({ offset: 10 });
        expect(result.offset).toBe(10);
      });

      it("should reject negative offset", () => {
        expect(() => GetStoriesSchema.parse({ offset: -1 })).toThrow(ZodError);
      });

      it("should accept all filters together", () => {
        const result = GetStoriesSchema.parse({
          epic_id: "epic-1",
          status: "todo",
          limit: 20,
          offset: 5,
        });
        expect(result.epic_id).toBe("epic-1");
        expect(result.status).toBe("todo");
        expect(result.limit).toBe(20);
        expect(result.offset).toBe(5);
      });
    });

    describe("UpdateStorySchema", () => {
      it("should accept story_id only", () => {
        const result = UpdateStorySchema.parse({ story_id: "story-123" });
        expect(result.story_id).toBe("story-123");
      });

      it("should reject empty story_id", () => {
        expect(() => UpdateStorySchema.parse({ story_id: "" })).toThrow(ZodError);
      });

      it("should reject missing story_id", () => {
        expect(() => UpdateStorySchema.parse({})).toThrow(ZodError);
      });

      it("should accept optional title", () => {
        const result = UpdateStorySchema.parse({
          story_id: "story-123",
          title: "New title",
        });
        expect(result.title).toBe("New title");
      });

      it("should accept optional description", () => {
        const result = UpdateStorySchema.parse({
          story_id: "story-123",
          description: "New description",
        });
        expect(result.description).toBe("New description");
      });

      it("should accept null description (to clear)", () => {
        const result = UpdateStorySchema.parse({
          story_id: "story-123",
          description: null,
        });
        expect(result.description).toBeNull();
      });

      it("should accept valid status", () => {
        const result = UpdateStorySchema.parse({
          story_id: "story-123",
          status: "in_progress",
        });
        expect(result.status).toBe("in_progress");
      });

      it("should accept all valid story statuses", () => {
        const validStatuses = ["todo", "in_progress", "done"];
        for (const status of validStatuses) {
          const result = UpdateStorySchema.parse({
            story_id: "story-123",
            status,
          });
          expect(result.status).toBe(status);
        }
      });

      it("should reject invalid status", () => {
        expect(() =>
          UpdateStorySchema.parse({
            story_id: "story-123",
            status: "review",
          })
        ).toThrow(ZodError);
        expect(() =>
          UpdateStorySchema.parse({
            story_id: "story-123",
            status: "blocked",
          })
        ).toThrow(ZodError);
      });

      it("should accept optional epic_id", () => {
        const result = UpdateStorySchema.parse({
          story_id: "story-123",
          epic_id: "epic-456",
        });
        expect(result.epic_id).toBe("epic-456");
      });

      it("should accept null epic_id (to unassign)", () => {
        const result = UpdateStorySchema.parse({
          story_id: "story-123",
          epic_id: null,
        });
        expect(result.epic_id).toBeNull();
      });

      it("should accept all fields together", () => {
        const result = UpdateStorySchema.parse({
          story_id: "story-123",
          title: "Updated title",
          description: "Updated description",
          status: "done",
          epic_id: "epic-789",
        });
        expect(result.story_id).toBe("story-123");
        expect(result.title).toBe("Updated title");
        expect(result.description).toBe("Updated description");
        expect(result.status).toBe("done");
        expect(result.epic_id).toBe("epic-789");
      });
    });

    describe("CreateEpicSchema", () => {
      it("should accept minimal epic", () => {
        const result = CreateEpicSchema.parse({ title: "New epic" });
        expect(result.title).toBe("New epic");
      });

      it("should reject empty title", () => {
        expect(() => CreateEpicSchema.parse({ title: "" })).toThrow(ZodError);
      });

      it("should reject missing title", () => {
        expect(() => CreateEpicSchema.parse({})).toThrow(ZodError);
      });

      it("should accept all optional fields", () => {
        const result = CreateEpicSchema.parse({
          title: "Full epic",
          project_id: "project-1",
          description: "Epic description",
          priority: "P0",
        });
        expect(result.project_id).toBe("project-1");
        expect(result.description).toBe("Epic description");
        expect(result.priority).toBe("P0");
      });

      it("should accept all valid priorities", () => {
        const validPriorities = ["P0", "P1", "P2", "P3"];
        for (const priority of validPriorities) {
          const result = CreateEpicSchema.parse({
            title: "Epic",
            priority,
          });
          expect(result.priority).toBe(priority);
        }
      });

      it("should reject invalid priority", () => {
        expect(() =>
          CreateEpicSchema.parse({ title: "Epic", priority: "P4" })
        ).toThrow(ZodError);
        expect(() =>
          CreateEpicSchema.parse({ title: "Epic", priority: "invalid" })
        ).toThrow(ZodError);
      });
    });

    describe("EpicIdSchema", () => {
      it("should accept valid epic_id", () => {
        const result = EpicIdSchema.parse({ epic_id: "epic-abc123" });
        expect(result.epic_id).toBe("epic-abc123");
      });

      it("should reject empty epic_id", () => {
        expect(() => EpicIdSchema.parse({ epic_id: "" })).toThrow(ZodError);
      });

      it("should reject missing epic_id", () => {
        expect(() => EpicIdSchema.parse({})).toThrow(ZodError);
      });
    });

    describe("UpdateEpicSchema", () => {
      it("should accept epic_id only", () => {
        const result = UpdateEpicSchema.parse({ epic_id: "epic-123" });
        expect(result.epic_id).toBe("epic-123");
      });

      it("should reject empty epic_id", () => {
        expect(() => UpdateEpicSchema.parse({ epic_id: "" })).toThrow(ZodError);
      });

      it("should reject missing epic_id", () => {
        expect(() => UpdateEpicSchema.parse({})).toThrow(ZodError);
      });

      it("should accept optional title", () => {
        const result = UpdateEpicSchema.parse({
          epic_id: "epic-123",
          title: "Updated epic",
        });
        expect(result.title).toBe("Updated epic");
      });

      it("should accept optional description", () => {
        const result = UpdateEpicSchema.parse({
          epic_id: "epic-123",
          description: "New description",
        });
        expect(result.description).toBe("New description");
      });

      it("should accept valid priority", () => {
        const result = UpdateEpicSchema.parse({
          epic_id: "epic-123",
          priority: "P1",
        });
        expect(result.priority).toBe("P1");
      });

      it("should accept valid status", () => {
        const result = UpdateEpicSchema.parse({
          epic_id: "epic-123",
          status: "in_progress",
        });
        expect(result.status).toBe("in_progress");
      });

      it("should accept all valid statuses", () => {
        const validStatuses = ["todo", "in_progress", "review", "done", "blocked"];
        for (const status of validStatuses) {
          const result = UpdateEpicSchema.parse({
            epic_id: "epic-123",
            status,
          });
          expect(result.status).toBe(status);
        }
      });

      it("should accept all fields together", () => {
        const result = UpdateEpicSchema.parse({
          epic_id: "epic-123",
          title: "Updated epic",
          description: "Updated description",
          priority: "P2",
          status: "review",
        });
        expect(result.epic_id).toBe("epic-123");
        expect(result.title).toBe("Updated epic");
        expect(result.description).toBe("Updated description");
        expect(result.priority).toBe("P2");
        expect(result.status).toBe("review");
      });
    });

    describe("GetEpicsSchema", () => {
      it("should accept empty object with defaults", () => {
        const result = GetEpicsSchema.parse({});
        expect(result.limit).toBe(50);
      });

      it("should accept status filter", () => {
        const result = GetEpicsSchema.parse({ status: "in_progress" });
        expect(result.status).toBe("in_progress");
      });

      it("should accept priority filter", () => {
        const result = GetEpicsSchema.parse({ priority: "P0" });
        expect(result.priority).toBe("P0");
      });

      it("should accept limit", () => {
        const result = GetEpicsSchema.parse({ limit: 25 });
        expect(result.limit).toBe(25);
      });

      it("should validate limit bounds", () => {
        expect(() => GetEpicsSchema.parse({ limit: 0 })).toThrow(ZodError);
        expect(() => GetEpicsSchema.parse({ limit: 101 })).toThrow(ZodError);
        const result = GetEpicsSchema.parse({ limit: 1 });
        expect(result.limit).toBe(1);
        const result2 = GetEpicsSchema.parse({ limit: 100 });
        expect(result2.limit).toBe(100);
      });
    });

    describe("RecordFailureSchema", () => {
      it("should accept valid failure record with all required fields", () => {
        const result = RecordFailureSchema.parse({
          task_id: "task-123",
          failure_type: "spec",
          reason: "Requirements were unclear",
        });
        expect(result.task_id).toBe("task-123");
        expect(result.failure_type).toBe("spec");
        expect(result.reason).toBe("Requirements were unclear");
      });

      it("should accept all valid failure types", () => {
        const validTypes = ["spec", "quality", "implementation"];
        for (const type of validTypes) {
          const result = RecordFailureSchema.parse({
            task_id: "task-123",
            failure_type: type,
            reason: "Test reason",
          });
          expect(result.failure_type).toBe(type);
        }
      });

      it("should accept optional attempt parameter", () => {
        const result = RecordFailureSchema.parse({
          task_id: "task-123",
          failure_type: "implementation",
          reason: "Failed",
          attempt: 2,
        });
        expect(result.attempt).toBe(2);
      });

      it("should reject invalid failure_type", () => {
        expect(() =>
          RecordFailureSchema.parse({
            task_id: "task-123",
            failure_type: "invalid",
            reason: "Test",
          })
        ).toThrow(ZodError);
      });

      it("should reject empty task_id", () => {
        expect(() =>
          RecordFailureSchema.parse({
            task_id: "",
            failure_type: "spec",
            reason: "Test",
          })
        ).toThrow(ZodError);
      });

      it("should reject missing task_id", () => {
        expect(() =>
          RecordFailureSchema.parse({
            failure_type: "spec",
            reason: "Test",
          })
        ).toThrow(ZodError);
      });

      it("should reject missing failure_type", () => {
        expect(() =>
          RecordFailureSchema.parse({
            task_id: "task-123",
            reason: "Test",
          })
        ).toThrow(ZodError);
      });

      it("should reject missing reason", () => {
        expect(() =>
          RecordFailureSchema.parse({
            task_id: "task-123",
            failure_type: "spec",
          })
        ).toThrow(ZodError);
      });

      it("should reject empty reason", () => {
        expect(() =>
          RecordFailureSchema.parse({
            task_id: "task-123",
            failure_type: "spec",
            reason: "",
          })
        ).toThrow(ZodError);
      });
    });
  });

  describe("Tool Handlers", () => {
    describe("get_project_status", () => {
      it("should return project status", async () => {
        const result = await handleTool("get_project_status", {}) as Record<string, unknown>;
        expect(result).toHaveProperty("total_tasks");
        expect(result).toHaveProperty("completion_percent");
      });
    });

    describe("get_session_context", () => {
      it("should return session context", async () => {
        const result = await handleTool("get_session_context", {}) as Record<string, unknown>;
        expect(result).toHaveProperty("in_progress_tasks");
        expect(result).toHaveProperty("blocked_tasks");
        expect(result).toHaveProperty("recent_activity");
      });
    });

    describe("get_tasks", () => {
      it("should return empty tasks list initially", async () => {
        const result = await handleTool("get_tasks", {}) as { tasks: unknown[] };
        expect(result.tasks).toEqual([]);
      });

      it("should return created tasks", async () => {
        db.createTask({ title: "Test task" });
        const result = await handleTool("get_tasks", {}) as { tasks: unknown[] };
        expect(result.tasks.length).toBe(1);
      });

      it("should filter by status", async () => {
        db.createTask({ title: "Todo task" });
        const inProgressId = db.createTask({ title: "In progress" });
        db.updateTaskStatus(inProgressId, "in_progress");

        const result = await handleTool("get_tasks", { status: "in_progress" }) as {
          tasks: Array<{ title: string }>;
        };
        expect(result.tasks.length).toBe(1);
        expect(result.tasks[0].title).toBe("In progress");
      });

      describe("field selection", () => {
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
    });

    describe("get_task", () => {
      it("should return task by ID", async () => {
        const taskId = db.createTask({ title: "Test task" });
        const result = await handleTool("get_task", { task_id: taskId }) as { title: string };
        expect(result.title).toBe("Test task");
      });

      it("should return error for non-existent task", async () => {
        const result = await handleTool("get_task", { task_id: "non-existent" }) as { error: string };
        expect(result.error).toContain("Task not found");
      });
    });

    describe("get_next_task", () => {
      it("should return message when no tasks", async () => {
        const result = await handleTool("get_next_task", {}) as { message: string };
        expect(result.message).toBe("No tasks available");
      });

      it("should return next task", async () => {
        db.createTask({ title: "Available task" });
        const result = await handleTool("get_next_task", {}) as { title: string };
        expect(result.title).toBe("Available task");
      });
    });

    describe("get_blocked_tasks", () => {
      it("should return empty list when no blocked tasks", async () => {
        const result = await handleTool("get_blocked_tasks", {}) as { tasks: unknown[] };
        expect(result.tasks).toEqual([]);
      });

      it("should return blocked tasks", async () => {
        const taskId = db.createTask({ title: "Blocked task" });
        db.setBlocker(taskId, "Waiting for API");
        const result = await handleTool("get_blocked_tasks", {}) as {
          tasks: Array<{ blockers: string }>;
        };
        expect(result.tasks.length).toBe(1);
        expect(result.tasks[0].blockers).toBe("Waiting for API");
      });
    });

    describe("create_task", () => {
      it("should create task and return ID", async () => {
        const result = await handleTool("create_task", { title: "New task" }) as {
          success: boolean;
          task_id: string;
        };
        expect(result.success).toBe(true);
        expect(result.task_id).toMatch(/^task-[a-f0-9]{8}$/);
      });

      it("should create task with all options", async () => {
        const result = await handleTool("create_task", {
          title: "Full task",
          task_type: "bug",
          description: "Fix something",
          estimate_hours: 4,
        }) as { success: boolean; task_id: string };

        const task = db.getTask(result.task_id);
        expect(task?.task_type).toBe("bug");
        expect(task?.estimate_hours).toBe(4);
      });

      it("should default to 'human' source when not provided", async () => {
        const result = await handleTool("create_task", {
          title: "Task without source",
        }) as { success: boolean; task_id: string };

        const task = db.getTask(result.task_id);
        expect(task?.source).toBe("human");
      });

      it("should accept 'pokayokay-plan' source", async () => {
        const result = await handleTool("create_task", {
          title: "Pokayokay task",
          source: "pokayokay-plan",
        }) as { success: boolean; task_id: string };

        const task = db.getTask(result.task_id);
        expect(task?.source).toBe("pokayokay-plan");
      });

      it("should accept 'kaizen-fix' source", async () => {
        const result = await handleTool("create_task", {
          title: "Kaizen fix task",
          source: "kaizen-fix",
        }) as { success: boolean; task_id: string };

        const task = db.getTask(result.task_id);
        expect(task?.source).toBe("kaizen-fix");
      });

      it("should accept 'kaizen-suggest' source", async () => {
        const result = await handleTool("create_task", {
          title: "Kaizen suggest task",
          source: "kaizen-suggest",
        }) as { success: boolean; task_id: string };

        const task = db.getTask(result.task_id);
        expect(task?.source).toBe("kaizen-suggest");
      });

      it("should reject invalid source", async () => {
        await expect(
          handleTool("create_task", {
            title: "Invalid source task",
            source: "invalid-source",
          })
        ).rejects.toThrow(ZodError);
      });
    });

    describe("create_story", () => {
      it("should create story and return ID", async () => {
        const result = await handleTool("create_story", { title: "New story" }) as {
          success: boolean;
          story_id: string;
        };
        expect(result.success).toBe(true);
        expect(result.story_id).toMatch(/^story-[a-f0-9]{8}$/);
      });

      it("should create story with all options", async () => {
        const result = await handleTool("create_story", {
          title: "Full story",
          epic_id: "epic-1",
          description: "Story description",
        }) as { success: boolean; story_id: string };

        expect(result.success).toBe(true);
        expect(result.story_id).toMatch(/^story-[a-f0-9]{8}$/);
      });

      it("should allow creating task with story_id", async () => {
        const storyResult = await handleTool("create_story", { title: "My story" }) as {
          success: boolean;
          story_id: string;
        };

        const taskResult = await handleTool("create_task", {
          title: "Task in story",
          story_id: storyResult.story_id,
        }) as { success: boolean; task_id: string };

        expect(taskResult.success).toBe(true);
        const task = db.getTask(taskResult.task_id);
        expect(task?.story_id).toBe(storyResult.story_id);
      });
    });

    describe("get_story", () => {
      it("should return story by ID", async () => {
        const storyId = db.createStory({ title: "Test story" });
        const result = await handleTool("get_story", { story_id: storyId }) as { title: string };
        expect(result.title).toBe("Test story");
      });

      it("should return error for non-existent story", async () => {
        const result = await handleTool("get_story", { story_id: "non-existent" }) as { error: string };
        expect(result.error).toContain("Story not found");
      });
    });

    describe("list_stories", () => {
      it("should return empty stories list initially", async () => {
        const result = await handleTool("list_stories", {}) as { stories: unknown[] };
        expect(result.stories).toEqual([]);
      });

      it("should return created stories", async () => {
        db.createStory({ title: "Story 1" });
        db.createStory({ title: "Story 2" });
        const result = await handleTool("list_stories", {}) as { stories: unknown[] };
        expect(result.stories.length).toBe(2);
      });

      it("should filter by epic_id", async () => {
        // Create an epic
        const dbInstance = db as unknown as { db: { run: (sql: string, params?: unknown[]) => void } };
        dbInstance.db.run(
          "INSERT INTO epics (id, title, priority) VALUES (?, ?, ?)",
          ["epic-1", "Epic 1", "P0"]
        );

        // Create stories with different epics
        db.createStory({ title: "Story in epic 1", epic_id: "epic-1" });
        db.createStory({ title: "Story in epic 1 (2)", epic_id: "epic-1" });
        db.createStory({ title: "Story without epic" });

        const result = await handleTool("list_stories", { epic_id: "epic-1" }) as {
          stories: Array<{ title: string }>;
        };
        expect(result.stories.length).toBe(2);
        expect(result.stories[0].title).toContain("epic 1");
      });

      it("should filter by status", async () => {
        const storyId1 = db.createStory({ title: "Todo story" });
        const storyId2 = db.createStory({ title: "In progress story" });
        const storyId3 = db.createStory({ title: "Done story" });

        // Update statuses
        db.updateStory(storyId2, { status: "in_progress" });
        db.updateStory(storyId3, { status: "done" });

        const result = await handleTool("list_stories", { status: "in_progress" }) as {
          stories: Array<{ title: string; status: string }>;
        };
        expect(result.stories.length).toBe(1);
        expect(result.stories[0].title).toBe("In progress story");
        expect(result.stories[0].status).toBe("in_progress");
      });

      it("should respect limit parameter", async () => {
        for (let i = 0; i < 10; i++) {
          db.createStory({ title: `Story ${i}` });
        }

        const result = await handleTool("list_stories", { limit: 5 }) as { stories: unknown[] };
        expect(result.stories.length).toBe(5);
      });

      it("should respect offset parameter", async () => {
        for (let i = 0; i < 10; i++) {
          db.createStory({ title: `Story ${i}` });
        }

        const result = await handleTool("list_stories", { offset: 8 }) as { stories: unknown[] };
        expect(result.stories.length).toBe(2);
      });

      it("should combine filters", async () => {
        const dbInstance = db as unknown as { db: { run: (sql: string, params?: unknown[]) => void } };
        dbInstance.db.run(
          "INSERT INTO epics (id, title, priority) VALUES (?, ?, ?)",
          ["epic-1", "Epic 1", "P0"]
        );

        const story1 = db.createStory({ title: "Story 1", epic_id: "epic-1" });
        const story2 = db.createStory({ title: "Story 2", epic_id: "epic-1" });
        const story3 = db.createStory({ title: "Story 3", epic_id: "epic-1" });

        db.updateStory(story1, { status: "todo" });
        db.updateStory(story2, { status: "in_progress" });
        db.updateStory(story3, { status: "in_progress" });

        const result = await handleTool("list_stories", {
          epic_id: "epic-1",
          status: "in_progress",
          limit: 10,
        }) as { stories: Array<{ status: string }> };

        expect(result.stories.length).toBe(2);
        for (const story of result.stories) {
          expect(story.status).toBe("in_progress");
        }
      });
    });

    describe("update_story", () => {
      it("should update story title", async () => {
        const storyId = db.createStory({ title: "Original title" });
        const result = await handleTool("update_story", {
          story_id: storyId,
          title: "Updated title",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        const story = db.getStory(storyId);
        expect(story?.title).toBe("Updated title");
      });

      it("should update story description", async () => {
        const storyId = db.createStory({ title: "Test story" });
        const result = await handleTool("update_story", {
          story_id: storyId,
          description: "New description",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        const story = db.getStory(storyId);
        expect(story?.description).toBe("New description");
      });

      it("should clear story description with null", async () => {
        const storyId = db.createStory({
          title: "Test story",
          description: "Initial description",
        });
        const result = await handleTool("update_story", {
          story_id: storyId,
          description: null,
        }) as { success: boolean };

        expect(result.success).toBe(true);
        const story = db.getStory(storyId);
        expect(story?.description).toBeNull();
      });

      it("should update story status", async () => {
        const storyId = db.createStory({ title: "Test story" });
        const result = await handleTool("update_story", {
          story_id: storyId,
          status: "in_progress",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        const story = db.getStory(storyId);
        expect(story?.status).toBe("in_progress");
      });

      it("should update story epic_id", async () => {
        const dbInstance = db as unknown as { db: { run: (sql: string, params?: unknown[]) => void } };
        dbInstance.db.run(
          "INSERT INTO epics (id, title, priority) VALUES (?, ?, ?)",
          ["epic-1", "Epic 1", "P0"]
        );

        const storyId = db.createStory({ title: "Test story" });
        const result = await handleTool("update_story", {
          story_id: storyId,
          epic_id: "epic-1",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        const story = db.getStory(storyId);
        expect(story?.epic_id).toBe("epic-1");
      });

      it("should unassign story from epic with null", async () => {
        const dbInstance = db as unknown as { db: { run: (sql: string, params?: unknown[]) => void } };
        dbInstance.db.run(
          "INSERT INTO epics (id, title, priority) VALUES (?, ?, ?)",
          ["epic-1", "Epic 1", "P0"]
        );

        const storyId = db.createStory({ title: "Test story", epic_id: "epic-1" });
        const result = await handleTool("update_story", {
          story_id: storyId,
          epic_id: null,
        }) as { success: boolean };

        expect(result.success).toBe(true);
        const story = db.getStory(storyId);
        expect(story?.epic_id).toBeNull();
      });

      it("should update multiple fields at once", async () => {
        const storyId = db.createStory({
          title: "Original",
          description: "Old description",
        });

        const result = await handleTool("update_story", {
          story_id: storyId,
          title: "Updated title",
          description: "Updated description",
          status: "done",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        const story = db.getStory(storyId);
        expect(story?.title).toBe("Updated title");
        expect(story?.description).toBe("Updated description");
        expect(story?.status).toBe("done");
      });

      it("should return success false for non-existent story", async () => {
        const result = await handleTool("update_story", {
          story_id: "non-existent",
          title: "New title",
        }) as { success: boolean };

        expect(result.success).toBe(false);
      });
    });

    describe("create_epic", () => {
      it("should create epic and return ID", async () => {
        const result = await handleTool("create_epic", { title: "New epic" }) as {
          success: boolean;
          epic_id: string;
        };
        expect(result.success).toBe(true);
        expect(result.epic_id).toMatch(/^epic-[a-f0-9]{8}$/);
      });

      it("should create epic with all options", async () => {
        const result = await handleTool("create_epic", {
          title: "Full epic",
          project_id: "project-1",
          description: "Epic description",
          priority: "P0",
        }) as { success: boolean; epic_id: string };

        expect(result.success).toBe(true);
        expect(result.epic_id).toMatch(/^epic-[a-f0-9]{8}$/);
      });
    });

    describe("get_epic", () => {
      it("should return epic by ID", async () => {
        const epicId = db.createEpic({ title: "Test epic" });
        const result = await handleTool("get_epic", { epic_id: epicId }) as { title: string };
        expect(result.title).toBe("Test epic");
      });

      it("should return error for non-existent epic", async () => {
        const result = await handleTool("get_epic", { epic_id: "non-existent" }) as { error: string };
        expect(result.error).toContain("Epic not found");
      });
    });

    describe("get_epics", () => {
      it("should return empty list initially", async () => {
        const result = await handleTool("get_epics", {}) as { epics: unknown[] };
        expect(result.epics).toEqual([]);
      });

      it("should return created epics", async () => {
        db.createEpic({ title: "Epic 1" });
        db.createEpic({ title: "Epic 2" });
        const result = await handleTool("get_epics", {}) as { epics: unknown[] };
        expect(result.epics.length).toBe(2);
      });

      it("should filter by status", async () => {
        const epic1 = db.createEpic({ title: "Todo epic" });
        const epic2 = db.createEpic({ title: "In progress epic" });
        const epic3 = db.createEpic({ title: "Done epic" });

        db.updateEpic(epic2, { status: "in_progress" });
        db.updateEpic(epic3, { status: "done" });

        const result = await handleTool("get_epics", { status: "in_progress" }) as {
          epics: Array<{ title: string; status: string }>;
        };
        expect(result.epics.length).toBe(1);
        expect(result.epics[0].title).toBe("In progress epic");
        expect(result.epics[0].status).toBe("in_progress");
      });

      it("should filter by priority", async () => {
        db.createEpic({ title: "P0 epic", priority: "P0" });
        db.createEpic({ title: "P1 epic", priority: "P1" });
        db.createEpic({ title: "P2 epic", priority: "P2" });

        const result = await handleTool("get_epics", { priority: "P0" }) as {
          epics: Array<{ title: string; priority: string }>;
        };
        expect(result.epics.length).toBe(1);
        expect(result.epics[0].title).toBe("P0 epic");
        expect(result.epics[0].priority).toBe("P0");
      });

      it("should respect limit parameter", async () => {
        for (let i = 0; i < 10; i++) {
          db.createEpic({ title: `Epic ${i}` });
        }

        const result = await handleTool("get_epics", { limit: 5 }) as { epics: unknown[] };
        expect(result.epics.length).toBe(5);
      });
    });

    describe("update_epic", () => {
      it("should update epic title", async () => {
        const epicId = db.createEpic({ title: "Original title" });
        const result = await handleTool("update_epic", {
          epic_id: epicId,
          title: "Updated title",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        const epic = db.getEpic(epicId);
        expect(epic?.title).toBe("Updated title");
      });

      it("should update epic description", async () => {
        const epicId = db.createEpic({ title: "Test epic" });
        const result = await handleTool("update_epic", {
          epic_id: epicId,
          description: "New description",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        const epic = db.getEpic(epicId);
        expect(epic?.description).toBe("New description");
      });

      it("should update epic priority", async () => {
        const epicId = db.createEpic({ title: "Test epic", priority: "P0" });
        const result = await handleTool("update_epic", {
          epic_id: epicId,
          priority: "P2",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        const epic = db.getEpic(epicId);
        expect(epic?.priority).toBe("P2");
      });

      it("should update epic status", async () => {
        const epicId = db.createEpic({ title: "Test epic" });
        const result = await handleTool("update_epic", {
          epic_id: epicId,
          status: "in_progress",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        const epic = db.getEpic(epicId);
        expect(epic?.status).toBe("in_progress");
      });

      it("should return success false for non-existent epic", async () => {
        const result = await handleTool("update_epic", {
          epic_id: "non-existent",
          title: "New title",
        }) as { success: boolean };

        expect(result.success).toBe(false);
      });
    });

    describe("update_task_status", () => {
      it("should update task status", async () => {
        const taskId = db.createTask({ title: "Test" });
        const result = await handleTool("update_task_status", {
          task_id: taskId,
          status: "in_progress",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        expect(db.getTask(taskId)?.status).toBe("in_progress");
      });

      it("should set handoff notes when provided", async () => {
        const taskId = db.createTask({ title: "Test" });
        await handleTool("update_task_status", {
          task_id: taskId,
          status: "done",
          notes: "Completed successfully",
        });

        expect(db.getTask(taskId)?.handoff_notes).toBe("Completed successfully");
      });

      it("should return boundaries when completing task with story", async () => {
        // Set up hierarchy
        const dbInstance = db as unknown as { db: { run: (sql: string, params?: unknown[]) => void } };
        dbInstance.db.run(
          "INSERT INTO epics (id, title, priority) VALUES (?, ?, ?)",
          ["epic-1", "Epic 1", "P0"]
        );
        dbInstance.db.run(
          "INSERT INTO stories (id, epic_id, title) VALUES (?, ?, ?)",
          ["story-1", "epic-1", "Story 1"]
        );

        const taskId = db.createTask({ title: "Test", story_id: "story-1" });
        const result = await handleTool("update_task_status", {
          task_id: taskId,
          status: "done",
        }) as {
          success: boolean;
          boundaries: {
            story_completed: boolean;
            epic_completed: boolean;
            story_id: string | null;
            epic_id: string | null;
          };
        };

        expect(result.success).toBe(true);
        expect(result.boundaries).toBeDefined();
        expect(result.boundaries.story_completed).toBe(true);
        expect(result.boundaries.epic_completed).toBe(true);
        expect(result.boundaries.story_id).toBe("story-1");
        expect(result.boundaries.epic_id).toBe("epic-1");
      });

      it("should not return boundaries for non-completion status changes", async () => {
        const taskId = db.createTask({ title: "Test" });
        const result = await handleTool("update_task_status", {
          task_id: taskId,
          status: "in_progress",
        }) as { success: boolean; boundaries?: unknown };

        expect(result.success).toBe(true);
        expect(result.boundaries).toBeUndefined();
      });
    });

    describe("update_task", () => {
      it("should update task fields", async () => {
        const taskId = db.createTask({ title: "Original" });
        const result = await handleTool("update_task", {
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
      it("should add activity to task", async () => {
        const taskId = db.createTask({ title: "Test" });
        const result = await handleTool("add_task_activity", {
          task_id: taskId,
          activity_type: "note",
          description: "Added a note",
        }) as { success: boolean };

        expect(result.success).toBe(true);
      });
    });

    describe("set_handoff_notes", () => {
      it("should set handoff notes", async () => {
        const taskId = db.createTask({ title: "Test" });
        const result = await handleTool("set_handoff_notes", {
          task_id: taskId,
          notes: "Continue from step 3",
        }) as { success: boolean };

        expect(result.success).toBe(true);
        expect(db.getTask(taskId)?.handoff_notes).toBe("Continue from step 3");
      });
    });

    describe("update_task_progress", () => {
      it("should update progress", async () => {
        const taskId = db.createTask({ title: "Test" });
        const result = await handleTool("update_task_progress", {
          task_id: taskId,
          progress_percent: 50,
        }) as { success: boolean };

        expect(result.success).toBe(true);
        expect(db.getTask(taskId)?.progress_percent).toBe(50);
      });

      it("should update progress with context summary", async () => {
        const taskId = db.createTask({ title: "Test" });
        await handleTool("update_task_progress", {
          task_id: taskId,
          progress_percent: 75,
          context_summary: "Almost done",
        });

        expect(db.getTask(taskId)?.context_summary).toBe("Almost done");
      });
    });

    describe("set_blocker", () => {
      it("should set blocker on task", async () => {
        const taskId = db.createTask({ title: "Test" });
        const result = await handleTool("set_blocker", {
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
      it("should resolve blocker", async () => {
        const taskId = db.createTask({ title: "Test" });
        db.setBlocker(taskId, "Waiting");

        const result = await handleTool("resolve_blocker", { task_id: taskId }) as {
          success: boolean;
        };

        expect(result.success).toBe(true);
        expect(db.getTask(taskId)?.status).toBe("in_progress");
      });
    });

    describe("archive_task", () => {
      it("should archive task", async () => {
        const taskId = db.createTask({ title: "Test" });
        const result = await handleTool("archive_task", { task_id: taskId }) as {
          success: boolean;
        };

        expect(result.success).toBe(true);
        expect(db.getTask(taskId)?.status).toBe("archived");
      });
    });

    describe("add_dependency", () => {
      it("should add dependency between tasks", async () => {
        const taskA = db.createTask({ title: "Task A" });
        const taskB = db.createTask({ title: "Task B" });

        const result = await handleTool("add_dependency", {
          task_id: taskA,
          depends_on_task_id: taskB,
        }) as { success: boolean; dependency_id: string };

        expect(result.success).toBe(true);
        expect(result.dependency_id).toMatch(/^dep-[a-f0-9]{8}$/);
      });

      it("should return error for invalid tasks", async () => {
        const taskA = db.createTask({ title: "Task A" });

        const result = await handleTool("add_dependency", {
          task_id: taskA,
          depends_on_task_id: "non-existent",
        }) as { success: boolean; error: string };

        expect(result.success).toBe(false);
        expect(result.error).toContain("Could not add dependency");
      });
    });

    describe("remove_dependency", () => {
      it("should remove dependency", async () => {
        const taskA = db.createTask({ title: "Task A" });
        const taskB = db.createTask({ title: "Task B" });
        db.addDependency(taskA, taskB);

        const result = await handleTool("remove_dependency", {
          task_id: taskA,
          depends_on_task_id: taskB,
        }) as { success: boolean };

        expect(result.success).toBe(true);
      });
    });

    describe("get_task_dependencies", () => {
      it("should return task dependencies", async () => {
        const taskA = db.createTask({ title: "Task A" });
        const taskB = db.createTask({ title: "Task B" });
        db.addDependency(taskA, taskB);

        const result = await handleTool("get_task_dependencies", { task_id: taskA }) as {
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
      it("should return message when not enough activity", async () => {
        const taskId = db.createTask({ title: "Test" });
        const result = await handleTool("summarize_task_activity", { task_id: taskId }) as {
          success: boolean;
          message: string;
        };

        expect(result.success).toBe(false);
        expect(result.message).toContain("Not enough activity");
      });
    });

    describe("record_task_failure", () => {
      it("should record failure and return failure_id", async () => {
        const taskId = db.createTask({ title: "Test task" });
        const result = await handleTool("record_task_failure", {
          task_id: taskId,
          failure_type: "spec",
          reason: "Requirements were unclear",
        }) as { success: boolean; failure_id: string };

        expect(result.success).toBe(true);
        expect(result.failure_id).toMatch(/^fail-[a-f0-9]{8}$/);

        // Verify failure was recorded
        const failures = db.getTaskFailures(taskId);
        expect(failures.length).toBe(1);
        expect(failures[0].failure_type).toBe("spec");
        expect(failures[0].failure_reason).toBe("Requirements were unclear");
      });

      it("should accept all valid failure types", async () => {
        const taskId = db.createTask({ title: "Test task" });
        const validTypes = ["spec", "quality", "implementation"];

        for (const type of validTypes) {
          const result = await handleTool("record_task_failure", {
            task_id: taskId,
            failure_type: type,
            reason: `Failure type: ${type}`,
          }) as { success: boolean; failure_id: string };

          expect(result.success).toBe(true);
          expect(result.failure_id).toBeDefined();
        }

        const failures = db.getTaskFailures(taskId);
        expect(failures.length).toBe(3);
      });

      it("should accept optional attempt parameter", async () => {
        const taskId = db.createTask({ title: "Test task" });
        const result = await handleTool("record_task_failure", {
          task_id: taskId,
          failure_type: "implementation",
          reason: "Failed on second attempt",
          attempt: 2,
        }) as { success: boolean; failure_id: string };

        expect(result.success).toBe(true);

        const failures = db.getTaskFailures(taskId);
        expect(failures.length).toBe(1);
        expect(failures[0].attempt).toBe(2);
      });

      it("should reject invalid failure_type", async () => {
        const taskId = db.createTask({ title: "Test task" });
        await expect(
          handleTool("record_task_failure", {
            task_id: taskId,
            failure_type: "invalid",
            reason: "Test",
          })
        ).rejects.toThrow(ZodError);
      });

      it("should reject missing task_id", async () => {
        await expect(
          handleTool("record_task_failure", {
            failure_type: "spec",
            reason: "Test",
          })
        ).rejects.toThrow(ZodError);
      });

      it("should reject missing failure_type", async () => {
        const taskId = db.createTask({ title: "Test task" });
        await expect(
          handleTool("record_task_failure", {
            task_id: taskId,
            reason: "Test",
          })
        ).rejects.toThrow(ZodError);
      });

      it("should reject missing reason", async () => {
        const taskId = db.createTask({ title: "Test task" });
        await expect(
          handleTool("record_task_failure", {
            task_id: taskId,
            failure_type: "spec",
          })
        ).rejects.toThrow(ZodError);
      });

      it("should reject empty reason", async () => {
        const taskId = db.createTask({ title: "Test task" });
        await expect(
          handleTool("record_task_failure", {
            task_id: taskId,
            failure_type: "spec",
            reason: "",
          })
        ).rejects.toThrow(ZodError);
      });
    });

    describe("unknown tool", () => {
      it("should throw error for unknown tool", async () => {
        await expect(handleTool("unknown_tool", {})).rejects.toThrow("Unknown tool: unknown_tool");
      });
    });
  });

  describe("Error Handling", () => {
    it("should throw ZodError for invalid arguments", async () => {
      await expect(
        handleTool("update_task_status", {
          task_id: "task-123",
          status: "invalid_status",
        })
      ).rejects.toThrow(ZodError);
    });

    it("should throw ZodError for missing required arguments", async () => {
      await expect(handleTool("get_task", {})).rejects.toThrow(ZodError);
    });
  });
});
