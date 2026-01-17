/**
 * TaskDatabase - Core database operations for ohno
 *
 * Uses sql.js (pure JavaScript SQLite) for maximum compatibility.
 * No native bindings required - works on any Node.js version and platform.
 */

import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import * as fs from "fs";
import * as path from "path";
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

// Cache the SQL.js initialization promise
let sqlJsPromise: Promise<initSqlJs.SqlJsStatic> | null = null;

/**
 * Initialize sql.js (cached)
 */
async function getSqlJs(): Promise<initSqlJs.SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs();
  }
  return sqlJsPromise;
}

/**
 * Convert sql.js result to array of objects
 */
function resultToObjects<T>(result: initSqlJs.QueryExecResult[]): T[] {
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row: initSqlJs.SqlValue[]) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col: string, i: number) => {
      obj[col] = row[i];
    });
    return obj as T;
  });
}

export class TaskDatabase {
  private db: SqlJsDatabase;
  private dbPath: string;

  /**
   * Private constructor - use TaskDatabase.open() instead
   */
  private constructor(db: SqlJsDatabase, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  /**
   * Open or create a database (async factory)
   */
  static async open(dbPath: string): Promise<TaskDatabase> {
    const SQL = await getSqlJs();

    let db: SqlJsDatabase;

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      // Ensure directory exists
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      db = new SQL.Database();
    }

    const instance = new TaskDatabase(db, dbPath);
    instance.ensureTables();
    instance.save(); // Save initial state

    return instance;
  }

  /**
   * Save database to disk
   */
  private save(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  /**
   * Ensure all required tables and columns exist
   */
  private ensureTables(): void {
    // Create hierarchy tables
    this.db.run(CREATE_PROJECTS_TABLE);
    this.db.run(CREATE_EPICS_TABLE);
    this.db.run(CREATE_STORIES_TABLE);

    // Create core tables
    this.db.run(CREATE_TASKS_TABLE);
    this.db.run(CREATE_TASK_ACTIVITY_TABLE);
    this.db.run(CREATE_TASK_FILES_TABLE);
    this.db.run(CREATE_TASK_DEPENDENCIES_TABLE);

    // Add extended columns if missing (backwards compatibility)
    for (const [colName, colType] of EXTENDED_TASK_COLUMNS) {
      try {
        this.db.run(`ALTER TABLE tasks ADD COLUMN ${colName} ${colType}`);
      } catch {
        // Column already exists
      }
    }

    // Create indexes
    for (const sql of CREATE_INDEXES) {
      this.db.run(sql);
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.save();
    this.db.close();
  }

  /**
   * Reload the database from disk (useful for tests)
   * This discards any in-memory changes and re-reads from the file.
   */
  async reload(): Promise<void> {
    const SQL = await getSqlJs();

    // Close current db
    this.db.close();

    // Reload from disk
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
      this.ensureTables();
      this.save();
    }
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get aggregated project status
   */
  getProjectStatus(): ProjectStatus {
    const result = this.db.exec(GET_PROJECT_STATUS);
    const rows = resultToObjects<Record<string, unknown>>(result);

    if (rows.length === 0) {
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

    const row = rows[0];
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

    const stmt = this.db.prepare(sql);
    stmt.bind(params as initSqlJs.BindParams);

    const rows: Task[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as Task;
      rows.push(row);
    }
    stmt.free();

    return rows;
  }

  /**
   * Get a single task by ID
   */
  getTask(taskId: string): Task | null {
    const stmt = this.db.prepare(GET_TASK_BY_ID);
    stmt.bind([taskId]);

    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as Task;
      stmt.free();
      return row;
    }

    stmt.free();
    return null;
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
    const stmt = this.db.prepare(sql);
    stmt.bind([taskId, limit]);

    const rows: TaskActivity[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as TaskActivity);
    }
    stmt.free();

    return rows;
  }

  /**
   * Get recent activity across all tasks
   */
  getRecentActivity(limit = 10): TaskActivity[] {
    const stmt = this.db.prepare(GET_RECENT_ACTIVITY);
    stmt.bind([limit]);

    const rows: TaskActivity[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as TaskActivity);
    }
    stmt.free();

    return rows;
  }

  /**
   * Get dependencies for a task
   */
  getTaskDependencies(taskId: string): TaskDependency[] {
    const stmt = this.db.prepare(GET_TASK_DEPENDENCIES);
    stmt.bind([taskId]);

    const rows: TaskDependency[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as TaskDependency);
    }
    stmt.free();

