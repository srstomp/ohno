/**
 * Output utilities for CLI
 */

import chalk from "chalk";

// Check for NO_COLOR environment variable
const useColor = !process.env.NO_COLOR && !process.env.OHNO_NO_COLOR && process.stdout.isTTY;

export const colors = {
  green: useColor ? chalk.green : (s: string) => s,
  red: useColor ? chalk.red : (s: string) => s,
  yellow: useColor ? chalk.yellow : (s: string) => s,
  blue: useColor ? chalk.blue : (s: string) => s,
  dim: useColor ? chalk.dim : (s: string) => s,
  bold: useColor ? chalk.bold : (s: string) => s,
  cyan: useColor ? chalk.cyan : (s: string) => s,
};

/**
 * Output handler with JSON and quiet mode support
 */
export class Output {
  private jsonMode = false;
  private quietMode = false;

  setJsonMode(enabled: boolean): void {
    this.jsonMode = enabled;
  }

  setQuietMode(enabled: boolean): void {
    this.quietMode = enabled;
  }

  isJsonMode(): boolean {
    return this.jsonMode;
  }

  /**
   * Print message to stdout
   */
  print(message: string): void {
    if (!this.quietMode) {
      console.log(message);
    }
  }

  /**
   * Print success message
   */
  success(message: string): void {
    if (!this.quietMode) {
      console.log(colors.green("✓") + " " + message);
    }
  }

  /**
   * Print warning message
   */
  warn(message: string): void {
    if (!this.quietMode) {
      console.log(colors.yellow("⚠") + " " + message);
    }
  }

  /**
   * Print error message
   */
  error(message: string, context?: string, suggestion?: string): void {
    console.error(colors.red("✗") + " " + message);
    if (context) {
      console.error(colors.dim("  " + context));
    }
    if (suggestion) {
      console.error(colors.dim("  Hint: " + suggestion));
    }
  }

  /**
   * Print info message
   */
  info(message: string): void {
    if (!this.quietMode) {
      console.log(colors.blue("ℹ") + " " + message);
    }
  }

  /**
   * Output JSON data
   */
  json(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  }

  /**
   * Output data as JSON if in JSON mode, otherwise format nicely
   */
  output(data: unknown, formatter?: (data: unknown) => string): void {
    if (this.jsonMode) {
      this.json(data);
    } else if (formatter) {
      this.print(formatter(data));
    } else {
      this.print(String(data));
    }
  }
}

// Global output instance
export const out = new Output();

/**
 * Format a task for display
 */
export function formatTask(task: Record<string, unknown>): string {
  const lines: string[] = [];

  const id = colors.dim(String(task.id ?? ""));
  const title = colors.bold(String(task.title ?? ""));
  const status = formatStatus(String(task.status ?? "todo"));

  lines.push(`${id} ${title}`);
  lines.push(`  Status: ${status}`);

  if (task.task_type) {
    lines.push(`  Type: ${task.task_type}`);
  }

  if (task.epic_priority) {
    lines.push(`  Priority: ${formatPriority(String(task.epic_priority))}`);
  }

  if (task.progress_percent !== undefined && task.progress_percent !== null) {
    lines.push(`  Progress: ${task.progress_percent}%`);
  }

  if (task.description) {
    lines.push(`  Description: ${task.description}`);
  }

  if (task.blockers) {
    lines.push(`  ${colors.red("Blocker:")} ${task.blockers}`);
  }

  if (task.handoff_notes) {
    lines.push(`  Handoff: ${task.handoff_notes}`);
  }

  return lines.join("\n");
}

/**
 * Format status with color
 */
export function formatStatus(status: string): string {
  switch (status) {
    case "done":
      return colors.green(status);
    case "in_progress":
      return colors.blue(status);
    case "blocked":
      return colors.red(status);
    case "review":
      return colors.yellow(status);
    default:
      return colors.dim(status);
  }
}

/**
 * Format priority with color
 */
export function formatPriority(priority: string): string {
  switch (priority) {
    case "P0":
      return colors.red(priority);
    case "P1":
      return colors.yellow(priority);
    case "P2":
      return colors.blue(priority);
    default:
      return colors.dim(priority);
  }
}

/**
 * Format a table row
 */
export function formatTableRow(columns: string[], widths: number[]): string {
  return columns
    .map((col, i) => col.padEnd(widths[i] ?? 10))
    .join("  ");
}
