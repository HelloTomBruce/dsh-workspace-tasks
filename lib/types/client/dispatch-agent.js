import { findCurrentSession } from "./dsh-open.js";
/**
 * 把派发提示词送进当前 Agent 会话（统一派发通道）。
 *
 * 会话解析顺序：主视图活跃 session → DOM data 属性 → localStorage →
 * uiWorkspace.connectWorkspace(workspaceId)（实在没有会话时按工作区连一个）。
 * 发送通道按可用性降级：sessions.binding(sessionId).session.prompt（队列模式）
 * → sessions.scope(sessionId).conversation.send（字符串签名）。
 *
 * 返回是否真正送达。调用方据此决定兜底（如复制剪贴板）或回执（ack failed）。
 * 注意：conversation.send 的签名是 send(text: string)，不是 send({ text })。
 */
export async function dispatchPromptToAgent(prompt, opts) {
    try {
        const dshCtx = window.__DSH_TASK_CLIENT_CTX__;
        if (!dshCtx)
            return false;
        let targetSessionId = findCurrentSession(dshCtx)?.sessionId;
        if (!targetSessionId && typeof document !== "undefined") {
            targetSessionId =
                document.querySelector("[data-sidebar-right-session]")?.getAttribute("data-sidebar-right-session") ||
                    document.querySelector("[data-session-id]")?.getAttribute("data-session-id") ||
                    undefined;
        }
        if (!targetSessionId && typeof localStorage !== "undefined") {
            try {
                const raw = localStorage.getItem("dsh.sessions.current");
                if (raw)
                    targetSessionId = JSON.parse(raw)?.sessionId;
            }
            catch { }
        }
        if (!targetSessionId && opts?.workspaceId && dshCtx?.uiWorkspace?.connectWorkspace) {
            try {
                targetSessionId = await dshCtx.uiWorkspace.connectWorkspace(opts.workspaceId);
                if (targetSessionId && dshCtx.uiWorkspace?.openSession) {
                    dshCtx.uiWorkspace.openSession(targetSessionId);
                }
            }
            catch (e) {
                console.warn("[dsh-workspace-tasks] connectWorkspace failed:", e);
            }
        }
        if (!targetSessionId)
            return false;
        // 通道 1：session binding 的 prompt（queue 模式排队，不打断正在跑的回合）
        try {
            const binding = dshCtx.sessions?.binding?.(targetSessionId);
            if (binding?.session?.prompt) {
                const res = await binding.session.prompt([{ type: "text", text: prompt }], "queue");
                if (!res || res.ok !== false)
                    return true;
            }
        }
        catch (e) {
            console.warn("[dsh-workspace-tasks] binding.session.prompt error:", e);
        }
        // 通道 2：scoped conversation.send（注意：签名为 send(text)，不是 send({ text })）
        try {
            const scopedCtx = dshCtx.sessions?.scope?.(targetSessionId);
            if (scopedCtx?.conversation?.send) {
                await scopedCtx.conversation.send(prompt);
                return true;
            }
        }
        catch (e) {
            console.warn("[dsh-workspace-tasks] scopedCtx.conversation.send error:", e);
        }
        return false;
    }
    catch (e) {
        console.warn("[dsh-workspace-tasks] dispatchPromptToAgent failed:", e);
        return false;
    }
}
//# sourceMappingURL=dispatch-agent.js.map