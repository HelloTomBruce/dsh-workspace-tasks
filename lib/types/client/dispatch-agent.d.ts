/**
 * 把派发提示词送进 Agent 会话（统一派发通道）。
 *
 * 会话解析顺序：
 * 1. 指定 workspacePath 时优先按 cwd 匹配该工作区的会话（跨工作区派发的路由依据）；
 * 2. 主视图活跃 session → DOM data 属性 → localStorage →
 *    uiWorkspace.connectWorkspace(workspaceId)（实在没有会话时按工作区连一个）。
 * 发送通道按可用性降级：sessions.binding(sessionId).session.prompt（队列模式）
 * → sessions.scope(sessionId).conversation.send（字符串签名）。
 *
 * 返回是否真正送达。调用方据此决定兜底（如复制剪贴板）或回执（ack failed）。
 * 注意：conversation.send 的签名是 send(text: string)，不是 send({ text })。
 */
export declare function dispatchPromptToAgent(prompt: string, opts?: {
    workspaceId?: string;
    workspacePath?: string;
}): Promise<boolean>;
//# sourceMappingURL=dispatch-agent.d.ts.map