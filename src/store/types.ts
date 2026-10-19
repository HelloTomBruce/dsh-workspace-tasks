export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked' | 'archived';
export type TaskPriority = 'P0' | 'P1' | 'P2';

export interface TaskConclusion {
  id: string;
  summary: string;
  deliverables?: string[];
  insights?: string[];
  completedAt: string;
  sessionId?: string;
}

export interface ProjectTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
  conclusions: TaskConclusion[];
}

export interface WorkspaceTasksDocument {
  version: number;
  workspacePath: string;
  tasks: ProjectTask[];
  updatedAt: string;
}

export interface WorkspaceTasksSummary {
  total: number;
  todo: number;
  inProgress: number;
  review: number;
  done: number;
  blocked: number;
  archived: number;
}
