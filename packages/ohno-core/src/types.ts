/**
 * Core type definitions for ohno task management
 */

// Task status enum
export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "blocked" | "archived";

// Task type enum
export type TaskType = "feature" | "bug" | "chore" | "spike" | "test";

// Priority enum
export type Priority = "P0" | "P1" | "P2" | "P3";

// Task source enum
export type TaskSource = "human" | "pokayokay-plan" | "kaizen-fix" | "kaizen-suggest";

// Activity type enum
export type ActivityType = "status_change" | "note" | "file_change" | "decision" | "progress" | "created" | "updated" | "blocker_set" | "blocker_resolved";

// Dependency type enum
export type DependencyType = "blocks" | "requires" | "relates_to";

// Field set for get_tasks response size control
export type FieldSet = "minimal" | "standard" | "full";

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
  source?: TaskSource;
  // Joined fields from relationships
  story_title?: string;
  story_status?: TaskStatus;
  epic_id?: string;
  epic_title?: string;
  epic_priority?: Priority;
  epic_status?: TaskStatus;
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
  source?: TaskSource;
}

/**
 * Options for creating a new story
 */
export interface CreateStoryOptions {
  title: string;
  epic_id?: string;
  description?: string;
  actor?: string;
}

/**
 * Options for updating an existing story
 */
export interface UpdateStoryOptions {
  title?: string;
  description?: string | null;
  status?: StoryStatus;
  epic_id?: string | null;
}

/**
 * Story status enum
 */
export type StoryStatus = "todo" | "in_progress" | "done";

/**
 * Story record - groups related tasks under an epic
 */
export interface Story {
  id: string;
  epic_id: string | null;
  title: string;
  description: string | null;
  status: StoryStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Epic record - high-level grouping of stories
 */
export interface Epic {
  id: string;
  project_id?: string;
  title: string;
  description?: string;
  priority?: Priority;
  status?: TaskStatus;
  created_at?: string;
  updated_at?: string;
}

/**
 * Options for creating a new epic
 */
export interface CreateEpicOptions {
  title: string;
  project_id?: string;
  description?: string;
  priority?: Priority;
  actor?: string;
}

/**
 * Options for querying epics
 */
export interface GetEpicsOptions {
  status?: TaskStatus;
  priority?: Priority;
  limit?: number;
}

/**
 * Options for querying stories
 */
export interface GetStoriesOptions {
  epic_id?: string | null;
  status?: StoryStatus;
  limit?: number;
  offset?: number;
}

/**
 * Options for querying tasks
 */
export interface GetTasksOptions {
  status?: TaskStatus;
  epic_id?: string;
  priority?: Priority;
  story_status?: TaskStatus;
  epic_status?: TaskStatus;
  limit?: number;
  fields?: FieldSet;
}

/**
 * Boundary metadata for task completion
 * Indicates whether completing a task also completed its story or epic
 */
export interface TaskCompletionBoundaries {
  story_completed: boolean;
  epic_completed: boolean;
  story_id: string | null;
  epic_id: string | null;
}

/**
 * Result of updating a task's status
 */
export interface UpdateStatusResult {
  success: boolean;
  boundaries?: TaskCompletionBoundaries;
}

/**
 * Convert an object to a dict, excluding undefined/null values
 */
export function toDict<T extends object>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)
  );
}
