/**
 * Interactive Kanban with keyboard navigation
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { KanbanBoard } from "./KanbanBoard.js";
import type { KanbanData } from "./kanban-data.js";

interface InteractiveKanbanProps {
  initialData: KanbanData;
  onRefresh?: () => Promise<KanbanData>;
  onMoveTask?: (taskId: string, newStatus: string) => Promise<void>;
}

export function InteractiveKanban({
  initialData,
  onRefresh,
  onMoveTask
}: InteractiveKanbanProps): React.ReactElement {
  const { exit } = useApp();
  const [data, setData] = useState(initialData);
  const [selectedColumn, setSelectedColumn] = useState(0);
  const [selectedRow, setSelectedRow] = useState(0);

  const columns = [
    { tasks: [...data.todo, ...data.blocked], status: "todo" },
    { tasks: data.inProgress, status: "in_progress" },
    { tasks: data.review, status: "review" },
    { tasks: data.done, status: "done" },
  ];

  const currentColumn = columns[selectedColumn];
  const maxRow = Math.max(0, currentColumn.tasks.length - 1);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit();
      return;
    }

    if (key.leftArrow) {
      setSelectedColumn((c) => Math.max(0, c - 1));
      setSelectedRow(0);
    } else if (key.rightArrow) {
      setSelectedColumn((c) => Math.min(3, c + 1));
      setSelectedRow(0);
    } else if (key.upArrow) {
      setSelectedRow((r) => Math.max(0, r - 1));
    } else if (key.downArrow) {
      setSelectedRow((r) => Math.min(maxRow, r + 1));
    } else if (input === "m" && currentColumn.tasks[selectedRow]) {
      // Move to next status
      const task = currentColumn.tasks[selectedRow];
      const nextStatus = selectedColumn < 3 ? columns[selectedColumn + 1].status : "done";
      onMoveTask?.(task.id, nextStatus);
    } else if (input === "M" && currentColumn.tasks[selectedRow]) {
      // Move to previous status
      const task = currentColumn.tasks[selectedRow];
      const prevStatus = selectedColumn > 0 ? columns[selectedColumn - 1].status : "todo";
      onMoveTask?.(task.id, prevStatus);
    }
  });

  // Auto-refresh (only update state if data actually changed)
  useEffect(() => {
    if (!onRefresh) return;
    const interval = setInterval(async () => {
      const newData = await onRefresh();
      setData((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(newData)) return prev;
        return newData;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  return (
    <Box flexDirection="column">
      <KanbanBoard
        data={data}
        selectedColumn={selectedColumn}
        selectedRow={selectedRow}
      />
      <Box marginTop={1}>
        <Text dimColor>
          [←→] Column  [↑↓] Select  [m/M] Move  [q] Quit
        </Text>
      </Box>
    </Box>
  );
}
