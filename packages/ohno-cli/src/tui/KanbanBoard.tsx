/**
 * Terminal Kanban Board TUI Component
 */

import React from "react";
import { Box, Text } from "ink";
import type { KanbanData, KanbanTask } from "./kanban-data.js";

interface ColumnProps {
  title: string;
  tasks: KanbanTask[];
  color: string;
  isSelected?: boolean;
  selectedRow?: number;
  maxVisible?: number;
  viewportStart?: number;
}

function Column({ title, tasks, color, isSelected, selectedRow, maxVisible, viewportStart = 0 }: ColumnProps): React.ReactElement {
  const effectiveMax = maxVisible ?? tasks.length;
  const visibleTasks = tasks.slice(viewportStart, viewportStart + effectiveMax);
  const hiddenAbove = viewportStart;
  const hiddenBelow = Math.max(0, tasks.length - viewportStart - effectiveMax);

  return (
    <Box flexDirection="column" width={20} marginRight={1}>
      <Box
        borderStyle="single"
        borderColor={isSelected ? "cyan" : color}
        paddingX={1}
      >
        <Text bold color={isSelected ? "cyan" : color}>{title}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {hiddenAbove > 0 && (
          <Text dimColor>{"↑ "}{hiddenAbove} more</Text>
        )}
        {visibleTasks.length === 0 ? (
          <Text dimColor>No tasks</Text>
        ) : (
          visibleTasks.map((task, idx) => (
            <Text key={task.id} wrap="truncate">
              {isSelected && (viewportStart + idx) === selectedRow ? "▶" : " "}
              {task.title}
            </Text>
          ))
        )}
        {hiddenBelow > 0 && (
          <Text dimColor>{"↓ "}{hiddenBelow} more</Text>
        )}
      </Box>
    </Box>
  );
}

interface KanbanBoardProps {
  data: KanbanData;
  selectedColumn?: number;
  selectedRow?: number;
  maxVisible?: number;
  viewportStart?: number;
}

export function KanbanBoard({ data, selectedColumn, selectedRow, maxVisible, viewportStart = 0 }: KanbanBoardProps): React.ReactElement {
  const columns = [
    { title: "Pending", tasks: [...data.todo, ...data.blocked], color: "gray" },
    { title: "In Progress", tasks: data.inProgress, color: "blue" },
    { title: "Review", tasks: data.review, color: "yellow" },
    { title: "Done", tasks: data.done, color: "green" },
  ];

  return (
    <Box flexDirection="row">
      {columns.map((col, idx) => {
        const isSel = selectedColumn !== undefined && idx === selectedColumn;
        return (
          <Column
            key={col.title}
            title={col.title}
            tasks={col.tasks}
            color={col.color}
            isSelected={isSel}
            selectedRow={isSel ? selectedRow : undefined}
            maxVisible={maxVisible}
            viewportStart={isSel ? viewportStart : 0}
          />
        );
      })}
    </Box>
  );
}
