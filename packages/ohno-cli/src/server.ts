/**
 * HTTP server for kanban board
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { watch } from "chokidar";
import { out, colors } from "./output.js";
import { exportDatabase, generateKanbanHtml } from "./kanban.js";

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
 * Create HTTP server to serve static files from ohno directory
 */
export function createHttpServer(ohnoDir: string): http.Server {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
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
 */
export function watchDatabase(ohnoDir: string): void {
  const dbPath = path.join(ohnoDir, "tasks.db");

  const watcher = watch(dbPath, {
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on("change", () => {
    out.info("Database changed, regenerating kanban...");
    syncKanban(ohnoDir);
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
export function syncKanban(ohnoDir: string): boolean {
  const dbPath = path.join(ohnoDir, "tasks.db");

  if (!fs.existsSync(dbPath)) {
    out.error("Database not found", dbPath, "Run 'ohno init' first");
    return false;
  }

  try {
    const data = exportDatabase(dbPath);
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
  if (!syncKanban(ohnoDir)) {
    process.exit(1);
  }

  // Create and start HTTP server
  const server = createHttpServer(ohnoDir);

  server.listen(port, host, () => {
    if (!quiet) {
      out.success(`Server started`);
      out.print(`  ${colors.cyan(`http://${host}:${port}/kanban.html`)}`);
      out.print(colors.dim("  Press Ctrl+C to stop"));
    }
  });

  // Watch for database changes
  watchDatabase(ohnoDir);
}
