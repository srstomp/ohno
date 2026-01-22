# @stevestomp/ohno-core

Core database layer for [Ohno](https://github.com/srstomp/ohno) task management.

Provides the `TaskDatabase` class and TypeScript types used by `@stevestomp/ohno-cli` and `@stevestomp/ohno-mcp`.

## Features

- **Pure JavaScript SQLite** - Uses sql.js (WebAssembly), no native bindings
- **Works everywhere** - Any Node.js version, no build tools required
- **TypeScript** - Full type definitions included
- **Async API** - Modern async/await interface

## Installation

```bash
npm install @stevestomp/ohno-core
```

## Usage

```typescript
import { TaskDatabase } from '@stevestomp/ohno-core';

// Open or create database
const db = await TaskDatabase.open('/path/to/.ohno/tasks.db');

// Create a story to organize tasks
const storyId = db.createStory({
  title: 'User Authentication',
  description: 'Implement login and signup flows'
});

// Create a task under the story
const taskId = db.createTask({
  title: 'Fix the bug',
  story_id: storyId,
  task_type: 'bug',
  description: 'Login fails on mobile'
});

// Update status
db.updateTaskStatus(taskId, 'in_progress');

// Get task
const task = db.getTask(taskId);

// List tasks
const tasks = db.getTasks({ status: 'todo', limit: 10 });

// Get session context (for AI agents)
const context = db.getSessionContext();

// Close when done
db.close();
```

## API

### TaskDatabase

```typescript
// Factory method (async)
static async open(dbPath: string): Promise<TaskDatabase>

// Story operations
createStory(options: CreateStoryOptions): string
getStory(storyId: string): Story | null

// Task operations
createTask(options: CreateTaskOptions): string
getTask(taskId: string): Task | null
getTasks(options?: GetTasksOptions): Task[]
updateTask(taskId: string, updates: Partial<Task>): void
updateTaskStatus(taskId: string, status: TaskStatus, notes?: string): void
archiveTask(taskId: string, reason?: string): void

// Progress & blockers
updateTaskProgress(taskId: string, percent: number, contextSummary?: string): void
setBlocker(taskId: string, reason: string): void
resolveBlocker(taskId: string): void
setHandoffNotes(taskId: string, notes: string): void

// Dependencies
addDependency(taskId: string, dependsOnTaskId: string, type?: DependencyType): string | null
removeDependency(taskId: string, dependsOnTaskId: string): boolean
getTaskDependencies(taskId: string): TaskDependency[]
getBlockingDependencies(taskId: string): string[]

// Activity
addTaskActivity(taskId: string, type: string, description: string): string
getTaskActivity(taskId: string): TaskActivity[]

// Context
getProjectStatus(): ProjectStatus
getSessionContext(): SessionContext
getNextTask(): Task | null
getBlockedTasks(): Task[]

// Lifecycle
close(): void
async reload(): Promise<void>
```

### Types

```typescript
type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked' | 'archived';
type TaskType = 'feature' | 'bug' | 'chore' | 'spike' | 'test';
type DependencyType = 'blocks' | 'requires' | 'relates_to';
```

## Utilities

```typescript
import { findDbPath, findOhnoDir, ensureOhnoDir } from '@stevestomp/ohno-core';

// Find .ohno/tasks.db walking up from cwd
const dbPath = findDbPath();

// Find .ohno directory
const ohnoDir = findOhnoDir();

// Create .ohno directory if needed
const dir = ensureOhnoDir('/path/to/project');
```

## License

MIT
