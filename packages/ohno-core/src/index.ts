/**
 * ohno-core - Core database layer for ohno task management
 */

export { TaskDatabase } from "./db.js";

export type {
  Task,
  TaskActivity,
  TaskDependency,
  ProjectStatus,
  SessionContext,
  CreateTaskOptions,
  CreateStoryOptions,
  CreateEpicOptions,
  GetTasksOptions,
  GetEpicsOptions,
  GetStoriesOptions,
  TaskStatus,
  TaskType,
  TaskSource,
  Priority,
  ActivityType,
  DependencyType,
  TaskCompletionBoundaries,
  UpdateStatusResult,
  Epic,
  Story,
  StoryStatus,
  UpdateStoryOptions,
  FieldSet,
} from "./types.js";

export { toDict } from "./types.js";

export {
  generateTaskId,
  generateActivityId,
  generateDependencyId,
  generateStoryId,
  generateEpicId,
  getTimestamp,
  findOhnoDir,
  findDbPath,
  ensureOhnoDir,
  sortByPriority,
  PRIORITY_ORDER,
} from "./utils.js";

export {
  CREATE_TASKS_TABLE,
  CREATE_TASK_ACTIVITY_TABLE,
  CREATE_TASK_FILES_TABLE,
  CREATE_TASK_DEPENDENCIES_TABLE,
  CREATE_INDEXES,
  EXTENDED_TASK_COLUMNS,
  FIELD_SETS,
} from "./schema.js";
