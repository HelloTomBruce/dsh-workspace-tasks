import { createElement, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { ApprovalRequest, ProjectTask } from "../store/types.ts";
import type { GlobalOverview, WorkspaceOverview } from "../store/global.ts";
import { setPendingNav } from "./pending-nav.ts";
import { MarkdownContent } from "./markdown.tsx";
import { findCurrentSession } from "./dsh-open.ts";

/**
 * 任务中台（跨工作区全局看板）：主区域全宽面板。
 * 只回答一个问题——「现在哪里需要我」：待拍板 / 待验收 / 进行中 / 阻塞 / 就绪。
 * 点击任务行打开详情弹窗（自足的，不跨界面跳）；待拍板的任务在弹窗里直接批红。
 */

const API_BASE = "/__dsh-tasks__";

function useGlobalOverview(): { data: GlobalOverview | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<GlobalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(`${API_BASE}/global`, { cache: "no-store" })
        .then((r) => r.json() as Promise<{ ok: boolean; data?: GlobalOverview }>)
        .then((res) => {
          if (alive && res.ok && res.data) setData(res.data);
        })
        .catch(() => {})
        .finally(() => {
          if (alive) setLoading(false);
        });
    };
    load();
    const timer = setInterval(load, 3000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [tick]);

  return { data, loading, refresh: () => setTick((t) => t + 1) };
}

/**
 * 跳回右栏工作区看板（工作区卡片标题用）。中台占据主区域时没有会话面板，
 * sidebarRight.openTab 会抛「no session surface is mounted」——先查会话再跳，避免噪音。
 */
function navigateToWorkspaceBoard(workspacePath: string): void {
  setPendingNav({ workspacePath });
  const dshCtx = (window as unknown as { __DSH_TASK_CLIENT_CTX__?: any }).__DSH_TASK_CLIENT_CTX__;
  const hasSession = Boolean(findCurrentSession(dshCtx)?.sessionId);
  if (!hasSession) return; // 中台在主区域时无会话面板，挂单已写，看板下次打开时会消费
  try {
    dshCtx?.sidebarRight?.openTab?.("workspace-tasks");
  } catch (e) {
    console.warn("[dsh-workspace-tasks] openTab failed:", e);
  }
  window.dispatchEvent(
    new CustomEvent("dsh-tasks:open-workspace", { detail: { workspacePath } })
  );
}

function claimLabel(task: ProjectTask): string | null {
  if (!task.claim) return null;
  const remain = new Date(task.claim.leaseUntil).getTime() - Date.now();
  if (Number.isNaN(remain) || remain <= 0) return `🔓 锁已过期`;
  return `🔒 ${task.claim.owner} · 剩 ${Math.max(1, Math.ceil(remain / 60000))} 分钟`;
}

const dispatchModeBadge = (mode: "observe" | "auto" | "off"): { icon: string; label: string } =>
  mode === "auto" ? { icon: "⚡", label: "自动派发" } : mode === "observe" ? { icon: "👁️", label: "观察模式" } : { icon: "⏸️", label: "派发关闭" };

const STATUS_LABEL: Record<string, string> = {
  todo: "待办",
  in_progress: "进行中",
  review: "待验收",
  done: "已完成",
  blocked: "阻塞",
  archived: "已归档",
};

interface SelectedTask {
  ws: WorkspaceOverview;
  task: ProjectTask;
}

function TaskRow({
  task,
  extra,
  onOpen,
}: {
  task: ProjectTask;
  extra?: string;
  onOpen: () => void;
}) {
  return createElement(
    "button",
    {
      type: "button",
      style: rowStyle,
      title: `查看 ${task.id} 详情`,
      onClick: onOpen,
    },
    createElement("span", { style: rowIdStyle }, task.id),
    createElement("span", { style: rowTitleStyle }, task.title),
    extra && createElement("span", { style: rowExtraStyle }, extra)
  );
}

