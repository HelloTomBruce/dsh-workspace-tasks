/**
 * 把派发提示词送进 Agent 会话（统一派发通道）。
 *
 * 会话解析优先级：
 * 0. opts.sessionId 直发指定会话（批红/驳回后唤醒原执行会话的场景）；
 *
 * A. 指定 workspacePath（跨工作区派发/中台手动派发）——**严格路由**：
 *    1. 按 cwd 精确匹配已有会话；
 *    2. 无匹配则从 workspaces.list 按路径解析 workspaceId，
 *       uiWorkspace.connectWorkspace 唤起目标工作区的会话；
 *    3. 仍无结果返回 false，由调用方兜底（复制提示词 / ack failed）。
 *    绝不退避到「当前活跃会话」——那把 B 工作区的活送进了 A 工作区的会话（串台）。
 *
 * B. 未指定 workspacePath（TaskPanel 按 workspaceId 派发的旧路径）：
 *    主视图活跃 session → DOM data 属性 → localStorage →
 *    uiWorkspace.connectWorkspace(workspaceId)（实在没有会话时按工作区连一个）。
 *
 * 发送通道按可用性降级：sessions.binding(sessionId).session.prompt（队列模式）
 * → sessions.scope(sessionId).conversation.send（字符串签名）。
 *
 * 返回是否真正送达。调用方据此决定兜底（如复制剪贴板）或回执（ack failed）。
 * 注意：conversation.send 的签名是 send(text: string)，不是 send({ text })。
 */
export declare function dispatchPromptToAgent(prompt: string, opts?: {
    workspaceId?: string;
    workspacePath?: string;
    sessionId?: string;
}): Promise<boolean>;
/**
 * 派发提示词统一模板（单一来源）：
 * 所有派发调用点（就绪横幅/任务卡片/中台/后台执行器）共用，
 * 消除「4 处文案各异」的模板漂移——带工作区根目录的强模板对单工作区派发同样无害。
 *
 * @param auto 无人值守自动派发时加 [自动派发] 前缀，便于 Agent 与人区分来源
 */
export declare function buildDispatchPrompt(task: {
    id: string;
    title: string;
    description?: string;
}, opts?: {
    workspacePath?: string;
    auto?: boolean;
}): string;
/**
 * 批红/驳回后唤醒原执行会话（审批反馈闭环）：
 * 任务 blocked 期间 Agent 已停轮退场，人批红后按认领锁的 sessionHint 定向注入反馈，
 * Agent 被唤醒后读取决策记录无缝续跑——不需要人再手动告知一句。
 *
 * 返回 sent / no-session（无 sessionHint 可寻）/ failed（会话已关闭等发送失败），
 * 调用方据此给出「已唤醒 / 需手动告知」的反馈。
 */
export declare function notifyApprovalResolved(opts: {
    taskId: string;
    approvalTitle: string;
    approved: boolean;
    /** 批红选中选项的原文（approved 时传入） */
    optionLabel?: string;
    /** 驳回备注（rejected 时传入） */
    note?: string;
    /** 认领锁上的会话线索（agent 认领时写入） */
    sessionHint?: string;
    workspacePath: string;
}): Promise<"sent" | "no-session" | "failed">;
//# sourceMappingURL=dispatch-agent.d.ts.map