    return rows;
  }

  /**
   * Get blocking (unfinished) dependencies for a task
   */
  getBlockingDependencies(taskId: string): string[] {
    const stmt = this.db.prepare(GET_BLOCKING_DEPENDENCIES);
    stmt.bind([taskId]);

    const rows: string[] = [];
    while (stmt.step()) {
      const obj = stmt.getAsObject() as unknown as { depends_on_task_id: string };
      rows.push(obj.depends_on_task_id);
    }
    stmt.free();

    return rows;
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

    this.db.run(sql, [
      taskId,
      opts.story_id ?? null,
      opts.title,
      opts.task_type ?? "feature",
      opts.description ?? null,
      opts.estimate_hours ?? null,
      timestamp,
      timestamp,
      opts.actor ?? null,
    ]);

    // Log activity
    this.addTaskActivity(taskId, "created", `Task created: ${opts.title}`, opts.actor);

    this.save();
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
    this.db.run(sql, params as initSqlJs.BindParams);

    const changes = this.db.getRowsModified();

    if (changes > 0) {
      this.addTaskActivity(taskId, "updated", "Task updated", actor);
      this.save();
    }

    return changes > 0;
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

    this.db.run(sql, [status, timestamp, notes ?? null, taskId]);
    const changes = this.db.getRowsModified();

    if (changes > 0) {
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

      this.save();
    }

    return changes > 0;
  }

  /**
   * Set handoff notes for a task
   */
  setHandoffNotes(taskId: string, notes: string, actor?: string): boolean {
    const sql = `UPDATE tasks SET handoff_notes = ?, updated_at = ? WHERE id = ?`;
    this.db.run(sql, [notes, getTimestamp(), taskId]);
    const changes = this.db.getRowsModified();

    if (changes > 0) {
      this.addTaskActivity(taskId, "note", "Handoff notes updated", actor);
      this.save();
    }

    return changes > 0;
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
    this.db.run(sql, params as initSqlJs.BindParams);
    const changes = this.db.getRowsModified();

    if (changes > 0) {
      this.addTaskActivity(taskId, "progress", `Progress updated to ${percent}%`, actor);
      this.save();
    }

    return changes > 0;
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

    this.db.run(sql, [reason, getTimestamp(), taskId]);
    const changes = this.db.getRowsModified();

    if (changes > 0) {
      this.addTaskActivity(taskId, "blocker_set", `Blocked: ${reason}`, actor);
      this.save();
    }

    return changes > 0;
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

    this.db.run(sql, [getTimestamp(), taskId]);
    const changes = this.db.getRowsModified();

    if (changes > 0) {
      this.addTaskActivity(taskId, "blocker_resolved", "Blocker resolved", actor);
      this.save();
    }

    return changes > 0;
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

    this.db.run(sql, [getTimestamp(), taskId]);
    const changes = this.db.getRowsModified();

    if (changes > 0) {
      this.addTaskActivity(
        taskId,
        "status_change",
        `Task archived${reason ? `: ${reason}` : ""}`,
        actor
      );
      this.save();
    }

    return changes > 0;
  }

  /**
   * Delete a task (hard delete)
   */
  deleteTask(taskId: string): boolean {
    // Delete related records first
    this.db.run("DELETE FROM task_activity WHERE task_id = ?", [taskId]);
    this.db.run("DELETE FROM task_files WHERE task_id = ?", [taskId]);
    this.db.run("DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_task_id = ?", [taskId, taskId]);

    this.db.run("DELETE FROM tasks WHERE id = ?", [taskId]);
    const changes = this.db.getRowsModified();

    if (changes > 0) {
      this.save();
    }

    return changes > 0;
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
    const stmt = this.db.prepare(
      "SELECT id FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?"
    );
    stmt.bind([taskId, dependsOnTaskId]);
    const exists = stmt.step();
    stmt.free();

    if (exists) {
      return null;
    }

    const sql = `
      INSERT INTO task_dependencies (id, task_id, depends_on_task_id, dependency_type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `;

    this.db.run(sql, [depId, taskId, dependsOnTaskId, dependencyType, getTimestamp()]);
    this.save();

    return depId;
  }

  /**
   * Remove a dependency
   */
  removeDependency(taskId: string, dependsOnTaskId: string): boolean {
    this.db.run(
      "DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?",
      [taskId, dependsOnTaskId]
    );

    const changes = this.db.getRowsModified();

    if (changes > 0) {
      this.save();
    }

    return changes > 0;
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

    this.db.run(sql, [
      actId,
      taskId,
      activityType,
      description,
      oldValue ?? null,
      newValue ?? null,
      actor ?? null,
      timestamp,
    ]);

    return this.db.getRowsModified() > 0;
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
    this.db.run("UPDATE tasks SET activity_summary = ? WHERE id = ?", [summary, taskId]);

    // Optionally delete old entries (keep last 3)
    if (deleteRaw && activities.length > 3) {
      const keepIds = activities.slice(0, 3).map((a) => a.id);
      const placeholders = keepIds.map(() => "?").join(",");

      this.db.run(
        `DELETE FROM task_activity WHERE task_id = ? AND id NOT IN (${placeholders})`,
        [taskId, ...keepIds]
      );
    }

    this.save();
    return summary;
  }
}
