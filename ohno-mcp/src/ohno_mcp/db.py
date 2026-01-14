"""
Database access layer for ohno tasks.

Provides clean abstractions over the SQLite database schema used by
skills (prd-analyzer, project-harness) and visualized by kanban.py.
"""

import hashlib
import sqlite3
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional, Union


# --- Hash-based ID Generation ---
# These provide collision-resistant IDs derived from content rather than pure random.


def generate_task_id(title: str, story_id: Optional[str], timestamp: str) -> str:
    """
    Generate a content-based task ID.

    Format: task-{hash[:8]} where hash is derived from title + story_id + timestamp.
    This provides better collision resistance than pure random while being deterministic
    for the same inputs.
    """
    content = f"{title}|{story_id or ''}|{timestamp}"
    hash_hex = hashlib.sha256(content.encode()).hexdigest()
    return f"task-{hash_hex[:8]}"


def generate_activity_id(task_id: str, activity_type: str, timestamp: str) -> str:
    """Generate a content-based activity ID."""
    content = f"{task_id}|{activity_type}|{timestamp}"
    hash_hex = hashlib.sha256(content.encode()).hexdigest()
    return f"act-{hash_hex[:8]}"


def generate_dependency_id(task_id: str, depends_on_task_id: str) -> str:
    """Generate a content-based dependency ID."""
    content = f"{task_id}|{depends_on_task_id}"
    hash_hex = hashlib.sha256(content.encode()).hexdigest()
    return f"dep-{hash_hex[:8]}"


