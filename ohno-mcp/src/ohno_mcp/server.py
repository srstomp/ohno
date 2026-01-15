"""
ohno MCP Server - Task management for AI agents.

Provides tools for querying and updating project tasks stored in .ohno/tasks.db.
Enables session continuity across context compaction and new sessions.

Usage:
    ohno-mcp                          # Use default .ohno/tasks.db
    ohno-mcp --db /path/to/tasks.db   # Specify database path

Configuration in Claude Code:
    {
      "mcpServers": {
        "ohno": {
          "command": "ohno-mcp",
          "args": ["--db", ".ohno/tasks.db"]
        }
      }
    }
"""

import argparse
import os
from pathlib import Path
from typing import Optional

from mcp.server.fastmcp import FastMCP

from .db import TaskDatabase


def find_db_path() -> Path:
    """Find tasks.db by walking up from cwd."""
    current = Path.cwd()
    while current != current.parent:
        db_path = current / ".ohno" / "tasks.db"
        if db_path.exists():
            return db_path
        current = current.parent
    # Default to cwd
    return Path.cwd() / ".ohno" / "tasks.db"


# Initialize MCP server
mcp = FastMCP(
    "ohno",
    instructions="""
ohno is a task management MCP server for AI agent workflows.

Use these tools to:
- Check project status and what needs to be done
- Resume work after context compaction or new sessions
- Update task progress and status
- Add notes for handoff to next session/agent

Key tools for session continuity:
- get_session_context: Start here after compaction/new session
- get_next_task: Get the recommended task to work on
- update_task_status: Mark tasks as done/in_progress/blocked
- set_handoff_notes: Leave notes for the next session
""",
)

# Database instance (initialized at runtime)
_db: Optional[TaskDatabase] = None


def get_db() -> TaskDatabase:
    """Get or initialize the database connection."""
    global _db
    if _db is None:
        db_path = os.environ.get("OHNO_DB_PATH")
        if db_path:
            _db = TaskDatabase(db_path)
        else:
            _db = TaskDatabase(find_db_path())
    return _db


# =============================================================================
# Read Tools - Query task state
# =============================================================================


@mcp.tool()
def get_project_status() -> dict:
    """
    Get overall project progress and statistics.

    Use this to understand the current state of the project at a glance.

    Returns:
        dict with fields:
        - project_name (str): Name of the project
        - total_tasks (int): Total number of tasks
        - done_tasks (int): Completed tasks
        - in_progress_tasks (int): Tasks currently being worked on
        - blocked_tasks (int): Tasks that are blocked
        - todo_tasks (int): Tasks not yet started
        - completion_percent (float): Percentage complete (0-100)
        - total_estimate_hours (float): Sum of all task estimates
        - total_actual_hours (float): Sum of actual hours logged

    Example response:
        {
            "project_name": "My Project",
            "total_tasks": 45,
            "done_tasks": 12,
            "completion_percent": 26.7,
            ...
        }
    """
    db = get_db()
    status = db.get_project_status()
    return status.to_dict()


@mcp.tool()
def get_session_context() -> dict:
    """
    Get context for resuming work after compaction or new session.

    START HERE when beginning work or after context compaction. This provides
    everything needed to understand current state and continue work.

    Returns:
        dict with fields:
        - in_progress_tasks (list): Tasks currently being worked on, with full details
        - blocked_tasks (list): Tasks that are blocked, with blockers
        - recent_activity (list): Last 10 activity entries across all tasks
        - suggested_next_task (dict|null): Recommended task to work on if nothing in progress

    Example response:
        {
            "in_progress_tasks": [
                {"id": "task-15", "title": "Implement auth", "progress_percent": 60, ...}
            ],
            "blocked_tasks": [],
            "recent_activity": [
                {"task_id": "task-15", "activity_type": "note", "description": "..."}
            ],
            "suggested_next_task": {"id": "task-20", "title": "Add tests", ...}
        }
    """
    db = get_db()
    ctx = db.get_session_context()
    return ctx.to_dict()


@mcp.tool()
def get_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = 20,
) -> list[dict]:
    """
    List tasks with optional filtering by status or priority.

    Args:
        status: Filter by status - one of: todo, in_progress, review, done, blocked
        priority: Filter by epic priority - one of: P0, P1, P2, P3
        limit: Maximum number of tasks to return (default: 20, max: 100)

    Returns:
        list of task dicts, each containing:
        - id (str): Task identifier
        - title (str): Task title
        - status (str): Current status
        - task_type (str|null): Type (feature, bug, chore, spike, test)
        - epic_title (str|null): Parent epic name
        - epic_priority (str|null): Epic priority (P0-P3)
        - progress_percent (int|null): Completion percentage
        - blockers (str|null): Current blockers if any

    Example:
        get_tasks(status="in_progress")  # Get all in-progress tasks
        get_tasks(priority="P0")          # Get all P0 priority tasks
    """
    db = get_db()
    tasks = db.get_tasks(
        status=status,
        priority=priority,
        limit=min(limit, 100),
    )
    return [t.to_dict() for t in tasks]


