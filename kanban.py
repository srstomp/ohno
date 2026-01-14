#!/usr/bin/env python3
"""
Kanban Board CLI Tool

A standalone tool for visualizing and serving a kanban board from tasks.db.

Usage:
    kanban serve [--port 3333]    # HTTP server + watch + auto-sync
    kanban sync                   # One-time sync
    kanban status                 # Show project stats
    kanban init                   # Initialize .claude/ folder

The tool watches tasks.db for changes and automatically regenerates kanban.html.
Skills and manual sqlite3 commands don't need to know about syncing - just modify
the database and the watcher handles the rest.

Installation:
    pipx install kanban-cli
    # or copy this file anywhere and run with python
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

__version__ = "1.0.0"

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
CLAUDE_DIR = ".claude"
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
ENV_PORT = get_env_int("KANBAN_PORT", DEFAULT_PORT)
ENV_HOST = get_env_str("KANBAN_HOST", DEFAULT_HOST)
ENV_DIR = os.environ.get("KANBAN_DIR")
ENV_WATCH_INTERVAL = get_env_float("KANBAN_WATCH_INTERVAL", WATCH_INTERVAL)
ENV_NO_COLOR = get_env_bool("KANBAN_NO_COLOR") or get_env_bool("NO_COLOR")

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


def find_claude_dir(override_dir: Optional[str] = None) -> Path:
    """Find .claude directory, with optional override."""
    # Priority 1: Explicit override
    if override_dir:
        path = Path(override_dir)
        if path.exists():
            return path
        # Maybe they specified the parent directory
        claude_path = path / CLAUDE_DIR
        if claude_path.exists():
            return claude_path
        return path  # Return as-is, let caller handle missing

    # Priority 2: Environment variable
    if ENV_DIR:
        path = Path(ENV_DIR)
        if path.exists():
            return path
        claude_path = path / CLAUDE_DIR
        if claude_path.exists():
            return claude_path
        return path

    # Priority 3: Walk up from current directory
    current = Path.cwd()
    while current != current.parent:
        claude_dir = current / CLAUDE_DIR
        if claude_dir.exists():
            return claude_dir
        current = current.parent

    # Default to current directory's .claude
    return Path.cwd() / CLAUDE_DIR


def get_db_path(claude_dir: Path) -> Path:
    """Get path to tasks.db."""
    return claude_dir / DB_NAME


def get_html_path(claude_dir: Path) -> Path:
    """Get path to kanban.html."""
    return claude_dir / HTML_NAME


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
        }

        # Export each table
        for table in ["projects", "epics", "stories", "tasks", "dependencies"]:
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

    total = len(tasks)
    done = len([t for t in tasks if t.get("status") == "done"])
    blocked = len([t for t in tasks if t.get("status") == "blocked"])
    in_progress = len([t for t in tasks if t.get("status") == "in_progress"])
    review = len([t for t in tasks if t.get("status") == "review"])
    todo = total - done - blocked - in_progress - review

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
    }


# ============================================================================
# HTML Generation
# ============================================================================

# Note: The HTML template uses innerHTML for rendering but sanitizes all
# user-provided content through the esc() function which escapes < and >
# characters. The data source is the user's own local SQLite database.

KANBAN_HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kanban Board</title>
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
        }

        .header {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            padding: 1rem 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .header h1 { font-size: 1.25rem; font-weight: 600; }

        .sync-status {
            font-size: 0.75rem;
            color: var(--text-muted);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .sync-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--green);
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .stats {
            display: flex;
            gap: 1.5rem;
            font-size: 0.875rem;
        }

        .stat-value { font-weight: 600; }
        .stat-label { color: var(--text-secondary); margin-left: 0.25rem; }

        .progress-bar-container {
            background: var(--bg-secondary);
            padding: 0.5rem 1.5rem;
            border-bottom: 1px solid var(--border);
        }

        .progress-bar {
            height: 6px;
            background: var(--bg-card);
            border-radius: 3px;
            overflow: hidden;
            display: flex;
        }

        .progress-done { background: var(--green); }
        .progress-review { background: var(--purple); }
        .progress-in-progress { background: var(--blue); }
        .progress-blocked { background: var(--red); }

        .filters {
            background: var(--bg-secondary);
            padding: 0.5rem 1.5rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
        }

        .filter-group {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .filter-label {
            font-size: 0.7rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .filter-select {
            background: var(--bg-card);
            border: 1px solid var(--border);
            color: var(--text-primary);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
        }

        .board {
            display: flex;
            gap: 1rem;
            padding: 1rem 1.5rem;
            overflow-x: auto;
            min-height: calc(100vh - 140px);
        }

        .column {
            min-width: 280px;
            max-width: 280px;
            background: var(--bg-secondary);
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            max-height: calc(100vh - 160px);
        }

        .column-header {
            padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }

        .column-todo .column-header { border-left: 3px solid var(--text-muted); }
        .column-in_progress .column-header { border-left: 3px solid var(--blue); }
        .column-review .column-header { border-left: 3px solid var(--purple); }
        .column-done .column-header { border-left: 3px solid var(--green); }
        .column-blocked .column-header { border-left: 3px solid var(--red); }

        .column-title { font-weight: 600; font-size: 0.875rem; }

        .column-count {
            background: var(--bg-card);
            padding: 0.125rem 0.5rem;
            border-radius: 10px;
            font-size: 0.75rem;
            color: var(--text-secondary);
        }

        .column-cards {
            padding: 0.5rem;
            overflow-y: auto;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .card {
            background: var(--bg-card);
            border-radius: 6px;
            padding: 0.75rem;
            cursor: default;
            transition: transform 0.1s, box-shadow 0.1s;
        }

        .card:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 0.375rem;
        }

        .card-id {
            font-size: 0.7rem;
            color: var(--text-muted);
            font-family: monospace;
        }

        .card-priority {
            font-size: 0.6rem;
            padding: 0.1rem 0.3rem;
            border-radius: 3px;
            font-weight: 600;
        }

        .priority-P0 { background: var(--red); color: white; }
        .priority-P1 { background: var(--orange); color: white; }
        .priority-P2 { background: var(--yellow); color: black; }
        .priority-P3 { background: var(--text-muted); color: white; }

        .card-title {
            font-size: 0.8rem;
            font-weight: 500;
            line-height: 1.3;
            margin-bottom: 0.375rem;
        }

        .card-meta {
            display: flex;
            justify-content: space-between;
            font-size: 0.7rem;
            color: var(--text-muted);
        }

        .card-type {
            background: var(--bg-secondary);
            padding: 0.1rem 0.3rem;
            border-radius: 3px;
        }

        .card-epic {
            font-size: 0.65rem;
            color: var(--blue);
            margin-top: 0.375rem;
            padding-top: 0.375rem;
            border-top: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 0.25rem;
        }

        .audit-badge {
            font-size: 0.6rem;
            padding: 0.1rem 0.3rem;
            border-radius: 3px;
            font-weight: 600;
        }

        .audit-0 { background: #6b7280; color: white; }
        .audit-1 { background: #ef4444; color: white; }
        .audit-2 { background: #f97316; color: white; }
        .audit-3 { background: #eab308; color: black; }
        .audit-4 { background: #22c55e; color: white; }
        .audit-5 { background: #3b82f6; color: white; }

        .empty { text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.8rem; }

        .no-data {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: calc(100vh - 80px);
            color: var(--text-secondary);
            text-align: center;
            padding: 2rem;
        }

        .no-data code {
            background: var(--bg-card);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.875rem;
        }
    </style>
</head>
<body>
    <div id="app"><div class="no-data">Loading...</div></div>
    <script>
        // Kanban board rendering script
        // Data is sanitized server-side before embedding, and the esc() function
        // provides additional client-side escaping for any dynamic content.

        const REFRESH_INTERVAL = 3000;
        const COLUMNS = [
            { id: 'todo', title: 'To Do', status: 'todo' },
            { id: 'in_progress', title: 'In Progress', status: 'in_progress' },
            { id: 'review', title: 'Review', status: 'review' },
            { id: 'done', title: 'Done', status: 'done' },
            { id: 'blocked', title: 'Blocked', status: 'blocked' },
        ];

        let data = window.KANBAN_DATA || {};
        let lastSync = data.synced_at;
        let filters = { epic: '', priority: '', type: '' };

        function init() {
            if (data.tasks && data.tasks.length) render();
            else renderNoData();
            setInterval(checkUpdates, REFRESH_INTERVAL);
        }

        async function checkUpdates() {
            try {
                const r = await fetch('kanban.html?_=' + Date.now());
                const t = await r.text();
                const m = t.match(/"synced_at":\\s*"([^"]+)"/);
                if (m && m[1] !== lastSync) location.reload();
            } catch(e) { /* ignore fetch errors */ }
        }

        function render() {
            const s = data.stats || {};
            const total = s.total_tasks || 1;
            const app = document.getElementById('app');

            // Build HTML with escaped content
            let html = '<header class="header">';
            html += '<div style="display:flex;align-items:center;gap:1rem">';
            html += '<h1>' + esc(data.projects && data.projects[0] ? data.projects[0].name : 'Kanban') + '</h1>';
            html += '<div class="sync-status">';
            html += '<span class="sync-dot"></span>';
            html += '<span>' + new Date(data.synced_at).toLocaleTimeString() + '</span>';
            html += '</div></div>';
            html += '<div class="stats">';
            html += '<div><span class="stat-value">' + s.done_tasks + '/' + s.total_tasks + '</span><span class="stat-label">tasks</span></div>';
            html += '<div><span class="stat-value">' + s.completion_pct + '%</span><span class="stat-label">done</span></div>';
            html += '<div><span class="stat-value">' + s.in_progress_tasks + '</span><span class="stat-label">active</span></div>';
            html += '<div><span class="stat-value">' + s.blocked_tasks + '</span><span class="stat-label">blocked</span></div>';
            html += '</div></header>';

            html += '<div class="progress-bar-container"><div class="progress-bar">';
            html += '<div class="progress-done" style="width:' + (s.done_tasks/total*100) + '%"></div>';
            html += '<div class="progress-review" style="width:' + (s.review_tasks/total*100) + '%"></div>';
            html += '<div class="progress-in-progress" style="width:' + (s.in_progress_tasks/total*100) + '%"></div>';
            html += '<div class="progress-blocked" style="width:' + (s.blocked_tasks/total*100) + '%"></div>';
            html += '</div></div>';

            html += '<div class="filters">';
            html += '<div class="filter-group"><span class="filter-label">Epic</span>';
            html += '<select class="filter-select" onchange="setFilter(\\'epic\\',this.value)">';
            html += '<option value="">All</option>';
            (data.epics||[]).forEach(function(e) {
                html += '<option value="' + esc(e.id) + '">' + esc(e.title) + '</option>';
            });
            html += '</select></div>';
            html += '<div class="filter-group"><span class="filter-label">Priority</span>';
            html += '<select class="filter-select" onchange="setFilter(\\'priority\\',this.value)">';
            html += '<option value="">All</option><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option>';
            html += '</select></div>';
            html += '<div class="filter-group"><span class="filter-label">Type</span>';
            html += '<select class="filter-select" onchange="setFilter(\\'type\\',this.value)">';
            html += '<option value="">All</option>';
            var types = {};
            (data.tasks||[]).forEach(function(t) { if (t.task_type) types[t.task_type] = true; });
            Object.keys(types).forEach(function(t) {
                html += '<option value="' + esc(t) + '">' + esc(t) + '</option>';
            });
            html += '</select></div></div>';

            html += '<div class="board">';
            COLUMNS.forEach(function(col) {
                html += renderColumn(col);
            });
            html += '</div>';

            app.innerHTML = html;
        }

        function renderColumn(col) {
            var tasks = getFilteredTasks().filter(function(t) { return t.status === col.status; });
            var html = '<div class="column column-' + col.id + '">';
            html += '<div class="column-header">';
            html += '<span class="column-title">' + esc(col.title) + '</span>';
            html += '<span class="column-count">' + tasks.length + '</span>';
            html += '</div><div class="column-cards">';
            if (tasks.length) {
                tasks.forEach(function(task) {
                    html += renderCard(task);
                });
            } else {
                html += '<div class="empty">No tasks</div>';
            }
            html += '</div></div>';
            return html;
        }

        function renderCard(task) {
            var story = (data.stories||[]).find(function(s) { return s.id === task.story_id; }) || {};
            var epic = (data.epics||[]).find(function(e) { return e.id === story.epic_id; }) || {};
            var html = '<div class="card">';
            html += '<div class="card-header">';
            html += '<span class="card-id">' + esc(task.id) + '</span>';
            if (epic.priority) {
                html += '<span class="card-priority priority-' + esc(epic.priority) + '">' + esc(epic.priority) + '</span>';
            }
            html += '</div>';
            html += '<div class="card-title">' + esc(task.title) + '</div>';
            html += '<div class="card-meta">';
            if (task.task_type) {
                html += '<span class="card-type">' + esc(task.task_type) + '</span>';
            } else {
                html += '<span></span>';
            }
            if (task.estimate_hours) {
                html += '<span>' + task.estimate_hours + 'h</span>';
            }
            html += '</div>';
            if (epic.title) {
                html += '<div class="card-epic">' + esc(epic.title);
                if (epic.audit_level != null) {
                    html += '<span class="audit-badge audit-' + epic.audit_level + '">L' + epic.audit_level + '</span>';
                }
                html += '</div>';
            }
            html += '</div>';
            return html;
        }

        function getFilteredTasks() {
            var tasks = data.tasks || [];
            var storyEpic = {};
            (data.stories||[]).forEach(function(s) { storyEpic[s.id] = s.epic_id; });
            var epicPri = {};
            (data.epics||[]).forEach(function(e) { epicPri[e.id] = e.priority; });

            if (filters.epic) {
                var storyIds = {};
                (data.stories||[]).forEach(function(s) {
                    if (s.epic_id === filters.epic) storyIds[s.id] = true;
                });
                tasks = tasks.filter(function(t) { return storyIds[t.story_id]; });
            }
            if (filters.priority) {
                tasks = tasks.filter(function(t) {
                    return epicPri[storyEpic[t.story_id]] === filters.priority;
                });
            }
            if (filters.type) {
                tasks = tasks.filter(function(t) { return t.task_type === filters.type; });
            }
            return tasks;
        }

        function setFilter(key, val) {
            filters[key] = val;
            render();
        }

        // Escape HTML special characters to prevent XSS
        function esc(s) {
            if (s == null) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function renderNoData() {
            var app = document.getElementById('app');
            app.innerHTML = '<header class="header"><h1>Kanban Board</h1></header>' +
                '<div class="no-data">' +
                '<h2 style="margin-bottom:1rem">No Data</h2>' +
                '<p>Run <code>prd-analyzer</code> to create tasks<br>or ensure <code>.claude/tasks.db</code> exists</p>' +
                '<p style="margin-top:1rem;font-size:0.8rem;color:var(--text-muted)">Auto-refreshing...</p>' +
                '</div>';
        }

        document.addEventListener('DOMContentLoaded', init);
    </script>
</body>
</html>'''


def get_kanban_html() -> str:
    """Return the kanban board HTML template."""
    return KANBAN_HTML_TEMPLATE


def generate_html(data: dict) -> str:
    """Generate kanban.html with embedded data."""
    template = get_kanban_html()
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

    claude_dir = find_claude_dir(args.dir)
    db_path = get_db_path(claude_dir)
    html_path = get_html_path(claude_dir)

    # Use env vars as defaults, CLI args override
    port = args.port if args.port != DEFAULT_PORT else ENV_PORT
    if args.port != DEFAULT_PORT:
        port = args.port

    host = args.host if args.host != DEFAULT_HOST else ENV_HOST
    if args.host != DEFAULT_HOST:
        host = args.host

    interval = ENV_WATCH_INTERVAL

    if not claude_dir.exists():
        out.error(
            f"{CLAUDE_DIR}/ folder not found",
            f"Searched from {Path.cwd()} upward",
            [
                f"Initialize with: kanban init",
                f"Or run prd-analyzer to create project structure",
                f"Or specify directory: kanban serve --dir /path/to/project",
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
        server = start_server(host, port, claude_dir)
        url = f"http://{host}:{port}/kanban.html"
        if host == "0.0.0.0":
            url = f"http://localhost:{port}/kanban.html"

        out.info("")
        out.info(out.blue("Kanban board ready!"))
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
                    f"Use a different port: kanban serve --port {port + 1}",
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

    claude_dir = find_claude_dir(args.dir)
    db_path = get_db_path(claude_dir)
    html_path = get_html_path(claude_dir)

    if not db_path.exists():
        out.error(
            f"Database not found: {db_path}",
            "No tasks.db file exists in the project",
            [
                "Run prd-analyzer to create tasks",
                "Initialize with: kanban init",
                f"Or specify directory: kanban sync --dir /path/to/project",
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

    claude_dir = find_claude_dir(args.dir)
    db_path = get_db_path(claude_dir)

    if not db_path.exists():
        out.error(
            f"Database not found: {db_path}",
            "No tasks.db file exists in the project",
            [
                "Run prd-analyzer to create tasks",
                "Initialize with: kanban init",
                f"Or specify directory: kanban status --dir /path/to/project",
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
    """Initialize .claude/ folder structure."""
    global out
    out = Output(quiet=args.quiet, json_mode=args.json, no_color=args.no_color)

    claude_dir = Path.cwd() / CLAUDE_DIR

    if claude_dir.exists() and not args.force:
        out.warning(f"{CLAUDE_DIR}/ already exists (use --force to overwrite)")
        if args.json:
            out.json_output({"status": "exists", "path": str(claude_dir)})
        sys.exit(EXIT_SUCCESS)

    # Create directories
    claude_dir.mkdir(exist_ok=True)
    (claude_dir / "sessions").mkdir(exist_ok=True)
    (claude_dir / "checkpoints").mkdir(exist_ok=True)

    # Create empty kanban.html
    html_path = claude_dir / HTML_NAME
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
        out.json_output({"status": "created", "path": str(claude_dir)})
    else:
        out.success(f"Created {CLAUDE_DIR}/ folder")
        out.info(f"  {CLAUDE_DIR}/")
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
        print(f"kanban {__version__}")
        print(f"Python {sys.version.split()[0]}")


# ============================================================================
# Main
# ============================================================================


def main():
    parser = argparse.ArgumentParser(
        description="Kanban board CLI - visualize and serve tasks.db",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  kanban serve              Start server + watcher
  kanban serve --port 8080  Use custom port
  kanban sync               One-time sync
  kanban status             Show project stats
  kanban status --json      Machine-readable output
  kanban init               Initialize .claude/ folder

Environment Variables:
  KANBAN_PORT               Default port (default: 3333)
  KANBAN_HOST               Default host (default: 127.0.0.1)
  KANBAN_DIR                Override project directory
  KANBAN_NO_COLOR           Disable colored output
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
    init_parser = subparsers.add_parser("init", help="Initialize .claude/ folder")
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
