/**
 * HTTP server for kanban board
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { watch } from "chokidar";
import { out, colors } from "./output.js";
import { exportDatabase, generateKanbanHtml } from "./kanban.js";
import { TaskDatabase, type TaskType } from "@stevestomp/ohno-core";

// Track last data hash to avoid regenerating when nothing changed
let lastDataHash: string | null = null;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

/**
 * Parse JSON body from request
 */
async function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(data));
}

/**
 * Handle API requests
 */
async function handleApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ohnoDir: string
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const method = req.method ?? "GET";

  // Handle OPTIONS request (no CORS needed for local-only server)
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Match /api/tasks/:id
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (!taskMatch) return false;

  const taskId = taskMatch[1];
  const dbPath = path.join(ohnoDir, "tasks.db");

  if (!fs.existsSync(dbPath)) {
    sendJson(res, 404, { error: "Database not found" });
    return true;
  }

  try {
    const db = await TaskDatabase.open(dbPath);

    if (method === "PUT") {
      // Update task
      const body = await parseJsonBody(req);
      const task = db.getTask(taskId);

      if (!task) {
        db.close();
        sendJson(res, 404, { error: "Task not found" });
        return true;
      }

      // Update allowed fields
      const validTaskTypes: TaskType[] = ["feature", "bug", "chore", "spike", "test"];
      const taskType = typeof body.task_type === "string" && validTaskTypes.includes(body.task_type as TaskType)
        ? (body.task_type as TaskType)
        : undefined;

      db.updateTask(taskId, {
        title: typeof body.title === "string" ? body.title : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        task_type: taskType,
        estimate_hours: typeof body.estimate_hours === "number" ? body.estimate_hours : undefined,
      });

      db.close();
      sendJson(res, 200, { success: true, task_id: taskId });
      return true;
    }

    if (method === "DELETE") {
      // Archive task (soft delete)
      const task = db.getTask(taskId);

      if (!task) {
        db.close();
        sendJson(res, 404, { error: "Task not found" });
        return true;
      }

      db.archiveTask(taskId, "Deleted from kanban UI");
      db.close();
      sendJson(res, 200, { success: true, task_id: taskId });
      return true;
    }

    if (method === "GET") {
      // Get task details
      const task = db.getTask(taskId);
      db.close();

      if (!task) {
        sendJson(res, 404, { error: "Task not found" });
        return true;
      }

      sendJson(res, 200, task);
      return true;
    }

    db.close();
    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  } catch (error) {
    // Log full error server-side, send generic message to client
    console.error("API error:", error);
    sendJson(res, 500, { error: "Internal server error" });
    return true;
  }
}

/**
 * Create HTTP server to serve static files from ohno directory
 */
export function createHttpServer(ohnoDir: string): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    // Handle API requests
    if (url.pathname.startsWith("/api/")) {
      await handleApiRequest(req, res, ohnoDir);
      return;
    }

    const requestedPath = path.join(ohnoDir, url.pathname === "/" ? "kanban.html" : url.pathname);

    // Security: use canonical path resolution to prevent directory traversal
    let filePath: string;
    try {
      const ohnoRealPath = fs.realpathSync(ohnoDir);
      filePath = fs.realpathSync(requestedPath);
      if (!filePath.startsWith(ohnoRealPath + path.sep) && filePath !== ohnoRealPath) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
    } catch {
      // File doesn't exist or can't be resolved
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    // Get mime type
    const ext = path.extname(filePath);
    const mimeType = MIME_TYPES[ext] ?? "application/octet-stream";

    // Read and serve file
    try {
      const content = fs.readFileSync(filePath);

      // Add cache-busting headers
      res.writeHead(200, {
        "Content-Type": mimeType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      });

      res.end(content);
    } catch (error) {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });
}

/**
 * Watch database file and regenerate kanban on changes
 *
 * Only watches the main tasks.db file, not the WAL file. This avoids a feedback
 * loop where reading the database during sync causes WAL checkpoints, which
 * would trigger another sync.
 */