function Group({
  icon,
  label,
  count,
  color,
  children,
}: {
  icon: string;
  label: string;
  count: number;
  color: string;
  children?: ReactNode;
}) {
  if (count === 0) return null;
  return createElement(
    "div",
    { style: groupStyle },
    createElement(
      "div",
      { style: { ...groupLabelStyle, color } },
      `${icon} ${label} (${count})`
    ),
    children
  );
}

/** 任务详情弹窗：中台自足——看详情、读决策、待拍板直接批红，不用离开中台 */
function TaskDetailModal({
  sel,
  onClose,
  onResolved,
}: {
  sel: SelectedTask;
  onClose: () => void;
  onResolved: () => void;
}) {
  const { ws, task } = sel;
  const [resolving, setResolving] = useState(false);
  const pendingApproval = (task.approvals ?? []).find((a) => a.status === "pending");
  const decisions = task.decisionLog ?? [];
  const checkpoints = (task.history ?? []).slice(0, 8);
  const conclusions = task.conclusions ?? [];
  const traceRefs = task.traceRefs ?? [];

  const resolveApproval = async (approval: ApprovalRequest, optionId: string) => {
    if (resolving) return;
    setResolving(true);
    try {
      await fetch(`${API_BASE}/approval/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspacePath: ws.workspacePath,
          taskId: task.id,
          approvalId: approval.id,
          optionId,
          actor: "human",
        }),
      });
      onResolved();
    } catch (e) {
      console.error(e);
    } finally {
      setResolving(false);
    }
  };

  const rejectApproval = async (approval: ApprovalRequest) => {
    if (resolving) return;
    const note = prompt("驳回备注（可选）：") ?? "";
    setResolving(true);
    try {
      await fetch(`${API_BASE}/approval/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspacePath: ws.workspacePath, taskId: task.id, approvalId: approval.id, note }),
      });
      onResolved();
    } catch (e) {
      console.error(e);
    } finally {
      setResolving(false);
    }
  };

  return createElement(
    "div",
    { style: modalOverlayStyle, onClick: onClose },
    createElement(
      "div",
      { style: modalContentStyle, onClick: (e: any) => e.stopPropagation() },
      // 头部：优先级 + ID + 标题 + 状态
      createElement(
        "div",
        { style: modalHeaderStyle },
        createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
          createElement("span", { style: modalIdStyle }, task.id),
          createElement("span", { style: statusChipStyle }, STATUS_LABEL[task.status] ?? task.status),
          createElement("span", { style: priorityChipStyle }, task.priority),
          claimLabel(task) && createElement("span", { style: claimChipStyle }, claimLabel(task))
        ),
        createElement("h3", { style: modalTitleStyle }, task.title),
        createElement(
          "div",
          { style: modalWsStyle },
          `📁 ${ws.title} · ${ws.workspacePath}`
        )
      ),

      // 待拍板：弹窗内直接批红（中台的核心动作）
      pendingApproval &&
        createElement(
          "div",
          { style: modalApprovalStyle },
          createElement("div", { style: modalApprovalTitleStyle }, `🔔 待拍板：${pendingApproval.title}`),
          pendingApproval.detail &&
            createElement("div", { style: modalApprovalDetailStyle }, pendingApproval.detail),
          createElement(
            "div",
            { style: modalApprovalOptionsStyle },
            pendingApproval.options.map((opt) =>
              createElement(
                "button",
                {
                  type: "button",
                  key: opt.id,
                  disabled: resolving,
                  style: modalOptionBtnStyle,
                  onClick: () => resolveApproval(pendingApproval, opt.id),
                },
                `✓ ${opt.label}`
              )
            ),
            createElement(
              "button",
              {
                type: "button",
                disabled: resolving,
                style: modalRejectBtnStyle,
                onClick: () => rejectApproval(pendingApproval),
              },
              "✕ 驳回"
            )
          ),
          createElement(
            "div",
            { style: modalApprovalMetaStyle },
            "批红后自动记录不可改写决策并恢复任务执行；驳回则保持阻塞"
          )
        ),

      // 描述
      task.description &&
        createElement(
          "div",
          { style: modalSectionStyle },
          createElement("div", { style: modalSectionLabelStyle }, "📋 需求描述"),
          createElement(MarkdownContent, { content: task.description })
        ),

      // 结论
      conclusions.length > 0 &&
        createElement(
          "div",
          { style: modalSectionStyle },
          createElement("div", { style: modalSectionLabelStyle }, `📝 执行结论 (${conclusions.length})`),
          conclusions.map((c) =>
            createElement(
              "div",
              { key: c.id, style: modalItemStyle },
              createElement(MarkdownContent, { content: c.summary }),
              c.deliverables && c.deliverables.length > 0 &&
                createElement(
                  "div",
                  { style: modalMetaLineStyle },
                  `交付物：${c.deliverables.join("、")}`
                ),
              c.insights && c.insights.length > 0 &&
                createElement(
                  "div",
                  { style: modalMetaLineStyle },
                  `心得：${c.insights.join("；")}`
                )
            )
          )
        ),

      // 决策日志
      decisions.length > 0 &&
        createElement(
          "div",
          { style: modalSectionStyle },
          createElement("div", { style: modalSectionLabelStyle }, `⚖️ 决策记录 (${decisions.length})`),
          decisions.map((d) =>
            createElement(
              "div",
              { key: d.id, style: { ...modalItemStyle, opacity: d.supersededBy ? 0.6 : 1 } },
              createElement(
                "div",
                { style: { fontWeight: 600 } },
                `${d.title}${d.supersededBy ? "（已被取代）" : ""}`
              ),
              createElement("div", { style: modalMetaLineStyle }, d.rationale),
              createElement(
                "div",
                { style: modalMetaLineStyle },
                `${d.actor ?? "unknown"} · ${new Date(d.decidedAt).toLocaleString()}`
              )
            )
          )
        ),

      // 跨工作区引用
      traceRefs.length > 0 &&
        createElement(
          "div",
          { style: modalSectionStyle },
          createElement("div", { style: modalSectionLabelStyle }, `🔗 跨工作区引用 (${traceRefs.length})`),
          traceRefs.map((r, i) =>
            createElement(
              "div",
              { key: i, style: modalMetaLineStyle },
              `${r.taskId} @ ${r.workspacePath}${r.note ? ` — ${r.note}` : ""}`
            )
          )
        ),

      // 最近检查点
      checkpoints.length > 0 &&
        createElement(
          "div",
          { style: modalSectionStyle },
          createElement("div", { style: modalSectionLabelStyle }, `🕘 最近动态 (${checkpoints.length})`),
          checkpoints.map((c, i) =>
            createElement(
              "div",
              { key: i, style: modalMetaLineStyle },
              `${new Date(c.at).toLocaleString()} · ${c.field}`
            )
          )
        ),

      // 底部
      createElement(
        "div",
        { style: modalFooterStyle },
        createElement(
          "span",
          null,
          `创建于 ${new Date(task.createdAt).toLocaleString()} · 更新于 ${new Date(task.updatedAt).toLocaleString()}`
        ),
        createElement(
          "button",
          { type: "button", style: modalCloseBtnStyle, onClick: onClose },
          "关闭"
        )
      )
    )
  );
}

