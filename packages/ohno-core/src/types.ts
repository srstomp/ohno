/**
 * Core type definitions for ohno task management
 */

// Task status enum
export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "blocked" | "archived";

// Task type enum
export type TaskType = "feature" | "bug" | "chore" | "spike" | "test";

// Priority enum
export type Priority = "P0" | "P1" | "P2" | "P3";

// Activity type enum
export type ActivityType = "status_change" | "note" | "file_change" | "decision" | "progress" | "created" | "updated" | "blocker_set" | "blocker_resolved";

// Dependency type enum
export type DependencyType = "blocks" | "requires" | "relates_to";

/**
 * Core task record
 */
export interface Task {
  id: string;
  story_id?: string;
  title: string;
  status: TaskStatus;
  task_type?: TaskType;
  estimate_hours?: number;
  description?: string;
  context_summary?: string;
  working_files?: string;
  blockers?: string;
  handoff_notes?: string;
  progress_percent?: number;
  actual_hours?: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  activity_summary?: string;
  // Joined fields from relationships
  story_title?: string;
  epic_id?: string;
  epic_title?: string;
  epic_priority?: Priority;
}

/**
 * Activity log entry for audit trail
 */
export interface TaskActivity {
  id: string;
  task_id: string;
  activity_type: ActivityType;
  description?: string;
  old_value?: string;
  new_value?: string;
  actor?: string;
  created_at?: string;
  // Joined field
  task_title?: string;
}

/**
 * Task dependency record
 */
export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type?: DependencyType;
  created_at?: string;
  // Joined fields
  depends_on_title?: string;
  depends_on_status?: TaskStatus;
}

/**
 * Aggregated project statistics
 */
export interface ProjectStatus {
  project_name?: string;
  total_tasks: number;
  done_tasks: number;
  in_progress_tasks: number;
  review_tasks: number;
  blocked_tasks: number;
  todo_tasks: number;
  completion_percent: number;
  total_epics: number;
  total_stories: number;
  total_estimate_hours: number;
  total_actual_hours: number;
}

/**
 * Session context for AI agent continuity
 */
export interface SessionContext {
  in_progress_tasks: Task[];
  blocked_tasks: Task[];
  recent_activity: TaskActivity[];
  suggested_next_task?: Task;
}

/**
 * Options for creating a new task
 */
export interface CreateTaskOptions {
  title: string;
  story_id?: string;
  task_type?: TaskType;
  description?: string;
  estimate_hours?: number;
  actor?: string;
}

/**
 * Options for querying tasks
 */
export interface GetTasksOptions {
  status?: TaskStatus;
  epic_id?: string;
  priority?: Priority;
  limit?: number;
}

/**
 * Convert an object to a dict, excluding undefined/null values
 */
export function toDict<T extends object>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)
  );
}
