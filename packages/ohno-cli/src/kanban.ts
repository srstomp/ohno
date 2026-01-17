/**
 * Kanban board generation
 */

import initSqlJs from "sql.js";
import * as fs from "fs";
import { createRequire } from "module";
import { KANBAN_TEMPLATE } from "./template.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

// Cache sql.js initialization
let sqlJsPromise: Promise<initSqlJs.SqlJsStatic> | null = null;

async function getSqlJs(): Promise<initSqlJs.SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs();
  }
  return sqlJsPromise;
}

export interface KanbanData {
  synced_at: string;
  version: string;
  projects: unknown[];
  epics: unknown[];
  stories: unknown[];
  tasks: unknown[];
  dependencies: unknown[];
  task_activity: unknown[];
  task_files: unknown[];
  task_dependencies: unknown[];
  stats: {
    total_tasks: number;
    done_tasks: number;
    blocked_tasks: number;
    in_progress_tasks: number;
    review_tasks: number;
    todo_tasks: number;
    completion_percent: number;
    total_stories: number;
    done_stories: number;
    total_epics: number;
    done_epics: number;
    p0_tasks: number;
    p1_tasks: number;
    total_estimate_hours: number;
    total_actual_hours: number;
    tasks_with_details: number;
    tasks_with_activity: number;
    tasks_with_files: number;
    tasks_with_dependencies: number;
  };
}

/**
 * Convert sql.js query result to array of objects
 */
function queryToObjects<T>(db: initSqlJs.Database, sql: string): T[] {
  try {
    const result = db.exec(sql);
    if (result.length === 0) return [];
    const { columns, values } = result[0];
    return values.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj as T;
    });
  } catch {
    return [];
  }
}

/**
 * Export database to JSON structure for kanban
 */
export async function exportDatabase(dbPath: string): Promise<KanbanData> {
  const SQL = await getSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  const data: KanbanData = {
    synced_at: new Date().toISOString(),
    version: pkg.version,
    projects: [],
    epics: [],
    stories: [],
    tasks: [],
    dependencies: [],
    task_activity: [],
    task_files: [],
    task_dependencies: [],
    stats: {
      total_tasks: 0,
      done_tasks: 0,
      blocked_tasks: 0,
      in_progress_tasks: 0,
      review_tasks: 0,
      todo_tasks: 0,
      completion_percent: 0,
      total_stories: 0,
      done_stories: 0,
      total_epics: 0,
      done_epics: 0,
      p0_tasks: 0,
      p1_tasks: 0,
      total_estimate_hours: 0,
      total_actual_hours: 0,
      tasks_with_details: 0,
      tasks_with_activity: 0,
      tasks_with_files: 0,
      tasks_with_dependencies: 0,
    },
  };

  // Export tables
  data.projects = queryToObjects(db, "SELECT * FROM projects");
  data.epics = queryToObjects(db, "SELECT * FROM epics");
  data.stories = queryToObjects(db, "SELECT * FROM stories");

  // Get tasks with joined info
  data.tasks = queryToObjects(db, `
    SELECT
      t.*,
      s.title as story_title,
      e.id as epic_id,
      e.title as epic_title,
      e.priority as epic_priority
    FROM tasks t
    LEFT JOIN stories s ON t.story_id = s.id
    LEFT JOIN epics e ON s.epic_id = e.id
    WHERE t.status != 'archived'
    ORDER BY t.updated_at DESC
  `);

  data.task_activity = queryToObjects(db, `
    SELECT a.*, t.title as task_title
    FROM task_activity a
    JOIN tasks t ON a.task_id = t.id
    ORDER BY a.created_at DESC
    LIMIT 100
  `);

  data.task_files = queryToObjects(db, "SELECT * FROM task_files");
  data.task_dependencies = queryToObjects(db, `
    SELECT d.*, t.title as depends_on_title, t.status as depends_on_status
    FROM task_dependencies d
    JOIN tasks t ON d.depends_on_task_id = t.id
  `);

  // Compute stats
  const tasks = data.tasks as { status: string; epic_priority?: string; estimate_hours?: number; actual_hours?: number; description?: string }[];

  data.stats.total_tasks = tasks.length;
  data.stats.done_tasks = tasks.filter((t) => t.status === "done").length;
  data.stats.blocked_tasks = tasks.filter((t) => t.status === "blocked").length;
  data.stats.in_progress_tasks = tasks.filter((t) => t.status === "in_progress").length;
  data.stats.review_tasks = tasks.filter((t) => t.status === "review").length;
  data.stats.todo_tasks = tasks.filter((t) => t.status === "todo").length;

  if (data.stats.total_tasks > 0) {
    data.stats.completion_percent = Math.round(
      (data.stats.done_tasks / data.stats.total_tasks) * 100
    );
  }

  data.stats.total_stories = (data.stories as unknown[]).length;
  data.stats.total_epics = (data.epics as unknown[]).length;
  data.stats.p0_tasks = tasks.filter((t) => t.epic_priority === "P0").length;
  data.stats.p1_tasks = tasks.filter((t) => t.epic_priority === "P1").length;

  data.stats.total_estimate_hours = tasks.reduce((sum, t) => sum + (t.estimate_hours ?? 0), 0);
  data.stats.total_actual_hours = tasks.reduce((sum, t) => sum + (t.actual_hours ?? 0), 0);

  data.stats.tasks_with_details = tasks.filter((t) => t.description).length;
  data.stats.tasks_with_activity = new Set((data.task_activity as { task_id: string }[]).map((a) => a.task_id)).size;
  data.stats.tasks_with_files = new Set((data.task_files as { task_id: string }[]).map((f) => f.task_id)).size;
  data.stats.tasks_with_dependencies = new Set((data.task_dependencies as { task_id: string }[]).map((d) => d.task_id)).size;

  db.close();
  return data;
}

/**
 * Generate kanban HTML from data
 */
export function generateKanbanHtml(data: KanbanData): string {
  const jsonData = JSON.stringify(data);
  return KANBAN_TEMPLATE.replace("{{KANBAN_DATA}}", jsonData);
}