@mcp.tool()
def get_task(task_id: str) -> dict:
    """
    Get full details for a specific task.

    Use this to get complete information about a task including description,
    context, working files, and activity history.

    Args:
        task_id: The task identifier (e.g., "task-15")

    Returns:
        dict with all task fields:
        - id, title, status, task_type
        - description (str|null): Full task description
        - context_summary (str|null): AI-generated context from last session
        - working_files (str|null): Comma-separated list of relevant files
        - blockers (str|null): Current blockers
        - handoff_notes (str|null): Notes from previous session
        - progress_percent (int|null): Completion percentage (0-100)
        - estimate_hours, actual_hours
        - epic_title, epic_priority, story_title

    Returns empty dict if task not found.
    """
    db = get_db()
    task = db.get_task(task_id)
    if task:
        return task.to_dict()
    return {"error": f"Task {task_id} not found"}


@mcp.tool()
def get_next_task() -> dict:
    """
    Get the recommended next task to work on.

    Logic:
    1. If there are in-progress tasks, returns the first one (continue current work)
    2. Otherwise returns highest priority (P0 > P1 > P2) todo task

    Returns:
        dict with task details, or {"message": "..."} if no tasks available

    Use this when you've completed a task and need to know what to work on next.
    """
    db = get_db()
    task = db.get_next_task()
    if task:
        return task.to_dict()
    return {"message": "No tasks available to work on"}


@mcp.tool()
def get_blocked_tasks() -> list[dict]:
    """
    Get all currently blocked tasks with their blockers.

    Returns:
        list of blocked task dicts, each containing:
        - id (str): Task identifier
        - title (str): Task title
        - blockers (str): Reason for being blocked
        - epic_title, epic_priority

    Use this to understand what's preventing progress and if any blockers
    can be resolved.
    """
    db = get_db()
    tasks = db.get_tasks(status="blocked", limit=50)
    return [t.to_dict() for t in tasks]


# =============================================================================
# Write Tools - Update task state
# =============================================================================


@mcp.tool()
def update_task_status(
    task_id: str,
    status: str,
    notes: Optional[str] = None,
) -> dict:
    """
    Update a task's status.

    Args:
        task_id: The task identifier (e.g., "task-15")
        status: New status - one of: todo, in_progress, review, done, blocked
        notes: Optional handoff notes for next session

    Returns:
        {"success": true} or {"success": false, "error": "..."}

    Examples:
        update_task_status("task-15", "done")
        update_task_status("task-15", "in_progress", notes="Starting auth implementation")
        update_task_status("task-15", "review", notes="Ready for code review")

    Note: Use set_blocker() instead of setting status to "blocked" to include
    a blocker reason.
    """
    if status not in ("todo", "in_progress", "review", "done", "blocked"):
        return {"success": False, "error": f"Invalid status: {status}"}

    db = get_db()
    success = db.update_task_status(task_id, status, notes)

    if success:
        return {"success": True}
    return {"success": False, "error": f"Failed to update task {task_id}"}


@mcp.tool()
def add_task_activity(
    task_id: str,
    activity_type: str,
    description: str,
) -> dict:
    """
    Add an activity entry to a task's history.

    Use this to log progress, decisions, or notes during work on a task.
    This creates an audit trail visible in the kanban detail view.

    Args:
        task_id: The task identifier
        activity_type: Type of activity - one of: note, file_change, decision, progress
        description: Description of the activity

    Returns:
        {"success": true} or {"success": false, "error": "..."}

    Examples:
        add_task_activity("task-15", "note", "Found root cause in auth/jwt.py line 47")
        add_task_activity("task-15", "decision", "Using JWT refresh tokens instead of sessions")
        add_task_activity("task-15", "progress", "Completed token validation, starting refresh flow")
    """
    db = get_db()
    success = db.add_task_activity(task_id, activity_type, description)

    if success:
        return {"success": True}
    return {"success": False, "error": f"Failed to add activity to task {task_id}"}


@mcp.tool()
def set_handoff_notes(task_id: str, notes: str) -> dict:
    """
    Set handoff notes for a task.

    Use this before ending a session to leave context for the next session
    or agent. These notes appear prominently in the task detail view.

    Args:
        task_id: The task identifier
        notes: Notes for the next session (what was done, what's next, gotchas)

    Returns:
        {"success": true} or {"success": false, "error": "..."}

    Example:
        set_handoff_notes("task-15",
            "Completed JWT validation. Next: implement refresh token flow. "
            "Watch out for the rate limiter in middleware.py"
        )
    """
    db = get_db()
    success = db.set_handoff_notes(task_id, notes)

    if success:
        return {"success": True}
    return {"success": False, "error": f"Failed to set handoff notes for task {task_id}"}


