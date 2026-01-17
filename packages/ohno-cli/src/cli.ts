/**
 * CLI command definitions
 */

import { Command } from "commander";
import { createRequire } from "module";
import {
  TaskDatabase,
  findDbPath,
  findOhnoDir,
  ensureOhnoDir,
  type TaskStatus,
} from "@stevestomp/ohno-core";
import { out, formatTask, formatStatus, formatPriority, colors } from "./output.js";
import { startServer, syncKanban } from "./server.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");
const VERSION = pkg.version;

// Get database, exit if not found
async function getDb(dir?: string): Promise<TaskDatabase> {
  const dbPath = findDbPath(dir);
  if (!dbPath) {
    out.error(
      "Database not found",
      "Could not find .ohno/tasks.db",
      "Run 'ohno init' first"
    );
    process.exit(1);
  }
  return TaskDatabase.open(dbPath);
}

// Get ohno directory, exit if not found
function getOhnoDir(dir?: string): string {
  const ohnoDir = findOhnoDir(dir);
  if (!ohnoDir) {
    out.error(
      "Ohno directory not found",
      "Could not find .ohno/",
      "Run 'ohno init' first"
    );
    process.exit(1);
  }
  return ohnoDir;
}

export function createCli(): Command {
  const program = new Command()
    .name("ohno")
    .version(VERSION)
    .description("Task management for AI agent workflows")
    .option("--json", "Output as JSON")
    .option("--no-color", "Disable colored output")
    .option("-d, --dir <path>", "Override ohno directory");

  // Handle global options
  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.json) out.setJsonMode(true);
  });

  // ==========================================================================
  // Visualization Commands
  // ==========================================================================

  program
    .command("serve")
    .description("Start visual kanban board server")
    .option("-p, --port <port>", "Port number", "3333")
    .option("-h, --host <host>", "Host address", "127.0.0.1")
    .option("-q, --quiet", "Suppress output")
    .action(async (options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const ohnoDir = getOhnoDir(globalOpts.dir);
      const port = parseInt(options.port, 10);

      await startServer({
        port,
        host: options.host,
        ohnoDir,
        quiet: options.quiet || globalOpts.json,
      });
    });

  program
    .command("sync")
    .description("One-time sync of kanban HTML")
    .option("-q, --quiet", "Suppress output")
    .action(async (options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const ohnoDir = getOhnoDir(globalOpts.dir);

      if (await syncKanban(ohnoDir)) {
        if (!options.quiet) {
          out.success("Kanban synced");
        }
        if (globalOpts.json) {
          out.json({ success: true });
        }
      } else {
        process.exit(1);
      }
    });

  program
    .command("status")
    .description("Show project statistics")
    .action(async (options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);
      const status = db.getProjectStatus();
      db.close();

      if (globalOpts.json) {
        out.json(status);
      } else {
        out.print(colors.bold("Project Status"));
        out.print("");
        out.print(`  Tasks:      ${status.done_tasks}/${status.total_tasks} (${status.completion_percent}% done)`);
        out.print(`  In Progress: ${status.in_progress_tasks}`);
        out.print(`  Blocked:     ${status.blocked_tasks}`);
        out.print(`  Review:      ${status.review_tasks}`);
        out.print(`  Todo:        ${status.todo_tasks}`);
        out.print("");
        out.print(`  Epics:       ${status.total_epics}`);
        out.print(`  Stories:     ${status.total_stories}`);
        out.print(`  Estimate:    ${status.total_estimate_hours}h`);
        out.print(`  Actual:      ${status.total_actual_hours}h`);
      }
    });

  program
    .command("init")
    .description("Initialize .ohno/ directory")
    .option("-f, --force", "Overwrite existing")
    .action(async (options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const baseDir = globalOpts.dir ?? process.cwd();

      try {
        const ohnoDir = ensureOhnoDir(baseDir);

        // Create empty database to initialize schema
        const dbPath = `${ohnoDir}/tasks.db`;
        const db = await TaskDatabase.open(dbPath);
        db.close();

        if (globalOpts.json) {
          out.json({ success: true, path: ohnoDir });
        } else {
          out.success(`Initialized ${ohnoDir}`);
        }
      } catch (error) {
        out.error("Failed to initialize", String(error));
        process.exit(1);
      }
    });

  // ==========================================================================
  // Task Management Commands
  // ==========================================================================

  program
    .command("tasks")
    .description("List tasks")
    .option("-s, --status <status>", "Filter by status (todo, in_progress, review, done, blocked)")
    .option("-p, --priority <priority>", "Filter by priority (P0, P1, P2, P3)")
    .option("-l, --limit <limit>", "Max tasks to return", "50")
    .action(async (options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);

      const tasks = db.getTasks({
        status: options.status as TaskStatus,
        priority: options.priority,
        limit: parseInt(options.limit, 10),
      });
      db.close();

      if (globalOpts.json) {
        out.json({ tasks });
      } else {
        if (tasks.length === 0) {
          out.print(colors.dim("No tasks found"));
          return;
        }

        tasks.forEach((task) => {
          const status = formatStatus(task.status);
          const priority = task.epic_priority ? formatPriority(task.epic_priority) + " " : "";
          out.print(`${colors.dim(task.id)}  ${status}  ${priority}${task.title}`);
        });
        out.print("");
        out.print(colors.dim(`${tasks.length} tasks`));
      }
    });

  program
    .command("task <id>")
    .description("Get task details")
    .action(async (id, options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);
      const task = db.getTask(id);
      db.close();

      if (!task) {
        out.error("Task not found", id);
        process.exit(1);
      }

      if (globalOpts.json) {
        out.json(task);
      } else {
        out.print(formatTask(task as unknown as Record<string, unknown>));
      }
    });

  program
    .command("create <title>")
    .description("Create a new task")
    .option("-t, --type <type>", "Task type (feature, bug, chore, spike, test)", "feature")
    .option("--description <desc>", "Task description")
    .option("-e, --estimate <hours>", "Estimated hours")
    .action(async (title, options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);

      const taskId = db.createTask({
        title,
        task_type: options.type,
        description: options.description,
        estimate_hours: options.estimate ? parseFloat(options.estimate) : undefined,
      });
      db.close();

      if (globalOpts.json) {
        out.json({ success: true, task_id: taskId });
      } else {
        out.success(`Created task ${taskId}`);
      }
    });

  program
    .command("start <id>")
    .description("Start working on a task (set status to in_progress)")
    .option("-n, --notes <notes>", "Handoff notes")
    .action(async (id, options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);
      const success = db.updateTaskStatus(id, "in_progress", options.notes);
      db.close();

      if (globalOpts.json) {
        out.json({ success });
      } else if (success) {
        out.success(`Started task ${id}`);
      } else {
        out.error("Failed to start task", id);
        process.exit(1);
      }
    });

  program
    .command("done <id>")
    .description("Mark task as done")
    .option("-n, --notes <notes>", "Completion notes")
    .action(async (id, options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);
      const success = db.updateTaskStatus(id, "done", options.notes);
      db.close();

      if (globalOpts.json) {
        out.json({ success });
      } else if (success) {
        out.success(`Completed task ${id}`);
      } else {
        out.error("Failed to complete task", id);
        process.exit(1);
      }
    });

  program
    .command("review <id>")
    .description("Mark task for review")
    .option("-n, --notes <notes>", "Review notes")
    .action(async (id, options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);
      const success = db.updateTaskStatus(id, "review", options.notes);
      db.close();

      if (globalOpts.json) {
        out.json({ success });
      } else if (success) {
        out.success(`Task ${id} marked for review`);
      } else {
        out.error("Failed to update task", id);
        process.exit(1);
      }
    });

  program
    .command("block <id> <reason>")
    .description("Set a blocker on a task")
    .action(async (id, reason, options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);
      const success = db.setBlocker(id, reason);
      db.close();

      if (globalOpts.json) {
        out.json({ success });
      } else if (success) {
        out.success(`Blocked task ${id}`);
      } else {
        out.error("Failed to block task", id);
        process.exit(1);
      }
    });

  program
    .command("unblock <id>")
    .description("Resolve blocker on a task")
    .action(async (id, options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);
      const success = db.resolveBlocker(id);
      db.close();

      if (globalOpts.json) {
        out.json({ success });
      } else if (success) {
        out.success(`Unblocked task ${id}`);
      } else {
        out.error("Failed to unblock task", id);
        process.exit(1);
      }
    });

  // ==========================================================================
  // Dependency Commands
  // ==========================================================================

  const dep = program
    .command("dep")
    .description("Manage task dependencies");

  dep
    .command("add <task-id> <depends-on-id>")
    .description("Add a dependency (task-id depends on depends-on-id)")
    .action(async (taskId, dependsOnId, options, command) => {
      const globalOpts = command.parent?.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);
      const depId = db.addDependency(taskId, dependsOnId);
      db.close();

      if (globalOpts.json) {
        out.json({ success: !!depId, dependency_id: depId });
      } else if (depId) {
        out.success(`Added dependency: ${taskId} depends on ${dependsOnId}`);
      } else {
        out.error("Failed to add dependency", "Tasks may not exist or dependency already exists");
        process.exit(1);
      }
    });

  dep
    .command("rm <task-id> <depends-on-id>")
    .description("Remove a dependency")
    .action(async (taskId, dependsOnId, options, command) => {
      const globalOpts = command.parent?.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);
      const success = db.removeDependency(taskId, dependsOnId);
      db.close();

      if (globalOpts.json) {
        out.json({ success });
      } else if (success) {
        out.success("Removed dependency");
      } else {
        out.error("Dependency not found");
        process.exit(1);
      }
    });

  dep
    .command("list <task-id>")
    .description("List dependencies for a task")
    .action(async (taskId, options, command) => {
      const globalOpts = command.parent?.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);
      const deps = db.getTaskDependencies(taskId);
      const blocking = db.getBlockingDependencies(taskId);
      db.close();

      if (globalOpts.json) {
        out.json({ dependencies: deps, blocking, is_blocked: blocking.length > 0 });
      } else {
        if (deps.length === 0) {
          out.print(colors.dim("No dependencies"));
          return;
        }

        out.print(colors.bold("Dependencies:"));
        deps.forEach((d) => {
          const status = formatStatus(d.depends_on_status ?? "unknown");
          const blocked = blocking.includes(d.depends_on_task_id) ? colors.red(" (blocking)") : "";
          out.print(`  ${d.depends_on_task_id}  ${status}${blocked}`);
        });
      }
    });

  // ==========================================================================
  // AI Agent Commands
  // ==========================================================================

  program
    .command("context")
    .description("Get session context (for AI agents resuming work)")
    .action(async (options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);
      const ctx = db.getSessionContext();
      db.close();

      if (globalOpts.json) {
        out.json(ctx);
      } else {
        out.print(colors.bold("Session Context"));
        out.print("");

        if (ctx.in_progress_tasks.length > 0) {
          out.print(colors.blue("In Progress:"));
          ctx.in_progress_tasks.forEach((t) => {
            out.print(`  ${colors.dim(t.id)}  ${t.title}`);
          });
          out.print("");
        }

        if (ctx.blocked_tasks.length > 0) {
          out.print(colors.red("Blocked:"));
          ctx.blocked_tasks.forEach((t) => {
            out.print(`  ${colors.dim(t.id)}  ${t.title}`);
            if (t.blockers) out.print(`    ${colors.dim(t.blockers)}`);
          });
          out.print("");
        }

        if (ctx.suggested_next_task) {
          out.print(colors.green("Suggested Next:"));
          out.print(`  ${colors.dim(ctx.suggested_next_task.id)}  ${ctx.suggested_next_task.title}`);
        }
      }
    });

  program
    .command("next")
    .description("Get the recommended next task")
    .action(async (options, command) => {
      const globalOpts = command.parent?.opts() ?? {};
      const db = await getDb(globalOpts.dir);
      const task = db.getNextTask();
      db.close();

      if (globalOpts.json) {
        out.json(task ?? { message: "No tasks available" });
      } else if (task) {
        out.print(formatTask(task as unknown as Record<string, unknown>));
      } else {
        out.print(colors.dim("No tasks available"));
      }
    });

  return program;
}
