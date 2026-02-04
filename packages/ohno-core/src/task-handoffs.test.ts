/**
 * Tests for task_handoffs table and related methods
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { TaskDatabase } from "./db.js";
import type { HandoffStatus } from "./types.js";

describe("TaskHandoffs", () => {
  let tempDir: string;
  let dbPath: string;
  let db: TaskDatabase;
  let taskId: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ohno-handoffs-test-"));
    dbPath = join(tempDir, "tasks.db");
    db = await TaskDatabase.open(dbPath);

    // Create a test task
    taskId = db.createTask({ title: "Test task for handoff" });
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("setTaskHandoff", () => {
    it("should store a handoff with minimal data (status + summary)", () => {
      const success = db.setTaskHandoff(
        taskId,
        "PASS",
        "Task completed successfully"
      );
      expect(success).toBe(true);
    });

    it("should store a handoff with all fields", () => {
      const success = db.setTaskHandoff(
        taskId,
        "PASS",
        "Implemented authentication feature",
        ["src/auth.ts", "src/middleware.ts"],
        "Full details:\n- Added JWT middleware\n- Created auth routes\n- Wrote tests"
      );
      expect(success).toBe(true);
    });

    it("should handle all status types", () => {
      const statuses: HandoffStatus[] = ["PASS", "FAIL", "BLOCKED"];

      for (const status of statuses) {
        const success = db.setTaskHandoff(
          taskId,
          status,
          `Test ${status} status`
        );
        expect(success).toBe(true);
      }
    });

    it("should upsert - replace existing handoff", () => {
      // First handoff
      db.setTaskHandoff(taskId, "FAIL", "Initial failure");

      // Update handoff
      const success = db.setTaskHandoff(
        taskId,
        "PASS",
        "Fixed and passed"
      );
      expect(success).toBe(true);

      // Verify it was replaced
      const handoff = db.getTaskHandoff(taskId);
      expect(handoff?.status).toBe("PASS");
      expect(handoff?.summary).toBe("Fixed and passed");
    });
  });

  describe("getTaskHandoff", () => {
    it("should return null for non-existent handoff", () => {
      const handoff = db.getTaskHandoff("non-existent-task");
      expect(handoff).toBeNull();
    });

    it("should return handoff without full_details by default", () => {
      db.setTaskHandoff(
        taskId,
        "PASS",
        "Brief summary",
        ["file1.ts"],
        "Very long detailed output that should not be returned by default"
      );

      const handoff = db.getTaskHandoff(taskId);
      expect(handoff).toBeDefined();
      expect(handoff?.task_id).toBe(taskId);
      expect(handoff?.status).toBe("PASS");
      expect(handoff?.summary).toBe("Brief summary");
      expect(handoff?.files_changed).toEqual(["file1.ts"]);
      expect(handoff?.full_details).toBeUndefined();
      expect(handoff?.created_at).toBeDefined();
    });

    it("should return full_details when include_details=true", () => {
      const fullDetails = "Complete detailed output with lots of information";
      db.setTaskHandoff(
        taskId,
        "PASS",
        "Summary",
        undefined,
        fullDetails
      );

      const handoff = db.getTaskHandoff(taskId, true);
      expect(handoff?.full_details).toBe(fullDetails);
    });

    it("should handle handoff without files_changed", () => {
      db.setTaskHandoff(taskId, "PASS", "No files");

      const handoff = db.getTaskHandoff(taskId);
      expect(handoff?.files_changed).toBeUndefined();
    });

    it("should handle handoff without full_details", () => {
      db.setTaskHandoff(taskId, "PASS", "Minimal handoff");

      const handoff = db.getTaskHandoff(taskId, true);
      expect(handoff?.summary).toBe("Minimal handoff");
      expect(handoff?.full_details).toBeNull();
    });

    it("should correctly parse files_changed JSON", () => {
      const files = ["src/a.ts", "src/b.ts", "test/c.test.ts"];
      db.setTaskHandoff(taskId, "PASS", "Multiple files", files);

      const handoff = db.getTaskHandoff(taskId);
      expect(handoff?.files_changed).toEqual(files);
    });
  });

  describe("timestamp handling", () => {
    it("should set created_at on handoff creation", () => {
      db.setTaskHandoff(taskId, "PASS", "Timestamped");

      const handoff = db.getTaskHandoff(taskId);
      expect(handoff?.created_at).toBeDefined();
      expect(new Date(handoff!.created_at!).getTime()).toBeGreaterThan(0);
    });

    it("should initialize compacted_at as null", () => {
      db.setTaskHandoff(taskId, "PASS", "Not compacted yet");

      const handoff = db.getTaskHandoff(taskId, true);
      expect(handoff?.compacted_at).toBeNull();
    });
  });
});
