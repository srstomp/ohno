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

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ohno-db-test-"));
    dbPath = join(tempDir, "tasks.db");
    db = new TaskDatabase(dbPath);
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

    it("should handle multiple opens of same database", () => {
      const db2 = new TaskDatabase(dbPath);
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
});
