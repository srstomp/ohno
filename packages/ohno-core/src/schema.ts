/**
 * SQL schema definitions for ohno
 */

/**
 * SQL to create the projects table
 */
export const CREATE_PROJECTS_TABLE = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`;

/**
 * SQL to create the epics table
 */
export const CREATE_EPICS_TABLE = `
CREATE TABLE IF NOT EXISTS epics (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'P2',
  status TEXT DEFAULT 'todo',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`;

/**
 * SQL to create the stories table
 */
export const CREATE_STORIES_TABLE = `
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  epic_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`;

/**
 * SQL to create the tasks table with all columns
 */
export const CREATE_TASKS_TABLE = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  story_id TEXT,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'todo',
  task_type TEXT,
  estimate_hours REAL,
  description TEXT,
  context_summary TEXT,
  working_files TEXT,
  blockers TEXT,
  handoff_notes TEXT,
  progress_percent INTEGER DEFAULT 0,
  actual_hours REAL,
  created_at TEXT,
  updated_at TEXT,
  created_by TEXT,
  activity_summary TEXT
)`;

/**
 * Extended columns to add if missing (for backwards compatibility)
 */
export const EXTENDED_TASK_COLUMNS: [string, string][] = [
  ["description", "TEXT"],
  ["context_summary", "TEXT"],
  ["working_files", "TEXT"],
  ["blockers", "TEXT"],
  ["handoff_notes", "TEXT"],
  ["progress_percent", "INTEGER DEFAULT 0"],
  ["actual_hours", "REAL"],
  ["created_at", "TEXT"],
  ["updated_at", "TEXT"],
  ["created_by", "TEXT"],
  ["activity_summary", "TEXT"],
];

/**
 * SQL to create the task_activity table
 */
export const CREATE_TASK_ACTIVITY_TABLE = `
CREATE TABLE IF NOT EXISTS task_activity (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  activity_type TEXT,
  description TEXT,
  old_value TEXT,
  new_value TEXT,
  actor TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`;

/**
 * SQL to create the task_files table
 */
export const CREATE_TASK_FILES_TABLE = `
CREATE TABLE IF NOT EXISTS task_files (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`;

/**
 * SQL to create the task_dependencies table
 */
export const CREATE_TASK_DEPENDENCIES_TABLE = `
CREATE TABLE IF NOT EXISTS task_dependencies (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  dependency_type TEXT DEFAULT 'blocks',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`;

/**
 * Indexes for performance
 */
export const CREATE_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_task_activity_task_id ON task_activity(task_id)",
  "CREATE INDEX IF NOT EXISTS idx_task_deps_task_id ON task_dependencies(task_id)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_story_id ON tasks(story_id)",
];

/**
 * Query to get tasks with joined epic/story info
 */
export const GET_TASKS_WITH_JOINS = `
SELECT
  t.*,
  s.title as story_title,
  e.id as epic_id,
  e.title as epic_title,
  e.priority as epic_priority
FROM tasks t
LEFT JOIN stories s ON t.story_id = s.id
LEFT JOIN epics e ON s.epic_id = e.id
`;

/**
 * Query to get a single task with joins
 */
export const GET_TASK_BY_ID = `
SELECT
  t.*,
  s.title as story_title,
  e.id as epic_id,
  e.title as epic_title,
  e.priority as epic_priority
FROM tasks t
LEFT JOIN stories s ON t.story_id = s.id
LEFT JOIN epics e ON s.epic_id = e.id
WHERE t.id = ?
`;

/**
 * Query to get project status
 */
export const GET_PROJECT_STATUS = `
SELECT
  (SELECT name FROM projects LIMIT 1) as project_name,
  COUNT(*) as total_tasks,
  SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_tasks,
  SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tasks,
  SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) as review_tasks,
  SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked_tasks,
  SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo_tasks,
  (SELECT COUNT(*) FROM epics) as total_epics,
  (SELECT COUNT(*) FROM stories) as total_stories,
  COALESCE(SUM(estimate_hours), 0) as total_estimate_hours,
  COALESCE(SUM(actual_hours), 0) as total_actual_hours
FROM tasks
WHERE status != 'archived'
`;

/**
 * Query to get recent activity with task title
 */
export const GET_RECENT_ACTIVITY = `
SELECT
  a.*,
  t.title as task_title
FROM task_activity a
JOIN tasks t ON a.task_id = t.id
ORDER BY a.created_at DESC
LIMIT ?
`;

/**
 * Query to get task dependencies with joined info
 */
export const GET_TASK_DEPENDENCIES = `
SELECT
  d.*,
  t.title as depends_on_title,
  t.status as depends_on_status
FROM task_dependencies d
JOIN tasks t ON d.depends_on_task_id = t.id
WHERE d.task_id = ?
`;

/**
 * Query to get blocking (unfinished) dependencies
 */
export const GET_BLOCKING_DEPENDENCIES = `
SELECT d.depends_on_task_id
FROM task_dependencies d
JOIN tasks t ON d.depends_on_task_id = t.id
WHERE d.task_id = ?
  AND t.status NOT IN ('done', 'archived')
`;
