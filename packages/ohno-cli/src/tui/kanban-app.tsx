/**
 * Main kanban TUI application (watch mode)
 */

import React from "react";
import { render, Text } from "ink";
import { InteractiveKanban } from "./InteractiveKanban.js";
import { getKanbanData } from "./kanban-data.js";
import { TaskDatabase } from "@stevestomp/ohno-core";

interface KanbanAppProps {
  dbPath: string;
}

function KanbanApp({ dbPath }: KanbanAppProps): React.ReactElement {
  const [data, setData] = React.useState<Awaited<ReturnType<typeof getKanbanData>> | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getKanbanData(dbPath)
      .then(setData)
      .catch((err) => setError(String(err)));
  }, [dbPath]);

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (!data) {
    return <Text dimColor>Loading...</Text>;
  }

  const handleRefresh = async () => {
    return getKanbanData(dbPath);
  };

  const handleMoveTask = async (taskId: string, newStatus: string) => {
    const db = await TaskDatabase.open(dbPath);
    db.updateTaskStatus(taskId, newStatus as "todo" | "in_progress" | "review" | "done" | "blocked");
    db.close();
    // Refresh data
    const newData = await getKanbanData(dbPath);
    setData(newData);
  };

  return (
    <InteractiveKanban
      initialData={data}
      onRefresh={handleRefresh}
      onMoveTask={handleMoveTask}
    />
  );
}

export async function runKanbanTui(dbPath: string): Promise<void> {
  const { waitUntilExit } = render(<KanbanApp dbPath={dbPath} />);
  await waitUntilExit();
}
