/**
 * Static kanban board renderer (print and exit)
 */

import { colors } from "../output.js";
import type { KanbanData, KanbanTask } from "./kanban-data.js";

function formatColumn(title: string, tasks: KanbanTask[], width: number): string[] {
  const lines: string[] = [];
  const header = `─ ${title} ─`.padEnd(width, "─");
  lines.push(header);

  if (tasks.length === 0) {
    lines.push(colors.dim("  (empty)".padEnd(width)));
  } else {
    for (const task of tasks.slice(0, 10)) {
      const id = colors.dim(`#${task.id.slice(-4)}`);
      const taskTitle = task.title.slice(0, width - 8);
      lines.push(`${id} ${taskTitle}`);
    }
    if (tasks.length > 10) {
      lines.push(colors.dim(`  +${tasks.length - 10} more`));
    }
  }

  return lines;
}

export function renderStaticKanban(data: KanbanData): void {
  const width = 18;
  const pending = [...data.todo, ...data.blocked];

  const cols = [
    formatColumn("Pending", pending, width),
    formatColumn("In Progress", data.inProgress, width),
    formatColumn("Review", data.review, width),
    formatColumn("Done", data.done, width),
  ];

  // Find max height
  const maxHeight = Math.max(...cols.map((c) => c.length));

  // Pad columns to same height
  for (const col of cols) {
    while (col.length < maxHeight) {
      col.push("".padEnd(width));
    }
  }

  // Print row by row
  for (let i = 0; i < maxHeight; i++) {
    console.log(cols.map((c) => c[i]).join(" │ "));
  }

  console.log("");
  console.log(colors.dim("Use --watch for interactive mode"));
}
