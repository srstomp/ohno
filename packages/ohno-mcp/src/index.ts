#!/usr/bin/env node

/**
 * ohno-mcp - MCP server for ohno task management
 *
 * Usage:
 *   npx ohno-mcp
 *   ohno-mcp --db /path/to/tasks.db
 *
 * Environment:
 *   OHNO_DB_PATH - Path to tasks.db file
 */

import { runServer } from "./server.js";

// Parse args
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--db" && args[i + 1]) {
    process.env.OHNO_DB_PATH = args[i + 1];
    i++;
  }
}

// Run the server
runServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
