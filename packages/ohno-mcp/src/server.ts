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
  limit: z.number().min(1).max(100).default(50),
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
    description: "List tasks with optional filtering by status and priority",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"], description: "Filter by status" },
        priority: { type: "string", enum: ["P0", "P1", "P2", "P3"], description: "Filter by priority" },
        limit: { type: "number", description: "Maximum tasks to return (1-100)", default: 50 },
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
    name: "get_blocked_tasks",
    description: "Get all blocked tasks with their blocker reasons",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "update_task_status",
    description: "Update a task's status (todo, in_progress, review, done, blocked)",
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
      },
      required: ["title"],
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
];

// Export schemas for testing
export {
  GetTasksSchema,
  TaskIdSchema,
  UpdateStatusSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  ActivitySchema,
  HandoffNotesSchema,
  ProgressSchema,
  BlockerSchema,
  ArchiveSchema,
  DependencySchema,
  RemoveDependencySchema,
  SummarizeSchema,
};

// Export tool definitions for testing
export { TOOLS };

// Database singleton
let db: TaskDatabase | null = null;

function getDb(): TaskDatabase {
  if (!db) {
    const dbPath = process.env.OHNO_DB_PATH ?? findDbPath();
    if (!dbPath) {
      throw new Error("Could not find .ohno/tasks.db. Run 'ohno init' first or set OHNO_DB_PATH.");
    }
    db = new TaskDatabase(dbPath);
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
export function handleTool(name: string, args: Record<string, unknown>): unknown {
  const database = getDb();

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

    case "get_blocked_tasks":
      return { tasks: database.getBlockedTasks() };

    case "update_task_status": {
      const parsed = UpdateStatusSchema.parse(args);
      const success = database.updateTaskStatus(
        parsed.task_id,
        parsed.status as TaskStatus,
        parsed.notes
      );
      return { success };
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

    case "create_task": {
      const parsed = CreateTaskSchema.parse(args);
      const taskId = database.createTask(parsed);
      return { success: true, task_id: taskId };
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
      const result = handleTool(name, args ?? {});
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
