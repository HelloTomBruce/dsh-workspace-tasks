import type { ApprovalRequest, DecisionRecord, ProjectTask, TaskCheckpoint, TaskClaim, TraceRef, TaskPriority, WorkspaceTasksDocument, WorkspaceTasksSummary } from "./types.ts";
/**
 * 认领冲突：任务被他人活跃锁定。这是多 Agent 并行的正常分支而非系统错误——
 * 工具层捕获后返回结构化响应（不抛异常），Agent 读到 owner 后应主动让开。
 */
export declare class ClaimConflictError extends Error {
    taskId: string;
    claim: TaskClaim;
    constructor(taskId: string, claim: TaskClaim);
}
export type ClaimResult = {
    ok: true;
    task: ProjectTask;
} | {
    ok: false;
    reason: "not-found" | "conflict";
    claim?: TaskClaim;
};
/**
 * 任务完成事件钩子：addConclusion 与 updateTask(status→done) 后触发。
 * 供自动派发引擎等订阅方使用；监听器同步调用、异常隔离（不影响主流程），
 * 异步工作由监听方自行 fire-and-forget。
 */
export type TaskDoneListener = (workspacePath: string, task: ProjectTask) => void;
export declare function onTaskDone(listener: TaskDoneListener): () => void;
/**
 * 任务创建事件钩子：createTasks 批量创建完成后触发一次（整批一次，非每 task 一次）。
 * 供自动派发引擎把「新建就绪任务」也作为派发时机——批量拆解时由并发闸门保证最多派一条。
 */
export type TasksCreatedListener = (workspacePath: string, tasks: ProjectTask[]) => void;
export declare function onTasksCreated(listener: TasksCreatedListener): () => void;
export type ApprovalResult = {
    ok: true;
    approval: ApprovalRequest;
    task: ProjectTask;
    decision?: DecisionRecord;
} | {
    ok: false;
    reason: "not-found" | "pending-exists" | "invalid" | "not-pending" | "invalid-option";
};
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
export declare function computeSummary(tasks: readonly ProjectTask[]): WorkspaceTasksSummary;
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
    static updateTask(workspacePath: string, taskId: string, patch: Partial<Pick<ProjectTask, "title" | "description" | "status" | "priority" | "tags" | "assignee" | "dependsOn">>, opts?: {
        claimOwner?: string;
        sessionHint?: string;
        leaseMinutes?: number;
    }): Promise<ProjectTask | null>;
    /**
     * 显式认领任务（加锁/续租）。被他人活跃锁定时返回 conflict（结构化，不抛异常）。
     * 同一 owner 重复认领即续租：保留 claimedAt，仅延长 leaseUntil。
     */
    static claimTask(workspacePath: string, taskId: string, opts: {
        owner: string;
        sessionHint?: string;
        leaseMinutes?: number;
    }): Promise<ClaimResult>;
    /**
     * 释放认领锁。幂等：无锁直接成功；锁已过期视为可释放并顺手清理；
     * 活跃锁仅允许 owner 本人或 force（UI 人力强制释放死锁）解除。
     */
    static releaseTask(workspacePath: string, taskId: string, opts?: {
        owner?: string;
        force?: boolean;
    }): Promise<ClaimResult>;
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
    /**
     * 发起决策请求（票拟）：任务随即转入 blocked 挂起（零消耗），resumeStatus 记录原状态。
     * 同一任务同时只允许一条 pending（去重：一件事只问一次）；
     * done/archived 终态任务不允许发起。options 至少 2 个候选。
     * 锁语义：blocked 保留 claim，待批期间其他会话不会把任务捡走。
     */
    static requestApproval(workspacePath: string, taskId: string, req: {
        title: string;
        detail?: string;
        options: string[];
    }): Promise<ApprovalResult>;
    /**
     * 批红（批准）：标记审批通过，自动落一条 DecisionRecord
     * （标题「拍板：…」，rationale 含选中选项原话与背景，actor 默认 human，
     * alternatives 收录未被选中的选项），decisionId 回链到审批记录，
     * 任务状态恢复 resumeStatus。仅接受 pending 状态的请求。
     */
    static resolveApproval(workspacePath: string, taskId: string, approvalId: string, resolution: {
        optionId: string;
        note?: string;
        actor?: string;
    }): Promise<ApprovalResult>;
    /**
     * 驳回：不落决策，任务保持 blocked，等待 Agent 重新规划后发起新的请求。
     */
    static rejectApproval(workspacePath: string, taskId: string, approvalId: string, opts?: {
        note?: string;
    }): Promise<ApprovalResult>;
    /**
     * 跨任务收集所有 pending 审批（供看板「待拍板」横幅）。
     */
    static listPendingApprovals(workspacePath: string): Promise<Array<{
        taskId: string;
        taskTitle: string;
        approval: ApprovalRequest;
    }>>;
    static archiveTask(workspacePath: string, taskId: string): Promise<ProjectTask | null>;
    static deleteTask(workspacePath: string, taskId: string): Promise<boolean>;
    static getReadyTasks(workspacePath: string, opts?: {
        owner?: string;
    }): Promise<ProjectTask[]>;
    static exportSummaryReport(workspacePath: string): Promise<string>;
}
//# sourceMappingURL=task-store.d.ts.map