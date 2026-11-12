import { findCurrentSession } from "./dsh-open.ts";

/**
 * 按目标工作区路径匹配会话：sessions 列表快照的行带 cwd，
 * 取 cwd 归一化相等且最近更新的会话——跨工作区派发的路由依据。
 * 路径不匹配宁可返回 undefined（调用方走 connectWorkspace 唤起目标工作区会话，
 * 或宣告失败），绝不把 B 工作区的活送进 A 工作区的会话。
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
 * 按工作区路径在 workspaces.list 快照中精确匹配 workspaceId——
 * 无同 cwd 会话时，connectWorkspace 唤起目标工作区会话的路由依据。
 */
function findWorkspaceIdByPath(ctx: unknown, workspacePath: string): string | undefined {
  try {
    const normalize = (p: string) => p.replace(/[/\\]+$/, "");
    const target = normalize(workspacePath);
    const items = (((ctx as any)?.workspaces?.list?.getSnapshot?.()?.items ?? []) as Array<{
      workspaceId?: string;
      path?: string;
    }>);
    return items.find((w) => w.path && normalize(w.path) === target)?.workspaceId;
  } catch {
    return undefined;
  }
}

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
export async function dispatchPromptToAgent(
  prompt: string,
  opts?: { workspaceId?: string; workspacePath?: string; sessionId?: string }
): Promise<boolean> {
  try {
    const dshCtx = (window as unknown as { __DSH_TASK_CLIENT_CTX__?: any }).__DSH_TASK_CLIENT_CTX__;
    if (!dshCtx) return false;

    // 0. 直发指定会话（唤醒场景）：跳过一切路由
    let targetSessionId: string | undefined = opts?.sessionId;

    if (!targetSessionId && opts?.workspacePath) {
      // A. 严格路由
      const matched = findSessionByCwd(dshCtx, opts.workspacePath);
      if (matched) targetSessionId = matched;

      if (!targetSessionId) {
        const wsId = opts.workspaceId ?? findWorkspaceIdByPath(dshCtx, opts.workspacePath);
        if (wsId && dshCtx?.uiWorkspace?.connectWorkspace) {
          try {
            targetSessionId = await dshCtx.uiWorkspace.connectWorkspace(wsId);
            if (targetSessionId && dshCtx.uiWorkspace?.openSession) {
              dshCtx.uiWorkspace.openSession(targetSessionId);
            }
          } catch (e) {
            console.warn("[dsh-workspace-tasks] connectWorkspace failed:", e);
          }
        }
      }

      if (!targetSessionId) return false;
    } else if (!targetSessionId) {
      // B. 旧路径：当前会话兜底链
      targetSessionId = findCurrentSession(dshCtx)?.sessionId;

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
    }

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

/**
 * 派发提示词统一模板（单一来源）：
 * 所有派发调用点（就绪横幅/任务卡片/中台/后台执行器）共用，
 * 消除「4 处文案各异」的模板漂移——带工作区根目录的强模板对单工作区派发同样无害。
 *
 * @param auto 无人值守自动派发时加 [自动派发] 前缀，便于 Agent 与人区分来源
 */
export function buildDispatchPrompt(
  task: { id: string; title: string; description?: string },
  opts?: { workspacePath?: string; auto?: boolean }
): string {
  const header = `${opts?.auto ? "[自动派发] " : ""}请帮我执行工作区就绪任务 [${task.id}]: "${task.title}"。`;
  const wsLine = opts?.workspacePath ? `\n【工作区根目录】：${opts.workspacePath}` : "";
  const descBlock = task.description ? `\n任务详情：\n${task.description}` : "";
  return `${header}${wsLine}${descBlock}\n\n请先用 workspace_task 的 update 把状态置为 in_progress（会自动获取认领锁），完成后用 conclude 登记执行结论与交付物。`;
}

/**
 * 批红/驳回后唤醒原执行会话（审批反馈闭环）：
 * 任务 blocked 期间 Agent 已停轮退场，人批红后按认领锁的 sessionHint 定向注入反馈，
 * Agent 被唤醒后读取决策记录无缝续跑——不需要人再手动告知一句。
 *
 * 返回 sent / no-session（无 sessionHint 可寻）/ failed（会话已关闭等发送失败），
 * 调用方据此给出「已唤醒 / 需手动告知」的反馈。
 */
export async function notifyApprovalResolved(opts: {
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
}): Promise<"sent" | "no-session" | "failed"> {
  if (!opts.sessionHint) return "no-session";
  const prompt = opts.approved
    ? `[批红反馈] 任务 [${opts.taskId}] 的票拟「${opts.approvalTitle}」已被批红 ✓ 选中选项：「${opts.optionLabel ?? ""}」。批红决策已自动落盘为不可改写的 DecisionRecord，任务已恢复执行（认领锁仍在你这里）。请用 workspace_task 的 get_task_history 查看决策与审批记录，然后继续执行该任务。`
    : `[批红反馈] 任务 [${opts.taskId}] 的票拟「${opts.approvalTitle}」已被驳回 ✕。${opts.note ? `驳回备注：${opts.note}。` : ""}任务保持 blocked，请重新规划：调整方案后可重新提交 request_approval，或按备注方向继续。`;
  const ok = await dispatchPromptToAgent(prompt, {
    sessionId: opts.sessionHint,
    workspacePath: opts.workspacePath,
  });
  return ok ? "sent" : "failed";
}
