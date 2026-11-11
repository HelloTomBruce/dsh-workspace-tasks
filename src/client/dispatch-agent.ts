import { findCurrentSession } from "./dsh-open.ts";

/**
 * 按目标工作区路径匹配会话：sessions 列表快照的行带 cwd，
 * 取 cwd 归一化相等且最近更新的会话——跨工作区派发的路由依据。
 * 路径不匹配比错误路由更好：宁可返回 undefined 走活跃会话兜底，
 * 也不把 B 工作区的活送进 A 工作区的会话。
 */
function findSessionByCwd(ctx: unknown, workspacePath: string): string | undefined {
  try {
    const normalize = (p: string) => p.replace(/[/\\]+$/, "");
    const target = normalize(workspacePath);
    const listSnapshot = (ctx as any)?.sessions?.list?.getSnapshot?.();
    const rows = Object.values(listSnapshot?.byId ?? {}) as Array<{
      sessionId: string;
      cwd?: string;
      updatedAt?: number;
    }>;
    const candidates = rows.filter((r) => r.cwd && normalize(r.cwd) === target);
    if (candidates.length === 0) return undefined;
    candidates.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return candidates[0]?.sessionId;
  } catch {
    return undefined;
  }
}

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
export async function dispatchPromptToAgent(
  prompt: string,
  opts?: { workspaceId?: string; workspacePath?: string }
): Promise<boolean> {
  try {
    const dshCtx = (window as unknown as { __DSH_TASK_CLIENT_CTX__?: any }).__DSH_TASK_CLIENT_CTX__;
    if (!dshCtx) return false;

    let targetSessionId: string | undefined;

    // 1. 按目标工作区 cwd 精确匹配会话（跨工作区派发的关键路由）
    if (opts?.workspacePath) {
      const matched = findSessionByCwd(dshCtx, opts.workspacePath);
      if (matched) targetSessionId = matched;
    }

    if (!targetSessionId) targetSessionId = findCurrentSession(dshCtx)?.sessionId;

    if (!targetSessionId && typeof document !== "undefined") {
      targetSessionId =
        document.querySelector("[data-sidebar-right-session]")?.getAttribute("data-sidebar-right-session") ||
        document.querySelector("[data-session-id]")?.getAttribute("data-session-id") ||
        undefined;
    }

    if (!targetSessionId && typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem("dsh.sessions.current");
        if (raw) targetSessionId = JSON.parse(raw)?.sessionId;
      } catch {}
    }

    if (!targetSessionId && opts?.workspaceId && dshCtx?.uiWorkspace?.connectWorkspace) {
      try {
        targetSessionId = await dshCtx.uiWorkspace.connectWorkspace(opts.workspaceId);
        if (targetSessionId && dshCtx.uiWorkspace?.openSession) {
          dshCtx.uiWorkspace.openSession(targetSessionId);
        }
      } catch (e) {
        console.warn("[dsh-workspace-tasks] connectWorkspace failed:", e);
      }
    }

    if (!targetSessionId) return false;

    // 通道 1：session binding 的 prompt（queue 模式排队，不打断正在跑的回合）
    try {
      const binding = dshCtx.sessions?.binding?.(targetSessionId);
      if (binding?.session?.prompt) {
        const res = await binding.session.prompt([{ type: "text", text: prompt }], "queue");
        if (!res || res.ok !== false) return true;
      }
    } catch (e) {
      console.warn("[dsh-workspace-tasks] binding.session.prompt error:", e);
    }

    // 通道 2：scoped conversation.send（注意：签名为 send(text)，不是 send({ text })）
    try {
      const scopedCtx = dshCtx.sessions?.scope?.(targetSessionId);
      if (scopedCtx?.conversation?.send) {
        await scopedCtx.conversation.send(prompt);
        return true;
      }
    } catch (e) {
      console.warn("[dsh-workspace-tasks] scopedCtx.conversation.send error:", e);
    }

    return false;
  } catch (e) {
    console.warn("[dsh-workspace-tasks] dispatchPromptToAgent failed:", e);
    return false;
  }
}
