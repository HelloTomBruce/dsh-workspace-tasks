export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked' | 'archived';
export type TaskPriority = 'P0' | 'P1' | 'P2';
export interface TaskConclusion {
    id: string;
    summary: string;
    deliverables?: string[];
    insights?: string[];
    completedAt: string;
}
/**
 * 过程检查点：任务字段变更的 append-only 事件记录，使过程而非仅结果可追溯。
 * from/to 记录变更前后的值快照（JSON 序列化），与任何会话无关。
 */
export interface TaskCheckpoint {
    at: string;
    field: string;
    from: string;
    to: string;
    actor?: string;
}
/**
 * 跨工作区痕迹引用：只读引用另一个工作区的任务，引用与被引用方完全解耦——
 * 被引用方被删除/归档时引用降级为悬挂提示（dangling），绝不阻塞本工作区读写。
 */
export interface TraceRef {
    /** 被引用工作区的绝对路径 */
    workspacePath: string;
    /** 被引用的任务 ID（如 TASK-001） */
    taskId: string;
    /** 引用说明（为什么引用这条痕迹） */
    note?: string;
    /** 解析结果（运行时填充，不持久化）：来源任务标题与最新结论摘要 */
    resolved?: {
        title: string;
        latestSummary?: string;
        dangling?: true;
    };
}
/**
 * 决策记录：自包含、append-only、不可原地改写。
 * 会话/Agent 标注（actor/sessionId）仅为装饰性溯源线索，可悬挂，绝不作为依赖——
 * 决策本体内容永远完整保存在任务文档内，会话删除不影响追溯。
 * 旧决策只能被新决策 supersede（通过 supersededBy 链），正文永不改写。
 */
export interface DecisionRecord {
    id: string;
    title: string;
    /** 决策理由与背景，自包含，不依赖任何外部会话内容 */
    rationale: string;
    /** 已考虑并否决的备选方案（可选） */
    alternatives?: string[];
    /** 决策者标识（自由文本快照，如 "agent" / 用户名） */
    actor?: string;
    /** 产生该决策的会话 ID，仅为提示性线索，可悬挂（装饰性，非外键） */
    sessionId?: string;
    /** 被哪个决策 ID 取代（supersede 链） */
    supersededBy?: string;
    decidedAt: string;
}
/**
 * 任务认领锁：多 Agent 会话并行时防止同时认领同一任务。
 * 租约过期后在读取路径惰性判定释放（无定时器）——崩溃会话持有的锁
 * 最长一个租约周期后自然失效，与「挂起零消耗」哲学一致。
 * sessionHint 仅为装饰性溯源线索，可悬挂。
 */
export interface TaskClaim {
    /** 认领者标识，如 "agent@a1b2c3d4"（有会话信息时）或 "agent" */
    owner: string;
    /** 会话提示（装饰性可悬挂线索） */
    sessionHint?: string;
    claimedAt: string;
    /** ISO 时间，过期即视为释放 */
    leaseUntil: string;
}
/**
 * 审批选项：人批红时的候选分支。label 为纯文本（UI 渲染时转义，只当资料不当指令）。
 */
export interface ApprovalOption {
    id: string;
    label: string;
}
export type ApprovalStatus = "pending" | "approved" | "rejected";
/**
 * 决策请求（票拟→批红）：Agent 遇到需要人拍板的事项时发起，
 * 任务随即转入 blocked 挂起（零消耗，无进程无轮询），等待人在看板批红。
 * 批准后自动落一条 DecisionRecord（含选中选项原话），decisionId 回链；
 * 驳回不落决策，任务保持 blocked 等待 Agent 重新规划。
 * 同一任务同时只允许一条 pending 请求（去重：一件事只问一次）。
 */
export interface ApprovalRequest {
    id: string;
    /** 拍板事项标题（票拟标题） */
    title: string;
    /** 背景说明（可选） */
    detail?: string;
    /** 批红候选（≥2 个） */
    options: ApprovalOption[];
    status: ApprovalStatus;
    /** 请求时的原状态，批红后恢复（通常 in_progress） */
    resumeStatus: TaskStatus;
    /** 批红结果：选中的 option id（approved 时存在） */
    resolvedOptionId?: string;
    /** 批准/驳回时的备注 */
    resolveNote?: string;
    /** 批准自动落盘的决策记录 ID（回链） */
    decisionId?: string;
    createdAt: string;
    resolvedAt?: string;
}
export interface ProjectTask {
    id: string;
    title: string;
    description?: string;
    status: TaskStatus;
    priority: TaskPriority;
    tags?: string[];
    assignee?: string;
    dependsOn?: string[];
    createdAt: string;
    updatedAt: string;
    conclusions: TaskConclusion[];
    /** 决策日志：append-only，新记录 unshift 到头部，只允许 supersede 不允许改写 */
    decisionLog?: DecisionRecord[];
    /** 过程检查点事件日志：append-only，新事件 unshift 到头部（最新在前） */
    history?: TaskCheckpoint[];
    /** 跨工作区痕迹引用（只读，可悬挂） */
    traceRefs?: TraceRef[];
    /** 认领锁：活跃期间其他会话不应认领本任务（惰性过期） */
    claim?: TaskClaim;
    /** 审批请求（票拟）：最新在前；同一任务同时至多一条 pending */
    approvals?: ApprovalRequest[];
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
//# sourceMappingURL=types.d.ts.map