function WorkspaceCard({ ws, onOpenTask }: { ws: WorkspaceOverview; onOpenTask: (t: ProjectTask) => void }) {
  if (ws.dangling) {
    return createElement(
      "div",
      { style: { ...cardStyle, opacity: 0.7, borderStyle: "dashed" } },
      createElement("div", { style: cardTitleStyle }, `⚠️ ${ws.title}`),
      createElement(
        "div",
        { style: cardSubStyle },
        `存储文件损坏或不可读：${ws.fileName}（已降级跳过，不影响其他工作区）`
      )
    );
  }

  const modeBadge = dispatchModeBadge(ws.dispatchMode);

  return createElement(
    "div",
    { style: cardStyle },
    // 卡片头：标题（点击跳右栏看板） + 派发模式徽标
    createElement(
      "div",
      { style: cardHeaderStyle },
      createElement(
        "button",
        {
          type: "button",
          style: cardTitleBtnStyle,
          title: `打开 ${ws.workspacePath} 的任务看板`,
          onClick: () => navigateToWorkspaceBoard(ws.workspacePath),
        },
        `📁 ${ws.title}`
      ),
      createElement(
        "span",
        { style: modeBadgeStyle, title: `自动派发：${modeBadge.label}` },
        `${modeBadge.icon} ${modeBadge.label}`
      )
    ),
    createElement(
      "div",
      { style: cardSubStyle },
      `共 ${ws.summary.total} 项 · 进行中 ${ws.summary.inProgress} · 阻塞 ${ws.summary.blocked}`
    ),

    // 待拍板：票拟标题直接列出，点击弹窗内批红
    createElement(
      Group,
      { icon: "🔔", label: "待拍板", count: ws.pendingApprovals.length, color: "#d97706" },
      ws.pendingApprovals.map((p) =>
        createElement(
          "button",
          {
            type: "button",
            key: p.approval.id,
            style: { ...rowStyle, borderLeft: "2px solid #d97706" },
            title: `查看并批红：${p.approval.title}`,
            onClick: () => onOpenTask(p.task),
          },
          createElement("span", { style: rowIdStyle }, p.taskId),
          createElement("span", { style: rowTitleStyle }, `「${p.approval.title}」`),
          createElement("span", { style: rowExtraStyle }, "去批红 →")
        )
      )
    ),

    createElement(
      Group,
      { icon: "⚡", label: "进行中", count: ws.inProgress.length, color: "#2563eb" },
      ws.inProgress.map((t) =>
        createElement(TaskRow, {
          key: t.id,
          task: t,
          extra: claimLabel(t) ?? undefined,
          onOpen: () => onOpenTask(t),
        })
      )
    ),

    createElement(
      Group,
      { icon: "🔍", label: "待验收", count: ws.review.length, color: "#7c3aed" },
      ws.review.map((t) =>
        createElement(TaskRow, { key: t.id, task: t, extra: "去验收 →", onOpen: () => onOpenTask(t) })
      )
    ),

    createElement(
      Group,
      { icon: "✅", label: "已完成待归档", count: ws.done.length, color: "#059669" },
      ws.done.slice(0, 5).map((t) =>
        createElement(TaskRow, { key: t.id, task: t, extra: "去归档 →", onOpen: () => onOpenTask(t) })
      ),
      ws.done.length > 5 &&
        createElement("div", { style: moreStyle }, `…还有 ${ws.done.length - 5} 项已完成`)
    ),

    createElement(
      Group,
      { icon: "🔒", label: "阻塞", count: ws.blocked.length, color: "#ef4444" },
      ws.blocked.map((t) =>
        createElement(TaskRow, { key: t.id, task: t, onOpen: () => onOpenTask(t) })
      )
    ),

    createElement(
      Group,
      { icon: "🎯", label: "就绪可派发", count: ws.readyPreview.count, color: "#059669" },
      ws.readyPreview.tasks.map((t) =>
        createElement(TaskRow, { key: t.id, task: t, extra: `[${t.priority}]`, onOpen: () => onOpenTask(t) })
      ),
      ws.readyPreview.count > 3 &&
        createElement("div", { style: moreStyle }, `…还有 ${ws.readyPreview.count - 3} 个就绪`)
    )
  );
}

