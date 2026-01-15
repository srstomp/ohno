/**
 * Utility functions for ohno
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
  let currentDir = startDir ?? process.cwd();

  // Walk up the directory tree
  while (true) {
    const ohnoPath = path.join(currentDir, ".ohno");

    if (fs.existsSync(ohnoPath) && fs.statSync(ohnoPath).isDirectory()) {
      return ohnoPath;
    }

    const parentDir = path.dirname(currentDir);

    // Reached root
    if (parentDir === currentDir) {
      return null;
    }

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
