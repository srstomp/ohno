/**
 * Tests for utility functions
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
  tryGit,
  getGitContext,
  resolveCanonicalProjectRoot,
} from "./utils.js";
import type { Task } from "./types.js";

function hasGit(): boolean {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}
const itGit = hasGit() ? it : it.skip;

function gitInit(dir: string) {
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
}
function gitCommit(dir: string, msg = 'init') {
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', msg, '--allow-empty'], { cwd: dir, stdio: 'ignore' });
}

describe('tryGit', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohno-trygit-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns trimmed stdout for a successful git invocation', () => {
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
    expect(tryGit(['rev-parse', '--is-inside-work-tree'], tmpDir)).toBe('true');
  });

  it('returns null when invoked in a non-git directory (does not throw)', () => {
    expect(tryGit(['rev-parse', '--is-inside-work-tree'], tmpDir)).toBeNull();
  });
});

describe('getGitContext', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohno-gctx-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns null in a non-git directory', () => {
    expect(getGitContext(tmpDir)).toBeNull();
  });

  it('returns null in a bare repo', () => {
    const bare = path.join(tmpDir, 'bare.git');
    fs.mkdirSync(bare);
    execFileSync('git', ['init', '--bare'], { cwd: bare, stdio: 'ignore' });
    expect(getGitContext(bare)).toBeNull();
  });

  it('populates all fields in a normal working tree', () => {
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
    const ctx = getGitContext(tmpDir);
    expect(ctx).not.toBeNull();
    expect(ctx!.insideWorkTree).toBe(true);
    expect(path.isAbsolute(ctx!.commonDir)).toBe(true);
    expect(ctx!.superprojectRoot).toBeNull();
  });
});

describe('resolveCanonicalProjectRoot', () => {
  it('returns topLevel for a submodule', () => {
    expect(resolveCanonicalProjectRoot({
      insideWorkTree: true,
      commonDir: '/parent/.git/modules/sub',
      topLevel: '/parent/sub',
      superprojectRoot: '/parent',
    })).toBe('/parent/sub');
  });
  it('returns dirname(commonDir) for a normal repo / linked worktree', () => {
    expect(resolveCanonicalProjectRoot({
      insideWorkTree: true,
      commonDir: '/repo/.git',
      topLevel: '/repo/.worktrees/feat',
      superprojectRoot: null,
    })).toBe('/repo');
  });
});

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

describe('findOhnoDir — git-aware behavior', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohno-fod-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns canonical .ohno from a normal git repo', () => {
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
    fs.mkdirSync(path.join(tmpDir, '.ohno'));
    expect(findOhnoDir(tmpDir)).toBe(path.join(fs.realpathSync(tmpDir), '.ohno'));
  });

  it('falls back to cwd-walk when not in a git repo', () => {
    fs.mkdirSync(path.join(tmpDir, '.ohno'));
    expect(findOhnoDir(tmpDir)).toBe(path.join(tmpDir, '.ohno'));
  });
});

describe('findOhnoDir — eight integration scenarios', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohno-int-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  itGit('1. canonical root', () => {
    gitInit(tmpDir);
    const ohno = path.join(tmpDir, '.ohno');
    fs.mkdirSync(ohno);
    expect(findOhnoDir(tmpDir)).toBe(path.join(fs.realpathSync(tmpDir), '.ohno'));
  });

  itGit('2. linked worktree returns canonical, not stale worktree-local', () => {
    gitInit(tmpDir);
    fs.mkdirSync(path.join(tmpDir, '.ohno'));
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'test');
    gitCommit(tmpDir);
    const wt = path.join(tmpDir, '.worktrees', 'feat');
    execFileSync('git', ['worktree', 'add', '-b', 'feat', wt], { cwd: tmpDir, stdio: 'ignore' });
    fs.mkdirSync(path.join(wt, '.ohno'));  // simulate buggy stale state
    const sub = path.join(wt, 'a', 'b');
    fs.mkdirSync(sub, { recursive: true });
    expect(findOhnoDir(sub)).toBe(path.join(fs.realpathSync(tmpDir), '.ohno'));
  });

  itGit('3. worktree without canonical .ohno returns null', () => {
    gitInit(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'test');
    gitCommit(tmpDir);
    const wt = path.join(tmpDir, '.worktrees', 'feat');
    execFileSync('git', ['worktree', 'add', '-b', 'feat', wt], { cwd: tmpDir, stdio: 'ignore' });
    fs.mkdirSync(path.join(wt, '.ohno'));
    expect(findOhnoDir(wt)).toBeNull();
  });

  itGit('4. submodule resolves to its own .ohno', () => {
    const subSrc = path.join(tmpDir, 'sub-src');
    fs.mkdirSync(subSrc);
    gitInit(subSrc);
    fs.writeFileSync(path.join(subSrc, 'a.txt'), 'a');
    gitCommit(subSrc);

    const parent = path.join(tmpDir, 'parent');
    fs.mkdirSync(parent);
    gitInit(parent);
    fs.writeFileSync(path.join(parent, 'README.md'), 'p');
    gitCommit(parent);

    execFileSync('git', ['-c', 'protocol.file.allow=always', 'submodule', 'add', 'file://' + subSrc, 'sub'], { cwd: parent, stdio: 'ignore' });

    fs.mkdirSync(path.join(parent, '.ohno'));
    fs.mkdirSync(path.join(parent, 'sub', '.ohno'));

    const subPath = path.join(parent, 'sub', 'deep');
    fs.mkdirSync(subPath);
    expect(findOhnoDir(subPath)).toBe(path.join(fs.realpathSync(parent), 'sub', '.ohno'));
  });

  itGit('5. bare repo returns null', () => {
    const bare = path.join(tmpDir, 'bare.git');
    fs.mkdirSync(bare);
    execFileSync('git', ['init', '--bare'], { cwd: bare, stdio: 'ignore' });
    expect(findOhnoDir(bare)).toBeNull();
  });

  itGit('6. external gitdir resolves to working tree', () => {
    const wt = path.join(tmpDir, 'wt');
    const gd = path.join(tmpDir, 'gd');
    fs.mkdirSync(wt);
    execFileSync('git', ['init', '--separate-git-dir=' + gd], { cwd: wt, stdio: 'ignore' });
    fs.mkdirSync(path.join(wt, '.ohno'));
    expect(findOhnoDir(wt)).toBe(path.join(fs.realpathSync(wt), '.ohno'));
  });

  it('7. non-git dir with .ohno: cwd-walk fallback returns it', () => {
    fs.mkdirSync(path.join(tmpDir, '.ohno'));
    expect(findOhnoDir(tmpDir)).toBe(path.join(tmpDir, '.ohno'));
  });

  it('8. git not on PATH falls back to cwd-walk without throwing', () => {
    fs.mkdirSync(path.join(tmpDir, '.ohno'));
    const origPath = process.env.PATH;
    try {
      process.env.PATH = '';
      expect(() => findOhnoDir(tmpDir)).not.toThrow();
      expect(findOhnoDir(tmpDir)).toBe(path.join(tmpDir, '.ohno'));
    } finally {
      process.env.PATH = origPath;
    }
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
