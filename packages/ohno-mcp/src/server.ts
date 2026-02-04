/**
 * MCP Server for ohno task management
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { TaskDatabase, findDbPath, type TaskStatus, type DependencyType } from "@stevestomp/ohno-core";

// Zod schemas for tool parameters
const GetTasksSchema = z.object({
  status: z.enum(["todo", "in_progress", "review", "done", "blocked"]).optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  story_status: z.enum(["todo", "in_progress", "review", "done", "blocked"]).optional(),
  epic_status: z.enum(["todo", "in_progress", "review", "done", "blocked"]).optional(),
  limit: z.number().min(1).max(100).default(50),
  fields: z.enum(["minimal", "standard", "full"]).default("minimal"),
});

const TaskIdSchema = z.object({
  task_id: z.string().min(1),
});

const UpdateStatusSchema = z.object({
  task_id: z.string().min(1),
  status: z.enum(["todo", "in_progress", "review", "done", "blocked"]),
  notes: z.string().optional(),
});

const CreateTaskSchema = z.object({
  title: z.string().min(1),
  story_id: z.string().optional(),
  task_type: z.enum(["feature", "bug", "chore", "spike", "test"]).default("feature"),
  description: z.string().optional(),
  estimate_hours: z.number().optional(),
  source: z.enum(["human", "pokayokay-plan", "kaizen-fix", "kaizen-suggest"]).optional(),
});

const CreateStorySchema = z.object({
  title: z.string().min(1),
  epic_id: z.string().optional(),
  description: z.string().optional(),
});

const UpdateTaskSchema = z.object({
  task_id: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  task_type: z.enum(["feature", "bug", "chore", "spike", "test"]).optional(),
  estimate_hours: z.number().optional(),
});

const ActivitySchema = z.object({
  task_id: z.string().min(1),
  activity_type: z.enum(["note", "file_change", "decision", "progress"]),
  description: z.string().min(1),
});

const HandoffNotesSchema = z.object({
  task_id: z.string().min(1),
  notes: z.string().min(1),
});

const ProgressSchema = z.object({
  task_id: z.string().min(1),
  progress_percent: z.number().min(0).max(100),
  context_summary: z.string().optional(),
});

const BlockerSchema = z.object({
  task_id: z.string().min(1),
  reason: z.string().min(1),
});

const ArchiveSchema = z.object({
  task_id: z.string().min(1),
  reason: z.string().optional(),
});

const NeedsReworkSchema = z.object({
  task_id: z.string().min(1),
  value: z.boolean(),
});

const DependencySchema = z.object({
  task_id: z.string().min(1),
  depends_on_task_id: z.string().min(1),
  dependency_type: z.enum(["blocks", "requires", "relates_to"]).default("blocks"),
});

const RemoveDependencySchema = z.object({
  task_id: z.string().min(1),
  depends_on_task_id: z.string().min(1),
});

const SummarizeSchema = z.object({
  task_id: z.string().min(1),
  delete_raw: z.boolean().default(false),
});

const RecordFailureSchema = z.object({
  task_id: z.string().min(1),
  failure_type: z.enum(["spec", "quality", "implementation"]),
  reason: z.string().min(1),
  attempt: z.number().optional(),
});

const CreateEpicSchema = z.object({
  title: z.string().min(1),
  project_id: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
});

const EpicIdSchema = z.object({
  epic_id: z.string().min(1),
});

const StoryIdSchema = z.object({
  story_id: z.string().min(1),
});

const GetStoriesSchema = z.object({
  epic_id: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

const UpdateStorySchema = z.object({
  story_id: z.string().min(1),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  epic_id: z.string().nullable().optional(),
});

const UpdateEpicSchema = z.object({
  epic_id: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  status: z.enum(["todo", "in_progress", "review", "done", "blocked"]).optional(),
});

const GetEpicsSchema = z.object({
  status: z.enum(["todo", "in_progress", "review", "done", "blocked"]).optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  limit: z.number().min(1).max(100).default(50),
});

const KanbanBoardSchema = z.object({
  include_done: z.boolean().default(false),
  limit_per_column: z.number().min(1).max(50).default(20),
});

const GetNextBatchSchema = z.object({
  batch_size: z.number().min(1).max(5).default(3),
});

// Tool definitions
const TOOLS = [
  {
    name: "get_project_status",
    description: "Get overall project status with task counts, completion percentage, and estimates",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_session_context",
    description: "Get session context for AI agent continuity. Returns in-progress tasks, blocked tasks, recent activity, and suggested next task. Call this at session start.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_tasks",
    description: "List tasks with optional filtering. Returns minimal fields by default for efficiency. Use fields='standard' for descriptions, or fields='full' for all data.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"], description: "Filter by task status" },
        priority: { type: "string", enum: ["P0", "P1", "P2", "P3"], description: "Filter by epic priority" },
        story_status: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"], description: "Filter by parent story status" },
        epic_status: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"], description: "Filter by parent epic status" },
        limit: { type: "number", description: "Maximum tasks to return (1-100)", default: 50 },
        fields: { type: "string", enum: ["minimal", "standard", "full"], description: "Field set to return: minimal (default, for selection), standard (with descriptions), full (all fields)", default: "minimal" },
      },
    },
  },
  {
    name: "get_task",
    description: "Get full details for a specific task by ID",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "get_next_task",
    description: "Get the recommended next task to work on based on priority and dependencies",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_next_batch",
    description: "Get a batch of up to N tasks ready for immediate execution. Returns tasks with status=todo or needs_rework=1, excluding tasks with unmet dependencies. Tasks are ordered by epic priority (P0 first) then creation date. Tasks needing rework include failure_context with previous failure details.",
    inputSchema: {
      type: "object" as const,
      properties: {
        batch_size: { type: "number", description: "Number of tasks to return (1-5, default 3)", default: 3 },
      },
    },
  },
  {
    name: "get_blocked_tasks",
    description: "Get all blocked tasks with their blocker reasons",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "update_task_status",
    description: "Update a task's status (todo, in_progress, review, done, blocked). When marking as done/archived, returns boundary metadata indicating if the task's story or epic was also completed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
        status: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"], description: "New status" },
        notes: { type: "string", description: "Optional handoff notes" },
      },
      required: ["task_id", "status"],
    },
  },
  {
    name: "add_task_activity",
    description: "Log activity on a task (note, file_change, decision, progress)",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
        activity_type: { type: "string", enum: ["note", "file_change", "decision", "progress"], description: "Type of activity" },
        description: { type: "string", description: "Activity description" },
      },
      required: ["task_id", "activity_type", "description"],
    },
  },
  {
    name: "set_handoff_notes",
    description: "Set handoff notes for a task (for session continuity)",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
        notes: { type: "string", description: "Handoff notes" },
      },
      required: ["task_id", "notes"],
    },
  },
  {
    name: "update_task_progress",
    description: "Update task completion percentage and optional context summary",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
        progress_percent: { type: "number", description: "Progress percentage (0-100)" },
        context_summary: { type: "string", description: "Optional context summary" },
      },
      required: ["task_id", "progress_percent"],
    },
  },
  {
    name: "set_blocker",
    description: "Mark a task as blocked with a reason",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
        reason: { type: "string", description: "Blocker reason" },
      },
      required: ["task_id", "reason"],
    },
  },
  {
    name: "resolve_blocker",
    description: "Resolve a blocker and set task to in_progress",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "set_needs_rework",
    description: "Mark a task as needing rework or clear the flag. Tasks marked for rework can be retried.",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
        value: { type: "boolean", description: "True to mark as needs rework, false to clear the flag" },
      },
      required: ["task_id", "value"],
    },
  },
  {
    name: "create_task",
    description: "Create a new task",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Task title" },
        story_id: { type: "string", description: "Optional story ID to associate with" },
        task_type: { type: "string", enum: ["feature", "bug", "chore", "spike", "test"], description: "Task type", default: "feature" },
        description: { type: "string", description: "Task description" },
        estimate_hours: { type: "number", description: "Estimated hours" },
        source: { type: "string", enum: ["human", "pokayokay-plan", "kaizen-fix", "kaizen-suggest"], description: "Source of the task (defaults to 'human')" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_story",
    description: "Create a new story to organize tasks under",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Story title" },
        epic_id: { type: "string", description: "Optional epic ID to associate with" },
        description: { type: "string", description: "Story description" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_story",
    description: "Get full details for a specific story by ID",
    inputSchema: {
      type: "object" as const,
      properties: {
        story_id: { type: "string", description: "Story ID" },
      },
      required: ["story_id"],
    },
  },
  {
    name: "list_stories",
    description: "List stories with optional filtering by epic and status",
    inputSchema: {
      type: "object" as const,
      properties: {
        epic_id: { type: "string", description: "Filter by epic ID" },
        status: { type: "string", enum: ["todo", "in_progress", "done"], description: "Filter by story status" },
        limit: { type: "number", description: "Maximum stories to return (1-100)", default: 50 },
        offset: { type: "number", description: "Number of stories to skip", default: 0 },
      },
    },
  },
  {
    name: "update_story",
    description: "Update story fields (title, description, status, epic_id)",
    inputSchema: {
      type: "object" as const,
      properties: {
        story_id: { type: "string", description: "Story ID" },
        title: { type: "string", description: "New title" },
        description: { type: ["string", "null"], description: "New description (null to clear)" },
        status: { type: "string", enum: ["todo", "in_progress", "done"], description: "New status" },
        epic_id: { type: ["string", "null"], description: "New epic ID (null to unassign)" },
      },
      required: ["story_id"],
    },
  },
  {
    name: "create_epic",
    description: "Create a new epic to organize stories under",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Epic title" },
        project_id: { type: "string", description: "Optional project ID" },
        description: { type: "string", description: "Epic description" },
        priority: { type: "string", enum: ["P0", "P1", "P2", "P3"], description: "Epic priority", default: "P2" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_epic",
    description: "Get full details for a specific epic by ID",
    inputSchema: {
      type: "object" as const,
      properties: {
        epic_id: { type: "string", description: "Epic ID" },
      },
      required: ["epic_id"],
    },
  },
  {
    name: "get_epics",
    description: "List epics with optional filtering by status and priority",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"], description: "Filter by status" },
        priority: { type: "string", enum: ["P0", "P1", "P2", "P3"], description: "Filter by priority" },
        limit: { type: "number", description: "Maximum epics to return (1-100)", default: 50 },
      },
    },
  },
  {
    name: "update_epic",
    description: "Update epic fields (title, description, priority, status)",
    inputSchema: {
      type: "object" as const,
      properties: {
        epic_id: { type: "string", description: "Epic ID" },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description" },
        priority: { type: "string", enum: ["P0", "P1", "P2", "P3"], description: "New priority" },
        status: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"], description: "New status" },
      },
      required: ["epic_id"],
    },
  },
  {
    name: "get_kanban_board",
    description: "Get tasks organized as a kanban board with columns for each status",
    inputSchema: {
      type: "object" as const,
      properties: {
        include_done: { type: "boolean", description: "Include done tasks in results", default: false },
        limit_per_column: { type: "number", description: "Maximum tasks per column (1-50)", default: 20 },
      },
    },
  },
  {
    name: "update_task",
    description: "Update task fields (title, description, task_type, estimate_hours)",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description" },
        task_type: { type: "string", enum: ["feature", "bug", "chore", "spike", "test"], description: "New task type" },
        estimate_hours: { type: "number", description: "New estimate" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "archive_task",
    description: "Archive a task (soft delete)",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
        reason: { type: "string", description: "Archive reason" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "add_dependency",
    description: "Add a dependency between tasks (task_id depends on depends_on_task_id)",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task that has the dependency" },
        depends_on_task_id: { type: "string", description: "Task that must be completed first" },
        dependency_type: { type: "string", enum: ["blocks", "requires", "relates_to"], description: "Type of dependency", default: "blocks" },
      },
      required: ["task_id", "depends_on_task_id"],
    },
  },
  {
    name: "remove_dependency",
    description: "Remove a dependency between tasks",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task that has the dependency" },
        depends_on_task_id: { type: "string", description: "Task to remove from dependencies" },
      },
      required: ["task_id", "depends_on_task_id"],
    },
  },
  {
    name: "get_task_dependencies",
    description: "Get all dependencies for a task including blocking status",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "summarize_task_activity",
    description: "Summarize task activity history to reduce context size",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
        delete_raw: { type: "boolean", description: "Delete raw activity entries after summarizing", default: false },
      },
      required: ["task_id"],
    },
  },
  {
    name: "record_task_failure",
    description: "Record a task failure for pattern learning. Stores failure information including type, reason, and optional attempt number.",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
        failure_type: { type: "string", enum: ["spec", "quality", "implementation"], description: "Type of failure: spec (requirements issue), quality (quality issue), implementation (technical issue)" },
        reason: { type: "string", description: "Human-readable description of why the task failed" },
        attempt: { type: "number", description: "Optional attempt number" },
      },
      required: ["task_id", "failure_type", "reason"],
    },
  },
];

// Export schemas for testing
export {
  GetTasksSchema,
  TaskIdSchema,
  UpdateStatusSchema,
  CreateTaskSchema,
  CreateStorySchema,
  StoryIdSchema,
  GetStoriesSchema,
  UpdateStorySchema,
  CreateEpicSchema,
  EpicIdSchema,
  UpdateEpicSchema,
  GetEpicsSchema,
  KanbanBoardSchema,
  GetNextBatchSchema,
  UpdateTaskSchema,
  ActivitySchema,
  HandoffNotesSchema,
  ProgressSchema,
  BlockerSchema,
  ArchiveSchema,
  DependencySchema,
  RemoveDependencySchema,
  SummarizeSchema,
  RecordFailureSchema,
};

// Export tool definitions for testing
export { TOOLS };

// Database singleton
let db: TaskDatabase | null = null;

async function getDb(): Promise<TaskDatabase> {
  if (!db) {
    const dbPath = process.env.OHNO_DB_PATH ?? findDbPath();
    if (!dbPath) {
      throw new Error("Could not find .ohno/tasks.db. Run 'ohno init' first or set OHNO_DB_PATH.");
    }
    db = await TaskDatabase.open(dbPath);
  }
  return db;
}

/**
 * Set database instance (for testing)
 */
