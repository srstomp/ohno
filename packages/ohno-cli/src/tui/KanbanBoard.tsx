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
}

function Column({ title, tasks, color, isSelected, selectedRow }: ColumnProps): React.ReactElement {
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
        {tasks.length === 0 ? (
          <Text dimColor>No tasks</Text>
        ) : (
          tasks.map((task, idx) => (
            <Text key={task.id} wrap="truncate">
              {isSelected && idx === selectedRow ? "▶" : " "}
              {task.title}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

interface KanbanBoardProps {
  data: KanbanData;
  selectedColumn?: number;
  selectedRow?: number;
}

export function KanbanBoard({ data, selectedColumn, selectedRow }: KanbanBoardProps): React.ReactElement {
  const columns = [
    { title: "Pending", tasks: [...data.todo, ...data.blocked], color: "gray" },
    { title: "In Progress", tasks: data.inProgress, color: "blue" },
    { title: "Review", tasks: data.review, color: "yellow" },
    { title: "Done", tasks: data.done, color: "green" },
  ];

  return (
    <Box flexDirection="row">
      {columns.map((col, idx) => (
        <Column
          key={col.title}
          title={col.title}
          tasks={col.tasks}
          color={col.color}
          isSelected={selectedColumn !== undefined && idx === selectedColumn}
          selectedRow={selectedColumn !== undefined && idx === selectedColumn ? selectedRow : undefined}
        />
      ))}
    </Box>
  );
}
