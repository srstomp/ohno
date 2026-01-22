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
}

function Column({ title, tasks, color }: ColumnProps): React.ReactElement {
  return (
    <Box flexDirection="column" width={20} marginRight={1}>
      <Box borderStyle="single" borderColor={color} paddingX={1}>
        <Text bold color={color}>{title}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {tasks.length === 0 ? (
          <Text dimColor>No tasks</Text>
        ) : (
          tasks.map((task) => (
            <Text key={task.id} wrap="truncate">
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
}

export function KanbanBoard({ data }: KanbanBoardProps): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Column title="Pending" tasks={[...data.todo, ...data.blocked]} color="gray" />
      <Column title="In Progress" tasks={data.inProgress} color="blue" />
      <Column title="Review" tasks={data.review} color="yellow" />
      <Column title="Done" tasks={data.done} color="green" />
    </Box>
  );
}
