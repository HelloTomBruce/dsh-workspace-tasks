import type { Context } from "@deepseek-ai/cordis";
import type { TaskPriority, TaskStatus } from "../store/types.ts";
export interface TaskCreateItem {
    title: string;
    description?: string;
    priority?: TaskPriority;
    assignee?: string;
    dependsOn?: string[];
}
export interface WorkspaceTaskToolArgs {
    action: "list" | "create" | "update" | "conclude" | "archive" | "delete";
    taskId?: string;
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assignee?: string;
    dependsOn?: string[];
    tasks?: TaskCreateItem[];
    summary?: string;
    deliverables?: string[];
    insights?: string[];
    workspacePath?: string;
}
export declare function registerTaskTools(ctx: Context): () => void;
//# sourceMappingURL=task-tools.d.ts.map