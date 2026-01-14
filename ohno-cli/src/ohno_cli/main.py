#!/usr/bin/env python3
"""
Ohno - Visual Kanban Board CLI

A standalone tool for visualizing and serving a kanban board from tasks.db.

Usage:
    ohno serve [--port 3333]    # HTTP server + watch + auto-sync
    ohno sync                   # One-time sync
    ohno status                 # Show project stats
    ohno init                   # Initialize .ohno/ folder

The tool watches tasks.db for changes and automatically regenerates kanban.html.
Skills and manual sqlite3 commands don't need to know about syncing - just modify
the database and the watcher handles the rest.

Installation:
    pip install git+https://github.com/srstomp/ohno.git#subdirectory=ohno-cli
"""

import argparse
import http.server
import json
import os
import signal
import socketserver
import sqlite3
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

__version__ = "1.1.0"

# ============================================================================
# Exit Codes (following sysexits.h conventions)
# ============================================================================

EXIT_SUCCESS = 0
EXIT_ERROR = 1
EXIT_USAGE = 2
EXIT_CONFIG = 3
EXIT_DATABASE = 4
EXIT_NETWORK = 5

# ============================================================================
# Configuration
# ============================================================================

DEFAULT_PORT = 3333
DEFAULT_HOST = "127.0.0.1"  # Security: localhost only by default
WATCH_INTERVAL = 1.0
OHNO_DIR = ".ohno"
DB_NAME = "tasks.db"
HTML_NAME = "kanban.html"


def get_env_int(name: str, default: int) -> int:
    """Get integer from environment variable."""
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def get_env_float(name: str, default: float) -> float:
    """Get float from environment variable."""
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def get_env_str(name: str, default: str) -> str:
    """Get string from environment variable."""
    return os.environ.get(name, default)


def get_env_bool(name: str, default: bool = False) -> bool:
    """Get boolean from environment variable."""
    value = os.environ.get(name, "").lower()
    if value in ("1", "true", "yes", "on"):
        return True
    if value in ("0", "false", "no", "off"):
        return False
    return default


# Environment variable configuration
ENV_PORT = get_env_int("OHNO_PORT", DEFAULT_PORT)
ENV_HOST = get_env_str("OHNO_HOST", DEFAULT_HOST)
ENV_DIR = os.environ.get("OHNO_DIR")
ENV_WATCH_INTERVAL = get_env_float("OHNO_WATCH_INTERVAL", WATCH_INTERVAL)
ENV_NO_COLOR = get_env_bool("OHNO_NO_COLOR") or get_env_bool("NO_COLOR")

# ============================================================================
# Output Helpers
# ============================================================================


class Output:
    """Handle output formatting with color and quiet mode support."""

    def __init__(self, quiet: bool = False, json_mode: bool = False, no_color: bool = False):
        self.quiet = quiet
        self.json_mode = json_mode
        self.no_color = no_color or ENV_NO_COLOR or not sys.stdout.isatty()

    def _color(self, text: str, code: str) -> str:
        """Apply ANSI color code."""
        if self.no_color:
            return text
        return f"\033[{code}m{text}\033[0m"

    def green(self, text: str) -> str:
        return self._color(text, "32")

    def yellow(self, text: str) -> str:
        return self._color(text, "33")

    def red(self, text: str) -> str:
        return self._color(text, "31")

    def blue(self, text: str) -> str:
        return self._color(text, "34")

    def dim(self, text: str) -> str:
        return self._color(text, "2")

    def info(self, message: str):
        """Print info message."""
        if not self.quiet and not self.json_mode:
            print(message)

    def success(self, message: str):
        """Print success message."""
        if not self.quiet and not self.json_mode:
            print(self.green(f"✓ {message}"))

    def warning(self, message: str):
        """Print warning message."""
        if not self.json_mode:
            print(self.yellow(f"⚠ {message}"), file=sys.stderr)

    def error(self, message: str, context: str = "", suggestions: list = None):
        """Print error message with context and suggestions."""
        if self.json_mode:
            error_obj = {"error": {"message": message}}
            if context:
                error_obj["error"]["context"] = context
            if suggestions:
                error_obj["error"]["suggestions"] = suggestions
            print(json.dumps(error_obj, indent=2), file=sys.stderr)
        else:
            print(self.red(f"\nError: {message}"), file=sys.stderr)
            if context:
                print(f"\n{self.dim('Context:')}", file=sys.stderr)
                for line in context.split("\n"):
                    print(f"  {line}", file=sys.stderr)
            if suggestions:
                print(f"\n{self.dim('Suggestions:')}", file=sys.stderr)
                for i, suggestion in enumerate(suggestions, 1):
                    print(f"  {i}. {suggestion}", file=sys.stderr)
            print(file=sys.stderr)

    def json_output(self, data: dict):
        """Print JSON output."""
        print(json.dumps(data, indent=2, default=str))


