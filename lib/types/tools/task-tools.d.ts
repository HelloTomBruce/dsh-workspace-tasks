import type { Context } from "@deepseek-ai/cordis";
import type { TaskPriority, TaskStatus } from "../store/types.ts";
export interface WorkspaceTaskToolArgs {
    action: "list" | "create" | "update" | "conclude" | "delete";
    taskId?: string;
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assignee?: string;
    summary?: string;
    deliverables?: string[];
    insights?: string[];
    workspacePath?: string;
}
export declare function registerTaskTools(ctx: Context): () => void;
//# sourceMappingURL=task-tools.d.ts.map