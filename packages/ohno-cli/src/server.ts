/**
 * HTTP server for kanban board
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { watch } from "chokidar";
import { out, colors } from "./output.js";
import { exportDatabase, generateKanbanHtml } from "./kanban.js";
import { TaskDatabase, type TaskType } from "@stevestomp/ohno-core";

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
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

  // Handle CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
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
    sendJson(res, 500, { error: String(error) });
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

    let filePath = path.join(ohnoDir, url.pathname === "/" ? "kanban.html" : url.pathname);

    // Security: prevent directory traversal
    if (!filePath.startsWith(ohnoDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
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
 * SQLite with WAL mode writes to tasks.db-wal first, then checkpoints to tasks.db.
 * We watch both files to catch changes immediately.
 */
export function watchDatabase(ohnoDir: string): void {
  const dbPath = path.join(ohnoDir, "tasks.db");
  const walPath = `${dbPath}-wal`;

  // Watch both main db and WAL file for SQLite WAL mode compatibility
  const watcher = watch([dbPath, walPath], {
    persistent: true,
    ignoreInitial: true,
  });

  // Debounce to avoid multiple regenerations when both files change
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 100;

  watcher.on("change", (changedPath) => {
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Set new timer to debounce rapid changes
    debounceTimer = setTimeout(async () => {
      out.info("Database changed, regenerating kanban...");
      await syncKanban(ohnoDir);
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
 */
export async function syncKanban(ohnoDir: string): Promise<boolean> {
  const dbPath = path.join(ohnoDir, "tasks.db");

  if (!fs.existsSync(dbPath)) {
    out.error("Database not found", dbPath, "Run 'ohno init' first");
    return false;
  }

  try {
    const data = await exportDatabase(dbPath);
    const html = generateKanbanHtml(data);
    const htmlPath = path.join(ohnoDir, "kanban.html");

    fs.writeFileSync(htmlPath, html);
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

  // Initial sync
  if (!(await syncKanban(ohnoDir))) {
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
