/**
 * ohno-core - Core database layer for ohno task management
 */

export { TaskDatabase } from "./db.js";

export type {
  Task,
  TaskActivity,
  TaskDependency,
  TaskFailure,
  TaskHandoff,
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
  FailureType,
  HandoffStatus,
  TaskCompletionBoundaries,
  UpdateStatusResult,
  Epic,
  Story,
  StoryStatus,
  UpdateStoryOptions,
  FieldSet,
  WorkQueueEntry,
} from "./types.js";

export { toDict } from "./types.js";

export {
  generateTaskId,
  generateActivityId,
  generateDependencyId,
  generateStoryId,
  generateEpicId,
  generateFailureId,
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
  CREATE_TASK_FAILURES_TABLE,
  CREATE_TASK_HANDOFFS_TABLE,
  CREATE_WORK_QUEUE_TABLE,
  CREATE_INDEXES,
  EXTENDED_TASK_COLUMNS,
  FIELD_SETS,
} from "./schema.js";
