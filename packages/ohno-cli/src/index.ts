#!/usr/bin/env node
/**
 * ohno-cli entry point
 */

import "./node-guard.js";
import { createCli } from "./cli.js";
import { OhnoDatabaseLockedError } from "@stevestomp/ohno-core";

async function main() {
  const program = createCli();
  await program.parseAsync();
}

main().catch((err) => {
  if (err instanceof OhnoDatabaseLockedError) {
    if (process.argv.includes('--json')) {
      process.stdout.write(JSON.stringify({
        success: false,
        error: err.message,
        errorCode: err.sqliteCode,
      }) + '\n');
    } else {
      process.stderr.write(err.message + '\n');
    }
    process.exit(1);
  }
  // Re-throw or print other errors using existing semantics
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
});