@mcp.tool()
def update_task_progress(
    task_id: str,
    progress_percent: int,
    context_summary: Optional[str] = None,
) -> dict:
    """
    Update task progress percentage.

    Use this to track incremental progress on a task. The percentage
    is shown on task cards in the kanban board.

    Args:
        task_id: The task identifier
        progress_percent: Completion percentage (0-100)
        context_summary: Optional summary of current context/state

    Returns:
        {"success": true} or {"success": false, "error": "..."}

    Example:
        update_task_progress("task-15", 60,
            context_summary="Token validation done, starting refresh flow"
        )
    """
    if not 0 <= progress_percent <= 100:
        return {"success": False, "error": "progress_percent must be 0-100"}

    db = get_db()
    success = db.update_task_progress(task_id, progress_percent, context_summary)

    if success:
        return {"success": True}
    return {"success": False, "error": f"Failed to update progress for task {task_id}"}


@mcp.tool()
def set_blocker(task_id: str, reason: str) -> dict:
    """
    Mark a task as blocked with a reason.

    This sets the task status to "blocked" and records the blocker reason.
    The blocker appears prominently in the kanban detail view.

    Args:
        task_id: The task identifier
        reason: Why the task is blocked

    Returns:
        {"success": true} or {"success": false, "error": "..."}

    Example:
        set_blocker("task-15", "Waiting for API documentation from external team")
    """
    db = get_db()
    success = db.set_blocker(task_id, reason)

    if success:
        return {"success": True}
    return {"success": False, "error": f"Failed to set blocker for task {task_id}"}


@mcp.tool()
def resolve_blocker(task_id: str) -> dict:
    """
    Resolve a blocker and set task back to in_progress.

    Use this when a blocked task can be resumed.

    Args:
        task_id: The task identifier

    Returns:
        {"success": true} or {"success": false, "error": "..."}
    """
    db = get_db()
    success = db.resolve_blocker(task_id)

    if success:
        return {"success": True}
    return {"success": False, "error": f"Failed to resolve blocker for task {task_id}"}


@mcp.tool()
def create_task(
    title: str,
    story_id: Optional[str] = None,
    task_type: str = "feature",
    description: Optional[str] = None,
    estimate_hours: Optional[float] = None,
) -> dict:
    """
    Create a new task.

    Use this when you discover additional work needed during implementation
    that wasn't in the original PRD/plan.

    Args:
        title: Task title (concise, actionable)
        story_id: Optional parent story ID
        task_type: Type of task - one of: feature, bug, chore, spike, test
        description: Optional detailed description
        estimate_hours: Optional time estimate

    Returns:
        {"success": true, "task_id": "task-xxx"} or {"success": false, "error": "..."}

    Example:
        create_task(
            title="Add rate limiting to auth endpoints",
            task_type="feature",
            description="Discovered need during auth implementation",
            estimate_hours=2
        )
    """
    db = get_db()
    task_id = db.create_task(
        title=title,
        story_id=story_id,
        task_type=task_type,
        description=description,
        estimate_hours=estimate_hours,
    )

    if task_id:
        return {"success": True, "task_id": task_id}
    return {"success": False, "error": "Failed to create task"}


@mcp.tool()
def update_task(
    task_id: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    task_type: Optional[str] = None,
    estimate_hours: Optional[float] = None,
) -> dict:
    """
    Update task details (title, description, type, estimate).

    Use this when requirements change or you need to refine task scope.

    Args:
        task_id: The task identifier
        title: New title (optional)
        description: New description (optional)
        task_type: New type (optional)
        estimate_hours: New estimate (optional)

    Returns:
        {"success": true} or {"success": false, "error": "..."}

    Example:
        update_task("task-15",
            title="Implement JWT auth with refresh tokens",
            description="Updated scope to include refresh flow"
        )
    """
    db = get_db()
    success = db.update_task(
        task_id,
        title=title,
        description=description,
        task_type=task_type,
        estimate_hours=estimate_hours,
    )

    if success:
        return {"success": True}
    return {"success": False, "error": f"Failed to update task {task_id}"}


@mcp.tool()
def archive_task(task_id: str, reason: str = "") -> dict:
    """
    Archive a task that's no longer needed.

    Use this when:
    - Requirements changed and task is obsolete
    - Task was duplicated
    - Task is out of scope

    The task remains in history but won't appear in active lists.

    Args:
        task_id: The task identifier
        reason: Why the task is being archived

    Returns:
        {"success": true} or {"success": false, "error": "..."}

    Example:
        archive_task("task-20", reason="Replaced by task-25 with updated scope")
    """
    db = get_db()
    success = db.archive_task(task_id, reason)

    if success:
        return {"success": True}
    return {"success": False, "error": f"Failed to archive task {task_id}"}


