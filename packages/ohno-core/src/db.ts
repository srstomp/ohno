/**
 * TaskDatabase - Core database operations for ohno
 *
 * Uses Node's built-in node:sqlite (DatabaseSync). Requires Node >= 22.16.
 */

import { DatabaseSync } from 'node:sqlite';
import * as fs from "fs";
import * as path from "path";
import type {
  Task,
  TaskActivity,
  TaskDependency,
  TaskFailure,
  TaskHandoff,
  BatchTask,
  WorkQueueEntry,
  ProjectStatus,
  SessionContext,
  CreateTaskOptions,
  CreateStoryOptions,
  UpdateStoryOptions,
  CreateEpicOptions,
  GetTasksOptions,
  GetStoriesOptions,
  GetEpicsOptions,
  TaskStatus,
  DependencyType,
  FailureType,
  TaskCompletionBoundaries,
  UpdateStatusResult,
  Epic,
  Story,
  FieldSet,
  HandoffStatus,
} from "./types.js";
import {
  generateTaskId,
  generateActivityId,
  generateDependencyId,
  generateStoryId,
  generateEpicId,
  generateFailureId,
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
  CREATE_TASK_FAILURES_TABLE,
  CREATE_TASK_HANDOFFS_TABLE,
  CREATE_WORK_QUEUE_TABLE,
  CREATE_INDEXES,
  EXTENDED_TASK_COLUMNS,
  GET_TASK_BY_ID,
  GET_PROJECT_STATUS,
  GET_RECENT_ACTIVITY,
  GET_TASK_DEPENDENCIES,
  GET_BLOCKING_DEPENDENCIES,
  FIELD_SETS,
} from "./schema.js";

// SQLite numeric error codes (node:sqlite uses .errcode, not .code, for the SQLite-specific code)
const SQLITE_BUSY = 5;
const SQLITE_BUSY_SNAPSHOT = 261; // SQLITE_BUSY | (1 << 8)
const SQLITE_LOCKED = 6;

/**
 * Typed error for database lock contention that is recoverable by the user.
 * Thrown when node:sqlite reports SQLITE_BUSY or SQLITE_BUSY_SNAPSHOT.
 */
export class OhnoDatabaseLockedError extends Error {
  constructor(public readonly sqliteCode: string, message: string) {
    super(message);
    this.name = 'OhnoDatabaseLockedError';
  }
}

/**
 * Map a node:sqlite error to a typed application error.
 * node:sqlite errors have .code = 'ERR_SQLITE_ERROR' and .errcode = <numeric SQLite code>.
 * Always throws; callers use it in catch blocks: try { ... } catch (e) { mapSqliteError(e); }
 */
function mapSqliteError(e: unknown): never {
  const errcode = (e as { errcode?: number })?.errcode;

  if (errcode === SQLITE_BUSY) {
    throw new OhnoDatabaseLockedError(
      'SQLITE_BUSY',
      "Database is locked by another ohno process; retry timed out after 5s. Try again, or check for stale ohno-mcp processes with 'ps aux | grep ohno-mcp'."
    );
  }
  if (errcode === SQLITE_BUSY_SNAPSHOT) {
    throw new OhnoDatabaseLockedError(
      'SQLITE_BUSY_SNAPSHOT',
      'Database changed during transaction; retry'
    );
  }
  if (errcode === SQLITE_LOCKED) {
    // Programmer-level bug, NOT an OhnoDatabaseLockedError
    const err = new Error('Internal lock conflict (SQLITE_LOCKED) — please report this as a bug.');
    (err as Error & { sqliteCode?: string }).sqliteCode = 'SQLITE_LOCKED';
    throw err;
  }
  // Pass-through: re-throw with errcode preserved in message if not already there
  const isNodeSqliteError = (e as { code?: string })?.code === 'ERR_SQLITE_ERROR';
  if (isNodeSqliteError && errcode !== undefined && e instanceof Error && !e.message.includes(String(errcode))) {
    throw new Error(`${e.message} [errcode=${errcode}]`, { cause: e });
  }
  throw e;
}

export class TaskDatabase {
  private constructor(private db: DatabaseSync, public readonly dbPath: string) {}