/** 主区域注册的任务中台面板（点进左侧菜单入口才挂载，轮询随卸载停止） */
export function GlobalBoardPanel() {
  const { data, loading, refresh } = useGlobalOverview();
  const [selected, setSelected] = useState<SelectedTask | null>(null);

  if (loading && !data) {
    return createElement("div", { style: rootStyle }, createElement("div", { style: emptyStyle }, "加载中台数据中…"));
  }
  if (!data || data.workspaces.length === 0) {
    return createElement(
      "div",
      { style: rootStyle },
      createElement(
        "div",
        { style: emptyStyle },
        "暂无任何工作区任务数据。先在某个工作区里用 workspace_task 建几张任务卡吧。"
      )
    );
  }

  const t = data.totals;
  return createElement(
    "div",
    { style: rootStyle },
    // 顶部总览
    createElement(
      "div",
      { style: headerStyle },
      createElement("div", { style: titleStyle }, "🗂️ 任务中台"),
      createElement(
        "div",
        { style: totalsRowStyle },
        createElement("span", { style: totalChipStyle("#d97706") }, `🔔 待拍板 ${t.pendingApprovals}`),
        createElement("span", { style: totalChipStyle("#2563eb") }, `⚡ 进行中 ${t.inProgress}`),
        createElement("span", { style: totalChipStyle("#7c3aed") }, `🔍 待验收 ${t.review}`),
        createElement("span", { style: totalChipStyle("#059669") }, `✅ 待归档 ${t.done}`),
        createElement("span", { style: totalChipStyle("#ef4444") }, `🔒 阻塞 ${t.blocked}`),
        createElement("span", { style: totalChipStyle("#059669") }, `🎯 就绪 ${t.ready}`)
      ),
      createElement(
        "div",
        { style: generatedAtStyle },
        `${t.workspaces} 个工作区 · 更新于 ${new Date(data.generatedAt).toLocaleTimeString()} · 点击任务查看详情，待拍板可直接批红`
      )
    ),
    // 工作区卡片网格
    createElement(
      "div",
      { style: gridStyle },
      data.workspaces.map((ws) =>
        createElement(WorkspaceCard, {
          key: ws.workspacePath || ws.fileName || ws.title,
          ws,
          onOpenTask: (task) => setSelected({ ws, task }),
        })
      )
    ),
    // 任务详情弹窗
    selected &&
      createElement(TaskDetailModal, {
        sel: selected,
        onClose: () => setSelected(null),
        onResolved: () => {
          setSelected(null);
          refresh();
        },
      })
  );
}

