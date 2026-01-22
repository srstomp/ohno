/**
 * Kanban data fetching and grouping
 */

import { TaskDatabase, type Task, type TaskStatus } from "@stevestomp/ohno-core";

export interface KanbanTask {
  id: string;
  title: string;
  status: TaskStatus;
  blockers?: string;
  epic_priority?: string;
  progress_percent?: number;
}

export interface KanbanData {
  todo: KanbanTask[];
  inProgress: KanbanTask[];
  review: KanbanTask[];
  done: KanbanTask[];
  blocked: KanbanTask[];
}

/**
 * Fetch and group tasks by status for kanban display
 */
export async function getKanbanData(dbPath: string): Promise<KanbanData> {
  const db = await TaskDatabase.open(dbPath);

  const allTasks = db.getTasks({ limit: 500 });
  db.close();

  const data: KanbanData = {
    todo: [],
    inProgress: [],
    review: [],
    done: [],
    blocked: [],
  };

  for (const task of allTasks) {
    const kanbanTask: KanbanTask = {
      id: task.id,
      title: task.title,
      status: task.status,
      blockers: task.blockers,
      epic_priority: task.epic_priority,
      progress_percent: task.progress_percent,
    };

    switch (task.status) {
      case "todo":
        data.todo.push(kanbanTask);
        break;
      case "in_progress":
        data.inProgress.push(kanbanTask);
        break;
      case "review":
        data.review.push(kanbanTask);
        break;
      case "done":
        data.done.push(kanbanTask);
        break;
      case "blocked":
        data.blocked.push(kanbanTask);
        break;
    }
  }

  return data;
}