  /**
   * Execute fn inside a BEGIN IMMEDIATE transaction.
   * Acquires the write lock at start, avoiding mid-transaction upgrade races.
   * If ROLLBACK itself throws, the original error propagates (not the rollback error).
   * SQLite lock errors (BUSY, BUSY_SNAPSHOT) are mapped to OhnoDatabaseLockedError.
   */
  private withTransaction<T>(fn: () => T): T {
    try {
      this.db.exec('BEGIN IMMEDIATE');
    } catch (e) {
      mapSqliteError(e);
    }

    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Swallow rollback errors so the original cause propagates.
      }
      // Map SQLite errors before propagating; non-SQLite errors pass through.
      mapSqliteError(e);
    }
  }

  /**
   * Open or create a database (async factory)
   */
  static async open(dbPath: string): Promise<TaskDatabase> {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(dbPath, { timeout: 5000 });

      // Set and verify journal mode. PRAGMA can silently fail (e.g., if the file
      // is in use by another process holding it in WAL); we assert the result.
      const journalRows = db.prepare('PRAGMA journal_mode = DELETE').all() as Array<{ journal_mode: string }>;
      const actualMode = journalRows[0]?.journal_mode;
      if (actualMode !== 'delete') {
        db.close();
        throw new Error(
          `Failed to set journal_mode = DELETE on ${dbPath}. ` +
          `SQLite returned mode '${actualMode}'. ` +
          `This usually means another process has the database open in a different journal mode. ` +
          `Close other ohno processes and retry.`
        );
      }

      db.exec('PRAGMA foreign_keys = ON');
      db.exec('PRAGMA synchronous = NORMAL');

      const checkRows = db.prepare('PRAGMA quick_check').all() as Array<{ quick_check: string }>;
      if (checkRows[0]?.quick_check !== 'ok') {
        db.close();
        throw new Error(
          `Database integrity check failed on ${dbPath}: ${checkRows[0]?.quick_check}. ` +
          `Run 'sqlite3 ${dbPath} ".recover"' to attempt recovery.`
        );
      }
    } catch (e) {
      // Close db if it was opened before the error occurred
      try { db?.close(); } catch { /* ignore close errors */ }
      // Remap SQLite-coded errors; let our own Error messages pass through unchanged.
      mapSqliteError(e);
    }

    const instance = new TaskDatabase(db, dbPath);
    instance.ensureTables();
    return instance;
  }

  /**
   * Ensure all required tables and columns exist
   */
  private ensureTables(): void {
    // Create hierarchy tables
    this.db.prepare(CREATE_PROJECTS_TABLE).run();
    this.db.prepare(CREATE_EPICS_TABLE).run();
    this.db.prepare(CREATE_STORIES_TABLE).run();

    // Create core tables
    this.db.prepare(CREATE_TASKS_TABLE).run();
    this.db.prepare(CREATE_TASK_ACTIVITY_TABLE).run();
    this.db.prepare(CREATE_TASK_FILES_TABLE).run();
    this.db.prepare(CREATE_TASK_DEPENDENCIES_TABLE).run();
    this.db.prepare(CREATE_TASK_FAILURES_TABLE).run();
    this.db.prepare(CREATE_TASK_HANDOFFS_TABLE).run();
    this.db.prepare(CREATE_WORK_QUEUE_TABLE).run();

    // Add extended columns if missing (backwards compatibility)
    for (const [colName, colType] of EXTENDED_TASK_COLUMNS) {
      try {
        this.db.prepare(`ALTER TABLE tasks ADD COLUMN ${colName} ${colType}`).run();
      } catch {
        // Column already exists
      }
    }

    // Create indexes
    for (const sql of CREATE_INDEXES) {
      this.db.prepare(sql).run();
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Reload the database from disk (useful for tests)
   * No-op: with node:sqlite, reads always see the latest committed state.
   * Kept for backwards compat with tests that called this with sql.js.
   * To be removed once cli.test.ts call sites are deleted.
   */
  async reload(): Promise<void> {
    // No-op: with node:sqlite, reads always see the latest committed state.
    // Kept for backwards compat with tests that called this with sql.js.
    // To be removed once cli.test.ts call sites are deleted.
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get aggregated project status
   */
  getProjectStatus(): ProjectStatus {
    const rows = this.db.prepare(GET_PROJECT_STATUS).all() as Array<Record<string, unknown>>;

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
    const { status, epic_id, priority, story_status, epic_status, limit = 50, fields = "minimal" } = opts;

    // Build SELECT clause based on fields parameter
    const fieldSet = FIELD_SETS[fields] || FIELD_SETS.minimal;
    const selectClause = fieldSet.join(", ");

    let sql = `SELECT ${selectClause} FROM tasks t
    LEFT JOIN stories s ON t.story_id = s.id
    LEFT JOIN epics e ON s.epic_id = e.id`;

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

    if (story_status) {
      conditions.push("s.status = ?");
      params.push(story_status);
    }

    if (epic_status) {
      conditions.push("e.status = ?");
      params.push(epic_status);
    }

    sql += ` WHERE ${conditions.join(" AND ")}`;
    sql += " ORDER BY CASE t.status WHEN 'in_progress' THEN 0 WHEN 'review' THEN 1 WHEN 'blocked' THEN 2 WHEN 'todo' THEN 3 WHEN 'done' THEN 4 ELSE 5 END, t.updated_at DESC, t.created_at DESC";
    sql += " LIMIT ?";
    params.push(limit);

    return this.db.prepare(sql).all(...(params as never[])) as unknown as Task[];
  }

  /**
   * Count tasks matching the given filters (ignores limit)
   */
  countTasks(opts: GetTasksOptions = {}): number {
    const { status, epic_id, priority, story_status, epic_status } = opts;

    let sql = `SELECT COUNT(*) as count FROM tasks t
    LEFT JOIN stories s ON t.story_id = s.id
    LEFT JOIN epics e ON s.epic_id = e.id`;

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
    if (story_status) {
      conditions.push("s.status = ?");
      params.push(story_status);
    }
    if (epic_status) {
      conditions.push("e.status = ?");
      params.push(epic_status);
    }

    sql += ` WHERE ${conditions.join(" AND ")}`;

    const row = this.db.prepare(sql).get(...(params as never[])) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  /**
   * Get a single task by ID
   */
  getTask(taskId: string, fields: FieldSet = "standard"): Task | null {
    // Build SELECT clause based on fields parameter
    const fieldSet = FIELD_SETS[fields] || FIELD_SETS.standard;
    const selectClause = fieldSet.join(", ");

    const sql = `
      SELECT ${selectClause}
      FROM tasks t
      LEFT JOIN stories s ON t.story_id = s.id
      LEFT JOIN epics e ON s.epic_id = e.id
      WHERE t.id = ?
    `;

    return (this.db.prepare(sql).get(taskId) as Task | undefined) ?? null;
  }

  /**
   * Get next recommended task
   * Logic: continue in_progress OR suggest highest priority todo without blocking deps
   */
  getNextTask(): Task | null {
    // First, check for in-progress tasks (use full fields to include WIP data)
    const inProgress = this.getTasks({ status: "in_progress", limit: 1, fields: "full" });
    if (inProgress.length > 0) {
      return inProgress[0];
    }

    // Get todo tasks and filter out those with blocking dependencies
    const todoTasks = this.getTasks({ status: "todo", limit: 20, fields: "standard" });
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
   * Get next batch of tasks ready for execution
   * Returns up to N tasks that are either todo or need rework, have no unmet dependencies,
   * ordered by epic priority then creation date
   *
   * @param size - Number of tasks to return (default 3, max 5)
   * @returns Array of BatchTask with failure_context attached for tasks needing rework
   */
  getNextBatch(size: number = 3): BatchTask[] {
    const maxSize = Math.min(size, 5);

    // Use pre-computed work queue for fast retrieval
    const sql = `
      SELECT t.*, e.priority as epic_priority, wq.priority_score
      FROM work_queue wq
      JOIN tasks t ON wq.task_id = t.id
      LEFT JOIN stories s ON t.story_id = s.id
      LEFT JOIN epics e ON s.epic_id = e.id
      WHERE wq.ready = 1
        AND (t.status = 'todo' OR t.needs_rework = 1)
        AND t.status != 'archived'
      ORDER BY wq.priority_score DESC
      LIMIT ?
    `;

    const batch: BatchTask[] = [];
    const rows = this.db.prepare(sql).all(maxSize) as unknown as Task[];
    for (const task of rows) {
      batch.push({
        ...task,
        failure_context: task.needs_rework ? this.getTaskFailures(task.id) : undefined,
      });
    }

    // Fallback: if queue is empty (first run or stale), rebuild and retry
    if (batch.length === 0) {
      this.rebuildWorkQueue();
      return this.getNextBatchFallback(maxSize);
    }

    return batch;
  }

  /**
   * Fallback batch retrieval without work queue (used during queue rebuild)
   */
  private getNextBatchFallback(maxSize: number): BatchTask[] {
    const sql = `
      SELECT t.*, e.priority as epic_priority
      FROM tasks t
      LEFT JOIN stories s ON t.story_id = s.id
      LEFT JOIN epics e ON s.epic_id = e.id
      WHERE (t.status = 'todo' OR t.needs_rework = 1)
        AND t.status != 'archived'
      ORDER BY
        CASE e.priority
          WHEN 'P0' THEN 0
          WHEN 'P1' THEN 1
          WHEN 'P2' THEN 2
          ELSE 3
        END,
        t.created_at ASC
    `;

    const candidates = this.db.prepare(sql).all() as unknown as Task[];
    const available = candidates.filter((task) => !this.isTaskBlockedByDependencies(task.id));
    const batch = available.slice(0, maxSize);

    return batch.map((task) => ({
      ...task,
      failure_context: task.needs_rework ? this.getTaskFailures(task.id) : undefined,
    }));
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
      in_progress_tasks: this.getTasks({ status: "in_progress", limit: 10, fields: "full" }),
      blocked_tasks: this.getTasks({ status: "blocked", limit: 10, fields: "minimal" }),
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
    return this.db.prepare(sql).all(taskId, limit) as unknown as TaskActivity[];
  }

  /**
   * Get recent activity across all tasks
   */
  getRecentActivity(limit = 10): TaskActivity[] {
    return this.db.prepare(GET_RECENT_ACTIVITY).all(limit) as unknown as TaskActivity[];
  }

  /**
   * Get dependencies for a task
   */
  getTaskDependencies(taskId: string): TaskDependency[] {
    return this.db.prepare(GET_TASK_DEPENDENCIES).all(taskId) as unknown as TaskDependency[];
  }

  /**
   * Get blocking (unfinished) dependencies for a task
   */
  getBlockingDependencies(taskId: string): string[] {
    const rows = this.db.prepare(GET_BLOCKING_DEPENDENCIES).all(taskId) as unknown as Array<{ depends_on_task_id: string }>;
    return rows.map((row) => row.depends_on_task_id);
  }

  /**
   * Check if task is blocked by unfinished dependencies
   */
  isTaskBlockedByDependencies(taskId: string): boolean {
    return this.getBlockingDependencies(taskId).length > 0;
  }

  /**
   * Check if all tasks in a story are completed (done or archived)
   */
  isStoryCompleted(storyId: string): boolean {
    const sql = `
      SELECT COUNT(*) as incomplete_count
      FROM tasks
      WHERE story_id = ?
        AND status NOT IN ('done', 'archived')
    `;
    const row = this.db.prepare(sql).get(storyId) as { incomplete_count: number } | undefined;
    return (row?.incomplete_count ?? 0) === 0;
  }

  /**
   * Check if all tasks in an epic are completed (all stories completed)
   */
  isEpicCompleted(epicId: string): boolean {
    const sql = `
      SELECT COUNT(*) as incomplete_count
      FROM tasks t
      JOIN stories s ON t.story_id = s.id
      WHERE s.epic_id = ?
        AND t.status NOT IN ('done', 'archived')
    `;
    const row = this.db.prepare(sql).get(epicId) as { incomplete_count: number } | undefined;
    return (row?.incomplete_count ?? 0) === 0;
  }

  /**
   * Get completion boundaries for a task
   * Returns information about whether completing this task completes its story/epic
   */
  getCompletionBoundaries(taskId: string): TaskCompletionBoundaries | null {
    const task = this.getTask(taskId);
    if (!task) {
      return null;
    }

    const storyId = task.story_id ?? null;
    const epicId = task.epic_id ?? null;

    return {
      story_completed: storyId ? this.isStoryCompleted(storyId) : false,
      epic_completed: epicId ? this.isEpicCompleted(epicId) : false,
      story_id: storyId,
      epic_id: epicId,
    };
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

    return this.withTransaction(() => {
      const sql = `
        INSERT INTO tasks (id, story_id, title, status, task_type, description, estimate_hours, created_at, updated_at, created_by, source)
        VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?)
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
        opts.actor ?? null,
        opts.source ?? "human",
      );

      // Log activity
      this.addTaskActivity(taskId, "created", `Task created: ${opts.title}`, opts.actor);

      // Add to work queue
      this.recomputeQueueEntry(taskId);

      return taskId;
    });
  }

  /**
   * Create a new story
   */
  createStory(opts: CreateStoryOptions): string {
    const timestamp = getTimestamp();
    let storyId = generateStoryId(opts.title, opts.epic_id ?? null, timestamp);

    // Handle collision by appending counter
    let counter = 0;
    while (this.getStory(storyId) !== null) {
      counter++;
      storyId = generateStoryId(opts.title, opts.epic_id ?? null, `${timestamp}-${counter}`);
    }

    const sql = `
      INSERT INTO stories (id, epic_id, title, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'todo', ?, ?)
    `;

    try {
      this.db.prepare(sql).run(
        storyId,
        opts.epic_id ?? null,
        opts.title,
        opts.description ?? null,
        timestamp,
        timestamp,
      );
    } catch (e) {
      if ((e as { code?: string })?.code === 'ERR_SQLITE_ERROR') {
        mapSqliteError(e);
      }
      throw e;
    }

    return storyId;
  }

  /**
   * Get a single story by ID
   */
  getStory(storyId: string): { id: string; epic_id?: string; title: string; description?: string; status?: string; created_at?: string; updated_at?: string } | null {
    const sql = "SELECT * FROM stories WHERE id = ?";
    return (this.db.prepare(sql).get(storyId) as { id: string; epic_id?: string; title: string; description?: string; status?: string; created_at?: string; updated_at?: string } | undefined) ?? null;
  }

  /**
   * Update story fields
   */
  updateStory(storyId: string, updates: UpdateStoryOptions): boolean {
    const story = this.getStory(storyId);
    if (!story) {
      return false;
    }

    const allowedFields = ["title", "description", "status", "epic_id"];
    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const field of allowedFields) {
      if (field in updates) {
        setClauses.push(`${field} = ?`);
        params.push(updates[field as keyof UpdateStoryOptions]);
      }
    }

    if (setClauses.length === 0) {
      return false;
    }

    setClauses.push("updated_at = ?");
    params.push(getTimestamp());
    params.push(storyId);

    const sql = `UPDATE stories SET ${setClauses.join(", ")} WHERE id = ?`;
    try {
      const result = this.db.prepare(sql).run(...(params as never[]));
      return Number(result.changes) > 0;
    } catch (e) {
      if ((e as { code?: string })?.code === 'ERR_SQLITE_ERROR') {
        mapSqliteError(e);
      }
      throw e;
    }
  }

  /**
   * Get stories with optional filtering
   */
  getStories(opts: GetStoriesOptions = {}): Story[] {
    const { epic_id, status, limit = 50, offset = 0 } = opts;

    let sql = "SELECT * FROM stories";
    const conditions: string[] = [];
    const params: unknown[] = [];

    // Handle epic_id filter (including null for orphan stories)
    if (epic_id !== undefined) {
      if (epic_id === null) {
        conditions.push("epic_id IS NULL");
      } else {
        conditions.push("epic_id = ?");
        params.push(epic_id);
      }
    }

    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    sql += " ORDER BY updated_at DESC, created_at DESC";
    sql += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    return this.db.prepare(sql).all(...(params as never[])) as unknown as Story[];
  }

  /**
   * Get a single epic by ID
   */
  getEpic(epicId: string): Epic | null {
    const sql = "SELECT * FROM epics WHERE id = ?";
    return (this.db.prepare(sql).get(epicId) as Epic | undefined) ?? null;
  }

  /**
   * Get epics with optional filtering
   */
  getEpics(opts: GetEpicsOptions = {}): Epic[] {
    const { status, priority, limit = 50 } = opts;

    let sql = "SELECT * FROM epics";
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }

    if (priority) {
      conditions.push("priority = ?");
      params.push(priority);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    sql += " ORDER BY updated_at DESC, created_at DESC";
    sql += " LIMIT ?";
    params.push(limit);

    return this.db.prepare(sql).all(...(params as never[])) as unknown as Epic[];
  }

  /**
   * Create a new epic
   */
  createEpic(opts: CreateEpicOptions): string {
    const timestamp = getTimestamp();
    let epicId = generateEpicId(opts.title, opts.project_id ?? null, timestamp);

    // Handle collision by appending counter
    let counter = 0;
    while (this.getEpic(epicId) !== null) {
      counter++;
      epicId = generateEpicId(opts.title, opts.project_id ?? null, `${timestamp}-${counter}`);
    }

    const sql = `
      INSERT INTO epics (id, project_id, title, description, priority, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'todo', ?, ?)
    `;

    try {
      this.db.prepare(sql).run(
        epicId,
        opts.project_id ?? null,
        opts.title,
        opts.description ?? null,
        opts.priority ?? "P2",
        timestamp,
        timestamp,
      );
    } catch (e) {
      if ((e as { code?: string })?.code === 'ERR_SQLITE_ERROR') {
        mapSqliteError(e);
      }
      throw e;
    }

    return epicId;
  }

  /**
   * Update epic fields
   */
  updateEpic(epicId: string, updates: Partial<Epic>): boolean {
    const epic = this.getEpic(epicId);
    if (!epic) {
      return false;
    }

    const allowedFields = ["title", "description", "priority", "status"];
    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const field of allowedFields) {
      if (field in updates && updates[field as keyof Epic] !== undefined) {
        setClauses.push(`${field} = ?`);
        params.push(updates[field as keyof Epic]);
      }
    }

    if (setClauses.length === 0) {
      return false;
    }

    setClauses.push("updated_at = ?");
    params.push(getTimestamp());
    params.push(epicId);

    const sql = `UPDATE epics SET ${setClauses.join(", ")} WHERE id = ?`;
    try {
      const result = this.db.prepare(sql).run(...(params as never[]));
      return Number(result.changes) > 0;
    } catch (e) {
      if ((e as { code?: string })?.code === 'ERR_SQLITE_ERROR') {
        mapSqliteError(e);
      }
      throw e;
    }
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

    return this.withTransaction(() => {
      const sql = `UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ?`;
      const result = this.db.prepare(sql).run(...(params as never[]));

      if (Number(result.changes) > 0) {
        this.addTaskActivity(taskId, "updated", "Task updated", actor);
      }

      return Number(result.changes) > 0;
    });
  }

  /**
   * Update task status
   * Returns UpdateStatusResult with boundary metadata when completing a task
   */
  updateTaskStatus(taskId: string, status: TaskStatus, notes?: string, actor?: string): UpdateStatusResult {
    const task = this.getTask(taskId);
    if (!task) {
      return { success: false };
    }

    const oldStatus = task.status;
    const timestamp = getTimestamp();

    return this.withTransaction(() => {
      // Clear needs_rework when completing or archiving task
      const clearNeedsRework = status === "done" || status === "archived";
      const sql = clearNeedsRework
        ? `
          UPDATE tasks
          SET status = ?, updated_at = ?, handoff_notes = COALESCE(?, handoff_notes), needs_rework = 0
          WHERE id = ?
        `
        : `
          UPDATE tasks
          SET status = ?, updated_at = ?, handoff_notes = COALESCE(?, handoff_notes)
          WHERE id = ?
        `;

      const result = this.db.prepare(sql).run(status, timestamp, notes ?? null, taskId);
      const changes = Number(result.changes);

      if (changes > 0) {
        this.addTaskActivity(
          taskId,
          "status_change",
          `Status changed from ${oldStatus} to ${status}`,
          actor,
          oldStatus,
          status
        );

        // Auto-summarize on completion (use unwrapped impl to avoid nested BEGIN IMMEDIATE)
        if (status === "done" || status === "archived") {
          this._summarizeTaskActivityImpl(taskId, false, 5);
        }

        // Update work queue: remove completed/in-progress tasks, recompute dependents
        this.recomputeQueueEntry(taskId);
        if (status === "done" || status === "archived") {
          this.recomputeQueueDependents(taskId);
        }

        // Return boundary metadata when marking as done or archived
        if (status === "done" || status === "archived") {
          const boundaries = this.getCompletionBoundaries(taskId);
          if (boundaries) {
            return { success: true, boundaries };
          }
        }
      }

      return { success: changes > 0 };
    });
  }

  /**
   * Set handoff notes for a task
   */
  setHandoffNotes(taskId: string, notes: string, actor?: string): boolean {
    return this.withTransaction(() => {
      const sql = `UPDATE tasks SET handoff_notes = ?, updated_at = ? WHERE id = ?`;
      const result = this.db.prepare(sql).run(notes, getTimestamp(), taskId);
      const changes = Number(result.changes);

      if (changes > 0) {
        this.addTaskActivity(taskId, "note", "Handoff notes updated", actor);
      }

      return changes > 0;
    });
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

    return this.withTransaction(() => {
      const sql = `UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ?`;
      const result = this.db.prepare(sql).run(...(params as never[]));
      const changes = Number(result.changes);

      if (changes > 0) {
        this.addTaskActivity(taskId, "progress", `Progress updated to ${percent}%`, actor);
      }

      return changes > 0;
    });
  }

  /**
   * Set a blocker on a task
   */
  setBlocker(taskId: string, reason: string, actor?: string): boolean {
    return this.withTransaction(() => {
      const sql = `
        UPDATE tasks
        SET status = 'blocked', blockers = ?, updated_at = ?
        WHERE id = ?
      `;

      const result = this.db.prepare(sql).run(reason, getTimestamp(), taskId);
      const changes = Number(result.changes);

      if (changes > 0) {
        this.addTaskActivity(taskId, "blocker_set", `Blocked: ${reason}`, actor);
      }

      return changes > 0;
    });
  }

  /**
   * Resolve a blocker
   */
  resolveBlocker(taskId: string, actor?: string): boolean {
    return this.withTransaction(() => {
      const sql = `
        UPDATE tasks
        SET status = 'in_progress', blockers = NULL, updated_at = ?
        WHERE id = ?
      `;

      const result = this.db.prepare(sql).run(getTimestamp(), taskId);
      const changes = Number(result.changes);

      if (changes > 0) {
        this.addTaskActivity(taskId, "blocker_resolved", "Blocker resolved", actor);
      }

      return changes > 0;
    });
  }

  /**
   * Set needs_rework flag on a task
   */
  setNeedsRework(taskId: string, value: boolean, actor?: string): boolean {
    const task = this.getTask(taskId);
    if (!task) {
      return false;
    }

    return this.withTransaction(() => {
      const sql = `
        UPDATE tasks
        SET needs_rework = ?, updated_at = ?
        WHERE id = ?
      `;

      const result = this.db.prepare(sql).run(value ? 1 : 0, getTimestamp(), taskId);
      const changes = Number(result.changes);

      if (changes > 0) {
        this.addTaskActivity(
          taskId,
          "updated",
          `Task ${value ? "marked as" : "cleared from"} needs rework`,
          actor
        );
        this.recomputeQueueEntry(taskId);
      }

      return changes > 0;
    });
  }

  /**
   * Update task work-in-progress metadata
   * Merges wipData into existing work_in_progress (shallow merge)
   */
  updateTaskWip(taskId: string, wipData: Record<string, unknown>, actor?: string): boolean {
    const task = this.getTask(taskId, "full");
    if (!task) {
      return false;
    }

    // Merge with existing WIP
    let existing: Record<string, unknown> = {};
    if (task.work_in_progress) {
      try {
        existing = JSON.parse(task.work_in_progress);
      } catch {
        // Invalid JSON, treat as empty object
        existing = {};
      }
    }
    const merged = { ...existing, ...wipData };

    return this.withTransaction(() => {
      const timestamp = getTimestamp();
      const sql = `UPDATE tasks SET work_in_progress = ?, wip_updated_at = ?, updated_at = ? WHERE id = ?`;
      const result = this.db.prepare(sql).run(JSON.stringify(merged), timestamp, timestamp, taskId);
      const changes = Number(result.changes);

      if (changes > 0) {
        this.addTaskActivity(taskId, "wip_update", "Work in progress updated", actor);
      }

      return changes > 0;
    });
  }

  /**
   * Archive a task
   */
  archiveTask(taskId: string, reason?: string, actor?: string): boolean {
    return this.withTransaction(() => {
      const sql = `
        UPDATE tasks
        SET status = 'archived', updated_at = ?
        WHERE id = ?
      `;

      const result = this.db.prepare(sql).run(getTimestamp(), taskId);
      const changes = Number(result.changes);

      if (changes > 0) {
        this.addTaskActivity(
          taskId,
          "status_change",
          `Task archived${reason ? `: ${reason}` : ""}`,
          actor
        );
        this.recomputeQueueEntry(taskId);
      }

      return changes > 0;
    });
  }

  /**
   * Reopen a task (move from done/review/archived back to todo)
   */
  reopenTask(taskId: string, notes?: string, actor?: string): boolean {
    // Guard: only reopen from done, review, or archived
    const task = this.getTask(taskId);
    if (!task) return false;

    const reopenableStatuses = ["done", "review", "archived"];
    if (!reopenableStatuses.includes(task.status)) {
      return false;
    }

    return this.withTransaction(() => {
      const sql = `
        UPDATE tasks
        SET status = 'todo', activity_summary = NULL, needs_rework = 0, updated_at = ?
        WHERE id = ?
      `;

      const result = this.db.prepare(sql).run(getTimestamp(), taskId);
      const changes = Number(result.changes);

      if (changes > 0) {
        this.addTaskActivity(
          taskId,
          "reopen",
          `Task reopened from ${task.status}${notes ? `: ${notes}` : ""}`,
          actor
        );
        this.recomputeQueueEntry(taskId);
        this.recomputeQueueDependents(taskId);
      }

      return changes > 0;
    });
  }

  /**
   * Internal unwrapped implementation for deleting a task.
   * Called by deleteTask (which wraps it) and by deleteEpic/deleteStory
   * (which wrap their own outer transaction and call this directly to avoid nesting).
   */
  private _deleteTaskImpl(taskId: string): boolean {
    // Delete related records first
    this.db.prepare("DELETE FROM task_activity WHERE task_id = ?").run(taskId);
    this.db.prepare("DELETE FROM task_files WHERE task_id = ?").run(taskId);
    this.db.prepare("DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_task_id = ?").run(taskId, taskId);
    this.db.prepare("DELETE FROM work_queue WHERE task_id = ?").run(taskId);

    const result = this.db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
    return Number(result.changes) > 0;
  }

  /**
   * Delete a task (hard delete)
   */
  deleteTask(taskId: string): boolean {
    return this.withTransaction(() => this._deleteTaskImpl(taskId));
  }

  private getTaskIdsByStory(storyId: string): string[] {
    const rows = this.db.prepare("SELECT id FROM tasks WHERE story_id = ?").all(storyId) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  private getStoriesByEpic(epicId: string): Array<{ id: string }> {
    return this.db.prepare("SELECT id FROM stories WHERE epic_id = ? ORDER BY updated_at DESC, created_at DESC").all(epicId) as Array<{ id: string }>;
  }

  /**
   * Delete an epic (hard delete)
   * Also deletes all stories and tasks associated with the epic
   */
  deleteEpic(epicId: string): boolean {
    const epic = this.getEpic(epicId);
    if (!epic) {
      return false;
    }

    return this.withTransaction(() => {
      const stories = this.getStoriesByEpic(epicId);

      // Delete all tasks in each story
      for (const story of stories) {
        for (const taskId of this.getTaskIdsByStory(story.id)) {
          // Use unwrapped impl to avoid nested BEGIN IMMEDIATE
          this._deleteTaskImpl(taskId);
        }
      }

      // Delete all stories in this epic
      for (const story of stories) {
        this.db.prepare("DELETE FROM stories WHERE id = ?").run(story.id);
      }

      // Delete the epic
      const result = this.db.prepare("DELETE FROM epics WHERE id = ?").run(epicId);

      return Number(result.changes) > 0;
    });
  }

  /**
   * Delete a story (hard delete)
   * Also deletes all tasks associated with the story
   */
  deleteStory(storyId: string): boolean {
    const story = this.getStory(storyId);
    if (!story) {
      return false;
    }

    return this.withTransaction(() => {
      // Delete all tasks in this story
      for (const taskId of this.getTaskIdsByStory(storyId)) {
        // Use unwrapped impl to avoid nested BEGIN IMMEDIATE
        this._deleteTaskImpl(taskId);
      }

      // Delete the story
      const result = this.db.prepare("DELETE FROM stories WHERE id = ?").run(storyId);

      return Number(result.changes) > 0;
    });
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

    return this.withTransaction(() => {
      const sql = `
        INSERT INTO task_dependencies (id, task_id, depends_on_task_id, dependency_type, created_at)
        VALUES (?, ?, ?, ?, ?)
      `;

      this.db.prepare(sql).run(depId, taskId, dependsOnTaskId, dependencyType, getTimestamp());

      // Recompute both tasks in work queue
      this.recomputeQueueEntry(taskId);
      this.recomputeQueueEntry(dependsOnTaskId);

      return depId;
    });
  }

  /**
   * Remove a dependency
   */
  removeDependency(taskId: string, dependsOnTaskId: string): boolean {
    return this.withTransaction(() => {
      const result = this.db.prepare(
        "DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?"
      ).run(taskId, dependsOnTaskId);

      const changes = Number(result.changes);

      if (changes > 0) {
        // Recompute both tasks in work queue
        this.recomputeQueueEntry(taskId);
        this.recomputeQueueEntry(dependsOnTaskId);
      }

      return changes > 0;
    });
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

    try {
      const result = this.db.prepare(sql).run(
        actId,
        taskId,
        activityType,
        description,
        oldValue ?? null,
        newValue ?? null,
        actor ?? null,
        timestamp,
      );

      return Number(result.changes) > 0;
    } catch (e) {
      mapSqliteError(e);
    }
  }

  /**
   * Summarize task activity into a compressed text.
   * When deleteRaw=true, this performs 2 writes (summary update + raw delete);
   * the public method wraps in a transaction. Internal callers that already
   * hold a transaction (e.g., updateTaskStatus) call _summarizeTaskActivityImpl
   * directly to avoid nested BEGIN IMMEDIATE.
   */
  summarizeTaskActivity(taskId: string, deleteRaw = false, minEntries = 5): string | null {
    return this.withTransaction(() =>
      this._summarizeTaskActivityImpl(taskId, deleteRaw, minEntries)
    );
  }

  private _summarizeTaskActivityImpl(taskId: string, deleteRaw: boolean, minEntries: number): string | null {
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
      ).run(...([taskId, ...keepIds] as never[]));
    }

    return summary;
  }

  // ==========================================================================
  // Failure Methods
  // ==========================================================================

  /**
   * Add a task failure record
   */
  addTaskFailure(
    taskId: string,
    failureType: FailureType,
    failureReason: string,
    attempt?: number
  ): string {
    const timestamp = getTimestamp();
    const failureId = generateFailureId(taskId, failureType, timestamp);

    const sql = `
      INSERT INTO task_failures (id, task_id, failure_type, failure_reason, attempt, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    try {
      this.db.prepare(sql).run(
        failureId,
        taskId,
        failureType,
        failureReason,
        attempt ?? null,
        timestamp,
      );
    } catch (e) {
      mapSqliteError(e);
    }

    return failureId;
  }

  /**
   * Get failure records for a task
   */
  getTaskFailures(taskId: string): TaskFailure[] {
    const sql = `
      SELECT * FROM task_failures
      WHERE task_id = ?
      ORDER BY created_at DESC
    `;
    return this.db.prepare(sql).all(taskId) as unknown as TaskFailure[];
  }

  // ==========================================================================
  // Task Handoff Methods
  // ==========================================================================

  /**
   * Set task handoff data (upsert)
   * Stores handoff information from subagent execution
   */
  setTaskHandoff(
    taskId: string,
    status: string,
    summary: string,
    filesChanged?: string[],
    fullDetails?: string
  ): boolean {
    const timestamp = getTimestamp();
    const sql = `
      INSERT OR REPLACE INTO task_handoffs (task_id, status, summary, files_changed, full_details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    try {
      const result = this.db.prepare(sql).run(
        taskId,
        status,
        summary,
        filesChanged ? JSON.stringify(filesChanged) : null,
        fullDetails ?? null,
        timestamp,
      );
      return Number(result.changes) > 0;
    } catch (e) {
      mapSqliteError(e);
    }
  }

  /**
   * Get task handoff data
   * Returns summary by default; includes full_details only when includeDetails=true
   */
  getTaskHandoff(taskId: string, includeDetails: boolean = false): TaskHandoff | null {
    const sql = includeDetails
      ? `SELECT * FROM task_handoffs WHERE task_id = ?`
      : `SELECT task_id, status, summary, files_changed, created_at, compacted_at FROM task_handoffs WHERE task_id = ?`;
    const row = this.db.prepare(sql).get(taskId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      task_id: row.task_id as string,
      status: row.status as HandoffStatus,
      summary: row.summary as string,
      files_changed: row.files_changed ? JSON.parse(row.files_changed as string) : undefined,
      full_details: includeDetails ? (row.full_details !== null ? row.full_details as string : null) : undefined,
      created_at: row.created_at as string ?? undefined,
      compacted_at: row.compacted_at !== null ? row.compacted_at as string : null,
    };
  }

  // ==========================================================================
  // Memory Decay Methods
  // ==========================================================================

  /**
   * Compact handoffs for a completed story.
   * Removes full_details but keeps summary.
   * Skips blocked/failed tasks (preserve for debugging).
   */
  compactStoryHandoffs(storyId: string): number {
    // Get all tasks in the story and their handoffs before the transaction
    const sql = `SELECT id, status FROM tasks WHERE story_id = ?`;
    const taskRows = this.db.prepare(sql).all(storyId) as Array<{ id: string; status: string }>;

    // Filter eligible tasks outside the transaction (reads)
    const eligible = taskRows.filter((task) => {
      if (task.status === "blocked") return false;
      const handoff = this.getTaskHandoff(task.id, true);
      if (!handoff) return false;
      if (handoff.status === "FAIL" || handoff.status === "BLOCKED") return false;
      if (handoff.full_details === null || handoff.full_details === undefined) return false;
      return true;
    });

    if (eligible.length === 0) return 0;

    return this.withTransaction(() => {
      let compacted = 0;
      const timestamp = getTimestamp();

      for (const task of eligible) {
        // Compact: null out full_details, set compacted_at
        const result = this.db.prepare(
          `UPDATE task_handoffs SET full_details = NULL, compacted_at = ? WHERE task_id = ?`
        ).run(timestamp, task.id);
        if (Number(result.changes) > 0) {
          compacted++;
        }
      }

      return compacted;
    });
  }

  /**
   * Delete handoffs for a completed epic.
   * Removes handoff records entirely.
   * Skips blocked/failed tasks (preserve for debugging).
   */
  deleteEpicHandoffs(epicId: string): number {
    // Get all stories in the epic
    const storySql = `SELECT id FROM stories WHERE epic_id = ?`;
    const storyRows = this.db.prepare(storySql).all(epicId) as Array<{ id: string }>;

    // Collect eligible task IDs outside the transaction (reads)
    const eligibleTaskIds: string[] = [];
    for (const story of storyRows) {
      const taskSql = `SELECT id, status FROM tasks WHERE story_id = ?`;
      const taskRows = this.db.prepare(taskSql).all(story.id) as Array<{ id: string; status: string }>;

      for (const task of taskRows) {
        if (task.status === "blocked") continue;
        const handoff = this.getTaskHandoff(task.id, false);
        if (!handoff) continue;
        if (handoff.status === "FAIL" || handoff.status === "BLOCKED") continue;
        eligibleTaskIds.push(task.id);
      }
    }

    if (eligibleTaskIds.length === 0) return 0;

    return this.withTransaction(() => {
      let deleted = 0;

      for (const taskId of eligibleTaskIds) {
        // Delete handoff
        const result = this.db.prepare(`DELETE FROM task_handoffs WHERE task_id = ?`).run(taskId);
        if (Number(result.changes) > 0) {
          deleted++;
        }
      }

      return deleted;
    });
  }

  // ==========================================================================
  // Work Queue Methods
  // ==========================================================================

  /**
   * Compute priority score for a task.
   * Higher score = higher priority.
   *
   * Factors:
   * - Epic priority: P0=1000, P1=750, P2=500, P3=250
   * - Age bonus: up to 100 points based on task age
   * - Blocks bonus: +50 per task this one blocks (unblocking others is valuable)
   */
  computePriorityScore(taskId: string): number {
    const task = this.getTask(taskId);
    if (!task) return 0;

    // Epic priority base score
    const priorityMap: Record<string, number> = { P0: 1000, P1: 750, P2: 500, P3: 250 };
    const epicPriority = task.epic_priority ?? "P2";
    let score = priorityMap[epicPriority] ?? 500;

    // Age bonus: older tasks get slight priority boost (up to 100 points over 30 days)
    if (task.created_at) {
      const ageMs = Date.now() - new Date(task.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      score += Math.min(ageDays * (100 / 30), 100);
    }

    // Blocks bonus: tasks that unblock others get priority
    const blocksSql = `
      SELECT COUNT(*) as count FROM task_dependencies
      WHERE depends_on_task_id = ?
    `;
    const row = this.db.prepare(blocksSql).get(taskId) as { count: number } | undefined;
    score += (row?.count ?? 0) * 50;

    return Math.round(score * 100) / 100;
  }

  /**
   * Recompute a single task's work queue entry.
   * Removes the entry if the task is no longer eligible (done, archived, in_progress).
   */
  recomputeQueueEntry(taskId: string): void {
    const task = this.getTask(taskId);
    if (!task) {
      this.db.prepare("DELETE FROM work_queue WHERE task_id = ?").run(taskId);
      return;
    }

    // Only queue tasks that are todo or needs_rework
    const eligible = (task.status === "todo" || (task.needs_rework && task.status !== "archived"));
    if (!eligible) {
      this.db.prepare("DELETE FROM work_queue WHERE task_id = ?").run(taskId);
      return;
    }

    const score = this.computePriorityScore(taskId);
    const blockers = this.getBlockingDependencies(taskId);
    const ready = blockers.length === 0 ? 1 : 0;
    const blockedBy = blockers.length > 0 ? JSON.stringify(blockers) : null;
    const timestamp = getTimestamp();

    // Batch group based on epic priority tier
    const priorityMap: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const batchGroup = priorityMap[task.epic_priority ?? "P2"] ?? 2;

    this.db.prepare(
      `INSERT OR REPLACE INTO work_queue (task_id, priority_score, batch_group, blocked_by, ready, computed_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(taskId, score, batchGroup, blockedBy, ready, timestamp);
  }

  /**
   * Recompute queue entries for all tasks that depend on a given task.
   * Called when a task completes or its status changes, to update readiness of dependents.
   */
  recomputeQueueDependents(taskId: string): void {
    const sql = `
      SELECT task_id FROM task_dependencies
      WHERE depends_on_task_id = ?
    `;
    const rows = this.db.prepare(sql).all(taskId) as Array<{ task_id: string }>;
    const dependentIds = rows.map((row) => row.task_id);

    for (const depId of dependentIds) {
      this.recomputeQueueEntry(depId);
    }
  }

  /**
   * Full rebuild of the work queue from scratch.
   * Called on first use or when queue is detected as stale.
   */
  rebuildWorkQueue(): void {
    // Get all eligible tasks before the transaction
    const sql = `
      SELECT t.id
      FROM tasks t
      WHERE (t.status = 'todo' OR t.needs_rework = 1)
        AND t.status != 'archived'
    `;
    const tasks = this.db.prepare(sql).all() as Array<{ id: string }>;

    this.withTransaction(() => {
      // Clear existing queue
      this.db.prepare("DELETE FROM work_queue").run();

      for (const task of tasks) {
        this.recomputeQueueEntry(task.id);
      }
    });
  }
}