// ===== 样式（沿用 --dsw-alias-* 主题 token） =====

const rootStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  overflowY: "auto",
  padding: "20px 24px",
  boxSizing: "border-box",
  backgroundColor: "var(--dsw-alias-bg-page, transparent)",
  color: "var(--dsw-alias-label-primary, #1f2328)",
  fontFamily: "inherit",
};

const headerStyle: CSSProperties = { marginBottom: 16 };
const titleStyle: CSSProperties = { fontSize: 18, fontWeight: 700, marginBottom: 10 };

const totalsRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };

const totalChipStyle = (color: string): CSSProperties => ({
  fontSize: 12,
  padding: "4px 12px",
  borderRadius: 12,
  backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
  color,
  fontWeight: 600,
  whiteSpace: "nowrap",
});

const generatedAtStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 11,
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
  gap: 14,
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
  borderRadius: 10,
  padding: "12px 14px",
  backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.02))",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const cardTitleBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 14,
  fontWeight: 700,
  color: "var(--dsw-alias-label-primary, #1f2328)",
  cursor: "pointer",
  textAlign: "left",
};

const cardTitleStyle: CSSProperties = { fontSize: 14, fontWeight: 700 };

const cardSubStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};

const modeBadgeStyle: CSSProperties = {
  fontSize: 10.5,
  padding: "2px 8px",
  borderRadius: 9,
  backgroundColor: "rgba(124, 58, 237, 0.1)",
  color: "#7c3aed",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const groupStyle: CSSProperties = { marginTop: 10 };

const groupLabelStyle: CSSProperties = { fontSize: 11.5, fontWeight: 700, marginBottom: 4 };

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "5px 8px",
  marginTop: 3,
  borderRadius: 6,
  border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.06))",
  backgroundColor: "var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.5))",
  cursor: "pointer",
  textAlign: "left",
  fontSize: 12,
  color: "var(--dsw-alias-label-primary, #1f2328)",
};

const rowIdStyle: CSSProperties = {
  fontFamily: "monospace",
  fontSize: 10.5,
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  flexShrink: 0,
};

const rowTitleStyle: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
};

const rowExtraStyle: CSSProperties = {
  fontSize: 10.5,
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  flexShrink: 0,
};

const moreStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 10.5,
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  paddingLeft: 8,
};

const emptyStyle: CSSProperties = {
  padding: 40,
  textAlign: "center",
  color: "var(--dsw-alias-label-secondary, #64748b)",
  fontSize: 13,
};

