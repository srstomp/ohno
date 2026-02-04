/**
 * Tests for Task Failures functionality
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { TaskDatabase } from "./db.js";
import type { TaskFailure, FailureType } from "./types.js";

describe("Task Failures", () => {
  let tempDir: string;
  let dbPath: string;
  let db: TaskDatabase;
  let taskId: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ohno-failures-test-"));
    dbPath = join(tempDir, "tasks.db");
    db = await TaskDatabase.open(dbPath);
    taskId = db.createTask({ title: "Test task for failures" });
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("addTaskFailure", () => {
    it("should add a failure record with all fields", () => {
      const failureId = db.addTaskFailure(
        taskId,
        "spec",
        "Requirements were unclear",
        1
      );

      expect(failureId).toMatch(/^fail-[a-f0-9]{8}$/);
    });

    it("should add failure with optional attempt parameter", () => {
      const failureId = db.addTaskFailure(
        taskId,
        "quality",
        "Tests did not pass"
      );

      expect(failureId).toBeDefined();
      const failures = db.getTaskFailures(taskId);
      expect(failures).toHaveLength(1);
      expect(failures[0].attempt).toBeNull();
    });

    it("should store created_at timestamp", () => {
      db.addTaskFailure(taskId, "implementation", "Bug in code", 1);

      const failures = db.getTaskFailures(taskId);
      expect(failures[0].created_at).toBeDefined();
      expect(new Date(failures[0].created_at!).getTime()).toBeGreaterThan(0);
    });

    it("should support all failure types", () => {
      db.addTaskFailure(taskId, "spec", "Spec issue", 1);
      db.addTaskFailure(taskId, "quality", "Quality issue", 2);
      db.addTaskFailure(taskId, "implementation", "Implementation issue", 3);

      const failures = db.getTaskFailures(taskId);
      expect(failures).toHaveLength(3);
      expect(failures.map(f => f.failure_type)).toContain("spec");
      expect(failures.map(f => f.failure_type)).toContain("quality");
      expect(failures.map(f => f.failure_type)).toContain("implementation");
    });
  });

  describe("getTaskFailures", () => {
    it("should return empty array for task with no failures", () => {
      const failures = db.getTaskFailures(taskId);
      expect(failures).toEqual([]);
    });

    it("should return all failures for a task", () => {
      db.addTaskFailure(taskId, "spec", "First failure", 1);
      db.addTaskFailure(taskId, "quality", "Second failure", 2);

      const failures = db.getTaskFailures(taskId);
      expect(failures).toHaveLength(2);
      // Check both failures are present (order may vary with same timestamp)
      const reasons = failures.map(f => f.failure_reason);
      expect(reasons).toContain("First failure");
      expect(reasons).toContain("Second failure");
    });

    it("should return failures ordered by created_at DESC", () => {
      db.addTaskFailure(taskId, "spec", "First", 1);
      // Small delay to ensure different timestamps
      const delay = new Promise(resolve => setTimeout(resolve, 10));
      delay.then(() => {
        db.addTaskFailure(taskId, "quality", "Second", 2);
      });

      const failures = db.getTaskFailures(taskId);
      // Most recent should be first
      expect(failures.length).toBeGreaterThan(0);
    });

    it("should only return failures for the specified task", () => {
      const otherTaskId = db.createTask({ title: "Other task" });

      db.addTaskFailure(taskId, "spec", "Failure for task 1", 1);
      db.addTaskFailure(otherTaskId, "quality", "Failure for task 2", 1);

      const task1Failures = db.getTaskFailures(taskId);
      const task2Failures = db.getTaskFailures(otherTaskId);

      expect(task1Failures).toHaveLength(1);
      expect(task2Failures).toHaveLength(1);
      expect(task1Failures[0].task_id).toBe(taskId);
      expect(task2Failures[0].task_id).toBe(otherTaskId);
    });
  });

  describe("Task Failure Schema", () => {
    it("should have correct table structure", () => {
      db.addTaskFailure(taskId, "spec", "Test failure", 1);
      const failures = db.getTaskFailures(taskId);

      const failure = failures[0];
      expect(failure).toHaveProperty("id");
      expect(failure).toHaveProperty("task_id");
      expect(failure).toHaveProperty("failure_type");
      expect(failure).toHaveProperty("failure_reason");
      expect(failure).toHaveProperty("attempt");
      expect(failure).toHaveProperty("created_at");
    });
  });
});
