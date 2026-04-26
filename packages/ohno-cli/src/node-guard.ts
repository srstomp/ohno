/**
 * Node.js version guard for ohno-cli.
 * Must be imported before any module that transitively imports node:sqlite.
 */

export function checkNodeVersion(
  version: string
): { ok: true } | { ok: false; message: string } {
  const [major, minor] = version.split(".").map(Number);
  if (major > 22 || (major === 22 && minor >= 16)) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      `ohno 1.0.0+ requires Node.js >= 22.16.0. You're on v${version}.\n` +
      `Either upgrade Node, or pin to @stevestomp/ohno-cli@^0.20 / @stevestomp/ohno-mcp@^0.20.`,
  };
}

export function runNodeGuard(): void {
  const result = checkNodeVersion(process.versions.node);
  if (!result.ok) {
    process.stderr.write(result.message + "\n");
    process.exit(1);
  }
}

// Self-execute so that a bare `import './node-guard.js'` runs the guard.
runNodeGuard();
