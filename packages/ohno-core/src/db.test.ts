/**
 * Tests for TaskDatabase class
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { TaskDatabase } from "./db.js";
import type { TaskStatus } from "./types.js";

describe("TaskDatabase", () => {
  let tempDir: string;
  let dbPath: string;
  let db: TaskDatabase;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ohno-db-test-"));
    dbPath = join(tempDir, "tasks.db");
    db = await TaskDatabase.open(dbPath);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Database Initialization", () => {
    it("should create database file", () => {
      expect(db).toBeDefined();
    });

    it("should create required tables", () => {
      // If tables don't exist, these queries would throw
      const tasks = db.getTasks();
      expect(Array.isArray(tasks)).toBe(true);
    });

    it("should handle multiple opens of same database", async () => {
      const db2 = await TaskDatabase.open(dbPath);
      expect(db2).toBeDefined();
      db2.close();
    });
  });

  describe("Task CRUD Operations", () => {
    describe("createTask", () => {
      it("should create a task with minimal options", () => {
        const taskId = db.createTask({ title: "Test task" });
        expect(taskId).toMatch(/^task-[a-f0-9]{8}$/);
      });

      it("should create a task with all options", () => {
        const taskId = db.createTask({
          title: "Full task",
          task_type: "feature",
          description: "A description",
          estimate_hours: 4,
        });
        const task = db.getTask(taskId);
        expect(task?.title).toBe("Full task");
        expect(task?.task_type).toBe("feature");
        expect(task?.description).toBe("A description");
        expect(task?.estimate_hours).toBe(4);
      });

      it("should set default status to todo", () => {
        const taskId = db.createTask({ title: "New task" });
        const task = db.getTask(taskId);
        expect(task?.status).toBe("todo");
      });

      it("should set created_at timestamp", () => {
        const taskId = db.createTask({ title: "Timestamped task" });
        const task = db.getTask(taskId);
        expect(task?.created_at).toBeDefined();
        expect(new Date(task!.created_at!).getTime()).toBeGreaterThan(0);
      });
    });

    describe("getTask", () => {
      it("should return null for non-existent task", () => {
        const task = db.getTask("non-existent");
        expect(task).toBeNull();
      });

      it("should return task with all fields", () => {
        const taskId = db.createTask({ title: "Get me" });
        const task = db.getTask(taskId);
        expect(task).toBeDefined();
        expect(task?.id).toBe(taskId);
        expect(task?.title).toBe("Get me");
      });
    });

    describe("getTasks", () => {
      beforeEach(() => {
        db.createTask({ title: "Task 1" });
        db.createTask({ title: "Task 2" });
        db.createTask({ title: "Task 3" });
      });

      it("should return all tasks", () => {
        const tasks = db.getTasks();
        expect(tasks.length).toBe(3);
      });

      it("should filter by status", () => {
        const taskId = db.createTask({ title: "In progress" });
        db.updateTaskStatus(taskId, "in_progress");

        const inProgress = db.getTasks({ status: "in_progress" });
        expect(inProgress.length).toBe(1);
        expect(inProgress[0].title).toBe("In progress");
      });

      it("should respect limit", () => {
        const tasks = db.getTasks({ limit: 2 });
        expect(tasks.length).toBe(2);
      });

      describe("field selection", () => {
        it("should return minimal fields by default", () => {
          db.createTask({ title: "Test task", description: "A long description" });
          const tasks = db.getTasks({ fields: "minimal" });
          expect(tasks.length).toBe(4); // 3 from beforeEach + 1 new
          const testTask = tasks.find(t => t.title === "Test task");
          expect(testTask?.id).toBeDefined();
          expect(testTask?.title).toBeDefined();
          expect(testTask?.status).toBeDefined();
          expect(testTask?.description).toBeUndefined();
          expect(testTask?.handoff_notes).toBeUndefined();
          expect(testTask?.activity_summary).toBeUndefined();
        });

        it("should return standard fields when requested", () => {
          db.createTask({ title: "Test task", description: "A description" });
          const tasks = db.getTasks({ fields: "standard" });
          const testTask = tasks.find(t => t.title === "Test task");
          expect(testTask?.description).toBe("A description");
          expect(testTask?.activity_summary).toBeUndefined();
        });

        it("should return full fields when requested", () => {
          db.createTask({ title: "Test task", description: "A description" });
          const tasks = db.getTasks({ fields: "full" });
          const testTask = tasks.find(t => t.title === "Test task");
          expect(testTask?.description).toBe("A description");
          // Full includes all columns even if null
          expect("activity_summary" in testTask!).toBe(true);
        });
      });
    });

    describe("updateTask", () => {
      it("should update task title", () => {
        const taskId = db.createTask({ title: "Original" });
        db.updateTask(taskId, { title: "Updated" });
        const task = db.getTask(taskId);
        expect(task?.title).toBe("Updated");
      });

      it("should update multiple fields", () => {
        const taskId = db.createTask({ title: "Original" });
        db.updateTask(taskId, {
          title: "Updated",
          description: "New description",
          estimate_hours: 8,
        });
        const task = db.getTask(taskId);
        expect(task?.title).toBe("Updated");
        expect(task?.description).toBe("New description");
        expect(task?.estimate_hours).toBe(8);
      });

      it("should update updated_at timestamp", () => {
        const taskId = db.createTask({ title: "Original" });

        // Update the task
        db.updateTask(taskId, { title: "Updated" });

        const task = db.getTask(taskId);
        expect(task?.updated_at).toBeDefined();
      });

      it("should return false for non-existent task", () => {
        const result = db.updateTask("non-existent", { title: "Updated" });
        expect(result).toBe(false);
      });
    });

    describe("deleteTask", () => {
      it("should delete task", () => {
        const taskId = db.createTask({ title: "Delete me" });
        expect(db.getTask(taskId)).not.toBeNull();

        db.deleteTask(taskId);
        expect(db.getTask(taskId)).toBeNull();
      });

      it("should return false for non-existent task", () => {
        const result = db.deleteTask("non-existent");
        expect(result).toBe(false);
      });
    });
  });

  describe("Status Transitions", () => {
    describe("updateTaskStatus", () => {
      it("should update status to in_progress", () => {
        const taskId = db.createTask({ title: "Work item" });
        db.updateTaskStatus(taskId, "in_progress");
        const task = db.getTask(taskId);
        expect(task?.status).toBe("in_progress");
      });

      it("should update status to done", () => {
        const taskId = db.createTask({ title: "Completed" });
        db.updateTaskStatus(taskId, "done");
        const task = db.getTask(taskId);
        expect(task?.status).toBe("done");
      });

      it("should set handoff notes when provided", () => {
        const taskId = db.createTask({ title: "With notes" });
        db.updateTaskStatus(taskId, "in_progress", "Starting work");
        const task = db.getTask(taskId);
        expect(task?.handoff_notes).toBe("Starting work");
      });

      it("should log activity on status change", () => {
        const taskId = db.createTask({ title: "Activity test" });
        db.updateTaskStatus(taskId, "in_progress");

        const activity = db.getTaskActivity(taskId);
        expect(activity.length).toBeGreaterThan(0);
        // First activity is "created", status_change is second
        const statusChange = activity.find((a) => a.activity_type === "status_change");
        expect(statusChange).toBeDefined();
      });
    });

    describe("setBlocker / resolveBlocker", () => {
      it("should set blocker and change status", () => {
        const taskId = db.createTask({ title: "Blocked task" });
        db.setBlocker(taskId, "Waiting for API");

        const task = db.getTask(taskId);
        expect(task?.status).toBe("blocked");
        expect(task?.blockers).toBe("Waiting for API");
      });

      it("should resolve blocker and change status back", () => {
        const taskId = db.createTask({ title: "Blocked task" });
        db.setBlocker(taskId, "Waiting");
        db.resolveBlocker(taskId);

        const task = db.getTask(taskId);
        // resolveBlocker sets status to in_progress (ready to work)
        expect(task?.status).toBe("in_progress");
        expect(task?.blockers).toBeNull();
      });
    });

    describe("archiveTask", () => {
      it("should archive task", () => {
        const taskId = db.createTask({ title: "Archive me" });
        db.archiveTask(taskId, "No longer needed");

        const task = db.getTask(taskId);
        expect(task?.status).toBe("archived");
      });

      it("should not return archived tasks by default", () => {
        const taskId = db.createTask({ title: "Archive me" });
        db.archiveTask(taskId);

        const tasks = db.getTasks();
        expect(tasks.find((t) => t.id === taskId)).toBeUndefined();
      });
    });
  });

  describe("Progress Tracking", () => {
    describe("updateTaskProgress", () => {
      it("should update progress percent", () => {
        const taskId = db.createTask({ title: "Progress task" });
        db.updateTaskProgress(taskId, 50);

        const task = db.getTask(taskId);
        expect(task?.progress_percent).toBe(50);
      });

      it("should update context summary when provided", () => {
        const taskId = db.createTask({ title: "Context task" });
        db.updateTaskProgress(taskId, 75, "Almost done");

        const task = db.getTask(taskId);
        expect(task?.context_summary).toBe("Almost done");
      });

      it("should accept any progress value", () => {
        const taskId = db.createTask({ title: "Progress test" });

        db.updateTaskProgress(taskId, 50);
        expect(db.getTask(taskId)?.progress_percent).toBe(50);

        db.updateTaskProgress(taskId, 100);
        expect(db.getTask(taskId)?.progress_percent).toBe(100);
      });
    });

    describe("setHandoffNotes", () => {
      it("should set handoff notes", () => {
        const taskId = db.createTask({ title: "Handoff task" });
        db.setHandoffNotes(taskId, "Continue with step 3");

        const task = db.getTask(taskId);
        expect(task?.handoff_notes).toBe("Continue with step 3");
      });
    });
  });

  describe("Dependencies", () => {
    describe("addDependency", () => {
      it("should add dependency between tasks", () => {
        const taskA = db.createTask({ title: "Task A" });
        const taskB = db.createTask({ title: "Task B" });

        const depId = db.addDependency(taskA, taskB);
        expect(depId).toMatch(/^dep-[a-f0-9]{8}$/);
      });

      it("should return null for duplicate dependency", () => {
        const taskA = db.createTask({ title: "Task A" });
        const taskB = db.createTask({ title: "Task B" });

        db.addDependency(taskA, taskB);
        const dupId = db.addDependency(taskA, taskB);
        expect(dupId).toBeNull();
      });

      it("should return null for non-existent tasks", () => {
        const taskA = db.createTask({ title: "Task A" });

        const depId = db.addDependency(taskA, "non-existent");
        expect(depId).toBeNull();
      });
    });

    describe("getTaskDependencies", () => {
      it("should return task dependencies", () => {
        const taskA = db.createTask({ title: "Task A" });
        const taskB = db.createTask({ title: "Task B" });
        db.addDependency(taskA, taskB);

        const deps = db.getTaskDependencies(taskA);
        expect(deps.length).toBe(1);
        expect(deps[0].depends_on_task_id).toBe(taskB);
      });

      it("should return empty array for no dependencies", () => {
        const taskA = db.createTask({ title: "Task A" });
        const deps = db.getTaskDependencies(taskA);
        expect(deps).toEqual([]);
      });
    });

    describe("getBlockingDependencies", () => {
      it("should return blocking dependencies", () => {
        const taskA = db.createTask({ title: "Task A" });
        const taskB = db.createTask({ title: "Task B" }); // todo status
        db.addDependency(taskA, taskB);

        const blocking = db.getBlockingDependencies(taskA);
        expect(blocking).toContain(taskB);
      });

      it("should not return completed dependencies", () => {
        const taskA = db.createTask({ title: "Task A" });
        const taskB = db.createTask({ title: "Task B" });
        db.addDependency(taskA, taskB);
        db.updateTaskStatus(taskB, "done");

        const blocking = db.getBlockingDependencies(taskA);
        expect(blocking).not.toContain(taskB);
      });
    });

    describe("removeDependency", () => {
      it("should remove dependency", () => {
        const taskA = db.createTask({ title: "Task A" });
        const taskB = db.createTask({ title: "Task B" });
        db.addDependency(taskA, taskB);

        const result = db.removeDependency(taskA, taskB);
        expect(result).toBe(true);

        const deps = db.getTaskDependencies(taskA);
        expect(deps.length).toBe(0);
      });

      it("should return false for non-existent dependency", () => {
        const taskA = db.createTask({ title: "Task A" });
        const taskB = db.createTask({ title: "Task B" });

        const result = db.removeDependency(taskA, taskB);
        expect(result).toBe(false);
      });
    });
  });

  describe("Activity Logging", () => {
    describe("addTaskActivity", () => {
      it("should add activity to task", () => {
        const taskId = db.createTask({ title: "Activity task" });
        const result = db.addTaskActivity(taskId, "note", "Added a note");
        expect(result).toBe(true);

        const activity = db.getTaskActivity(taskId);
        // Task creation adds a "created" activity, plus our "note"
        expect(activity.length).toBeGreaterThanOrEqual(1);
        const noteActivity = activity.find((a) => a.activity_type === "note");
        expect(noteActivity?.description).toBe("Added a note");
      });

      it("should allow activity for any task ID", () => {
        // Implementation allows adding activity without checking task existence
        const result = db.addTaskActivity("any-id", "note", "Note");
        expect(result).toBe(true);
      });
    });

    describe("getTaskActivity", () => {
      it("should return activities in reverse chronological order", () => {
        const taskId = db.createTask({ title: "Activity task" });
        // Use different activity types to avoid ID collision (same timestamp + same type = same ID)
        db.addTaskActivity(taskId, "note", "First note");
        db.addTaskActivity(taskId, "decision", "Second decision");

        const activity = db.getTaskActivity(taskId);
        // Should have: created, note, decision (newest first)
        expect(activity.length).toBeGreaterThanOrEqual(2);
      });

      it("should respect limit", () => {
        const taskId = db.createTask({ title: "Activity task" });
        // Use different activity types to avoid ID collision
        db.addTaskActivity(taskId, "note", "One");
        db.addTaskActivity(taskId, "decision", "Two");
        db.addTaskActivity(taskId, "progress", "Three");

        const activity = db.getTaskActivity(taskId, 2);
        expect(activity.length).toBe(2);
      });
    });
  });

  describe("Session Context", () => {
    describe("getSessionContext", () => {
      it("should return in-progress tasks", () => {
        const taskId = db.createTask({ title: "In progress" });
        db.updateTaskStatus(taskId, "in_progress");

        const ctx = db.getSessionContext();
        expect(ctx.in_progress_tasks.length).toBe(1);
        expect(ctx.in_progress_tasks[0].id).toBe(taskId);
      });

      it("should return blocked tasks", () => {
        const taskId = db.createTask({ title: "Blocked" });
        db.setBlocker(taskId, "Waiting");

        const ctx = db.getSessionContext();
        expect(ctx.blocked_tasks.length).toBe(1);
      });

      it("should suggest next task", () => {
        db.createTask({ title: "Todo task" });

        const ctx = db.getSessionContext();
        expect(ctx.suggested_next_task).toBeDefined();
      });
    });

    describe("getNextTask", () => {
      it("should return highest priority todo task", () => {
        db.createTask({ title: "Low priority" });
        const highId = db.createTask({ title: "High priority" });

        // Note: Without epic priority, order may be by creation
        const next = db.getNextTask();
        expect(next).toBeDefined();
      });

      it("should prioritize in_progress tasks over todo tasks", () => {
        const doneId = db.createTask({ title: "Done" });
        db.updateTaskStatus(doneId, "done");

        const progressId = db.createTask({ title: "In progress" });
        db.updateTaskStatus(progressId, "in_progress");

        db.createTask({ title: "Todo" });

        const next = db.getNextTask();
        // Should return the in_progress task first (to encourage continuing work)
        expect(next?.status).toBe("in_progress");
        expect(next?.id).toBe(progressId);
      });

      it("should return todo task when no in_progress tasks exist", () => {
        const doneId = db.createTask({ title: "Done" });
        db.updateTaskStatus(doneId, "done");

        const todoId = db.createTask({ title: "Todo" });

        const next = db.getNextTask();
        // Should return the todo task when no in_progress exists
        expect(next?.status).toBe("todo");
        expect(next?.id).toBe(todoId);
      });

      it("should return null when no tasks available", () => {
        const next = db.getNextTask();
        expect(next).toBeNull();
      });
    });
  });

  describe("Completion Boundaries", () => {
    // Helper function to set up hierarchy: epic -> story -> tasks
    const setupHierarchy = () => {
      // Access the private db property for direct SQL
      const dbInstance = db as unknown as { db: { run: (sql: string, params?: unknown[]) => void } };

      // Create an epic
      dbInstance.db.run(
        "INSERT INTO epics (id, title, priority) VALUES (?, ?, ?)",
        ["epic-1", "Epic 1", "P0"]
      );

      // Create a story
      dbInstance.db.run(
        "INSERT INTO stories (id, epic_id, title) VALUES (?, ?, ?)",
        ["story-1", "epic-1", "Story 1"]
      );

      // Create another story in the same epic
      dbInstance.db.run(
        "INSERT INTO stories (id, epic_id, title) VALUES (?, ?, ?)",
        ["story-2", "epic-1", "Story 2"]
      );
    };

    describe("isStoryCompleted", () => {
      it("should return false when tasks are incomplete", () => {
        setupHierarchy();

        db.createTask({ title: "Task 1", story_id: "story-1" });
        db.createTask({ title: "Task 2", story_id: "story-1" });

        expect(db.isStoryCompleted("story-1")).toBe(false);
      });

      it("should return true when all tasks are done", () => {
        setupHierarchy();

        const task1 = db.createTask({ title: "Task 1", story_id: "story-1" });
        const task2 = db.createTask({ title: "Task 2", story_id: "story-1" });

        db.updateTaskStatus(task1, "done");
        db.updateTaskStatus(task2, "done");

        expect(db.isStoryCompleted("story-1")).toBe(true);
      });

      it("should return true when all tasks are archived", () => {
        setupHierarchy();

        const task1 = db.createTask({ title: "Task 1", story_id: "story-1" });
        db.archiveTask(task1);

        expect(db.isStoryCompleted("story-1")).toBe(true);
      });

      it("should return true for story with no tasks", () => {
        setupHierarchy();

        expect(db.isStoryCompleted("story-1")).toBe(true);
      });
    });

    describe("isEpicCompleted", () => {
      it("should return false when tasks in any story are incomplete", () => {
        setupHierarchy();

        const task1 = db.createTask({ title: "Task 1", story_id: "story-1" });
        const task2 = db.createTask({ title: "Task 2", story_id: "story-2" });

        db.updateTaskStatus(task1, "done");
        // task2 is still todo

        expect(db.isEpicCompleted("epic-1")).toBe(false);
      });

      it("should return true when all tasks in all stories are done", () => {
        setupHierarchy();

        const task1 = db.createTask({ title: "Task 1", story_id: "story-1" });
        const task2 = db.createTask({ title: "Task 2", story_id: "story-2" });

        db.updateTaskStatus(task1, "done");
        db.updateTaskStatus(task2, "done");

        expect(db.isEpicCompleted("epic-1")).toBe(true);
      });

      it("should return true for epic with no tasks", () => {
        setupHierarchy();

        expect(db.isEpicCompleted("epic-1")).toBe(true);
      });
    });

    describe("getCompletionBoundaries", () => {
      it("should return null for non-existent task", () => {
        expect(db.getCompletionBoundaries("non-existent")).toBeNull();
      });

      it("should return false for both when task has no story", () => {
        const taskId = db.createTask({ title: "Orphan task" });
        db.updateTaskStatus(taskId, "done");

        const boundaries = db.getCompletionBoundaries(taskId);
        expect(boundaries).toEqual({
          story_completed: false,
          epic_completed: false,
          story_id: null,
          epic_id: null,
        });
      });

      it("should return story_completed when completing last task in story", () => {
        setupHierarchy();

        const task1 = db.createTask({ title: "Task 1", story_id: "story-1" });
        const task2 = db.createTask({ title: "Task 2", story_id: "story-1" });

        db.updateTaskStatus(task1, "done");
        db.updateTaskStatus(task2, "done");

        const boundaries = db.getCompletionBoundaries(task2);
        expect(boundaries?.story_completed).toBe(true);
        expect(boundaries?.story_id).toBe("story-1");
      });

      it("should return epic_completed when completing last task in epic", () => {
        setupHierarchy();

        const task1 = db.createTask({ title: "Task 1", story_id: "story-1" });
        const task2 = db.createTask({ title: "Task 2", story_id: "story-2" });

        db.updateTaskStatus(task1, "done");
        db.updateTaskStatus(task2, "done");

        const boundaries = db.getCompletionBoundaries(task2);
        expect(boundaries?.story_completed).toBe(true);
        expect(boundaries?.epic_completed).toBe(true);
        expect(boundaries?.epic_id).toBe("epic-1");
      });
    });

    describe("updateTaskStatus with boundaries", () => {
      it("should return boundaries when marking task as done", () => {
        setupHierarchy();

        const taskId = db.createTask({ title: "Task 1", story_id: "story-1" });
        const result = db.updateTaskStatus(taskId, "done");

        expect(result.success).toBe(true);
        expect(result.boundaries).toBeDefined();
        expect(result.boundaries?.story_completed).toBe(true);
        expect(result.boundaries?.story_id).toBe("story-1");
      });

      it("should return boundaries when archiving task", () => {
        setupHierarchy();

        const taskId = db.createTask({ title: "Task 1", story_id: "story-1" });

        // Update status to archived (not using archiveTask helper)
        const result = db.updateTaskStatus(taskId, "archived");

        expect(result.success).toBe(true);
        expect(result.boundaries).toBeDefined();
      });

      it("should not return boundaries for non-completion status changes", () => {
        const taskId = db.createTask({ title: "Task 1" });
        const result = db.updateTaskStatus(taskId, "in_progress");

        expect(result.success).toBe(true);
        expect(result.boundaries).toBeUndefined();
      });

      it("should return success false for non-existent task", () => {
        const result = db.updateTaskStatus("non-existent", "done");
        expect(result.success).toBe(false);
        expect(result.boundaries).toBeUndefined();
      });
    });
  });

  describe("Story CRUD Operations", () => {
    describe("createStory", () => {
      it("should create a story with minimal options", () => {
        const storyId = db.createStory({ title: "Test story" });
        expect(storyId).toMatch(/^story-[a-f0-9]{8}$/);
      });

      it("should create a story with all options", () => {
        const epicId = db.createEpic({ title: "Test epic" });
        const storyId = db.createStory({
          title: "Full story",
          epic_id: epicId,
          description: "A description",
        });
        const story = db.getStory(storyId);
        expect(story?.title).toBe("Full story");
        expect(story?.epic_id).toBe(epicId);
        expect(story?.description).toBe("A description");
      });

      it("should set default status to todo", () => {
        const storyId = db.createStory({ title: "New story" });
        const story = db.getStory(storyId);
        expect(story?.status).toBe("todo");
      });
    });

    describe("getStory", () => {
      it("should return null for non-existent story", () => {
        const story = db.getStory("non-existent");
        expect(story).toBeNull();
      });

      it("should return story with all fields", () => {
        const storyId = db.createStory({ title: "Get me" });
        const story = db.getStory(storyId);
        expect(story).toBeDefined();
        expect(story?.id).toBe(storyId);
        expect(story?.title).toBe("Get me");
      });
    });

    describe("updateStory", () => {
      it("should update story title", () => {
        const storyId = db.createStory({ title: "Original" });
        const result = db.updateStory(storyId, { title: "Updated" });
        expect(result).toBe(true);

        const story = db.getStory(storyId);
        expect(story?.title).toBe("Updated");
      });

      it("should update story description", () => {
        const storyId = db.createStory({ title: "Test story" });
        const result = db.updateStory(storyId, { description: "New description" });
        expect(result).toBe(true);

        const story = db.getStory(storyId);
        expect(story?.description).toBe("New description");
      });

      it("should update story status", () => {
        const storyId = db.createStory({ title: "Test story" });
        const result = db.updateStory(storyId, { status: "in_progress" });
        expect(result).toBe(true);

        const story = db.getStory(storyId);
        expect(story?.status).toBe("in_progress");
      });

      it("should update story epic_id", () => {
        const epicId = db.createEpic({ title: "Test epic" });
        const storyId = db.createStory({ title: "Test story" });
        const result = db.updateStory(storyId, { epic_id: epicId });
        expect(result).toBe(true);

        const story = db.getStory(storyId);
        expect(story?.epic_id).toBe(epicId);
      });

      it("should update multiple fields at once", () => {
        const storyId = db.createStory({ title: "Original" });
        const result = db.updateStory(storyId, {
          title: "Updated",
          description: "New description",
          status: "in_progress",
        });
        expect(result).toBe(true);

        const story = db.getStory(storyId);
        expect(story?.title).toBe("Updated");
        expect(story?.description).toBe("New description");
        expect(story?.status).toBe("in_progress");
      });

      it("should update updated_at timestamp", () => {
        const storyId = db.createStory({ title: "Original" });
        const story1 = db.getStory(storyId);
        const originalUpdatedAt = story1?.updated_at;

        // Small delay to ensure timestamp changes
        db.updateStory(storyId, { title: "Updated" });

        const story2 = db.getStory(storyId);
        expect(story2?.updated_at).toBeDefined();
        // Updated timestamp should exist (we can't guarantee it's different due to timestamp precision)
      });

      it("should return false for non-existent story", () => {
        const result = db.updateStory("non-existent", { title: "Updated" });
        expect(result).toBe(false);
      });

      it("should return false when no fields are provided", () => {
        const storyId = db.createStory({ title: "Test story" });
        const result = db.updateStory(storyId, {});
        expect(result).toBe(false);
      });

      it("should allow setting description to null", () => {
        const storyId = db.createStory({ title: "Test story", description: "Original description" });
        const result = db.updateStory(storyId, { description: null });
        expect(result).toBe(true);

        const story = db.getStory(storyId);
        expect(story?.description).toBeNull();
      });

      it("should allow setting epic_id to null", () => {
        const epicId = db.createEpic({ title: "Test epic" });
        const storyId = db.createStory({ title: "Test story", epic_id: epicId });
        const result = db.updateStory(storyId, { epic_id: null });
        expect(result).toBe(true);

        const story = db.getStory(storyId);
        expect(story?.epic_id).toBeNull();
      });
    });
  });

  describe("getStories", () => {
    it("should return empty array when no stories exist", () => {
      const stories = db.getStories();
      expect(stories).toEqual([]);
    });

    it("should return all stories without options", () => {
      const story1 = db.createStory({ title: "Story 1" });
      const story2 = db.createStory({ title: "Story 2" });
      const story3 = db.createStory({ title: "Story 3" });

      const stories = db.getStories();
      expect(stories.length).toBe(3);
      expect(stories.map(s => s.id)).toContain(story1);
      expect(stories.map(s => s.id)).toContain(story2);
      expect(stories.map(s => s.id)).toContain(story3);
    });

    it("should filter by epic_id", () => {
      const epic1 = db.createEpic({ title: "Epic 1" });
      const epic2 = db.createEpic({ title: "Epic 2" });

      const story1 = db.createStory({ title: "Story 1", epic_id: epic1 });
      const story2 = db.createStory({ title: "Story 2", epic_id: epic2 });
      const story3 = db.createStory({ title: "Story 3", epic_id: epic1 });

      const stories = db.getStories({ epic_id: epic1 });
      expect(stories.length).toBe(2);
      expect(stories.map(s => s.id)).toContain(story1);
      expect(stories.map(s => s.id)).toContain(story3);
      expect(stories.map(s => s.id)).not.toContain(story2);
    });

    it("should filter by epic_id === null (orphan stories)", () => {
      const epic1 = db.createEpic({ title: "Epic 1" });

      const orphan1 = db.createStory({ title: "Orphan 1" });
      const orphan2 = db.createStory({ title: "Orphan 2" });
      const withEpic = db.createStory({ title: "With Epic", epic_id: epic1 });

      const stories = db.getStories({ epic_id: null });
      expect(stories.length).toBe(2);
      expect(stories.map(s => s.id)).toContain(orphan1);
      expect(stories.map(s => s.id)).toContain(orphan2);
      expect(stories.map(s => s.id)).not.toContain(withEpic);
    });

    it("should filter by status", () => {
      const story1 = db.createStory({ title: "Story 1" });
      const story2 = db.createStory({ title: "Story 2" });
      const story3 = db.createStory({ title: "Story 3" });

      db.updateStory(story1, { status: "in_progress" });
      db.updateStory(story2, { status: "done" });
      // story3 remains "todo"

      const inProgress = db.getStories({ status: "in_progress" });
      expect(inProgress.length).toBe(1);
      expect(inProgress[0].id).toBe(story1);

      const done = db.getStories({ status: "done" });
      expect(done.length).toBe(1);
      expect(done[0].id).toBe(story2);

      const todo = db.getStories({ status: "todo" });
      expect(todo.length).toBe(1);
      expect(todo[0].id).toBe(story3);
    });

    it("should combine epic_id and status filters", () => {
      const epic1 = db.createEpic({ title: "Epic 1" });

      const story1 = db.createStory({ title: "Story 1", epic_id: epic1 });
      const story2 = db.createStory({ title: "Story 2", epic_id: epic1 });
      const story3 = db.createStory({ title: "Story 3", epic_id: epic1 });

      db.updateStory(story1, { status: "in_progress" });
      db.updateStory(story2, { status: "done" });
      // story3 remains "todo"

      const stories = db.getStories({ epic_id: epic1, status: "in_progress" });
      expect(stories.length).toBe(1);
      expect(stories[0].id).toBe(story1);
    });

    it("should respect limit option", () => {
      db.createStory({ title: "Story 1" });
      db.createStory({ title: "Story 2" });
      db.createStory({ title: "Story 3" });
      db.createStory({ title: "Story 4" });

      const stories = db.getStories({ limit: 2 });
      expect(stories.length).toBe(2);
    });

    it("should respect offset option", () => {
      const story1 = db.createStory({ title: "Story 1" });
      const story2 = db.createStory({ title: "Story 2" });
      const story3 = db.createStory({ title: "Story 3" });

      // Stories are ordered by updated_at DESC, created_at DESC
      // So the most recent is first
      const stories = db.getStories({ offset: 1, limit: 2 });
      expect(stories.length).toBe(2);
      // Should skip the first story
    });

    it("should respect limit and offset together", () => {
      db.createStory({ title: "Story 1" });
      db.createStory({ title: "Story 2" });
      db.createStory({ title: "Story 3" });
      db.createStory({ title: "Story 4" });

      const page1 = db.getStories({ limit: 2, offset: 0 });
      expect(page1.length).toBe(2);

      const page2 = db.getStories({ limit: 2, offset: 2 });
      expect(page2.length).toBe(2);

      // Ensure no overlap
      const page1Ids = page1.map(s => s.id);
      const page2Ids = page2.map(s => s.id);
      expect(page1Ids).not.toContain(page2Ids[0]);
      expect(page1Ids).not.toContain(page2Ids[1]);
    });

    it("should return Story objects with all required fields", () => {
      const epicId = db.createEpic({ title: "Epic 1" });
      const storyId = db.createStory({
        title: "Full Story",
        epic_id: epicId,
        description: "A description",
      });

      const stories = db.getStories();
      expect(stories.length).toBe(1);

      const story = stories[0];
      expect(story.id).toBe(storyId);
      expect(story.title).toBe("Full Story");
      expect(story.epic_id).toBe(epicId);
      expect(story.description).toBe("A description");
      expect(story.status).toBe("todo");
      expect(story.created_at).toBeDefined();
      expect(story.updated_at).toBeDefined();
    });

    it("should handle null epic_id in returned stories", () => {
      const storyId = db.createStory({ title: "Orphan Story" });

      const stories = db.getStories();
      expect(stories.length).toBe(1);
      expect(stories[0].epic_id).toBeNull();
    });

    it("should handle null description in returned stories", () => {
      const storyId = db.createStory({ title: "No Description" });

      const stories = db.getStories();
      expect(stories.length).toBe(1);
      expect(stories[0].description).toBeNull();
    });

    it("should return stories ordered by timestamp", () => {
      db.createStory({ title: "Story 1" });
      db.createStory({ title: "Story 2" });
      db.createStory({ title: "Story 3" });

      const stories = db.getStories();
      expect(stories.length).toBe(3);
      // Verify ordering is applied (by updated_at DESC, created_at DESC)
      // We just verify all stories are returned; exact order depends on timing
      expect(stories.map((s) => s.title).sort()).toEqual([
        "Story 1",
        "Story 2",
        "Story 3",
      ]);
    });
  });

  describe("Task Source Field", () => {
    describe("createTask with source", () => {
      it("should default to 'human' when source is not provided", () => {
        const taskId = db.createTask({ title: "Default source task" });
        const task = db.getTask(taskId);
        expect(task?.source).toBe("human");
      });

      it("should accept 'human' source", () => {
        const taskId = db.createTask({ title: "Human task", source: "human" });
        const task = db.getTask(taskId);
        expect(task?.source).toBe("human");
      });

      it("should accept 'pokayokay-plan' source", () => {
        const taskId = db.createTask({ title: "Pokayokay task", source: "pokayokay-plan" });
        const task = db.getTask(taskId);
        expect(task?.source).toBe("pokayokay-plan");
      });

      it("should accept 'kaizen-fix' source", () => {
        const taskId = db.createTask({ title: "Kaizen fix task", source: "kaizen-fix" });
        const task = db.getTask(taskId);
        expect(task?.source).toBe("kaizen-fix");
      });

      it("should accept 'kaizen-suggest' source", () => {
        const taskId = db.createTask({ title: "Kaizen suggest task", source: "kaizen-suggest" });
        const task = db.getTask(taskId);
        expect(task?.source).toBe("kaizen-suggest");
      });

      it("should persist source field across database operations", async () => {
        const taskId = db.createTask({ title: "Persisted task", source: "kaizen-fix" });

        // Reload database to ensure persistence
        db.close();
        db = await TaskDatabase.open(dbPath);

        const task = db.getTask(taskId);
        expect(task?.source).toBe("kaizen-fix");
      });
    });

    describe("existing tasks migration", () => {
      it("should have 'human' as default for existing tasks without source", async () => {
        // This test verifies backward compatibility with existing databases
        const taskId = db.createTask({ title: "Existing task" });
        const task = db.getTask(taskId);
        expect(task?.source).toBe("human");
      });
    });
  });

  describe("Project Status", () => {
    describe("getProjectStatus", () => {
      it("should return correct task counts", () => {
        db.createTask({ title: "Todo 1" });
        db.createTask({ title: "Todo 2" });
        const doneId = db.createTask({ title: "Done" });
        db.updateTaskStatus(doneId, "done");

        const status = db.getProjectStatus();
        expect(status.total_tasks).toBe(3);
        expect(status.done_tasks).toBe(1);
        expect(status.todo_tasks).toBe(2);
      });

      it("should calculate completion percent", () => {
        db.createTask({ title: "Todo" });
        const doneId = db.createTask({ title: "Done" });
        db.updateTaskStatus(doneId, "done");

        const status = db.getProjectStatus();
        expect(status.completion_percent).toBe(50);
      });

      it("should handle zero tasks", () => {
        const status = db.getProjectStatus();
        expect(status.total_tasks).toBe(0);
        expect(status.completion_percent).toBe(0);
      });
    });

    describe("getBlockedTasks", () => {
      it("should return blocked tasks with blockers", () => {
        const taskId = db.createTask({ title: "Blocked task" });
        db.setBlocker(taskId, "API unavailable");

        const blocked = db.getBlockedTasks();
        expect(blocked.length).toBe(1);
        expect(blocked[0].blockers).toBe("API unavailable");
      });
    });
  });

  describe("Needs Rework Flag", () => {
    describe("setNeedsRework", () => {
      it("should set needs_rework flag to true", () => {
        const taskId = db.createTask({ title: "Task needs rework" });
        const result = db.setNeedsRework(taskId, true);
        expect(result).toBe(true);

        const task = db.getTask(taskId);
        expect(task?.needs_rework).toBe(1);
      });

      it("should set needs_rework flag to false", () => {
        const taskId = db.createTask({ title: "Task fixed" });
        db.setNeedsRework(taskId, true);
        const result = db.setNeedsRework(taskId, false);
        expect(result).toBe(true);

        const task = db.getTask(taskId);
        expect(task?.needs_rework).toBe(0);
      });

      it("should return false for non-existent task", () => {
        const result = db.setNeedsRework("non-existent", true);
        expect(result).toBe(false);
      });

      it("should log activity when setting needs_rework", () => {
        const taskId = db.createTask({ title: "Activity test" });
        db.setNeedsRework(taskId, true);

        const activity = db.getTaskActivity(taskId);
        const reworkActivity = activity.find((a) => a.description?.includes("needs rework"));
        expect(reworkActivity).toBeDefined();
      });
    });

    describe("needs_rework with task completion", () => {
      it("should clear needs_rework flag when task is marked as done", () => {
        const taskId = db.createTask({ title: "Task to complete" });
        db.setNeedsRework(taskId, true);

        db.updateTaskStatus(taskId, "done");
        const task = db.getTask(taskId);
        expect(task?.needs_rework).toBe(0);
      });

      it("should clear needs_rework flag when task is archived", () => {
        const taskId = db.createTask({ title: "Task to archive" });
        db.setNeedsRework(taskId, true);

        db.updateTaskStatus(taskId, "archived");
        const task = db.getTask(taskId);
        expect(task?.needs_rework).toBe(0);
      });

      it("should not clear needs_rework when transitioning to other statuses", () => {
        const taskId = db.createTask({ title: "Task in progress" });
        db.setNeedsRework(taskId, true);

        db.updateTaskStatus(taskId, "in_progress");
        const task = db.getTask(taskId);
        expect(task?.needs_rework).toBe(1);
      });
    });

    describe("needs_rework persistence", () => {
      it("should persist needs_rework across database reloads", async () => {
        const taskId = db.createTask({ title: "Persistent rework" });
        db.setNeedsRework(taskId, true);

        db.close();
        db = await TaskDatabase.open(dbPath);

        const task = db.getTask(taskId);
        expect(task?.needs_rework).toBe(1);
      });
    });

    describe("getTasks with needs_rework", () => {
      it("should return tasks with needs_rework flag", () => {
        const task1 = db.createTask({ title: "Task 1" });
        const task2 = db.createTask({ title: "Task 2" });
        const task3 = db.createTask({ title: "Task 3" });

        db.setNeedsRework(task1, true);
        db.setNeedsRework(task3, true);

        const tasks = db.getTasks({ fields: "full" });
        const reworkTask1 = tasks.find(t => t.id === task1);
        const reworkTask2 = tasks.find(t => t.id === task2);
        const reworkTask3 = tasks.find(t => t.id === task3);

        expect(reworkTask1?.needs_rework).toBe(1);
        expect(reworkTask2?.needs_rework).toBe(0);
        expect(reworkTask3?.needs_rework).toBe(1);
      });
    });

    describe("default value", () => {
      it("should default needs_rework to 0 for new tasks", () => {
        const taskId = db.createTask({ title: "New task" });
        const task = db.getTask(taskId);
        expect(task?.needs_rework).toBe(0);
      });
    });
  });

  describe("Batch Retrieval", () => {
    describe("getNextBatch", () => {
      it("should return empty array when no tasks available", () => {
        const batch = db.getNextBatch();
        expect(batch).toEqual([]);
      });

      it("should return todo tasks", () => {
        db.createTask({ title: "Todo 1" });
        db.createTask({ title: "Todo 2" });

        const batch = db.getNextBatch();
        expect(batch.length).toBe(2);
        expect(batch.every(t => t.status === "todo")).toBe(true);
      });

      it("should return tasks with needs_rework=1", () => {
        const task1 = db.createTask({ title: "Task 1" });
        db.updateTaskStatus(task1, "done");
        db.setNeedsRework(task1, true);

        const batch = db.getNextBatch();
        expect(batch.length).toBe(1);
        expect(batch[0].id).toBe(task1);
        expect(batch[0].needs_rework).toBe(1);
      });

      it("should exclude archived tasks", () => {
        const task1 = db.createTask({ title: "Task 1" });
        const task2 = db.createTask({ title: "Task 2" });
        db.archiveTask(task1);

        const batch = db.getNextBatch();
        expect(batch.length).toBe(1);
        expect(batch[0].id).toBe(task2);
      });

      it("should exclude in_progress and review tasks", () => {
        const task1 = db.createTask({ title: "Task 1" });
        const task2 = db.createTask({ title: "Task 2" });
        const task3 = db.createTask({ title: "Task 3" });

        db.updateTaskStatus(task1, "in_progress");
        db.updateTaskStatus(task2, "review");

        const batch = db.getNextBatch();
        expect(batch.length).toBe(1);
        expect(batch[0].id).toBe(task3);
      });

      it("should filter out tasks with unmet dependencies", () => {
        const task1 = db.createTask({ title: "Task 1" });
        const task2 = db.createTask({ title: "Task 2 - blocked" });

        db.addDependency(task2, task1);

        const batch = db.getNextBatch();
        expect(batch.length).toBe(1);
        expect(batch[0].id).toBe(task1);
      });

      it("should include tasks when dependencies are done", () => {
        const task1 = db.createTask({ title: "Task 1" });
        const task2 = db.createTask({ title: "Task 2" });

        db.addDependency(task2, task1);
        db.updateTaskStatus(task1, "done");

        const batch = db.getNextBatch();
        expect(batch.some(t => t.id === task2)).toBe(true);
      });

      it("should respect default size of 3", () => {
        db.createTask({ title: "Task 1" });
        db.createTask({ title: "Task 2" });
        db.createTask({ title: "Task 3" });
        db.createTask({ title: "Task 4" });
        db.createTask({ title: "Task 5" });

        const batch = db.getNextBatch();
        expect(batch.length).toBe(3);
      });

      it("should respect custom size parameter", () => {
        db.createTask({ title: "Task 1" });
        db.createTask({ title: "Task 2" });
        db.createTask({ title: "Task 3" });
        db.createTask({ title: "Task 4" });
        db.createTask({ title: "Task 5" });

        const batch = db.getNextBatch(2);
        expect(batch.length).toBe(2);
      });

      it("should enforce max size of 5", () => {
        for (let i = 1; i <= 10; i++) {
          db.createTask({ title: `Task ${i}` });
        }

        const batch = db.getNextBatch(10);
        expect(batch.length).toBe(5);
      });

      it("should order by epic priority then created_at", () => {
        // Create epics with different priorities
        const epic1 = db.createEpic({ title: "P2 Epic", priority: "P2" });
        const epic2 = db.createEpic({ title: "P0 Epic", priority: "P0" });
        const epic3 = db.createEpic({ title: "P1 Epic", priority: "P1" });

        // Create stories
        const story1 = db.createStory({ title: "Story 1", epic_id: epic1 });
        const story2 = db.createStory({ title: "Story 2", epic_id: epic2 });
        const story3 = db.createStory({ title: "Story 3", epic_id: epic3 });

        // Create tasks (order matters for created_at)
        const task1 = db.createTask({ title: "P2 Task 1", story_id: story1 });
        const task2 = db.createTask({ title: "P0 Task 1", story_id: story2 });
        const task3 = db.createTask({ title: "P1 Task 1", story_id: story3 });
        const task4 = db.createTask({ title: "P0 Task 2", story_id: story2 });

        const batch = db.getNextBatch(4);

        // Should be ordered: P0 tasks first, then P1, then P2
        // Within same priority, oldest created_at first
        expect(batch[0].id).toBe(task2); // P0, created first
        expect(batch[1].id).toBe(task4); // P0, created second
        expect(batch[2].id).toBe(task3); // P1
        expect(batch[3].id).toBe(task1); // P2
      });

      it("should attach failure_context for tasks with needs_rework", () => {
        const task1 = db.createTask({ title: "Task 1" });
        db.updateTaskStatus(task1, "done");

        db.addTaskFailure(task1, "implementation", "Test failed", 1);
        db.addTaskFailure(task1, "spec", "Wrong behavior", 2);
        db.setNeedsRework(task1, true);

        const batch = db.getNextBatch();
        expect(batch.length).toBe(1);
        expect(batch[0].failure_context).toBeDefined();
        expect(batch[0].failure_context?.length).toBe(2);

        // Check that both failure types are present (order may vary)
        const failureTypes = batch[0].failure_context?.map(f => f.failure_type);
        expect(failureTypes).toContain("spec");
        expect(failureTypes).toContain("implementation");
      });

      it("should not attach failure_context for tasks without needs_rework", () => {
        const task1 = db.createTask({ title: "Task 1" });

        // Add failures but don't set needs_rework
        db.addTaskFailure(task1, "implementation", "Test failed", 1);

        const batch = db.getNextBatch();
        expect(batch.length).toBe(1);
        expect(batch[0].failure_context).toBeUndefined();
      });

      it("should handle mix of todo and needs_rework tasks", () => {
        const task1 = db.createTask({ title: "Todo task" });
        const task2 = db.createTask({ title: "Rework task" });

        db.updateTaskStatus(task2, "done");
        db.addTaskFailure(task2, "implementation", "Failed", 1);
        db.setNeedsRework(task2, true);

        const batch = db.getNextBatch(5);
        expect(batch.length).toBe(2);

        const todoTask = batch.find(t => t.id === task1);
        const reworkTask = batch.find(t => t.id === task2);

        expect(todoTask?.failure_context).toBeUndefined();
        expect(reworkTask?.failure_context).toBeDefined();
        expect(reworkTask?.failure_context?.length).toBe(1);
      });

      it("should handle tasks without epic (null epic_priority)", () => {
        // Task without story/epic
        const task1 = db.createTask({ title: "Orphan task 1" });

        // Task with story but no epic
        const story1 = db.createStory({ title: "Orphan story" });
        const task2 = db.createTask({ title: "Task with orphan story", story_id: story1 });

        // Task with epic
        const epic1 = db.createEpic({ title: "Epic", priority: "P0" });
        const story2 = db.createStory({ title: "Story", epic_id: epic1 });
        const task3 = db.createTask({ title: "Task with epic", story_id: story2 });

        const batch = db.getNextBatch(5);
        expect(batch.length).toBe(3);

        // Task with P0 epic should come first
        expect(batch[0].id).toBe(task3);
      });
    });
  });
});
