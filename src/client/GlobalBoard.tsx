import { createElement, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { ProjectTask } from "../store/types.ts";
import type { GlobalOverview, WorkspaceOverview } from "../store/global.ts";

/**
 * 任务中台（跨工作区全局看板）：主区域全宽面板。
 * 只回答一个问题——「现在哪里需要我」：待拍板 / 待验收 / 进行中 / 阻塞 / 就绪。
 * 只读：点击任务行跳回右栏看板的对应工作区（openTab + CustomEvent 定位），不做任何写操作。
 */

const API_BASE = "/__dsh-tasks__";

function useGlobalOverview(): { data: GlobalOverview | null; loading: boolean } {
  const [data, setData] = useState<GlobalOverview | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, []);

  return { data, loading };
}

/** 打开右栏工作区看板并定位到指定任务 */
function navigateToWorkspaceTask(workspacePath: string, taskId?: string): void {
  const dshCtx = (window as unknown as { __DSH_TASK_CLIENT_CTX__?: any }).__DSH_TASK_CLIENT_CTX__;
  try {
    dshCtx?.sidebarRight?.openTab?.("workspace-tasks");
  } catch (e) {
    console.warn("[dsh-workspace-tasks] openTab failed:", e);
  }
  window.dispatchEvent(
    new CustomEvent("dsh-tasks:open-workspace", { detail: { workspacePath, taskId } })
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

function TaskRow({ task, workspacePath, extra }: { task: ProjectTask; workspacePath: string; extra?: string }) {
  return createElement(
    "button",
    {
      type: "button",
      style: rowStyle,
      title: `跳转到 ${workspacePath} 的 ${task.id}`,
      onClick: () => navigateToWorkspaceTask(workspacePath, task.id),
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

function WorkspaceCard({ ws }: { ws: WorkspaceOverview }) {
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
    // 卡片头：标题 + 派发模式徽标（点击标题跳转该工作区看板）
    createElement(
      "div",
      { style: cardHeaderStyle },
      createElement(
        "button",
        {
          type: "button",
          style: cardTitleBtnStyle,
          title: `打开 ${ws.workspacePath} 的任务看板`,
          onClick: () => navigateToWorkspaceTask(ws.workspacePath),
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

    // 待拍板：票拟标题直接列出，中台的核心价值
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
            title: `去批红：${p.approval.title}`,
            onClick: () => navigateToWorkspaceTask(ws.workspacePath, p.taskId),
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
          workspacePath: ws.workspacePath,
          extra: claimLabel(t) ?? undefined,
        })
      )
    ),

    createElement(
      Group,
      { icon: "🔍", label: "待验收", count: ws.review.length, color: "#7c3aed" },
      ws.review.map((t) =>
        createElement(TaskRow, { key: t.id, task: t, workspacePath: ws.workspacePath, extra: "去验收 →" })
      )
    ),

    createElement(
      Group,
      { icon: "✅", label: "已完成待归档", count: ws.done.length, color: "#059669" },
      ws.done.slice(0, 5).map((t) =>
        createElement(TaskRow, { key: t.id, task: t, workspacePath: ws.workspacePath, extra: "去归档 →" })
      ),
      ws.done.length > 5 &&
        createElement("div", { style: moreStyle }, `…还有 ${ws.done.length - 5} 项已完成`)
    ),

    createElement(
      Group,
      { icon: "🔒", label: "阻塞", count: ws.blocked.length, color: "#ef4444" },
      ws.blocked.map((t) =>
        createElement(TaskRow, { key: t.id, task: t, workspacePath: ws.workspacePath })
      )
    ),

    createElement(
      Group,
      { icon: "🎯", label: "就绪可派发", count: ws.readyPreview.count, color: "#059669" },
      ws.readyPreview.tasks.map((t) =>
        createElement(TaskRow, { key: t.id, task: t, workspacePath: ws.workspacePath, extra: `[${t.priority}]` })
      ),
      ws.readyPreview.count > 3 &&
        createElement("div", { style: moreStyle }, `…还有 ${ws.readyPreview.count - 3} 个就绪`)
    )
  );
}

/** 主区域注册的任务中台面板（点进左侧菜单入口才挂载，轮询随卸载停止） */
export function GlobalBoardPanel() {
  const { data, loading } = useGlobalOverview();

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
        `${t.workspaces} 个工作区 · 更新于 ${new Date(data.generatedAt).toLocaleTimeString()} · 只读视图，点击任务跳回对应看板`
      )
    ),
    // 工作区卡片网格
    createElement(
      "div",
      { style: gridStyle },
      data.workspaces.map((ws) =>
        createElement(WorkspaceCard, { key: ws.workspacePath || ws.fileName || ws.title, ws })
      )
    )
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
