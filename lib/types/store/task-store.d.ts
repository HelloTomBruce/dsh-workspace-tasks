import type { DecisionRecord, ProjectTask, TaskCheckpoint, TraceRef, TaskPriority, WorkspaceTasksDocument, WorkspaceTasksSummary } from "./types.ts";
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
    static createTasks(workspacePath: string, items: Array<{
        title: string;
        description?: string;
        priority?: TaskPriority;
        tags?: string[];
        assignee?: string;
        dependsOn?: string[];
    }>): Promise<ProjectTask[]>;
    static createTask(workspacePath: string, params: {
        title: string;
        description?: string;
        priority?: TaskPriority;
        tags?: string[];
        assignee?: string;
        dependsOn?: string[];
    }): Promise<ProjectTask>;
    static updateTask(workspacePath: string, taskId: string, patch: Partial<Pick<ProjectTask, "title" | "description" | "status" | "priority" | "tags" | "assignee" | "dependsOn">>): Promise<ProjectTask | null>;
    /**
     * 查询任务过程检查点（append-only 事件日志，最新在前）。
     */
    static getTaskHistory(workspacePath: string, taskId: string): Promise<TaskCheckpoint[]>;
    /**
     * 添加跨工作区痕迹引用（只读）。引用存于本工作区任务上，与被引用方完全解耦；
     * 解析（resolveTraceRefs）失败时引用仍保留，仅标记悬挂。
     */
    static addTraceRef(workspacePath: string, taskId: string, ref: {
        workspacePath: string;
        taskId: string;
        note?: string;
    }): Promise<ProjectTask | null>;
    /**
     * 解析任务上的跨工作区引用：读取来源工作区任务，填充 resolved
     * （title + 最新结论摘要）；来源不可达时标记 dangling，不抛错、不丢引用。
     */
    static resolveTraceRefs(workspacePath: string, taskId: string): Promise<TraceRef[] | null>;
    static addConclusion(workspacePath: string, taskId: string, conclusion: {
        summary: string;
        deliverables?: string[];
        insights?: string[];
    }): Promise<ProjectTask | null>;
    /**
     * 追加决策记录（append-only）。决策正文一旦写入即不可改写；
     * 若对同一问题改主意，请用 supersedeDecision 生成新决策并建立 supersededBy 链。
     * sessionId 仅为装饰性溯源线索，可悬挂，不参与任何读取依赖。
     */
    static addDecision(workspacePath: string, taskId: string, decision: {
        title: string;
        rationale: string;
        alternatives?: string[];
        actor?: string;
        sessionId?: string;
    }): Promise<DecisionRecord | null>;
    /**
     * 取代（supersede）一条既有决策：仅给旧记录打上 supersededBy 标记，不改写其正文；
     * 并以新决策的身份追加一条新记录（newDecision 完整自包含），建立演进链。
     * 返回新决策记录；旧决策不存在或已被取代时返回 null。
     */
    static supersedeDecision(workspacePath: string, taskId: string, supersededDecisionId: string, newDecision: {
        title: string;
        rationale: string;
        alternatives?: string[];
        actor?: string;
        sessionId?: string;
    }): Promise<DecisionRecord | null>;
    /**
     * 查询任务决策日志（含被 supersede 的历史），按 decidedAt 倒序。
     * sessionId 悬挂与否不影响读取——决策内容全部自包含。
     */
    static listDecisions(workspacePath: string, taskId: string): Promise<DecisionRecord[]>;
    static archiveTask(workspacePath: string, taskId: string): Promise<ProjectTask | null>;
    static deleteTask(workspacePath: string, taskId: string): Promise<boolean>;
    static getReadyTasks(workspacePath: string): Promise<ProjectTask[]>;
    static exportSummaryReport(workspacePath: string): Promise<string>;
}
//# sourceMappingURL=task-store.d.ts.map