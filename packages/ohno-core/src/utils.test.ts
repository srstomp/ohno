/**
 * Tests for utility functions
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  generateTaskId,
  generateActivityId,
  generateDependencyId,
  getTimestamp,
  findOhnoDir,
  findDbPath,
  ensureOhnoDir,
  sortByPriority,
} from "./utils.js";
import type { Task } from "./types.js";

describe("ID Generation", () => {
  describe("generateTaskId", () => {
    it("should generate consistent IDs for same inputs", () => {
      const id1 = generateTaskId("Test task", null, "2024-01-01T00:00:00Z");
      const id2 = generateTaskId("Test task", null, "2024-01-01T00:00:00Z");
      expect(id1).toBe(id2);
    });

    it("should generate different IDs for different titles", () => {
      const id1 = generateTaskId("Task A", null, "2024-01-01T00:00:00Z");
      const id2 = generateTaskId("Task B", null, "2024-01-01T00:00:00Z");
      expect(id1).not.toBe(id2);
    });

    it("should generate different IDs for different timestamps", () => {
      const id1 = generateTaskId("Test", null, "2024-01-01T00:00:00Z");
      const id2 = generateTaskId("Test", null, "2024-01-02T00:00:00Z");
      expect(id1).not.toBe(id2);
    });

    it("should include story_id in hash when provided", () => {
      const id1 = generateTaskId("Test", "story-1", "2024-01-01T00:00:00Z");
      const id2 = generateTaskId("Test", "story-2", "2024-01-01T00:00:00Z");
      expect(id1).not.toBe(id2);
    });

    it("should start with 'task-' prefix", () => {
      const id = generateTaskId("Test", null, "2024-01-01T00:00:00Z");
      expect(id).toMatch(/^task-[a-f0-9]{8}$/);
    });
  });

  describe("generateActivityId", () => {
    it("should generate unique IDs for same inputs (includes randomness)", () => {
      const id1 = generateActivityId("task-123", "note", "2024-01-01T00:00:00Z");
      const id2 = generateActivityId("task-123", "note", "2024-01-01T00:00:00Z");
      expect(id1).not.toBe(id2);
    });

    it("should start with 'act-' prefix", () => {
      const id = generateActivityId("task-123", "note", "2024-01-01T00:00:00Z");
      expect(id).toMatch(/^act-[a-f0-9]{8}$/);
    });
  });

  describe("generateDependencyId", () => {
    it("should generate consistent IDs for same inputs", () => {
      const id1 = generateDependencyId("task-a", "task-b");
      const id2 = generateDependencyId("task-a", "task-b");
      expect(id1).toBe(id2);
    });

    it("should generate different IDs for different order", () => {
      const id1 = generateDependencyId("task-a", "task-b");
      const id2 = generateDependencyId("task-b", "task-a");
      expect(id1).not.toBe(id2);
    });

    it("should start with 'dep-' prefix", () => {
      const id = generateDependencyId("task-a", "task-b");
      expect(id).toMatch(/^dep-[a-f0-9]{8}$/);
    });
  });
});

describe("getTimestamp", () => {
  it("should return ISO 8601 format", () => {
    const timestamp = getTimestamp();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("should return current time (within 1 second)", () => {
    const before = Date.now();
    const timestamp = getTimestamp();
    const after = Date.now();
    const timestampMs = new Date(timestamp).getTime();
    expect(timestampMs).toBeGreaterThanOrEqual(before);
    expect(timestampMs).toBeLessThanOrEqual(after);
  });
});

describe("Directory Discovery", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ohno-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("findOhnoDir", () => {
    it("should find .ohno directory in current directory", () => {
      const ohnoDir = join(tempDir, ".ohno");
      mkdirSync(ohnoDir);
      expect(findOhnoDir(tempDir)).toBe(ohnoDir);
    });

    it("should find .ohno directory in parent directory", () => {
      const ohnoDir = join(tempDir, ".ohno");
      mkdirSync(ohnoDir);
      const subDir = join(tempDir, "subdir");
      mkdirSync(subDir);
      expect(findOhnoDir(subDir)).toBe(ohnoDir);
    });

    it("should return null if .ohno not found", () => {
      expect(findOhnoDir(tempDir)).toBeNull();
    });
  });

  describe("findDbPath", () => {
    it("should find tasks.db in .ohno directory", () => {
      const ohnoDir = join(tempDir, ".ohno");
      mkdirSync(ohnoDir);
      const dbPath = join(ohnoDir, "tasks.db");
      writeFileSync(dbPath, "");
      expect(findDbPath(tempDir)).toBe(dbPath);
    });

    it("should return null if tasks.db not found", () => {
      const ohnoDir = join(tempDir, ".ohno");
      mkdirSync(ohnoDir);
      expect(findDbPath(tempDir)).toBeNull();
    });
  });

  describe("ensureOhnoDir", () => {
    it("should create .ohno directory structure", () => {
      const ohnoDir = ensureOhnoDir(tempDir);
      expect(ohnoDir).toBe(join(tempDir, ".ohno"));
    });

    it("should create checkpoints subdirectory", () => {
      ensureOhnoDir(tempDir);
      const checkpointsDir = join(tempDir, ".ohno", "checkpoints");
      expect(() => mkdirSync(checkpointsDir)).toThrow(); // Already exists
    });

    it("should create sessions subdirectory", () => {
      ensureOhnoDir(tempDir);
      const sessionsDir = join(tempDir, ".ohno", "sessions");
      expect(() => mkdirSync(sessionsDir)).toThrow(); // Already exists
    });
  });
});

describe("sortByPriority", () => {
  it("should sort P0 before P1", () => {
    const tasks: Task[] = [
      { id: "1", title: "Low", status: "todo", epic_priority: "P1" },
      { id: "2", title: "High", status: "todo", epic_priority: "P0" },
    ];
    const sorted = sortByPriority(tasks);
    expect(sorted[0].epic_priority).toBe("P0");
    expect(sorted[1].epic_priority).toBe("P1");
  });

  it("should sort by priority order P0 > P1 > P2 > P3", () => {
    const tasks: Task[] = [
      { id: "1", title: "P3", status: "todo", epic_priority: "P3" },
      { id: "2", title: "P1", status: "todo", epic_priority: "P1" },
      { id: "3", title: "P0", status: "todo", epic_priority: "P0" },
      { id: "4", title: "P2", status: "todo", epic_priority: "P2" },
    ];
    const sorted = sortByPriority(tasks);
    expect(sorted.map((t) => t.epic_priority)).toEqual(["P0", "P1", "P2", "P3"]);
  });

  it("should handle tasks without priority (sort last)", () => {
    const tasks: Task[] = [
      { id: "1", title: "No priority", status: "todo" },
      { id: "2", title: "P0", status: "todo", epic_priority: "P0" },
    ];
    const sorted = sortByPriority(tasks);
    expect(sorted[0].epic_priority).toBe("P0");
    expect(sorted[1].epic_priority).toBeUndefined();
  });

  it("should not modify original array", () => {
    const tasks: Task[] = [
      { id: "1", title: "P1", status: "todo", epic_priority: "P1" },
      { id: "2", title: "P0", status: "todo", epic_priority: "P0" },
    ];
    sortByPriority(tasks);
    expect(tasks[0].epic_priority).toBe("P1"); // Original unchanged
  });
});