# Global output instance (will be configured per command)
out = Output()

# ============================================================================
# Database Operations
# ============================================================================


def find_ohno_dir(override_dir: Optional[str] = None) -> Path:
    """Find .ohno directory, with optional override."""
    # Priority 1: Explicit override
    if override_dir:
        path = Path(override_dir)
        if path.exists():
            return path
        # Maybe they specified the parent directory
        ohno_path = path / OHNO_DIR
        if ohno_path.exists():
            return ohno_path
        return path  # Return as-is, let caller handle missing

    # Priority 2: Environment variable
    if ENV_DIR:
        path = Path(ENV_DIR)
        if path.exists():
            return path
        ohno_path = path / OHNO_DIR
        if ohno_path.exists():
            return ohno_path
        return path

    # Priority 3: Walk up from current directory
    current = Path.cwd()
    while current != current.parent:
        ohno_dir = current / OHNO_DIR
        if ohno_dir.exists():
            return ohno_dir
        current = current.parent

    # Default to current directory's .ohno
    return Path.cwd() / OHNO_DIR


def get_db_path(ohno_dir: Path) -> Path:
    """Get path to tasks.db."""
    return ohno_dir / DB_NAME


def get_html_path(ohno_dir: Path) -> Path:
    """Get path to kanban.html."""
    return ohno_dir / HTML_NAME


def export_database(db_path: Path) -> Optional[dict]:
    """Export all tables from tasks.db to dict."""
    if not db_path.exists():
        return None

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row

        data = {
            "synced_at": datetime.now().isoformat(),
            "version": __version__,
            "projects": [],
            "epics": [],
            "stories": [],
            "tasks": [],
            "dependencies": [],
            "task_activity": [],
            "task_files": [],
            "task_dependencies": [],
        }

        # Export core tables
        for table in ["projects", "epics", "stories", "tasks", "dependencies"]:
            try:
                cursor = conn.execute(f"SELECT * FROM {table}")
                data[table] = [dict(row) for row in cursor.fetchall()]
            except sqlite3.OperationalError:
                pass  # Table doesn't exist yet

        # Export extended tables (Phase 3 support)
        for table in ["task_activity", "task_files", "task_dependencies"]:
            try:
                cursor = conn.execute(f"SELECT * FROM {table}")
                data[table] = [dict(row) for row in cursor.fetchall()]
            except sqlite3.OperationalError:
                pass  # Table doesn't exist yet

        conn.close()

        # Compute stats
        data["stats"] = compute_stats(data)

        return data
    except sqlite3.Error as e:
        out.error(
            f"Database error: {e}",
            f"Failed to read {db_path}",
            [
                "Check if the database is corrupted",
                "Ensure no other process has locked the file",
                "Try running 'sqlite3 tasks.db .tables' to verify",
            ],
        )
        return None