export function setDb(database: TaskDatabase | null): void {
  db = database;
}

/**
 * Tool handler - exported for testing
 */
export async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const database = await getDb();

  switch (name) {
    case "get_project_status":
      return database.getProjectStatus();

    case "get_session_context":
      return database.getSessionContext();

    case "get_tasks": {
      const parsed = GetTasksSchema.parse(args);
      return { tasks: database.getTasks(parsed) };
    }

    case "get_task": {
      const parsed = TaskIdSchema.parse(args);
      const task = database.getTask(parsed.task_id);
      if (!task) {
        return { error: `Task not found: ${parsed.task_id}` };
      }
      return task;
    }

    case "get_next_task": {
      const task = database.getNextTask();
      if (!task) {
        return { message: "No tasks available" };
      }
      return task;
    }

    case "get_next_batch": {
      const parsed = GetNextBatchSchema.parse(args);
      const tasks = database.getNextBatch(parsed.batch_size);
      return { tasks, batch_size: tasks.length };
    }

    case "get_blocked_tasks":
      return { tasks: database.getBlockedTasks() };

    case "update_task_status": {
      const parsed = UpdateStatusSchema.parse(args);
      const result = database.updateTaskStatus(
        parsed.task_id,
        parsed.status as TaskStatus,
        parsed.notes
      );
      // Return full result including boundaries when completing a task
      return result;
    }

    case "add_task_activity": {
      const parsed = ActivitySchema.parse(args);
      const success = database.addTaskActivity(
        parsed.task_id,
        parsed.activity_type,
        parsed.description
      );
      return { success };
    }

    case "set_handoff_notes": {
      const parsed = HandoffNotesSchema.parse(args);
      const success = database.setHandoffNotes(parsed.task_id, parsed.notes);
      return { success };
    }

    case "update_task_progress": {
      const parsed = ProgressSchema.parse(args);
      const success = database.updateTaskProgress(
        parsed.task_id,
        parsed.progress_percent,
        parsed.context_summary
      );
      return { success };
    }

    case "set_blocker": {
      const parsed = BlockerSchema.parse(args);
      const success = database.setBlocker(parsed.task_id, parsed.reason);
      return { success };
    }

    case "resolve_blocker": {
      const parsed = TaskIdSchema.parse(args);
      const success = database.resolveBlocker(parsed.task_id);
      return { success };
    }

    case "set_needs_rework": {
      const parsed = NeedsReworkSchema.parse(args);
      const success = database.setNeedsRework(parsed.task_id, parsed.value);
      return { success };
    }

    case "create_task": {
      const parsed = CreateTaskSchema.parse(args);
      const taskId = database.createTask(parsed);
      return { success: true, task_id: taskId };
    }

    case "create_story": {
      const parsed = CreateStorySchema.parse(args);
      const storyId = database.createStory(parsed);
      return { success: true, story_id: storyId };
    }

    case "get_story": {
      const parsed = StoryIdSchema.parse(args);
      const story = database.getStory(parsed.story_id);
      if (!story) {
        return { error: `Story not found: ${parsed.story_id}` };
      }
      return story;
    }

    case "list_stories": {
      const parsed = GetStoriesSchema.parse(args);
      return { stories: database.getStories(parsed) };
    }

    case "update_story": {
      const parsed = UpdateStorySchema.parse(args);
      const { story_id, ...updates } = parsed;
      const success = database.updateStory(story_id, updates);
      return { success };
    }

    case "create_epic": {
      const parsed = CreateEpicSchema.parse(args);
      const epicId = database.createEpic(parsed);
      return { success: true, epic_id: epicId };
    }

    case "get_epic": {
      const parsed = EpicIdSchema.parse(args);
      const epic = database.getEpic(parsed.epic_id);
      if (!epic) {
        return { error: `Epic not found: ${parsed.epic_id}` };
      }
      return epic;
    }

    case "get_epics": {
      const parsed = GetEpicsSchema.parse(args);
      return { epics: database.getEpics(parsed) };
    }

    case "update_epic": {
      const parsed = UpdateEpicSchema.parse(args);
      const { epic_id, ...updates } = parsed;
      const success = database.updateEpic(epic_id, updates);
      return { success };
    }

    case "get_kanban_board": {
      const parsed = KanbanBoardSchema.parse(args);
      const limit = parsed.limit_per_column;

      const columns: Record<string, unknown[]> = {
        todo: database.getTasks({ status: "todo", limit }),
        in_progress: database.getTasks({ status: "in_progress", limit }),
        review: database.getTasks({ status: "review", limit }),
        blocked: database.getTasks({ status: "blocked", limit }),
      };

      if (parsed.include_done) {
        columns.done = database.getTasks({ status: "done", limit });
      }

      const stats = {
        todo_count: columns.todo.length,
        in_progress_count: columns.in_progress.length,
        review_count: columns.review.length,
        blocked_count: columns.blocked.length,
        ...(parsed.include_done ? { done_count: columns.done?.length ?? 0 } : {}),
        total_active: columns.todo.length + columns.in_progress.length + columns.review.length + columns.blocked.length,
      };

      return { columns, stats };
    }

    case "update_task": {
      const parsed = UpdateTaskSchema.parse(args);
      const { task_id, ...updates } = parsed;
      const success = database.updateTask(task_id, updates);
      return { success };
    }

    case "archive_task": {
      const parsed = ArchiveSchema.parse(args);
      const success = database.archiveTask(parsed.task_id, parsed.reason);
      return { success };
    }

    case "add_dependency": {
      const parsed = DependencySchema.parse(args);
      const depId = database.addDependency(
        parsed.task_id,
        parsed.depends_on_task_id,
        parsed.dependency_type as DependencyType
      );
      if (!depId) {
        return { success: false, error: "Could not add dependency (invalid tasks or already exists)" };
      }
      return { success: true, dependency_id: depId };
    }

    case "remove_dependency": {
      const parsed = RemoveDependencySchema.parse(args);
      const success = database.removeDependency(parsed.task_id, parsed.depends_on_task_id);
      return { success };
    }

    case "get_task_dependencies": {
      const parsed = TaskIdSchema.parse(args);
      const dependencies = database.getTaskDependencies(parsed.task_id);
      const blocking = database.getBlockingDependencies(parsed.task_id);
      return {
        dependencies,
        blocking,
        is_blocked: blocking.length > 0,
      };
    }

    case "summarize_task_activity": {
      const parsed = SummarizeSchema.parse(args);
      const summary = database.summarizeTaskActivity(parsed.task_id, parsed.delete_raw);
      if (!summary) {
        return { success: false, message: "Not enough activity to summarize" };
      }
      return { success: true, summary };
    }

    case "record_task_failure": {
      const parsed = RecordFailureSchema.parse(args);
      const failureId = database.addTaskFailure(
        parsed.task_id,
        parsed.failure_type as "spec" | "quality" | "implementation",
        parsed.reason,
        parsed.attempt
      );
      return { success: true, failure_id: failureId };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function createServer(): Promise<Server> {
  const server = new Server(
    {
      name: "ohno",
      version: "0.5.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleTool(name, args ?? {});
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: message }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function runServer(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ohno MCP server started");
}
