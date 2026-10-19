import type { ProjectTask, TaskPriority, WorkspaceTasksDocument, WorkspaceTasksSummary } from "./types.ts";
/**
 * 获取本地持久化根目录：统一存放在用户本地 ~/.dsh/storages/workspace-tasks/，
 * 绝不污染用户代码仓库，也绝不参与 Git 跟踪与提交。
 */
export declare function getStorageDir(): string;
/**
 * 根据工作区绝对路径生成唯一的本地存储文件名。
 * 格式形如：<工作区文件夹名>-<sha256前8位>.json
 */
export declare function getTasksFilePath(workspacePath: string): string;
export declare class TaskStore {
    static load(workspacePath: string): Promise<WorkspaceTasksDocument>;
    static save(workspacePath: string, doc: WorkspaceTasksDocument): Promise<void>;
    static listTasks(workspacePath: string): Promise<{
        tasks: ProjectTask[];
        summary: WorkspaceTasksSummary;
    }>;
    static createTask(workspacePath: string, params: {
        title: string;
        description?: string;
        priority?: TaskPriority;
        assignee?: string;
        sessionId?: string;
    }): Promise<ProjectTask>;
    static updateTask(workspacePath: string, taskId: string, patch: Partial<Pick<ProjectTask, "title" | "description" | "status" | "priority" | "assignee">>): Promise<ProjectTask | null>;
    static addConclusion(workspacePath: string, taskId: string, conclusion: {
        summary: string;
        deliverables?: string[];
        insights?: string[];
        sessionId?: string;
    }): Promise<ProjectTask | null>;
    static deleteTask(workspacePath: string, taskId: string): Promise<boolean>;
}
//# sourceMappingURL=task-store.d.ts.map