def compute_stats(data: dict) -> dict:
    """Compute summary statistics."""
    tasks = data.get("tasks", [])
    stories = data.get("stories", [])
    epics = data.get("epics", [])
    activity = data.get("task_activity", [])
    files = data.get("task_files", [])
    dependencies = data.get("task_dependencies", [])

    total = len(tasks)
    done = len([t for t in tasks if t.get("status") == "done"])
    blocked = len([t for t in tasks if t.get("status") == "blocked"])
    in_progress = len([t for t in tasks if t.get("status") == "in_progress"])
    review = len([t for t in tasks if t.get("status") == "review"])
    todo = total - done - blocked - in_progress - review

    # Compute estimated vs actual hours
    total_estimate = sum(t.get("estimate_hours") or 0 for t in tasks)
    total_actual = sum(t.get("actual_hours") or 0 for t in tasks)

    # Count tasks with descriptions/context
    tasks_with_details = len([t for t in tasks if t.get("description") or t.get("context_summary")])

    return {
        "total_tasks": total,
        "done_tasks": done,
        "blocked_tasks": blocked,
        "in_progress_tasks": in_progress,
        "review_tasks": review,
        "todo_tasks": todo,
        "completion_pct": round(100 * done / total, 1) if total > 0 else 0,
        "total_stories": len(stories),
        "done_stories": len([s for s in stories if s.get("status") == "done"]),
        "total_epics": len(epics),
        "p0_count": len([e for e in epics if e.get("priority") == "P0"]),
        "p1_count": len([e for e in epics if e.get("priority") == "P1"]),
        # Extended stats
        "total_estimate_hours": total_estimate,
        "total_actual_hours": total_actual,
        "tasks_with_details": tasks_with_details,
        "total_activity": len(activity),
        "total_files": len(files),
        "total_dependencies": len(dependencies),
    }


# ============================================================================
# HTML Generation
# ============================================================================

# The HTML template is loaded from a separate file or embedded here.
# Note: The template uses innerHTML for rendering but sanitizes all
# user-provided content through the esc() function which escapes HTML
# special characters. The data source is the user's own local SQLite database.
# This is the same sanitization approach used by the standalone kanban.py.

def get_kanban_html() -> str:
    """Return the kanban board HTML template."""
    # Import the template from the package or use embedded
    try:
        from importlib import resources
        template_path = resources.files("ohno_cli") / "template.html"
        if template_path.is_file():
            return template_path.read_text()
    except Exception:
        pass

    # Fallback: return embedded template
    return _get_embedded_template()


def _get_embedded_template() -> str:
    """Return the embedded HTML template."""
    # This is a minimal version - the full template is in template.html
    return '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ohno - Kanban Board</title>
    <script>window.KANBAN_DATA = {};</script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --bg-card: #334155;
            --text-primary: #f1f5f9;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --border: #475569;
            --blue: #3b82f6;
            --green: #22c55e;
            --yellow: #eab308;
            --red: #ef4444;
            --purple: #a855f7;
            --orange: #f97316;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .loading {
            text-align: center;
            color: var(--text-secondary);
        }
    </style>
</head>
<body>
    <div class="loading">
        <h2>Ohno Kanban Board</h2>
        <p>Loading...</p>
    </div>
