/**
 * TaskDatabase - Core database operations for ohno
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import type {
  Task,
  TaskActivity,
  TaskDependency,
  ProjectStatus,
  SessionContext,
  CreateTaskOptions,
  GetTasksOptions,
  TaskStatus,
  DependencyType,
} from "./types.js";
import {
  generateTaskId,
  generateActivityId,
  generateDependencyId,
  getTimestamp,
  sortByPriority,
} from "./utils.js";
import {
  CREATE_PROJECTS_TABLE,
  CREATE_EPICS_TABLE,
  CREATE_STORIES_TABLE,
  CREATE_TASKS_TABLE,
  CREATE_TASK_ACTIVITY_TABLE,
  CREATE_TASK_FILES_TABLE,
  CREATE_TASK_DEPENDENCIES_TABLE,
  CREATE_INDEXES,
  EXTENDED_TASK_COLUMNS,
  GET_TASKS_WITH_JOINS,
  GET_TASK_BY_ID,
  GET_PROJECT_STATUS,
  GET_RECENT_ACTIVITY,
  GET_TASK_DEPENDENCIES,
  GET_BLOCKING_DEPENDENCIES,
} from "./schema.js";

export class TaskDatabase {
  private db: DatabaseType;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.ensureTables();
  }

  /**
   * Ensure all required tables and columns exist
   */
  private ensureTables(): void {
    // Create hierarchy tables
    this.db.exec(CREATE_PROJECTS_TABLE);
    this.db.exec(CREATE_EPICS_TABLE);
    this.db.exec(CREATE_STORIES_TABLE);

    // Create core tables
    this.db.exec(CREATE_TASKS_TABLE);
    this.db.exec(CREATE_TASK_ACTIVITY_TABLE);
    this.db.exec(CREATE_TASK_FILES_TABLE);
    this.db.exec(CREATE_TASK_DEPENDENCIES_TABLE);

    // Add extended columns if missing (backwards compatibility)
    for (const [colName, colType] of EXTENDED_TASK_COLUMNS) {
      try {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN ${colName} ${colType}`);
      } catch {
        // Column already exists
      }
    }

    // Create indexes
    for (const sql of CREATE_INDEXES) {
      this.db.exec(sql);
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get aggregated project status
   */
  getProjectStatus(): ProjectStatus {
    const row = this.db.prepare(GET_PROJECT_STATUS).get() as Record<string, unknown> | undefined;

    if (!row) {
      return {
        total_tasks: 0,
        done_tasks: 0,
        in_progress_tasks: 0,
        review_tasks: 0,
        blocked_tasks: 0,
        todo_tasks: 0,
        completion_percent: 0,
        total_epics: 0,
        total_stories: 0,
        total_estimate_hours: 0,
        total_actual_hours: 0,
      };
    }

    const total = Number(row.total_tasks) || 0;
    const done = Number(row.done_tasks) || 0;

    return {
      project_name: row.project_name as string | undefined,
      total_tasks: total,
      done_tasks: done,
      in_progress_tasks: Number(row.in_progress_tasks) || 0,
      review_tasks: Number(row.review_tasks) || 0,
      blocked_tasks: Number(row.blocked_tasks) || 0,
      todo_tasks: Number(row.todo_tasks) || 0,
      completion_percent: total > 0 ? Math.round((done / total) * 100) : 0,
      total_epics: Number(row.total_epics) || 0,
      total_stories: Number(row.total_stories) || 0,
      total_estimate_hours: Number(row.total_estimate_hours) || 0,
      total_actual_hours: Number(row.total_actual_hours) || 0,
    };
  }

  /**
   * Get tasks with optional filtering
   */
  getTasks(opts: GetTasksOptions = {}): Task[] {
    const { status, epic_id, priority, limit = 50 } = opts;

    let sql = GET_TASKS_WITH_JOINS;
    const conditions: string[] = ["t.status != 'archived'"];
    const params: unknown[] = [];

    if (status) {
      conditions.push("t.status = ?");
      params.push(status);
    }

    if (epic_id) {
      conditions.push("e.id = ?");
      params.push(epic_id);
    }

    if (priority) {
      conditions.push("e.priority = ?");
      params.push(priority);
    }

    sql += ` WHERE ${conditions.join(" AND ")}`;
    sql += " ORDER BY t.updated_at DESC, t.created_at DESC";
    sql += " LIMIT ?";
    params.push(limit);

    return this.db.prepare(sql).all(...params) as Task[];
  }

  /**
   * Get a single task by ID
   */
  getTask(taskId: string): Task | null {
    const row = this.db.prepare(GET_TASK_BY_ID).get(taskId) as Task | undefined;
    return row ?? null;
  }

  /**
   * Get next recommended task
   * Logic: continue in_progress OR suggest highest priority todo without blocking deps
   */
  getNextTask(): Task | null {
    // First, check for in-progress tasks
    const inProgress = this.getTasks({ status: "in_progress", limit: 1 });
    if (inProgress.length > 0) {
      return inProgress[0];
    }

    // Get todo tasks and filter out those with blocking dependencies
    const todoTasks = this.getTasks({ status: "todo", limit: 20 });
    const availableTasks = todoTasks.filter(
      (task) => !this.isTaskBlockedByDependencies(task.id)
    );

    if (availableTasks.length === 0) {
      return null;
    }

    // Sort by priority and return first
    const sorted = sortByPriority(availableTasks);
    return sorted[0];
  }

  /**
   * Get blocked tasks
   */
  getBlockedTasks(): Task[] {
    return this.getTasks({ status: "blocked" });
  }

  /**
   * Get session context for AI agent continuity
   */
  getSessionContext(): SessionContext {
    return {
      in_progress_tasks: this.getTasks({ status: "in_progress", limit: 10 }),
      blocked_tasks: this.getTasks({ status: "blocked", limit: 10 }),
      recent_activity: this.getRecentActivity(10),
      suggested_next_task: this.getNextTask() ?? undefined,
    };
  }

  /**
   * Get activity history for a task
   */
  getTaskActivity(taskId: string, limit = 20): TaskActivity[] {
    const sql = `
      SELECT * FROM task_activity
      WHERE task_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;
    return this.db.prepare(sql).all(taskId, limit) as TaskActivity[];
  }

  /**
   * Get recent activity across all tasks
   */
  getRecentActivity(limit = 10): TaskActivity[] {
    return this.db.prepare(GET_RECENT_ACTIVITY).all(limit) as TaskActivity[];
  }

  /**
   * Get dependencies for a task
   */
  getTaskDependencies(taskId: string): TaskDependency[] {
    return this.db.prepare(GET_TASK_DEPENDENCIES).all(taskId) as TaskDependency[];
  }

  /**
   * Get blocking (unfinished) dependencies for a task
   */
  getBlockingDependencies(taskId: string): string[] {
    const rows = this.db.prepare(GET_BLOCKING_DEPENDENCIES).all(taskId) as { depends_on_task_id: string }[];
    return rows.map((r) => r.depends_on_task_id);
  }

  /**
   * Check if task is blocked by unfinished dependencies
   */
  isTaskBlockedByDependencies(taskId: string): boolean {
    return this.getBlockingDependencies(taskId).length > 0;
  }

  // ==========================================================================
  // Mutation Methods
  // ==========================================================================

  /**
   * Create a new task
   */
  createTask(opts: CreateTaskOptions): string {
    const timestamp = getTimestamp();
    let taskId = generateTaskId(opts.title, opts.story_id ?? null, timestamp);

    // Handle collision by appending counter
    let counter = 0;
    while (this.getTask(taskId) !== null) {
      counter++;
      taskId = generateTaskId(opts.title, opts.story_id ?? null, `${timestamp}-${counter}`);
    }

    const sql = `
      INSERT INTO tasks (id, story_id, title, status, task_type, description, estimate_hours, created_at, updated_at, created_by)
      VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?)
    `;

    this.db.prepare(sql).run(
      taskId,
      opts.story_id ?? null,
      opts.title,
      opts.task_type ?? "feature",
      opts.description ?? null,
      opts.estimate_hours ?? null,
      timestamp,
      timestamp,
      opts.actor ?? null
    );

    // Log activity
    this.addTaskActivity(taskId, "created", `Task created: ${opts.title}`, opts.actor);

    return taskId;
  }

  /**
   * Update task fields
   */
  updateTask(taskId: string, updates: Partial<Task>, actor?: string): boolean {
    const task = this.getTask(taskId);
    if (!task) {
      return false;
    }

    const allowedFields = ["title", "description", "task_type", "estimate_hours"];
    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const field of allowedFields) {
      if (field in updates && updates[field as keyof Task] !== undefined) {
        setClauses.push(`${field} = ?`);
        params.push(updates[field as keyof Task]);
      }
    }

    if (setClauses.length === 0) {
      return false;
    }

    setClauses.push("updated_at = ?");
    params.push(getTimestamp());
    params.push(taskId);

    const sql = `UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ?`;
    const result = this.db.prepare(sql).run(...params);

    if (result.changes > 0) {
      this.addTaskActivity(taskId, "updated", "Task updated", actor);
    }

    return result.changes > 0;
  }

  /**
   * Update task status
   */
  updateTaskStatus(taskId: string, status: TaskStatus, notes?: string, actor?: string): boolean {
    const task = this.getTask(taskId);
    if (!task) {
      return false;
    }

    const oldStatus = task.status;
    const timestamp = getTimestamp();

    const sql = `
      UPDATE tasks
      SET status = ?, updated_at = ?, handoff_notes = COALESCE(?, handoff_notes)
      WHERE id = ?
    `;

    const result = this.db.prepare(sql).run(status, timestamp, notes ?? null, taskId);

    if (result.changes > 0) {
      this.addTaskActivity(
        taskId,
        "status_change",
        `Status changed from ${oldStatus} to ${status}`,
        actor,
        oldStatus,
        status
      );

      // Auto-summarize on completion
      if (status === "done" || status === "archived") {
        this.summarizeTaskActivity(taskId);
      }
    }

    return result.changes > 0;
  }

  /**
   * Set handoff notes for a task
   */
  setHandoffNotes(taskId: string, notes: string, actor?: string): boolean {
    const sql = `UPDATE tasks SET handoff_notes = ?, updated_at = ? WHERE id = ?`;
    const result = this.db.prepare(sql).run(notes, getTimestamp(), taskId);

    if (result.changes > 0) {
      this.addTaskActivity(taskId, "note", "Handoff notes updated", actor);
    }

    return result.changes > 0;
  }

  /**
   * Update task progress
   */
  updateTaskProgress(taskId: string, percent: number, contextSummary?: string, actor?: string): boolean {
    const setClauses = ["progress_percent = ?", "updated_at = ?"];
    const params: unknown[] = [percent, getTimestamp()];

    if (contextSummary !== undefined) {
      setClauses.push("context_summary = ?");
      params.push(contextSummary);
    }

    params.push(taskId);

    const sql = `UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ?`;
    const result = this.db.prepare(sql).run(...params);

    if (result.changes > 0) {
      this.addTaskActivity(taskId, "progress", `Progress updated to ${percent}%`, actor);
    }

    return result.changes > 0;
  }

  /**
   * Set a blocker on a task
   */
  setBlocker(taskId: string, reason: string, actor?: string): boolean {
    const sql = `
      UPDATE tasks
      SET status = 'blocked', blockers = ?, updated_at = ?
      WHERE id = ?
    `;

    const result = this.db.prepare(sql).run(reason, getTimestamp(), taskId);

    if (result.changes > 0) {
      this.addTaskActivity(taskId, "blocker_set", `Blocked: ${reason}`, actor);
    }

    return result.changes > 0;
  }

  /**
   * Resolve a blocker
   */
  resolveBlocker(taskId: string, actor?: string): boolean {
    const sql = `
      UPDATE tasks
      SET status = 'in_progress', blockers = NULL, updated_at = ?
      WHERE id = ?
    `;

    const result = this.db.prepare(sql).run(getTimestamp(), taskId);

    if (result.changes > 0) {
      this.addTaskActivity(taskId, "blocker_resolved", "Blocker resolved", actor);
    }

    return result.changes > 0;
  }

  /**
   * Archive a task
   */
  archiveTask(taskId: string, reason?: string, actor?: string): boolean {
    const sql = `
      UPDATE tasks
      SET status = 'archived', updated_at = ?
      WHERE id = ?
    `;

    const result = this.db.prepare(sql).run(getTimestamp(), taskId);

    if (result.changes > 0) {
      this.addTaskActivity(
        taskId,
        "status_change",
        `Task archived${reason ? `: ${reason}` : ""}`,
        actor
      );
    }

    return result.changes > 0;
  }

  /**
   * Delete a task (hard delete)
   */
  deleteTask(taskId: string): boolean {
    // Delete related records first
    this.db.prepare("DELETE FROM task_activity WHERE task_id = ?").run(taskId);
    this.db.prepare("DELETE FROM task_files WHERE task_id = ?").run(taskId);
    this.db.prepare("DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_task_id = ?").run(taskId, taskId);

    const result = this.db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
    return result.changes > 0;
  }

  // ==========================================================================
  // Dependency Methods
  // ==========================================================================

  /**
   * Add a dependency between tasks
   */
  addDependency(taskId: string, dependsOnTaskId: string, dependencyType: DependencyType = "blocks"): string | null {
    // Prevent self-reference
    if (taskId === dependsOnTaskId) {
      return null;
    }

    // Check both tasks exist
    if (!this.getTask(taskId) || !this.getTask(dependsOnTaskId)) {
      return null;
    }

    const depId = generateDependencyId(taskId, dependsOnTaskId);

    // Check if already exists
    const existing = this.db.prepare(
      "SELECT id FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?"
    ).get(taskId, dependsOnTaskId);

    if (existing) {
      return null;
    }

    const sql = `
      INSERT INTO task_dependencies (id, task_id, depends_on_task_id, dependency_type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `;

    this.db.prepare(sql).run(depId, taskId, dependsOnTaskId, dependencyType, getTimestamp());
    return depId;
  }

  /**
   * Remove a dependency
   */
  removeDependency(taskId: string, dependsOnTaskId: string): boolean {
    const result = this.db.prepare(
      "DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?"
    ).run(taskId, dependsOnTaskId);

    return result.changes > 0;
  }

  // ==========================================================================
  // Activity Methods
  // ==========================================================================

  /**
   * Add an activity log entry
   */
  addTaskActivity(
    taskId: string,
    activityType: string,
    description: string,
    actor?: string,
    oldValue?: string,
    newValue?: string
  ): boolean {
    const timestamp = getTimestamp();
    const actId = generateActivityId(taskId, activityType, timestamp);

    const sql = `
      INSERT INTO task_activity (id, task_id, activity_type, description, old_value, new_value, actor, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = this.db.prepare(sql).run(
      actId,
      taskId,
      activityType,
      description,
      oldValue ?? null,
      newValue ?? null,
      actor ?? null,
      timestamp
    );

    return result.changes > 0;
  }

  /**
   * Summarize task activity into a compressed text
   */
  summarizeTaskActivity(taskId: string, deleteRaw = false, minEntries = 5): string | null {
    const activities = this.getTaskActivity(taskId, 100);

    if (activities.length < minEntries) {
      return null;
    }

    // Build summary text
    const lines: string[] = [];
    for (const act of activities.reverse()) {
      const timestamp = act.created_at?.split("T")[0] ?? "unknown";
      lines.push(`[${timestamp}] ${act.activity_type}: ${act.description ?? ""}`);
    }

    const summary = lines.join("\n");

    // Store summary on task
    this.db.prepare("UPDATE tasks SET activity_summary = ? WHERE id = ?").run(summary, taskId);

    // Optionally delete old entries (keep last 3)
    if (deleteRaw && activities.length > 3) {
      const keepIds = activities.slice(0, 3).map((a) => a.id);
      const placeholders = keepIds.map(() => "?").join(",");

      this.db.prepare(
        `DELETE FROM task_activity WHERE task_id = ? AND id NOT IN (${placeholders})`
      ).run(taskId, ...keepIds);
    }

    return summary;
  }
}
