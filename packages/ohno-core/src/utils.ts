/**
 * Utility functions for ohno
 */

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface GitContext {
  insideWorkTree: boolean;
  gitDir: string;       // per-worktree gitdir from `git rev-parse --git-dir`
  commonDir: string;
  topLevel: string;
  superprojectRoot: string | null;
}

export function tryGit(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export function getGitContext(cwd: string): GitContext | null {
  const insideWorkTreeStr = tryGit(['rev-parse', '--is-inside-work-tree'], cwd);
  if (insideWorkTreeStr !== 'true') return null;
  const gitDirRaw = tryGit(['rev-parse', '--git-dir'], cwd);
  if (!gitDirRaw) return null;
  const gitDir = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(cwd, gitDirRaw);
  const commonDir = tryGit(['rev-parse', '--git-common-dir'], cwd);
  const topLevel  = tryGit(['rev-parse', '--show-toplevel'], cwd);
  if (!commonDir || !topLevel) return null;
  const superRaw = tryGit(['rev-parse', '--show-superproject-working-tree'], cwd);
  const superprojectRoot = superRaw && superRaw.length > 0 ? superRaw : null;
  return {
    insideWorkTree: true,
    gitDir,
    commonDir: path.isAbsolute(commonDir) ? commonDir : path.resolve(cwd, commonDir),
    topLevel,
    superprojectRoot,
  };
}

export function resolveCanonicalProjectRoot(ctx: GitContext): string | null {
  if (ctx.superprojectRoot !== null) return ctx.topLevel;
  // Linked worktrees have a per-worktree gitDir distinct from the canonical commonDir.
  // Normal repos and external gitdirs have gitDir === commonDir.
  if (ctx.gitDir !== ctx.commonDir) {
    return path.dirname(ctx.commonDir);
  }
  return ctx.topLevel;
}

/**
 * Generate a content-based task ID
 * Format: task-{sha256[:8]}
 */
export function generateTaskId(title: string, storyId: string | null, timestamp: string): string {
  const content = `${title}|${storyId ?? ""}|${timestamp}`;
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `task-${hash.slice(0, 8)}`;
}

/**
 * Generate a unique activity ID
 * Format: act-{sha256[:8]}
 * Includes random component to avoid collisions within same timestamp
 */
export function generateActivityId(taskId: string, activityType: string, timestamp: string): string {
  const random = crypto.randomBytes(4).toString("hex");
  const content = `${taskId}|${activityType}|${timestamp}|${random}`;
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `act-${hash.slice(0, 8)}`;
}

/**
 * Generate a content-based dependency ID
 * Format: dep-{sha256[:8]}
 */
export function generateDependencyId(taskId: string, dependsOnTaskId: string): string {
  const content = `${taskId}|${dependsOnTaskId}`;
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `dep-${hash.slice(0, 8)}`;
}

/**
 * Generate a content-based story ID
 * Format: story-{sha256[:8]}
 */
export function generateStoryId(title: string, epicId: string | null, timestamp: string): string {
  const content = `${title}|${epicId ?? ""}|${timestamp}`;
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `story-${hash.slice(0, 8)}`;
}

/**
 * Generate a content-based epic ID
 * Format: epic-{sha256[:8]}
 */
export function generateEpicId(title: string, projectId: string | null, timestamp: string): string {
  const content = `${title}|${projectId ?? ""}|${timestamp}`;
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `epic-${hash.slice(0, 8)}`;
}

/**
 * Generate a unique failure ID
 * Format: fail-{sha256[:8]}
 * Includes random component to avoid collisions
 */
export function generateFailureId(taskId: string, failureType: string, timestamp: string): string {
  const random = crypto.randomBytes(4).toString("hex");
  const content = `${taskId}|${failureType}|${timestamp}|${random}`;
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `fail-${hash.slice(0, 8)}`;
}

/**
 * Get current ISO timestamp
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Find the .ohno directory by walking up from startDir
 * Similar to how git finds .git
 */
export function findOhnoDir(startDir?: string): string | null {
  const cwd = startDir ?? process.cwd();
  const gitCtx = getGitContext(cwd);
  if (gitCtx) {
    const projectRoot = resolveCanonicalProjectRoot(gitCtx);
    if (projectRoot) {
      const candidate = path.join(projectRoot, '.ohno');
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return fs.realpathSync(candidate);
      }
      return null;  // Inside working tree but no canonical .ohno; do not fall through to worktree-local
    }
  }
  return walkUpForOhno(cwd);
}

function walkUpForOhno(startDir: string): string | null {
  let currentDir = startDir;
  while (true) {
    const ohnoPath = path.join(currentDir, '.ohno');
    if (fs.existsSync(ohnoPath) && fs.statSync(ohnoPath).isDirectory()) return ohnoPath;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

/**
 * Find the tasks.db file
 */
export function findDbPath(startDir?: string): string | null {
  const ohnoDir = findOhnoDir(startDir);
  if (!ohnoDir) {
    return null;
  }

  const dbPath = path.join(ohnoDir, "tasks.db");
  if (fs.existsSync(dbPath)) {
    return dbPath;
  }

  return null;
}

/**
 * Ensure .ohno directory exists
 */
export function ensureOhnoDir(baseDir?: string): string {
  const dir = baseDir ?? process.cwd();
  const ohnoDir = path.join(dir, ".ohno");

  if (!fs.existsSync(ohnoDir)) {
    fs.mkdirSync(ohnoDir, { recursive: true });
  }

  // Create subdirectories
  const sessionsDir = path.join(ohnoDir, "sessions");
  const checkpointsDir = path.join(ohnoDir, "checkpoints");

  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir);
  }

  if (!fs.existsSync(checkpointsDir)) {
    fs.mkdirSync(checkpointsDir);
  }

  return ohnoDir;
}

/**
 * Priority ordering for sorting tasks
 */
export const PRIORITY_ORDER: Record<string, number> = {
  "P0": 0,
  "P1": 1,
  "P2": 2,
  "P3": 3,
};

/**
 * Sort tasks by priority (P0 first)
 */
export function sortByPriority<T extends { epic_priority?: string }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const aPriority = PRIORITY_ORDER[a.epic_priority ?? ""] ?? 99;
    const bPriority = PRIORITY_ORDER[b.epic_priority ?? ""] ?? 99;
    return aPriority - bPriority;
  });
}