</body>
</html>'''


def generate_html(data: dict) -> str:
    """Generate kanban.html with embedded data."""
    # Use the full template from kanban.py instead of minimal
    from . import _template
    template = _template.KANBAN_HTML_TEMPLATE
    json_str = json.dumps(data, default=str)
    return template.replace("window.KANBAN_DATA = {};", f"window.KANBAN_DATA = {json_str};")


# ============================================================================
# Sync Operations
# ============================================================================


def sync_once(db_path: Path, html_path: Path, quiet: bool = False) -> Optional[dict]:
    """Perform a single sync operation."""
    data = export_database(db_path)
    if data is None:
        return None

    html = generate_html(data)
    html_path.write_text(html)

    if not quiet:
        stats = data["stats"]
        out.success(f"Synced: {stats['done_tasks']}/{stats['total_tasks']} tasks ({stats['completion_pct']}%)")

    return data


# ============================================================================
# File Watcher
# ============================================================================


class DatabaseWatcher:
    """Watch tasks.db for changes and trigger sync."""

    def __init__(self, db_path: Path, html_path: Path, interval: float = WATCH_INTERVAL):
        self.db_path = db_path
        self.html_path = html_path
        self.interval = interval
        self.last_mtime = 0
        self.running = False

    def start(self):
        """Start watching in current thread."""
        self.running = True
        out.info(out.dim(f"Watching {self.db_path.name} for changes..."))

        # Initial sync
        if self.db_path.exists():
            self._sync()
            self.last_mtime = self.db_path.stat().st_mtime

        while self.running:
            try:
                if self.db_path.exists():
                    mtime = self.db_path.stat().st_mtime
                    if mtime > self.last_mtime:
                        self._sync()
                        self.last_mtime = mtime
                time.sleep(self.interval)
            except KeyboardInterrupt:
                break
            except Exception as e:
                out.warning(f"Watch error: {e}")
                time.sleep(self.interval)

        out.info("\nStopped watching")

    def stop(self):
        """Stop watching."""
        self.running = False

    def _sync(self):
        """Perform sync with timestamp."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        data = sync_once(self.db_path, self.html_path, quiet=True)
        if data:
            stats = data["stats"]
            out.info(out.dim(f"[{timestamp}]") + f" Synced: {stats['done_tasks']}/{stats['total_tasks']} ({stats['completion_pct']}%)")


# ============================================================================
# HTTP Server
# ============================================================================


class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP handler that suppresses request logging."""

    def log_message(self, format, *args):
        pass  # Suppress logging

    def end_headers(self):
        # Add cache-busting headers
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def start_server(host: str, port: int, directory: Path) -> socketserver.TCPServer:
    """Start HTTP server in background thread."""
    os.chdir(directory)

    handler = QuietHTTPHandler
    server = socketserver.TCPServer((host, port), handler)
    server.allow_reuse_address = True

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    return server


# ============================================================================
# Commands
# ============================================================================


def cmd_serve(args):
    """Start HTTP server + file watcher."""
    global out
    out = Output(quiet=args.quiet, json_mode=args.json, no_color=args.no_color)

    ohno_dir = find_ohno_dir(args.dir)
    db_path = get_db_path(ohno_dir)
    html_path = get_html_path(ohno_dir)

    # Use env vars as defaults, CLI args override
    port = args.port if args.port != DEFAULT_PORT else ENV_PORT
    if args.port != DEFAULT_PORT:
        port = args.port

    host = args.host if args.host != DEFAULT_HOST else ENV_HOST
    if args.host != DEFAULT_HOST:
        host = args.host

    interval = ENV_WATCH_INTERVAL

    if not ohno_dir.exists():
        out.error(
            f"{OHNO_DIR}/ folder not found",
            f"Searched from {Path.cwd()} upward",
            [
                f"Initialize with: ohno init",
                f"Or run prd-analyzer to create project structure",
                f"Or specify directory: ohno serve --dir /path/to/project",
            ],
        )
        sys.exit(EXIT_CONFIG)

    # Initial sync
    out.info("Syncing...")
    data = sync_once(db_path, html_path, quiet=True)

    if data:
        stats = data["stats"]
        out.info(f"Loaded {stats['total_tasks']} tasks ({stats['completion_pct']}% done)")

    # Start HTTP server
    try:
        server = start_server(host, port, ohno_dir)
        url = f"http://{host}:{port}/kanban.html"
        if host == "0.0.0.0":
            url = f"http://localhost:{port}/kanban.html"

        out.info("")
        out.info(out.blue("Ohno board ready!"))
        out.info(f"  URL: {url}")
        out.info(f"  Auto-refreshes when tasks.db changes")
        out.info(f"  Press Ctrl+C to stop")
        out.info("")

    except OSError as e:
        if "Address already in use" in str(e) or "address already in use" in str(e).lower():
            out.error(
                f"Port {port} is already in use",
                "Another process is using this port",
                [
                    f"Use a different port: ohno serve --port {port + 1}",
                    f"Find the process: lsof -i :{port}",
                    f"Kill it: kill <PID>",
                ],
            )
            sys.exit(EXIT_NETWORK)
        else:
            out.error(f"Server error: {e}")
            sys.exit(EXIT_NETWORK)

    # Start watcher (blocks)
    watcher = DatabaseWatcher(db_path, html_path, interval)

    def signal_handler(sig, frame):
        out.info("\n\nShutting down...")
        watcher.stop()
        server.shutdown()
        sys.exit(EXIT_SUCCESS)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    watcher.start()


def cmd_sync(args):
    """One-time sync."""
    global out
    out = Output(quiet=args.quiet, json_mode=args.json, no_color=args.no_color)

    ohno_dir = find_ohno_dir(args.dir)
    db_path = get_db_path(ohno_dir)
    html_path = get_html_path(ohno_dir)

    if not db_path.exists():
        out.error(
            f"Database not found: {db_path}",
            "No tasks.db file exists in the project",
            [
                "Run prd-analyzer to create tasks",
                "Initialize with: ohno init",
                f"Or specify directory: ohno sync --dir /path/to/project",
            ],
        )
        sys.exit(EXIT_DATABASE)

    out.info("Syncing kanban board...")
    data = sync_once(db_path, html_path, quiet=args.quiet)

    if data:
        if args.json:
            out.json_output({"status": "synced", "output": str(html_path), "stats": data["stats"]})
        else:
            out.info(f"Output: {html_path}")
        sys.exit(EXIT_SUCCESS)
    else:
        sys.exit(EXIT_DATABASE)


def cmd_status(args):
    """Show project status."""
    global out
    out = Output(quiet=args.quiet, json_mode=args.json, no_color=args.no_color)

    ohno_dir = find_ohno_dir(args.dir)
    db_path = get_db_path(ohno_dir)

    if not db_path.exists():
        out.error(
            f"Database not found: {db_path}",
            "No tasks.db file exists in the project",
            [
                "Run prd-analyzer to create tasks",
                "Initialize with: ohno init",
                f"Or specify directory: ohno status --dir /path/to/project",
            ],
        )
        sys.exit(EXIT_DATABASE)

    data = export_database(db_path)
    if data is None:
        sys.exit(EXIT_DATABASE)

    stats = data["stats"]

    if args.json:
        out.json_output(
            {
                "project": data["projects"][0].get("name", "Unknown") if data["projects"] else None,
                "stats": stats,
                "synced_at": data["synced_at"],
            }
        )
        sys.exit(EXIT_SUCCESS)

    # Human-readable output
    print()
    print(out.blue("PROJECT STATUS"))
    print("=" * 40)

    if data["projects"]:
        print(f"Project: {data['projects'][0].get('name', 'Unknown')}")

    print()
    print("Tasks")
    print(f"  Total:       {stats['total_tasks']}")
    print(f"  {out.green('Done:')}        {stats['done_tasks']} ({stats['completion_pct']}%)")
    print(f"  {out.blue('In Progress:')} {stats['in_progress_tasks']}")
    print(f"  Review:      {stats['review_tasks']}")
    print(f"  {out.red('Blocked:')}     {stats['blocked_tasks']}")
    print(f"  To Do:       {stats['todo_tasks']}")

    print()
    print("Epics")
    print(f"  Total: {stats['total_epics']}")
    print(f"  P0:    {stats['p0_count']}")
    print(f"  P1:    {stats['p1_count']}")

    print()
    print("Stories")
    print(f"  Total: {stats['total_stories']}")
    print(f"  Done:  {stats['done_stories']}")
    print()


def cmd_init(args):
    """Initialize .ohno/ folder structure."""
    global out
    out = Output(quiet=args.quiet, json_mode=args.json, no_color=args.no_color)

    ohno_dir = Path.cwd() / OHNO_DIR

    if ohno_dir.exists() and not args.force:
        out.warning(f"{OHNO_DIR}/ already exists (use --force to overwrite)")
        if args.json:
            out.json_output({"status": "exists", "path": str(ohno_dir)})
        sys.exit(EXIT_SUCCESS)

    # Create directories
    ohno_dir.mkdir(exist_ok=True)
    (ohno_dir / "sessions").mkdir(exist_ok=True)
    (ohno_dir / "checkpoints").mkdir(exist_ok=True)

    # Create empty kanban.html
    html_path = ohno_dir / HTML_NAME
    data = {
        "synced_at": datetime.now().isoformat(),
        "version": __version__,
        "projects": [],
        "epics": [],
        "stories": [],
        "tasks": [],
        "stats": compute_stats({"tasks": [], "stories": [], "epics": []}),
    }
    html_path.write_text(generate_html(data))

    if args.json:
        out.json_output({"status": "created", "path": str(ohno_dir)})
    else:
        out.success(f"Created {OHNO_DIR}/ folder")
        out.info(f"  {OHNO_DIR}/")
        out.info(f"  ├── sessions/")
        out.info(f"  ├── checkpoints/")
        out.info(f"  └── kanban.html")
        out.info("")
        out.info("Run prd-analyzer to create tasks.db")


def cmd_version(args):
    """Show version information."""
    if args.json:
        print(json.dumps({"version": __version__, "python": sys.version.split()[0]}))
    else:
        print(f"ohno {__version__}")
        print(f"Python {sys.version.split()[0]}")


# ============================================================================
# Main
# ============================================================================


def main():
    parser = argparse.ArgumentParser(
        description="Ohno - Visual kanban board for task management",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ohno serve              Start server + watcher
  ohno serve --port 8080  Use custom port
  ohno sync               One-time sync
  ohno status             Show project stats
  ohno status --json      Machine-readable output
  ohno init               Initialize .ohno/ folder

Environment Variables:
  OHNO_PORT               Default port (default: 3333)
  OHNO_HOST               Default host (default: 127.0.0.1)
  OHNO_DIR                Override project directory
  OHNO_NO_COLOR           Disable colored output
        """,
    )

    parser.add_argument("--version", "-V", action="store_true", help="Show version")

    # Global flags
    parser.add_argument("--quiet", "-q", action="store_true", help="Suppress non-error output")
    parser.add_argument("--json", "-j", action="store_true", help="Output in JSON format")
    parser.add_argument("--no-color", action="store_true", help="Disable colored output")
    parser.add_argument("--dir", "-d", type=str, help="Project directory (overrides auto-detection)")

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # serve
    serve_parser = subparsers.add_parser("serve", help="Start HTTP server + file watcher")
    serve_parser.add_argument(
        "--port", "-p", type=int, default=DEFAULT_PORT, help=f"Port (default: {DEFAULT_PORT})"
    )
    serve_parser.add_argument(
        "--host", "-H", type=str, default=DEFAULT_HOST, help=f"Host to bind (default: {DEFAULT_HOST})"
    )

    # sync
    sync_parser = subparsers.add_parser("sync", help="One-time sync of kanban.html")
    sync_parser.add_argument("--json", "-j", action="store_true", help="Output as JSON")
    sync_parser.add_argument("--quiet", "-q", action="store_true", help="Suppress output")

    # status
    status_parser = subparsers.add_parser("status", help="Show project status")
    status_parser.add_argument("--json", "-j", action="store_true", help="Output as JSON")

    # init
    init_parser = subparsers.add_parser("init", help="Initialize .ohno/ folder")
    init_parser.add_argument("--force", "-f", action="store_true", help="Overwrite existing folder")

    # version (also available as --version)
    version_parser = subparsers.add_parser("version", help="Show version information")
    version_parser.add_argument("--json", "-j", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    # Handle --version flag
    if args.version:
        cmd_version(args)
        sys.exit(EXIT_SUCCESS)

    # Route to command
    if args.command == "serve":
        cmd_serve(args)
    elif args.command == "sync":
        cmd_sync(args)
    elif args.command == "status":
        cmd_status(args)
    elif args.command == "init":
        cmd_init(args)
    elif args.command == "version":
        cmd_version(args)
    else:
        # Default to serve if no command specified
        # Need to add serve-specific defaults
        args.port = DEFAULT_PORT
        args.host = DEFAULT_HOST
        cmd_serve(args)


if __name__ == "__main__":
    main()