# =============================================================================
# Dependency Management Tools
# =============================================================================


@mcp.tool()
def add_dependency(
    task_id: str,
    depends_on_task_id: str,
    dependency_type: str = "blocks",
) -> dict:
    """
    Add a dependency between tasks.

    The task specified by task_id will depend on depends_on_task_id,
    meaning task_id cannot be suggested until depends_on_task_id is done.

    This affects get_session_context() and get_next_task() - they will
    skip tasks whose dependencies aren't completed.

    Args:
        task_id: The task that has the dependency
        depends_on_task_id: The task that must be completed first
        dependency_type: Type of dependency - blocks (default), requires, relates_to

    Returns:
        {"success": true, "dependency_id": "dep-xxx"} or {"success": false, "error": "..."}

    Example:
        add_dependency("task-20", "task-15")  # task-20 depends on task-15
    """
    if dependency_type not in ("blocks", "requires", "relates_to"):
        return {"success": False, "error": f"Invalid dependency_type: {dependency_type}"}

    db = get_db()
    dep_id = db.add_dependency(task_id, depends_on_task_id, dependency_type)

    if dep_id:
        return {"success": True, "dependency_id": dep_id}
    return {"success": False, "error": "Failed to add dependency (tasks may not exist or self-reference)"}


@mcp.tool()
def remove_dependency(task_id: str, depends_on_task_id: str) -> dict:
    """
    Remove a dependency between tasks.

    Args:
        task_id: The task that has the dependency
        depends_on_task_id: The task being depended on

    Returns:
        {"success": true} or {"success": false, "error": "..."}
    """
    db = get_db()
    success = db.remove_dependency(task_id, depends_on_task_id)

    if success:
        return {"success": True}
    return {"success": False, "error": "Dependency not found"}


@mcp.tool()
def get_task_dependencies(task_id: str) -> dict:
    """
    Get all dependencies for a task.

    Returns tasks that must be completed before this task can start.
    Also indicates which dependencies are currently blocking the task.

    Args:
        task_id: The task to get dependencies for

    Returns:
        dict with:
        - dependencies: list of dependency objects with task details
        - blocking: list of task IDs that are not yet done (blocking this task)
        - is_blocked: boolean indicating if any dependencies are unfinished

    Example response:
        {
            "dependencies": [
                {"depends_on_task_id": "task-15", "depends_on_title": "Setup auth", "depends_on_status": "done"},
                {"depends_on_task_id": "task-18", "depends_on_title": "Add DB schema", "depends_on_status": "in_progress"}
            ],
            "blocking": ["task-18"],
            "is_blocked": true
        }
    """
    db = get_db()
    deps = db.get_task_dependencies(task_id)
    blocking = db.get_blocking_dependencies(task_id)

    return {
        "dependencies": [dep.to_dict() for dep in deps],
        "blocking": blocking,
        "is_blocked": len(blocking) > 0,
    }


@mcp.tool()
def summarize_task_activity(task_id: str, delete_raw: bool = False) -> dict:
    """
    Summarize task activity into a compact format.

    This compresses N activity entries into a summary stored on the task.
    Useful for long-running tasks with lots of activity to reduce context size.

    Args:
        task_id: The task to summarize
        delete_raw: If True, delete old activity entries after summarization
                   (keeps last 3 entries for recent context)

    Returns:
        {"success": true, "summary": "..."} or {"success": false, "error": "..."}

    Note: Automatically called when a task is marked as done or archived.
          Use this manually for long-running in_progress tasks.
    """
    db = get_db()
    summary = db.summarize_task_activity(task_id, delete_raw=delete_raw)

    if summary:
        return {"success": True, "summary": summary}
    return {"success": False, "error": "Insufficient activity to summarize (need 5+ entries)"}


# =============================================================================
# Entry Point
# =============================================================================


def main():
    """Entry point for the ohno-mcp command."""
    parser = argparse.ArgumentParser(
        description="ohno MCP server - Task management for AI agents",
    )
    parser.add_argument(
        "--db",
        type=str,
        help="Path to tasks.db (default: find .ohno/tasks.db by walking up)",
    )
    parser.add_argument(
        "--transport",
        type=str,
        default="stdio",
        choices=["stdio", "streamable-http"],
        help="MCP transport (default: stdio)",
    )

    args = parser.parse_args()

    # Set database path in environment for get_db()
    if args.db:
        os.environ["OHNO_DB_PATH"] = args.db

    # Run the server
    mcp.run(transport=args.transport)


if __name__ == "__main__":
    main()