@dataclass
class Task:
    """Task record from the database."""
    id: str
    story_id: Optional[str] = None
    title: str = ""
    status: str = "todo"  # todo, in_progress, review, done, blocked
    task_type: Optional[str] = None  # feature, bug, chore, spike, test
    estimate_hours: Optional[float] = None
    description: Optional[str] = None
    context_summary: Optional[str] = None
    working_files: Optional[str] = None  # Comma-separated paths
    blockers: Optional[str] = None
    handoff_notes: Optional[str] = None
    progress_percent: Optional[int] = None
    actual_hours: Optional[float] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    created_by: Optional[str] = None
    activity_summary: Optional[str] = None  # Compressed activity history

    # Joined fields (not in tasks table directly)
    story_title: Optional[str] = None
    epic_id: Optional[str] = None
    epic_title: Optional[str] = None
    epic_priority: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary, excluding None values."""
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class TaskActivity:
    """Activity log entry."""
    id: str
    task_id: str
    activity_type: str  # status_change, note, file_change
    description: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    actor: Optional[str] = None
    created_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class TaskDependency:
    """Task dependency record."""
    id: str
    task_id: str
    depends_on_task_id: str
    dependency_type: Optional[str] = None  # blocks, requires, relates_to
    created_at: Optional[str] = None
    # Joined fields for display
    depends_on_title: Optional[str] = None
    depends_on_status: Optional[str] = None

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class ProjectStatus:
    """Aggregated project statistics."""
    project_name: Optional[str] = None
    total_tasks: int = 0
    done_tasks: int = 0
    in_progress_tasks: int = 0
    review_tasks: int = 0
    blocked_tasks: int = 0
    todo_tasks: int = 0
    completion_percent: float = 0.0
    total_epics: int = 0
    total_stories: int = 0
    total_estimate_hours: float = 0.0
    total_actual_hours: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class SessionContext:
    """Context for resuming work after compaction or new session."""
    in_progress_tasks: list = field(default_factory=list)
    blocked_tasks: list = field(default_factory=list)
    recent_activity: list = field(default_factory=list)
    suggested_next_task: Optional[dict] = None

    def to_dict(self) -> dict:
        return {
            "in_progress_tasks": self.in_progress_tasks,
            "blocked_tasks": self.blocked_tasks,
            "recent_activity": self.recent_activity,
            "suggested_next_task": self.suggested_next_task,
        }


class TaskDatabase:
    """Database access for ohno tasks."""

    def __init__(self, db_path: Union[str, Path]):
        self.db_path = Path(db_path)
        self._ensure_tables()

    def _get_connection(self) -> sqlite3.Connection:
        """Get a database connection with row factory."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_tables(self):
        """Ensure extended tables exist (activity, files, dependencies)."""
        if not self.db_path.exists():
            return

        conn = self._get_connection()
        try:
            # Create activity table if not exists
            conn.execute("""
                CREATE TABLE IF NOT EXISTS task_activity (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    activity_type TEXT,
                    description TEXT,
                    old_value TEXT,
                    new_value TEXT,
                    actor TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Create files table if not exists
            conn.execute("""
                CREATE TABLE IF NOT EXISTS task_files (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    file_type TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Create dependencies table if not exists
            conn.execute("""
                CREATE TABLE IF NOT EXISTS task_dependencies (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    depends_on_task_id TEXT NOT NULL,
                    dependency_type TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Create indexes for performance
            try:
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_task_activity_task_id
                    ON task_activity(task_id)
                """)
            except sqlite3.OperationalError:
                pass  # Index already exists or table doesn't exist

            try:
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_task_deps_task_id
                    ON task_dependencies(task_id)
                """)
            except sqlite3.OperationalError:
                pass

            # Add extended columns to tasks if they don't exist
            # SQLite doesn't have IF NOT EXISTS for ALTER TABLE, so we catch errors
            extended_columns = [
                ("description", "TEXT"),
                ("context_summary", "TEXT"),
                ("working_files", "TEXT"),
                ("blockers", "TEXT"),
                ("handoff_notes", "TEXT"),
                ("progress_percent", "INTEGER"),
                ("actual_hours", "REAL"),
                ("created_at", "TEXT"),
                ("updated_at", "TEXT"),
                ("created_by", "TEXT"),
                ("activity_summary", "TEXT"),  # Compressed activity history
            ]

            for col_name, col_type in extended_columns:
                try:
                    conn.execute(f"ALTER TABLE tasks ADD COLUMN {col_name} {col_type}")
                except sqlite3.OperationalError:
                    pass  # Column already exists

            conn.commit()
        finally:
            conn.close()

    def get_project_status(self) -> ProjectStatus:
        """Get aggregated project statistics."""
        conn = self._get_connection()
        try:
            status = ProjectStatus()

            # Get project name
            try:
                row = conn.execute("SELECT name FROM projects LIMIT 1").fetchone()
                if row:
                    status.project_name = row["name"]
            except sqlite3.OperationalError:
                pass

            # Get task counts by status
            try:
                rows = conn.execute("""
                    SELECT status, COUNT(*) as count
                    FROM tasks
                    GROUP BY status
                """).fetchall()

                for row in rows:
                    s = row["status"]
                    c = row["count"]
                    if s == "done":
                        status.done_tasks = c
                    elif s == "in_progress":
                        status.in_progress_tasks = c
                    elif s == "review":
                        status.review_tasks = c
                    elif s == "blocked":
                        status.blocked_tasks = c
                    elif s == "todo":
                        status.todo_tasks = c

                status.total_tasks = (
                    status.done_tasks + status.in_progress_tasks +
                    status.review_tasks + status.blocked_tasks + status.todo_tasks
                )

                if status.total_tasks > 0:
                    status.completion_percent = round(
                        100 * status.done_tasks / status.total_tasks, 1
                    )
            except sqlite3.OperationalError:
                pass

            # Get epic/story counts
            try:
                row = conn.execute("SELECT COUNT(*) as count FROM epics").fetchone()
                status.total_epics = row["count"] if row else 0
            except sqlite3.OperationalError:
                pass

            try:
                row = conn.execute("SELECT COUNT(*) as count FROM stories").fetchone()
                status.total_stories = row["count"] if row else 0
            except sqlite3.OperationalError:
                pass

            # Get hour totals
            try:
                row = conn.execute("""
                    SELECT
                        COALESCE(SUM(estimate_hours), 0) as est,
                        COALESCE(SUM(actual_hours), 0) as act
                    FROM tasks
                """).fetchone()
                if row:
                    status.total_estimate_hours = row["est"] or 0
                    status.total_actual_hours = row["act"] or 0
            except sqlite3.OperationalError:
                pass

            return status
        finally:
            conn.close()

    def get_tasks(
        self,
        status: Optional[str] = None,
        epic_id: Optional[str] = None,
        priority: Optional[str] = None,
        limit: int = 50,
    ) -> list[Task]:
        """Get tasks with optional filtering."""
        conn = self._get_connection()
        try:
            query = """
                SELECT
                    t.*,
                    s.title as story_title,
                    s.epic_id,
                    e.title as epic_title,
                    e.priority as epic_priority
                FROM tasks t
                LEFT JOIN stories s ON t.story_id = s.id
                LEFT JOIN epics e ON s.epic_id = e.id
                WHERE 1=1
            """
            params = []

            if status:
                query += " AND t.status = ?"
                params.append(status)

            if epic_id:
                query += " AND s.epic_id = ?"
                params.append(epic_id)

            if priority:
                query += " AND e.priority = ?"
                params.append(priority)

            query += " ORDER BY e.priority, t.id LIMIT ?"
            params.append(limit)

            rows = conn.execute(query, params).fetchall()

            tasks = []
            for row in rows:
                task = Task(
                    id=row["id"],
                    story_id=row["story_id"],
                    title=row["title"],
                    status=row["status"] or "todo",
                    task_type=row["task_type"] if "task_type" in row.keys() else None,
                    estimate_hours=row["estimate_hours"] if "estimate_hours" in row.keys() else None,
                )

                # Add extended fields if they exist
                for field_name in [
                    "description", "context_summary", "working_files", "blockers",
                    "handoff_notes", "progress_percent", "actual_hours",
                    "created_at", "updated_at", "created_by", "activity_summary"
                ]:
                    if field_name in row.keys():
                        setattr(task, field_name, row[field_name])

                # Add joined fields
                task.story_title = row["story_title"] if "story_title" in row.keys() else None
                task.epic_id = row["epic_id"] if "epic_id" in row.keys() else None
                task.epic_title = row["epic_title"] if "epic_title" in row.keys() else None
                task.epic_priority = row["epic_priority"] if "epic_priority" in row.keys() else None

                tasks.append(task)

            return tasks
        finally:
            conn.close()

    def get_task(self, task_id: str) -> Optional[Task]:
        """Get a single task by ID with full details."""
        tasks = self.get_tasks(limit=1000)  # Get all to find by ID
        for task in tasks:
            if task.id == task_id:
                return task
        return None

    def get_task_activity(self, task_id: str, limit: int = 20) -> list[TaskActivity]:
        """Get activity history for a task."""
        conn = self._get_connection()
        try:
            rows = conn.execute("""
                SELECT * FROM task_activity
                WHERE task_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            """, (task_id, limit)).fetchall()

            return [
                TaskActivity(
                    id=row["id"],
                    task_id=row["task_id"],
                    activity_type=row["activity_type"],
                    description=row["description"] if "description" in row.keys() else None,
                    old_value=row["old_value"] if "old_value" in row.keys() else None,
                    new_value=row["new_value"] if "new_value" in row.keys() else None,
                    actor=row["actor"] if "actor" in row.keys() else None,
                    created_at=row["created_at"] if "created_at" in row.keys() else None,
                )
                for row in rows
            ]
        except sqlite3.OperationalError:
            return []
        finally:
            conn.close()

    def get_session_context(self) -> SessionContext:
        """Get context for resuming work (in-progress, blocked, recent activity)."""
        ctx = SessionContext()

        # Get in-progress tasks
        in_progress = self.get_tasks(status="in_progress", limit=10)
        ctx.in_progress_tasks = [t.to_dict() for t in in_progress]

        # Get blocked tasks
        blocked = self.get_tasks(status="blocked", limit=10)
        ctx.blocked_tasks = [t.to_dict() for t in blocked]

        # Get recent activity across all tasks
        conn = self._get_connection()
        try:
            rows = conn.execute("""
                SELECT a.*, t.title as task_title
                FROM task_activity a
                JOIN tasks t ON a.task_id = t.id
                ORDER BY a.created_at DESC
                LIMIT 10
            """).fetchall()

            ctx.recent_activity = [
                {
                    "task_id": row["task_id"],
                    "task_title": row["task_title"],
                    "activity_type": row["activity_type"],
                    "description": row["description"],
                    "created_at": row["created_at"],
                }
                for row in rows
            ]
        except sqlite3.OperationalError:
            pass
        finally:
            conn.close()

        # Suggest next task (highest priority non-blocked todo WITH satisfied dependencies)
        next_tasks = self.get_tasks(status="todo", limit=20)  # Get more candidates
        if next_tasks:
            # Filter out tasks with unfinished dependencies
            available_tasks = [
                t for t in next_tasks
                if not self.is_task_blocked_by_dependencies(t.id)
            ]

            if available_tasks:
                # Sort by priority (P0 > P1 > P2 > None)
                priority_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
                sorted_tasks = sorted(
                    available_tasks,
                    key=lambda t: priority_order.get(t.epic_priority, 99)
                )
                ctx.suggested_next_task = sorted_tasks[0].to_dict()

        return ctx

    def get_next_task(self) -> Optional[Task]:
        """Get the recommended next task based on priority and dependencies."""
        ctx = self.get_session_context()

        # If there's work in progress, continue that
        if ctx.in_progress_tasks:
            task_id = ctx.in_progress_tasks[0]["id"]
            return self.get_task(task_id)

        # Otherwise suggest next todo
        if ctx.suggested_next_task:
            task_id = ctx.suggested_next_task["id"]
            return self.get_task(task_id)

        return None

    def update_task_status(
        self,
        task_id: str,
        status: str,
        notes: Optional[str] = None,
        actor: str = "agent",
    ) -> bool:
        """Update a task's status and optionally add notes."""
        conn = self._get_connection()
        try:
            # Get current status for activity log
            row = conn.execute(
                "SELECT status FROM tasks WHERE id = ?", (task_id,)
            ).fetchone()

            if not row:
                return False

            old_status = row["status"]
            now = datetime.now().isoformat()

            # Update task
            if notes:
                conn.execute("""
                    UPDATE tasks
                    SET status = ?, handoff_notes = ?, updated_at = ?
                    WHERE id = ?
                """, (status, notes, now, task_id))
            else:
                conn.execute("""
                    UPDATE tasks
                    SET status = ?, updated_at = ?
                    WHERE id = ?
                """, (status, now, task_id))

            # Log activity
            activity_id = generate_activity_id(task_id, "status_change", now)
            conn.execute("""
                INSERT INTO task_activity
                (id, task_id, activity_type, old_value, new_value, actor, created_at)
                VALUES (?, ?, 'status_change', ?, ?, ?, ?)
            """, (activity_id, task_id, old_status, status, actor, now))

            conn.commit()

            # Auto-summarize on completion (done or archived)
            if status in ("done", "archived"):
                self.summarize_task_activity(task_id, delete_raw=False)

            return True
        except sqlite3.Error:
            return False
        finally:
            conn.close()

    def add_task_activity(
        self,
        task_id: str,
        activity_type: str,
        description: str,
        actor: str = "agent",
    ) -> bool:
        """Add an activity entry to a task's history."""
        conn = self._get_connection()
        try:
            now = datetime.now().isoformat()
            activity_id = generate_activity_id(task_id, activity_type, now)

            conn.execute("""
                INSERT INTO task_activity
                (id, task_id, activity_type, description, actor, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (activity_id, task_id, activity_type, description, actor, now))

            # Update task's updated_at
            conn.execute(
                "UPDATE tasks SET updated_at = ? WHERE id = ?",
                (now, task_id)
            )

            conn.commit()
            return True
        except sqlite3.Error:
            return False
        finally:
            conn.close()

    def set_handoff_notes(self, task_id: str, notes: str) -> bool:
        """Set handoff notes for a task (for next session/agent)."""
        conn = self._get_connection()
        try:
            now = datetime.now().isoformat()

            conn.execute("""
                UPDATE tasks
                SET handoff_notes = ?, updated_at = ?
                WHERE id = ?
            """, (notes, now, task_id))

            conn.commit()
            return conn.total_changes > 0
        except sqlite3.Error:
            return False
        finally:
            conn.close()

    def update_task_progress(
        self,
        task_id: str,
        progress_percent: int,
        context_summary: Optional[str] = None,
    ) -> bool:
        """Update task progress percentage and optionally context summary."""
        conn = self._get_connection()
        try:
            now = datetime.now().isoformat()

            if context_summary:
                conn.execute("""
                    UPDATE tasks
                    SET progress_percent = ?, context_summary = ?, updated_at = ?
                    WHERE id = ?
                """, (progress_percent, context_summary, now, task_id))
            else:
                conn.execute("""
                    UPDATE tasks
                    SET progress_percent = ?, updated_at = ?
                    WHERE id = ?
                """, (progress_percent, now, task_id))

            conn.commit()
            return conn.total_changes > 0
        except sqlite3.Error:
            return False
        finally:
            conn.close()

    def set_blocker(self, task_id: str, reason: str, actor: str = "agent") -> bool:
        """Mark a task as blocked with a reason."""
        conn = self._get_connection()
        try:
            now = datetime.now().isoformat()

            # Get current status
            row = conn.execute(
                "SELECT status FROM tasks WHERE id = ?", (task_id,)
            ).fetchone()

            if not row:
                return False

            old_status = row["status"]

            # Update task
            conn.execute("""
                UPDATE tasks
                SET status = 'blocked', blockers = ?, updated_at = ?
                WHERE id = ?
            """, (reason, now, task_id))

            # Log activity
            activity_id = generate_activity_id(task_id, "status_change", now)
            conn.execute("""
                INSERT INTO task_activity
                (id, task_id, activity_type, description, old_value, new_value, actor, created_at)
                VALUES (?, ?, 'status_change', ?, ?, 'blocked', ?, ?)
            """, (activity_id, task_id, f"Blocked: {reason}", old_status, actor, now))

            conn.commit()
            return True
        except sqlite3.Error:
            return False
        finally:
            conn.close()

    def resolve_blocker(self, task_id: str, actor: str = "agent") -> bool:
        """Resolve a blocker and set task back to in_progress."""
        conn = self._get_connection()
        try:
            now = datetime.now().isoformat()

            # Update task
            conn.execute("""
                UPDATE tasks
                SET status = 'in_progress', blockers = NULL, updated_at = ?
                WHERE id = ?
            """, (now, task_id))

            # Log activity
            activity_id = generate_activity_id(task_id, "status_change", now)
            conn.execute("""
                INSERT INTO task_activity
                (id, task_id, activity_type, description, old_value, new_value, actor, created_at)
                VALUES (?, ?, 'status_change', 'Blocker resolved', 'blocked', 'in_progress', ?, ?)
            """, (activity_id, task_id, actor, now))

            conn.commit()
            return True
        except sqlite3.Error:
            return False
        finally:
            conn.close()

    def create_task(
        self,
        title: str,
        story_id: Optional[str] = None,
        task_type: str = "feature",
        description: Optional[str] = None,
        estimate_hours: Optional[float] = None,
        actor: str = "agent",
    ) -> Optional[str]:
        """Create a new task. Returns task ID or None on failure."""
        conn = self._get_connection()
        try:
            now = datetime.now().isoformat()
            task_id = generate_task_id(title, story_id, now)

            # Handle collision by appending counter if ID exists
            base_id = task_id
            counter = 1
            while conn.execute("SELECT 1 FROM tasks WHERE id = ?", (task_id,)).fetchone():
                task_id = f"{base_id}-{counter}"
                counter += 1
                if counter > 100:  # Safety limit
                    return None

            conn.execute("""
                INSERT INTO tasks
                (id, story_id, title, status, task_type, description, estimate_hours,
                 created_at, updated_at, created_by)
                VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?)
            """, (task_id, story_id, title, task_type, description, estimate_hours, now, now, actor))

            # Log activity
            activity_id = generate_activity_id(task_id, "created", now)
            conn.execute("""
                INSERT INTO task_activity
                (id, task_id, activity_type, description, actor, created_at)
                VALUES (?, ?, 'created', ?, ?, ?)
            """, (activity_id, task_id, f"Task created: {title}", actor, now))

            conn.commit()
            return task_id
        except sqlite3.Error:
            return None
        finally:
            conn.close()

    def update_task(
        self,
        task_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        task_type: Optional[str] = None,
        estimate_hours: Optional[float] = None,
        actor: str = "agent",
    ) -> bool:
        """Update task details (title, description, type, estimate)."""
        conn = self._get_connection()
        try:
            now = datetime.now().isoformat()

            # Build dynamic update query
            updates = []
            params = []

            if title is not None:
                updates.append("title = ?")
                params.append(title)
            if description is not None:
                updates.append("description = ?")
                params.append(description)
            if task_type is not None:
                updates.append("task_type = ?")
                params.append(task_type)
            if estimate_hours is not None:
                updates.append("estimate_hours = ?")
                params.append(estimate_hours)

            if not updates:
                return True  # Nothing to update

            updates.append("updated_at = ?")
            params.append(now)
            params.append(task_id)

            query = f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?"
            conn.execute(query, params)

            # Log activity
            activity_id = generate_activity_id(task_id, "updated", now)
            changes = []
            if title:
                changes.append(f"title to '{title}'")
            if description:
                changes.append("description")
            if task_type:
                changes.append(f"type to '{task_type}'")
            if estimate_hours:
                changes.append(f"estimate to {estimate_hours}h")

            conn.execute("""
                INSERT INTO task_activity
                (id, task_id, activity_type, description, actor, created_at)
                VALUES (?, ?, 'updated', ?, ?, ?)
            """, (activity_id, task_id, f"Updated {', '.join(changes)}", actor, now))

            conn.commit()
            return True
        except sqlite3.Error:
            return False
        finally:
            conn.close()

    def archive_task(self, task_id: str, reason: str = "", actor: str = "agent") -> bool:
        """Archive a task (set status to 'archived'). Use when task is no longer needed."""
        conn = self._get_connection()
        try:
            now = datetime.now().isoformat()

            # Get current status
            row = conn.execute(
                "SELECT status FROM tasks WHERE id = ?", (task_id,)
            ).fetchone()

            if not row:
                return False

            old_status = row["status"]

            # Update to archived
            conn.execute("""
                UPDATE tasks
                SET status = 'archived', updated_at = ?
                WHERE id = ?
            """, (now, task_id))

            # Log activity
            activity_id = generate_activity_id(task_id, "status_change", now)
            description = f"Task archived"
            if reason:
                description += f": {reason}"

            conn.execute("""
                INSERT INTO task_activity
                (id, task_id, activity_type, description, old_value, new_value, actor, created_at)
                VALUES (?, ?, 'status_change', ?, ?, 'archived', ?, ?)
            """, (activity_id, task_id, description, old_status, actor, now))

            conn.commit()
            return True
        except sqlite3.Error:
            return False
        finally:
            conn.close()

    def delete_task(self, task_id: str) -> bool:
        """Permanently delete a task. Use archive_task() for soft delete."""
        conn = self._get_connection()
        try:
            # Delete activity first (foreign key)
            conn.execute("DELETE FROM task_activity WHERE task_id = ?", (task_id,))
            conn.execute("DELETE FROM task_files WHERE task_id = ?", (task_id,))
            conn.execute("DELETE FROM task_dependencies WHERE task_id = ?", (task_id,))

            # Delete task
            conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))

            conn.commit()
            return conn.total_changes > 0
        except sqlite3.Error:
            return False
        finally:
            conn.close()

    # --- Dependency Management ---

    def add_dependency(
        self,
        task_id: str,
        depends_on_task_id: str,
        dependency_type: str = "blocks",
    ) -> Optional[str]:
        """
        Add a dependency between tasks. Returns dependency ID or None.

        The task specified by task_id will depend on depends_on_task_id,
        meaning task_id cannot be started until depends_on_task_id is done.
        """
        conn = self._get_connection()
        try:
            # Verify both tasks exist
            t1 = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
            t2 = conn.execute("SELECT id FROM tasks WHERE id = ?", (depends_on_task_id,)).fetchone()
            if not t1 or not t2:
                return None

            # Prevent self-dependency
            if task_id == depends_on_task_id:
                return None

            # Check for duplicate
            existing = conn.execute("""
                SELECT id FROM task_dependencies
                WHERE task_id = ? AND depends_on_task_id = ?
            """, (task_id, depends_on_task_id)).fetchone()
            if existing:
                return existing["id"]  # Already exists

            now = datetime.now().isoformat()
            dep_id = generate_dependency_id(task_id, depends_on_task_id)

            conn.execute("""
                INSERT INTO task_dependencies
                (id, task_id, depends_on_task_id, dependency_type, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (dep_id, task_id, depends_on_task_id, dependency_type, now))

            conn.commit()
            return dep_id
        except sqlite3.Error:
            return None
        finally:
            conn.close()

    def remove_dependency(self, task_id: str, depends_on_task_id: str) -> bool:
        """Remove a dependency between tasks."""
        conn = self._get_connection()
        try:
            cursor = conn.execute("""
                DELETE FROM task_dependencies
                WHERE task_id = ? AND depends_on_task_id = ?
            """, (task_id, depends_on_task_id))
            conn.commit()
            return cursor.rowcount > 0
        except sqlite3.Error:
            return False
        finally:
            conn.close()

    def get_task_dependencies(self, task_id: str) -> list[TaskDependency]:
        """Get all dependencies for a task (tasks this task depends on)."""
        conn = self._get_connection()
        try:
            rows = conn.execute("""
                SELECT d.*, t.title as depends_on_title, t.status as depends_on_status
                FROM task_dependencies d
                JOIN tasks t ON d.depends_on_task_id = t.id
                WHERE d.task_id = ?
            """, (task_id,)).fetchall()

            return [
                TaskDependency(
                    id=row["id"],
                    task_id=row["task_id"],
                    depends_on_task_id=row["depends_on_task_id"],
                    dependency_type=row["dependency_type"],
                    created_at=row["created_at"],
                    depends_on_title=row["depends_on_title"],
                    depends_on_status=row["depends_on_status"],
                )
                for row in rows
            ]
        except sqlite3.OperationalError:
            return []
        finally:
            conn.close()

    def get_blocking_dependencies(self, task_id: str) -> list[str]:
        """Get task IDs that are blocking this task (not done yet)."""
        conn = self._get_connection()
        try:
            rows = conn.execute("""
                SELECT d.depends_on_task_id
                FROM task_dependencies d
                JOIN tasks t ON d.depends_on_task_id = t.id
                WHERE d.task_id = ? AND t.status != 'done'
            """, (task_id,)).fetchall()
            return [row["depends_on_task_id"] for row in rows]
        except sqlite3.OperationalError:
            return []
        finally:
            conn.close()

    def is_task_blocked_by_dependencies(self, task_id: str) -> bool:
        """Check if a task has unfinished dependencies."""
        return len(self.get_blocking_dependencies(task_id)) > 0

    # --- Activity Summarization ---

    def summarize_task_activity(
        self,
        task_id: str,
        delete_raw: bool = False,
        min_entries: int = 5,
    ) -> Optional[str]:
        """
        Summarize task activity into a compact text format.

        Args:
            task_id: Task to summarize
            delete_raw: If True, delete raw activity entries after summarization
            min_entries: Minimum entries required to trigger summarization

        Returns:
            Summary text or None if insufficient activity
        """
        conn = self._get_connection()
        try:
            # Get all activity for this task
            rows = conn.execute("""
                SELECT * FROM task_activity
                WHERE task_id = ?
                ORDER BY created_at ASC
            """, (task_id,)).fetchall()

            if len(rows) < min_entries:
                return None  # Not enough to summarize

            # Build summary
            now = datetime.now().isoformat()
            summary_lines = [f"Activity summary generated at {now[:10]}"]
            summary_lines.append(f"Total entries: {len(rows)}")
            summary_lines.append("")

            # Count by type
            type_counts: dict[str, int] = {}
            for row in rows:
                t = row["activity_type"] or "unknown"
                type_counts[t] = type_counts.get(t, 0) + 1

            summary_lines.append("By type:")
            for t, c in sorted(type_counts.items()):
                summary_lines.append(f"  - {t}: {c}")

            # Status change timeline
            status_changes = [r for r in rows if r["activity_type"] == "status_change"]
            if status_changes:
                summary_lines.append("")
                summary_lines.append("Status history:")
                for sc in status_changes:
                    ts = sc["created_at"][:10] if sc["created_at"] else "?"
                    old = sc["old_value"] or "?"
                    new = sc["new_value"] or "?"
                    summary_lines.append(f"  - {ts}: {old} -> {new}")

            # Recent notes (last 3)
            notes = [r for r in rows if r["activity_type"] == "note"]
            if notes:
                summary_lines.append("")
                summary_lines.append("Recent notes:")
                for note in notes[-3:]:
                    desc = note["description"] or ""
                    if len(desc) > 100:
                        desc = desc[:100] + "..."
                    summary_lines.append(f"  - {desc}")

            summary = "\n".join(summary_lines)

            # Store summary on task
            conn.execute("""
                UPDATE tasks SET activity_summary = ?, updated_at = ?
                WHERE id = ?
            """, (summary, now, task_id))

            # Optionally delete raw entries (keep last 3 for context)
            if delete_raw and len(rows) >= 3:
                keep_ids = [r["id"] for r in rows[-3:]]
                placeholders = ",".join("?" * len(keep_ids))
                conn.execute(f"""
                    DELETE FROM task_activity
                    WHERE task_id = ? AND id NOT IN ({placeholders})
                """, [task_id] + keep_ids)

            conn.commit()
            return summary
        except sqlite3.Error:
            return None
        finally:
            conn.close()
