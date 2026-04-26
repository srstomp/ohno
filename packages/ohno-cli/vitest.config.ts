import { defineConfig, type Plugin } from "vitest/config";

// node:sqlite is a Node 22.5+ built-in added after builtinModules was frozen.
// vite-node's normalizeModuleId() strips the "node:" prefix, so "node:sqlite"
// becomes "sqlite", which Vite can't find as a file. This plugin intercepts
// the stripped id and provides a virtual module that loads the real built-in.
const nodeSqlitePlugin: Plugin = {
  name: "node-sqlite-external",
  enforce: "pre",
  resolveId(id) {
    if (id === "sqlite") {
      return "\0virtual:sqlite";
    }
  },
  load(id) {
    if (id === "\0virtual:sqlite") {
      return `
import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
const mod = _require('node:sqlite');
export const DatabaseSync = mod.DatabaseSync;
export const StatementSync = mod.StatementSync;
export default mod;
`;
    }
  },
};

export default defineConfig({
  plugins: [nodeSqlitePlugin],
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});