export function watchDatabase(ohnoDir: string): void {
  const dbPath = path.join(ohnoDir, "tasks.db");

  // Only watch main db file - watching WAL causes feedback loops because
  // opening the db for reading can trigger WAL checkpoints
  const watcher = watch(dbPath, {
    persistent: true,
    ignoreInitial: true,
    // Use polling for SQLite files since inotify may miss some changes
    usePolling: true,
    interval: 1000,
  });

  // Debounce to avoid multiple regenerations
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 500;

  // Track last sync time to avoid redundant syncs
  let lastSyncTime = 0;
  let isSyncing = false;

  watcher.on("change", (changedPath) => {
    // Skip if we're currently syncing (our own write could trigger this)
    if (isSyncing) {
      return;
    }

    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Set new timer to debounce rapid changes
    debounceTimer = setTimeout(async () => {
      // Check if enough time has passed since last sync
      const now = Date.now();
      if (now - lastSyncTime < 1000) {
        debounceTimer = null;
        return;
      }

      isSyncing = true;
      const didSync = await syncKanban(ohnoDir);
      if (didSync) {
        out.info("Database changed, regenerated kanban");
      }
      lastSyncTime = Date.now();
      isSyncing = false;
      debounceTimer = null;
    }, DEBOUNCE_MS);
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    watcher.close();
    process.exit(0);
  });
}

/**
 * Sync database to kanban HTML
 *
 * Compares data hash to avoid regenerating when nothing actually changed.
 * Returns true if sync was performed, false if skipped or errored.
 */
export async function syncKanban(ohnoDir: string, force: boolean = false): Promise<boolean> {
  const dbPath = path.join(ohnoDir, "tasks.db");

  if (!fs.existsSync(dbPath)) {
    out.error("Database not found", dbPath, "Run 'ohno init' first");
    return false;
  }

  try {
    const data = await exportDatabase(dbPath);

    // Hash only the actual data (exclude volatile fields like synced_at)
    const stableData = {
      projects: data.projects,
      epics: data.epics,
      stories: data.stories,
      tasks: data.tasks,
      dependencies: data.dependencies,
      task_activity: data.task_activity,
      task_files: data.task_files,
      task_dependencies: data.task_dependencies,
      stats: data.stats,
    };
    const dataHash = crypto
      .createHash("md5")
      .update(JSON.stringify(stableData))
      .digest("hex");

    // Skip if data hasn't changed (unless forced)
    if (!force && lastDataHash === dataHash) {
      return false;
    }

    const html = generateKanbanHtml(data);
    const htmlPath = path.join(ohnoDir, "kanban.html");

    fs.writeFileSync(htmlPath, html);
    lastDataHash = dataHash;
    return true;
  } catch (error) {
    out.error("Failed to sync kanban", String(error));
    return false;
  }
}

/**
 * Try to listen on a port, returns a promise that resolves with the actual port used
 */
function tryListen(
  server: http.Server,
  port: number,
  host: string,
  maxAttempts: number = 10
): Promise<number> {
  return new Promise((resolve, reject) => {
    let currentPort = port;
    let attempts = 0;

    const attemptListen = () => {
      attempts++;

      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && attempts < maxAttempts) {
          server.removeListener("error", onError);
          currentPort++;
          attemptListen();
        } else {
          reject(err);
        }
      };

      server.once("error", onError);

      server.listen(currentPort, host, () => {
        server.removeListener("error", onError);
        resolve(currentPort);
      });
    };

    attemptListen();
  });
}

/**
 * Start the serve command
 */
export async function startServer(options: {
  port: number;
  host: string;
  ohnoDir: string;
  quiet: boolean;
}): Promise<void> {
  const { port, host, ohnoDir, quiet } = options;

  // Initial sync (force to ensure HTML is generated)
  if (!(await syncKanban(ohnoDir, true))) {
    process.exit(1);
  }

  // Create and start HTTP server
  const server = createHttpServer(ohnoDir);

  try {
    const actualPort = await tryListen(server, port, host);

    if (!quiet) {
      out.success(`Server started`);
      if (actualPort !== port) {
        out.print(colors.dim(`  Port ${port} was in use, using ${actualPort}`));
      }
      out.print(`  ${colors.cyan(`http://${host}:${actualPort}/kanban.html`)}`);
      out.print(colors.dim("  Press Ctrl+C to stop"));
    }

    // Watch for database changes
    watchDatabase(ohnoDir);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "EADDRINUSE") {
      out.error(
        "No available ports",
        `Ports ${port}-${port + 9} are all in use`,
        "Try specifying a different port with --port"
      );
    } else {
      out.error("Failed to start server", error.message);
    }
    process.exit(1);
  }
}