// ===== 任务详情弹窗 =====

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 24,
};

const modalContentStyle: CSSProperties = {
  width: "min(680px, 94vw)",
  maxHeight: "86vh",
  overflowY: "auto",
  backgroundColor: "var(--dsw-alias-bg-layer-2, #fff)",
  borderRadius: 12,
  border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))",
  boxShadow: "var(--dsw-shadow-lv4, 0 16px 48px rgba(0,0,0,0.25))",
  padding: "18px 20px",
};

const modalHeaderStyle: CSSProperties = { marginBottom: 12 };

const modalIdStyle: CSSProperties = {
  fontFamily: "monospace",
  fontSize: 12,
  fontWeight: 700,
  color: "#2563eb",
};

const statusChipStyle: CSSProperties = {
  fontSize: 10.5,
  padding: "2px 8px",
  borderRadius: 9,
  backgroundColor: "rgba(37, 99, 235, 0.1)",
  color: "#2563eb",
};

const priorityChipStyle: CSSProperties = {
  fontSize: 10.5,
  padding: "2px 8px",
  borderRadius: 9,
  backgroundColor: "rgba(245, 158, 11, 0.12)",
  color: "#d97706",
};

const claimChipStyle: CSSProperties = {
  fontSize: 10.5,
  padding: "2px 8px",
  borderRadius: 9,
  backgroundColor: "rgba(245, 158, 11, 0.14)",
  color: "#d97706",
};

const modalTitleStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.4,
  color: "var(--dsw-alias-label-primary, #1f2328)",
};

const modalWsStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  fontFamily: "monospace",
  wordBreak: "break-all",
};

const modalSectionStyle: CSSProperties = { marginTop: 14 };

const modalSectionLabelStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: "var(--dsw-alias-label-secondary, #64748b)",
  marginBottom: 6,
};

const modalItemStyle: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.06))",
  marginTop: 4,
  fontSize: 12,
};

const modalMetaLineStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--dsw-alias-label-secondary, #64748b)",
  marginTop: 3,
  lineHeight: 1.5,
  wordBreak: "break-all",
};

// 弹窗内批红区（琥珀色，与右栏看板批红卡片同视觉语义）
const modalApprovalStyle: CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid rgba(245, 158, 11, 0.4)",
  borderLeft: "3px solid #d97706",
  backgroundColor: "rgba(245, 158, 11, 0.06)",
};

const modalApprovalTitleStyle: CSSProperties = { fontSize: 13, fontWeight: 700 };

const modalApprovalDetailStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 11.5,
  lineHeight: 1.6,
  color: "var(--dsw-alias-label-secondary, #64748b)",
  whiteSpace: "pre-wrap",
};

const modalApprovalOptionsStyle: CSSProperties = {
  marginTop: 8,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const modalOptionBtnStyle: CSSProperties = {
  fontSize: 11.5,
  padding: "5px 12px",
  borderRadius: 6,
  border: "1px solid rgba(217, 119, 6, 0.5)",
  backgroundColor: "var(--dsw-alias-bg-layer-1, #fff)",
  color: "#d97706",
  cursor: "pointer",
  fontWeight: 500,
};

const modalRejectBtnStyle: CSSProperties = {
  fontSize: 11.5,
  padding: "5px 12px",
  borderRadius: 6,
  border: "1px solid rgba(148, 163, 184, 0.4)",
  backgroundColor: "transparent",
  color: "var(--dsw-alias-label-secondary, #64748b)",
  cursor: "pointer",
};

const modalApprovalMetaStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 10.5,
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};

const modalFooterStyle: CSSProperties = {
  marginTop: 16,
  paddingTop: 10,
  borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.06))",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: 10.5,
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};

const modalCloseBtnStyle: CSSProperties = {
  fontSize: 11.5,
  padding: "5px 14px",
  borderRadius: 6,
  border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))",
  backgroundColor: "transparent",
  color: "var(--dsw-alias-label-secondary, #475569)",
  cursor: "pointer",
};
