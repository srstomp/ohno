#!/usr/bin/env python3
"""
Kanban Board CLI Tool

A standalone tool for visualizing and serving a kanban board from tasks.db.

Usage:
    kanban serve [--port 3333]    # HTTP server + watch + auto-sync
    kanban sync                   # One-time sync
    kanban status                 # Show project stats
    kanban init                   # Initialize .ohno/ folder

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
    """Find .ohno directory, with optional override."""
    # Priority 1: Explicit override
    if override_dir:
        path = Path(override_dir)
        if path.exists():
            return path
        # Maybe they specified the parent directory
        claude_path = path / OHNO_DIR
        if claude_path.exists():
            return claude_path
        return path  # Return as-is, let caller handle missing

    # Priority 2: Environment variable
    if ENV_DIR:
        path = Path(ENV_DIR)
        if path.exists():
            return path
        claude_path = path / OHNO_DIR
        if claude_path.exists():
            return claude_path
        return path

    # Priority 3: Walk up from current directory
    current = Path.cwd()
    while current != current.parent:
        claude_dir = current / OHNO_DIR
        if claude_dir.exists():
            return claude_dir
        current = current.parent

    # Default to current directory's .claude
    return Path.cwd() / OHNO_DIR


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

        /* Detail Panel Slide-out */
        .detail-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.2s, visibility 0.2s;
            z-index: 200;
        }

        .detail-backdrop.open {
            opacity: 1;
            visibility: visible;
        }

        .detail-panel {
            position: fixed;
            top: 0;
            right: -600px;
            width: 600px;
            max-width: 100vw;
            height: 100vh;
            background: var(--bg-secondary);
            border-left: 1px solid var(--border);
            overflow-y: auto;
            transition: right 0.3s ease-out;
            z-index: 201;
        }

        .detail-panel.open {
            right: 0;
        }

        .detail-header {
            padding: 1.25rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            position: sticky;
            top: 0;
            background: var(--bg-secondary);
            z-index: 1;
        }

        .detail-header-left {
            flex: 1;
            min-width: 0;
        }

        .detail-id {
            font-size: 0.75rem;
            color: var(--text-muted);
            font-family: monospace;
            margin-bottom: 0.5rem;
        }

        .detail-title {
            font-size: 1.125rem;
            font-weight: 600;
            line-height: 1.3;
            margin-bottom: 0.75rem;
        }

        .detail-badges {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        .detail-badge {
            font-size: 0.7rem;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-weight: 500;
        }

        .detail-close {
            background: var(--bg-card);
            border: 1px solid var(--border);
            color: var(--text-secondary);
            width: 32px;
            height: 32px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            flex-shrink: 0;
            margin-left: 1rem;
        }

        .detail-close:hover {
            background: var(--bg-primary);
            color: var(--text-primary);
        }

        .detail-section {
            padding: 1rem 1.25rem;
            border-bottom: 1px solid var(--border);
        }

        .detail-section:last-child {
            border-bottom: none;
        }

        .detail-section-title {
            font-size: 0.7rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.75rem;
            font-weight: 600;
        }

        .detail-description {
            font-size: 0.875rem;
            line-height: 1.6;
            color: var(--text-primary);
            white-space: pre-wrap;
        }

        .detail-context {
            font-size: 0.8rem;
            line-height: 1.5;
            color: var(--text-secondary);
            background: var(--bg-card);
            padding: 0.75rem;
            border-radius: 6px;
            white-space: pre-wrap;
        }

        .detail-files {
            display: flex;
            flex-direction: column;
            gap: 0.375rem;
        }

        .detail-file {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem;
            background: var(--bg-card);
            border-radius: 4px;
            font-size: 0.8rem;
            cursor: pointer;
            transition: background 0.1s;
        }

        .detail-file:hover {
            background: var(--bg-primary);
        }

        .detail-file-icon {
            color: var(--text-muted);
        }

        .detail-file-path {
            font-family: monospace;
            color: var(--blue);
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .detail-file-copy {
            color: var(--text-muted);
            font-size: 0.7rem;
            opacity: 0;
            transition: opacity 0.1s;
        }

        .detail-file:hover .detail-file-copy {
            opacity: 1;
        }

        .detail-deps {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .detail-dep {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem;
            background: var(--bg-card);
            border-radius: 4px;
            font-size: 0.8rem;
        }

        .detail-dep-type {
            color: var(--text-muted);
            font-size: 0.7rem;
            text-transform: uppercase;
        }

        .detail-dep-id {
            font-family: monospace;
            color: var(--purple);
            cursor: pointer;
        }

        .detail-dep-id:hover {
            text-decoration: underline;
        }

        .detail-dep-status {
            font-size: 0.65rem;
            padding: 0.1rem 0.3rem;
            border-radius: 3px;
            margin-left: auto;
        }

        .detail-dep-status.done { background: var(--green); color: white; }
        .detail-dep-status.blocked { background: var(--red); color: white; }
        .detail-dep-status.in_progress { background: var(--blue); color: white; }

        .detail-activity {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .activity-item {
            display: flex;
            gap: 0.75rem;
            font-size: 0.8rem;
        }

        .activity-icon {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: var(--bg-card);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 0.7rem;
        }

        .activity-icon.status { background: var(--blue); color: white; }
        .activity-icon.note { background: var(--purple); color: white; }
        .activity-icon.file { background: var(--green); color: white; }

        .activity-content {
            flex: 1;
            min-width: 0;
        }

        .activity-text {
            color: var(--text-primary);
            margin-bottom: 0.25rem;
        }

        .activity-time {
            font-size: 0.7rem;
            color: var(--text-muted);
        }

        .activity-actor {
            color: var(--blue);
            font-weight: 500;
        }

        .detail-meta {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.75rem;
        }

        .meta-item {
            background: var(--bg-card);
            padding: 0.625rem;
            border-radius: 4px;
        }

        .meta-label {
            font-size: 0.65rem;
            color: var(--text-muted);
            text-transform: uppercase;
            margin-bottom: 0.25rem;
        }

        .meta-value {
            font-size: 0.875rem;
            color: var(--text-primary);
        }

        .detail-blockers {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid var(--red);
            padding: 0.75rem;
            border-radius: 6px;
            color: var(--red);
            font-size: 0.875rem;
            line-height: 1.5;
            white-space: pre-wrap;
        }

        .detail-handoff {
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid var(--blue);
            padding: 0.75rem;
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 0.875rem;
            line-height: 1.5;
            white-space: pre-wrap;
        }

        .detail-progress {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .detail-progress-bar {
            flex: 1;
            height: 8px;
            background: var(--bg-card);
            border-radius: 4px;
            overflow: hidden;
        }

        .detail-progress-fill {
            height: 100%;
            background: var(--green);
            border-radius: 4px;
            transition: width 0.3s;
        }

        .detail-progress-text {
            font-size: 0.875rem;
            font-weight: 600;
            min-width: 40px;
            text-align: right;
        }

        .empty-state {
            text-align: center;
            padding: 1rem;
            color: var(--text-muted);
            font-size: 0.8rem;
            font-style: italic;
        }

        /* Card clickable */
        .card.clickable {
            cursor: pointer;
        }

        .card.clickable:active {
            transform: scale(0.98);
        }

        /* Toast notification for copy */
        .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: var(--bg-card);
            border: 1px solid var(--border);
            padding: 0.75rem 1.25rem;
            border-radius: 6px;
            font-size: 0.875rem;
            color: var(--text-primary);
            opacity: 0;
            transition: transform 0.3s, opacity 0.3s;
            z-index: 300;
        }

        .toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
    </style>
</head>
<body>
    <div id="app"><div class="no-data">Loading...</div></div>
    <div class="detail-backdrop" id="detailBackdrop" onclick="closeDetail()"></div>
    <div class="detail-panel" id="detailPanel"></div>
    <div class="toast" id="toast"></div>
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
            var hasDetails = task.description || task.context_summary || task.blockers || task.handoff_notes;
            var html = '<div class="card clickable" onclick="openDetail(\\'' + esc(task.id) + '\\')">';
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
            var metaRight = '';
            if (task.progress_percent != null && task.progress_percent > 0) {
                metaRight += '<span style="color:var(--green)">' + task.progress_percent + '%</span> ';
            }
            if (task.estimate_hours) {
                metaRight += '<span>' + task.estimate_hours + 'h</span>';
            }
            html += metaRight || '<span></span>';
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
                '<p>Run <code>prd-analyzer</code> to create tasks<br>or ensure <code>.ohno/tasks.db</code> exists</p>' +
                '<p style="margin-top:1rem;font-size:0.8rem;color:var(--text-muted)">Auto-refreshing...</p>' +
                '</div>';
        }

        // Detail panel functions
        var currentTaskId = null;

        function openDetail(taskId) {
            currentTaskId = taskId;
            var task = (data.tasks||[]).find(function(t) { return t.id === taskId; });
            if (!task) return;

            var panel = document.getElementById('detailPanel');
            var backdrop = document.getElementById('detailBackdrop');

            renderDetailPanel(task, panel);
            panel.classList.add('open');
            backdrop.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function closeDetail() {
            var panel = document.getElementById('detailPanel');
            var backdrop = document.getElementById('detailBackdrop');
            panel.classList.remove('open');
            backdrop.classList.remove('open');
            document.body.style.overflow = '';
            currentTaskId = null;
        }

        function renderDetailPanel(task, panel) {
            var story = (data.stories||[]).find(function(s) { return s.id === task.story_id; }) || {};
            var epic = (data.epics||[]).find(function(e) { return e.id === story.epic_id; }) || {};
            var taskFiles = (data.task_files||[]).filter(function(f) { return f.task_id === task.id; });
            var taskDeps = (data.task_dependencies||[]).filter(function(d) { return d.task_id === task.id; });
            var taskActivity = (data.task_activity||[]).filter(function(a) { return a.task_id === task.id; })
                .sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); }).slice(0, 20);

            var html = '<div class="detail-header">';
            html += '<div class="detail-header-left">';
            html += '<div class="detail-id">' + esc(task.id) + '</div>';
            html += '<div class="detail-title">' + esc(task.title) + '</div>';
            html += '<div class="detail-badges">';
            if (task.status) {
                var statusColors = {todo:'var(--text-muted)',in_progress:'var(--blue)',review:'var(--purple)',done:'var(--green)',blocked:'var(--red)'};
                html += '<span class="detail-badge" style="background:' + (statusColors[task.status]||'var(--text-muted)') + ';color:white">' + esc(task.status.replace('_',' ')) + '</span>';
            }
            if (epic.priority) {
                var priColors = {P0:'var(--red)',P1:'var(--orange)',P2:'var(--yellow)',P3:'var(--text-muted)'};
                var priText = epic.priority === 'P2' ? 'black' : 'white';
                html += '<span class="detail-badge" style="background:' + (priColors[epic.priority]||'var(--text-muted)') + ';color:' + priText + '">' + esc(epic.priority) + '</span>';
            }
            if (task.task_type) {
                html += '<span class="detail-badge" style="background:var(--bg-card)">' + esc(task.task_type) + '</span>';
            }
            html += '</div></div>';
            html += '<button class="detail-close" onclick="closeDetail()">&times;</button>';
            html += '</div>';

            // Progress section
            if (task.progress_percent != null) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Progress</div>';
                html += '<div class="detail-progress">';
                html += '<div class="detail-progress-bar"><div class="detail-progress-fill" style="width:' + (task.progress_percent || 0) + '%"></div></div>';
                html += '<span class="detail-progress-text">' + (task.progress_percent || 0) + '%</span>';
                html += '</div></div>';
            }

            // Blockers section (if blocked)
            if (task.blockers) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Blockers</div>';
                html += '<div class="detail-blockers">' + esc(task.blockers) + '</div>';
                html += '</div>';
            }

            // Description section
            if (task.description) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Description</div>';
                html += '<div class="detail-description">' + esc(task.description) + '</div>';
                html += '</div>';
            }

            // Context section
            if (task.context_summary) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Context</div>';
                html += '<div class="detail-context">' + esc(task.context_summary) + '</div>';
                html += '</div>';
            }

            // Handoff notes
            if (task.handoff_notes) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Handoff Notes</div>';
                html += '<div class="detail-handoff">' + esc(task.handoff_notes) + '</div>';
                html += '</div>';
            }

            // Working files from task field
            if (task.working_files) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Working Files</div>';
                html += '<div class="detail-files">';
                var files = task.working_files.split(',').map(function(f) { return f.trim(); }).filter(Boolean);
                files.forEach(function(f) {
                    html += '<div class="detail-file" onclick="copyToClipboard(\\'' + esc(f) + '\\')">';
                    html += '<span class="detail-file-icon">📄</span>';
                    html += '<span class="detail-file-path">' + esc(f) + '</span>';
                    html += '<span class="detail-file-copy">Copy</span>';
                    html += '</div>';
                });
                html += '</div></div>';
            }

            // Files from task_files table
            if (taskFiles.length > 0) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Associated Files</div>';
                html += '<div class="detail-files">';
                taskFiles.forEach(function(f) {
                    html += '<div class="detail-file" onclick="copyToClipboard(\\'' + esc(f.file_path) + '\\')">';
                    html += '<span class="detail-file-icon">' + (f.file_type === 'modified' ? '✏️' : f.file_type === 'created' ? '➕' : '📄') + '</span>';
                    html += '<span class="detail-file-path">' + esc(f.file_path) + '</span>';
                    html += '<span class="detail-file-copy">Copy</span>';
                    html += '</div>';
                });
                html += '</div></div>';
            }

            // Dependencies
            if (taskDeps.length > 0) {
                html += '<div class="detail-section">';
                html += '<div class="detail-section-title">Dependencies</div>';
                html += '<div class="detail-deps">';
                taskDeps.forEach(function(d) {
                    var depTask = (data.tasks||[]).find(function(t) { return t.id === d.depends_on_task_id; });
                    var depStatus = depTask ? depTask.status : 'unknown';
                    html += '<div class="detail-dep">';
                    html += '<span class="detail-dep-type">' + esc(d.dependency_type || 'blocks') + '</span>';
                    html += '<span class="detail-dep-id" onclick="openDetail(\\'' + esc(d.depends_on_task_id) + '\\')">' + esc(d.depends_on_task_id) + '</span>';
                    if (depTask) {
                        html += '<span class="detail-dep-status ' + depStatus + '">' + esc(depStatus.replace('_',' ')) + '</span>';
                    }
                    html += '</div>';
                });
                html += '</div></div>';
            }

            // Activity
            html += '<div class="detail-section">';
            html += '<div class="detail-section-title">Activity</div>';
            if (taskActivity.length > 0) {
                html += '<div class="detail-activity">';
                taskActivity.forEach(function(a) {
                    var iconClass = a.activity_type === 'status_change' ? 'status' : a.activity_type === 'note' ? 'note' : 'file';
                    var iconChar = a.activity_type === 'status_change' ? '→' : a.activity_type === 'note' ? '📝' : '📎';
                    html += '<div class="activity-item">';
                    html += '<div class="activity-icon ' + iconClass + '">' + iconChar + '</div>';
                    html += '<div class="activity-content">';
                    html += '<div class="activity-text">';
                    if (a.actor) html += '<span class="activity-actor">' + esc(a.actor) + '</span> ';
                    if (a.activity_type === 'status_change') {
                        html += 'Changed status';
                        if (a.old_value) html += ' from <strong>' + esc(a.old_value) + '</strong>';
                        if (a.new_value) html += ' to <strong>' + esc(a.new_value) + '</strong>';
                    } else {
                        html += esc(a.description || a.activity_type);
                    }
                    html += '</div>';
                    html += '<div class="activity-time">' + formatTime(a.created_at) + '</div>';
                    html += '</div></div>';
                });
                html += '</div>';
            } else {
                html += '<div class="empty-state">No activity recorded</div>';
            }
            html += '</div>';

            // Metadata
            html += '<div class="detail-section">';
            html += '<div class="detail-section-title">Details</div>';
            html += '<div class="detail-meta">';
            if (epic.title) {
                html += '<div class="meta-item"><div class="meta-label">Epic</div><div class="meta-value">' + esc(epic.title) + '</div></div>';
            }
            if (story.title) {
                html += '<div class="meta-item"><div class="meta-label">Story</div><div class="meta-value">' + esc(story.title) + '</div></div>';
            }
            if (task.estimate_hours) {
                html += '<div class="meta-item"><div class="meta-label">Estimate</div><div class="meta-value">' + task.estimate_hours + ' hours</div></div>';
            }
            if (task.actual_hours) {
                html += '<div class="meta-item"><div class="meta-label">Actual</div><div class="meta-value">' + task.actual_hours + ' hours</div></div>';
            }
            if (task.created_by) {
                html += '<div class="meta-item"><div class="meta-label">Created By</div><div class="meta-value">' + esc(task.created_by) + '</div></div>';
            }
            if (task.created_at) {
                html += '<div class="meta-item"><div class="meta-label">Created</div><div class="meta-value">' + formatTime(task.created_at) + '</div></div>';
            }
            if (task.updated_at) {
                html += '<div class="meta-item"><div class="meta-label">Updated</div><div class="meta-value">' + formatTime(task.updated_at) + '</div></div>';
            }
            html += '</div></div>';

            panel.innerHTML = html;
        }

        function formatTime(isoStr) {
            if (!isoStr) return '';
            try {
                var d = new Date(isoStr);
                var now = new Date();
                var diff = now - d;
                if (diff < 60000) return 'Just now';
                if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
                if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
                if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
                return d.toLocaleDateString();
            } catch(e) { return isoStr; }
        }

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(function() {
                showToast('Copied: ' + text);
            }).catch(function() {
                showToast('Failed to copy');
            });
        }

        function showToast(msg) {
            var toast = document.getElementById('toast');
            toast.textContent = msg;
            toast.classList.add('show');
            setTimeout(function() { toast.classList.remove('show'); }, 2000);
        }

        // Keyboard handler for ESC
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && currentTaskId) closeDetail();
        });

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
            f"{OHNO_DIR}/ folder not found",
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
    """Initialize .ohno/ folder structure."""
    global out
    out = Output(quiet=args.quiet, json_mode=args.json, no_color=args.no_color)

    claude_dir = Path.cwd() / OHNO_DIR

    if claude_dir.exists() and not args.force:
        out.warning(f"{OHNO_DIR}/ already exists (use --force to overwrite)")
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
  kanban init               Initialize .ohno/ folder

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
