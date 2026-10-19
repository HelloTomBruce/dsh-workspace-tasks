import { createElement, useEffect, useState } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import type { ProjectTask, TaskPriority, TaskStatus, WorkspaceTasksSummary } from "../store/types.ts";
import { PlusIcon, RefreshIcon, TaskTabIcon } from "./icons.tsx";

const API_BASE = "/__dsh-tasks__";

interface ListResponse {
  ok: boolean;
  data: {
    tasks: ProjectTask[];
    summary: WorkspaceTasksSummary;
  };
  error?: string;
}

export interface ActiveWorkspaceInfo {
  id?: string;
  path: string;
  title: string;
}

export function findBestMatchingWorkspace(
  items: Array<{
    workspaceId: string;
    path: string;
    title: string;
    sessionIds?: string[];
  }>,
  targetPath?: string
): ActiveWorkspaceInfo | null {
  if (!targetPath || !items || items.length === 0) return null;
  const normalizedTarget = targetPath.replace(/[/\\]+$/, "");

  // 1. 精确路径匹配优先（防止子目录被父级目录误匹配）
  const exact = items.find((w) => w.path.replace(/[/\\]+$/, "") === normalizedTarget);
  if (exact) {
    return { id: exact.workspaceId, path: exact.path, title: exact.title || exact.path };
  }

  // 2. 最长前缀匹配（必须带路径分隔符边界，按路径长度降序优先匹配最深层子工作区）
  const prefixMatches = items.filter((w) => {
    const wPath = w.path.replace(/[/\\]+$/, "");
    return normalizedTarget.startsWith(wPath + "/") || normalizedTarget.startsWith(wPath + "\\");
  });

  if (prefixMatches.length > 0) {
    prefixMatches.sort((a, b) => b.path.length - a.path.length);
    const best = prefixMatches[0];
    if (best) {
      return { id: best.workspaceId, path: best.path, title: best.title || best.path };
    }
  }

  return null;
}

export function resolveActiveWorkspace(
  explicitSessionId?: string,
  explicitWorkspacePath?: string
): ActiveWorkspaceInfo {
  try {
    const dshCtx = (window as unknown as { __DSH_TASK_CLIENT_CTX__?: any }).__DSH_TASK_CLIENT_CTX__;
    const workspacesState = dshCtx?.workspaces?.list?.getSnapshot?.();
    const sessionsState = dshCtx?.sessions?.list?.getSnapshot?.();

    const items: Array<{
      workspaceId: string;
      path: string;
      title: string;
      sessionIds?: string[];
      createdAt?: string;
      updatedAt?: string;
    }> = workspacesState?.items ?? [];

    // 0. 如果显式指定了有效的工作区路径，优先按精准/最长前缀路径解析
    if (explicitWorkspacePath) {
      const match = findBestMatchingWorkspace(items, explicitWorkspacePath);
      if (match) return match;
      const title = explicitWorkspacePath.split("/").filter(Boolean).pop() || explicitWorkspacePath;
      return { id: undefined, path: explicitWorkspacePath, title };
    }

    // 1. 搜集当前候选 Session ID（按优先级排序）
    const candidateSessionIds: string[] = [];

    // 1.1 显式传入（例如 TaskPanel 组件接收到的 props.sessionId）
    if (explicitSessionId) {
      candidateSessionIds.push(explicitSessionId);
    }

    // 1.2 从 uiWorkspace 获取（最准确的主视图当前会话）
    const mainRefSessionId = dshCtx?.uiWorkspace?.mainReference?.sessionId;
    if (mainRefSessionId && !candidateSessionIds.includes(mainRefSessionId)) {
      candidateSessionIds.push(mainRefSessionId);
    }

    const selectionSessionId = dshCtx?.uiWorkspace?.selection?.getSnapshot?.()?.sessionId;
    if (selectionSessionId && !candidateSessionIds.includes(selectionSessionId)) {
      candidateSessionIds.push(selectionSessionId);
    }

    // 1.3 从 DOM 获取右侧栏当前会话标记: [data-sidebar-right-session]
    if (typeof document !== "undefined") {
      const rightbarEl = document.querySelector("[data-sidebar-right-session]");
      const rightbarSessionId = rightbarEl?.getAttribute("data-sidebar-right-session");
      if (rightbarSessionId && !candidateSessionIds.includes(rightbarSessionId)) {
        candidateSessionIds.push(rightbarSessionId);
      }

      const anySessionEl = document.querySelector("[data-session-id]");
      const domSessionId = anySessionEl?.getAttribute("data-session-id");
      if (domSessionId && !candidateSessionIds.includes(domSessionId)) {
        candidateSessionIds.push(domSessionId);
      }
    }

    // 1.4 从 localStorage 读取 "dsh.sessions.current"
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem("dsh.sessions.current");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.sessionId && !candidateSessionIds.includes(parsed.sessionId)) {
            candidateSessionIds.push(parsed.sessionId);
          }
        }
      } catch {}
    }

    // 2. 根据搜集到的 candidateSessionIds 查找匹配的 workspace
    for (const sid of candidateSessionIds) {
      // 2.1 检查 items[].sessionIds 是否包含该 sid
      if (items.length > 0) {
        const found = items.find((w) => w.sessionIds?.includes(sid));
        if (found) {
          return { id: found.workspaceId, path: found.path, title: found.title || found.path };
        }
      }

      // 2.2 检查 sessionsState.byId[sid]?.cwd 是否匹配某个 workspace
      const sessionCwd = sessionsState?.byId?.[sid]?.cwd;
      if (sessionCwd) {
        const matched = findBestMatchingWorkspace(items, sessionCwd);
        if (matched) return matched;
        const title = sessionCwd.split("/").filter(Boolean).pop() || sessionCwd;
        return { id: undefined, path: sessionCwd, title };
      }
    }

    // 3. 尝试从 DOM 激活项查找工作区
    if (typeof document !== "undefined" && items.length > 0) {
      const activeEl = document.querySelector(
        "[data-workspace-id][aria-selected='true'], [data-workspace-id].active, [data-workspace-active='true']"
      );
      const activeWsId = activeEl?.getAttribute("data-workspace-id");
      if (activeWsId) {
        const found = items.find((w) => w.workspaceId === activeWsId);
        if (found) {
          return { id: found.workspaceId, path: found.path, title: found.title || found.path };
        }
      }
    }

    // 4. 模拟 DSH 官方 recentWorkspace 策略：根据 session.updatedAt 选出最新活跃的工作区
    if (items.length > 0) {
      let selected: (typeof items)[0] | undefined;
      let selectedTime = Number.NEGATIVE_INFINITY;
      for (const item of items) {
        let latest = Number.NEGATIVE_INFINITY;
        for (const sid of item.sessionIds ?? []) {
          const s = sessionsState?.byId?.[sid];
          if (s?.updatedAt) {
            latest = Math.max(latest, Number(s.updatedAt));
          }
        }
        if (latest === Number.NEGATIVE_INFINITY && item.updatedAt) {
          latest = Date.parse(item.updatedAt);
        }
        if (latest === Number.NEGATIVE_INFINITY && item.createdAt) {
          latest = Date.parse(item.createdAt);
        }
        if (selected === undefined || latest > selectedTime) {
          selected = item;
          selectedTime = latest;
        }
      }
      if (selected) {
        return { id: selected.workspaceId, path: selected.path, title: selected.title || selected.path };
      }
    }

    // 5. 兜底取第一个工作区
    if (items.length > 0 && items[0]) {
      return { id: items[0].workspaceId, path: items[0].path, title: items[0].title || items[0].path };
    }
  } catch (e) {
    console.warn("Failed to resolve active workspace:", e);
  }

  return { path: "", title: "" };
}

export function useActiveWorkspace(
  explicitSessionId?: string,
  explicitWorkspacePath?: string
): ActiveWorkspaceInfo {
  const [workspace, setWorkspace] = useState<ActiveWorkspaceInfo>(() =>
    resolveActiveWorkspace(explicitSessionId, explicitWorkspacePath)
  );

  useEffect(() => {
    const dshCtx = (window as unknown as { __DSH_TASK_CLIENT_CTX__?: any }).__DSH_TASK_CLIENT_CTX__;

    const update = () => {
      const current = resolveActiveWorkspace(explicitSessionId, explicitWorkspacePath);
      setWorkspace((prev) => {
        if (
          prev.path !== current.path ||
          prev.id !== current.id ||
          prev.title !== current.title
        ) {
          return current;
        }
        return prev;
      });
    };

    update();

    const unsubs: Array<() => void> = [];
    if (dshCtx?.workspaces?.list?.subscribe) {
      unsubs.push(dshCtx.workspaces.list.subscribe(update));
    }
    if (dshCtx?.sessions?.list?.subscribe) {
      unsubs.push(dshCtx.sessions.list.subscribe(update));
    }
    if (dshCtx?.uiWorkspace?.selection?.subscribe) {
      unsubs.push(dshCtx.uiWorkspace.selection.subscribe(update));
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "dsh.sessions.current") {
        update();
      }
    };
    window.addEventListener("storage", onStorage);
    unsubs.push(() => window.removeEventListener("storage", onStorage));

    // 快速轮询作为兜底（800ms），无论用户以何种方式切换工作区或会话，都能在 1 秒内自动响应刷新
    const timer = setInterval(update, 800);

    return () => {
      unsubs.forEach((fn) => fn());
      clearInterval(timer);
    };
  }, [explicitSessionId, explicitWorkspacePath]);

  return workspace;
}

function useTasks(workspacePath: string): {
  tasks: ProjectTask[];
  summary: WorkspaceTasksSummary;
  loading: boolean;
  refresh: () => void;
} {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [summary, setSummary] = useState<WorkspaceTasksSummary>({
    total: 0,
    todo: 0,
    inProgress: 0,
    review: 0,
    done: 0,
    blocked: 0,
  });
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    const query = workspacePath ? `?workspacePath=${encodeURIComponent(workspacePath)}` : "";
    fetch(`${API_BASE}/list${query}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<ListResponse>)
      .then((res) => {
        if (!alive) return;
        if (res.ok && res.data) {
          setTasks(res.data.tasks);
          setSummary(res.data.summary);
        } else {
          setTasks([]);
          setSummary({ total: 0, todo: 0, inProgress: 0, review: 0, done: 0, blocked: 0 });
        }
      })
      .catch((err) => {
        console.error("Failed to load tasks", err);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [workspacePath, tick]);

  // 静默轮询（每 3 秒刷新，并监听 window focus 及自定义刷新事件）
  useEffect(() => {
    const fetchLatest = () => {
      const query = workspacePath ? `?workspacePath=${encodeURIComponent(workspacePath)}` : "";
      fetch(`${API_BASE}/list${query}`, { cache: "no-store" })
        .then((r) => r.json() as Promise<ListResponse>)
        .then((res) => {
          if (res.ok && res.data) {
            setTasks(res.data.tasks);
            setSummary(res.data.summary);
          }
        })
        .catch(() => {});
    };

    const timer = setInterval(fetchLatest, 3000);
    const onRefreshEvent = () => fetchLatest();
    window.addEventListener("focus", onRefreshEvent);
    window.addEventListener("dsh-tasks:refresh", onRefreshEvent);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onRefreshEvent);
      window.removeEventListener("dsh-tasks:refresh", onRefreshEvent);
    };
  }, [workspacePath]);

  return {
    tasks,
    summary,
    loading,
    refresh: () => setTick((t) => t + 1),
  };
}

export function TaskPanelTitle(props?: { sessionId?: string; useTabInfo?: () => any }) {
  const workspace = useActiveWorkspace(props?.sessionId);
  const { summary } = useTasks(workspace.path);
  return createElement(
    "span",
    { style: titleWrapperStyle },
    createElement(TaskTabIcon, { style: { marginRight: 6 } }),
    createElement("span", null, "工作区任务"),
    summary.inProgress > 0 &&
      createElement("span", { style: inProgressBadgeStyle }, String(summary.inProgress))
  );
}

export function TaskPanelBody(props?: { sessionId?: string; useTabInfo?: () => any }) {
  const [manualWorkspacePath, setManualWorkspacePath] = useState<string | null>(null);
  const workspace = useActiveWorkspace(props?.sessionId, manualWorkspacePath || undefined);
  const { tasks, summary, loading, refresh } = useTasks(workspace.path);
  const [filter, setFilter] = useState<"all" | TaskStatus>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  const dshCtx = (window as unknown as { __DSH_TASK_CLIENT_CTX__?: any }).__DSH_TASK_CLIENT_CTX__;
  const allWorkspaces: Array<{ workspaceId: string; path: string; title: string }> =
    dshCtx?.workspaces?.list?.getSnapshot?.()?.items ?? [];

  const filteredTasks = tasks.filter((t) => {
    if (filter === "all") return true;
    return t.status === filter;
  });

  const toggleExpand = (id: string) => {
    setExpandedTasks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const updateStatus = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await fetch(`${API_BASE}/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspacePath: workspace.path,
          taskId,
          status: newStatus,
        }),
      });
      refresh();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm(`确定删除任务 ${taskId} 吗？`)) return;
    try {
      await fetch(`${API_BASE}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspacePath: workspace.path,
          taskId,
        }),
      });
      refresh();
    } catch (e) {
      console.error(e);
    }
  };

  return createElement(
    "div",
    {
      style: containerStyle,
      onPointerDown: () => {
        if (showWorkspaceMenu) setShowWorkspaceMenu(false);
      },
    },
    // 头部工具栏
    createElement(
      "div",
      { style: headerStyle },
      createElement(
        "div",
        { style: headerLeftStyle },
        createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 8 } },
          createElement("span", { style: headerTitleStyle }, "工作区任务看板"),
          allWorkspaces.length > 0 &&
            createElement(
              "div",
              { style: { position: "relative", display: "inline-block" } },
              createElement(
                "button",
                {
                  type: "button",
                  onClick: (e: any) => {
                    e.stopPropagation();
                    setShowWorkspaceMenu(!showWorkspaceMenu);
                  },
                  style: workspaceChipStyle(!!manualWorkspacePath),
                  title: manualWorkspacePath
                    ? `已固定在: ${workspace.title || workspace.path} (点击切换或恢复自动跟随)`
                    : `当前工作区: ${workspace.title || workspace.path} (点击可手动切换)`,
                },
                `📁 ${workspace.title || "未选工作区"}`,
                manualWorkspacePath && createElement("span", { style: manualTagStyle }, "固定"),
                createElement("span", { style: { fontSize: "8px", opacity: 0.7, marginLeft: 2 } }, "▼")
              ),
              showWorkspaceMenu &&
                createElement(
                  "div",
                  {
                    style: workspaceMenuStyle,
                    onClick: (e: any) => e.stopPropagation(),
                  },
                  createElement("div", { style: menuHeaderStyle }, "切换查看工作区任务"),
                  createElement(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        setManualWorkspacePath(null);
                        setShowWorkspaceMenu(false);
                      },
                      style: menuItemStyle(manualWorkspacePath === null),
                    },
                    "✨ 自动跟随当前工作区",
                    manualWorkspacePath === null ? " ✓" : ""
                  ),
                  allWorkspaces.map((ws) =>
                    createElement(
                      "button",
                      {
                        type: "button",
                        key: ws.workspaceId || ws.path,
                        onClick: () => {
                          setManualWorkspacePath(ws.path);
                          setShowWorkspaceMenu(false);
                        },
                        style: menuItemStyle(workspace.path === ws.path && manualWorkspacePath === ws.path),
                      },
                      ws.title || ws.path,
                      workspace.path === ws.path && manualWorkspacePath === ws.path ? " ✓" : ""
                    )
                  )
                )
            )
        ),
        createElement(
          "span",
          { style: countSubStyle },
          `共 ${summary.total} 项，进行中 ${summary.inProgress}`
        )
      ),
      createElement(
        "div",
        { style: headerActionsStyle },
        createElement(
          "button",
          {
            onClick: refresh,
            style: iconBtnStyle,
            title: "刷新列表",
          },
          createElement(RefreshIcon, { className: loading ? "spin" : undefined })
        ),
        createElement(
          "button",
          {
            onClick: () => setShowCreateModal(true),
            style: primaryBtnStyle,
          },
          createElement(PlusIcon, { style: { marginRight: 4 } }),
          "新建任务"
        )
      )
    ),

    // 过滤分段标签
    createElement(
      "div",
      { style: filterBarStyle },
      [
        { key: "all", label: `全部 (${summary.total})` },
        { key: "todo", label: `待办 (${summary.todo})` },
        { key: "in_progress", label: `进行中 (${summary.inProgress})` },
        { key: "review", label: `审查 (${summary.review})` },
        { key: "done", label: `已完成 (${summary.done})` },
        { key: "blocked", label: `阻塞 (${summary.blocked})` },
      ].map((tab) =>
        createElement(
          "button",
          {
            key: tab.key,
            style: filterTabStyle(filter === tab.key),
            onClick: () => setFilter(tab.key as "all" | TaskStatus),
          },
          tab.label
        )
      )
    ),

    // 任务列表内容
    createElement(
      "div",
      { style: taskListStyle },
      filteredTasks.length === 0
        ? createElement(
            "div",
            { style: emptyStyle },
            loading ? "加载任务中…" : "暂无相关任务，点击右上角【新建任务】开始"
          )
        : filteredTasks.map((task) =>
            createElement(TaskCard, {
              key: task.id,
              task,
              workspacePath: workspace.path,
              workspaceId: workspace.id,
              currentSessionId: props?.sessionId,
              isExpanded: !!expandedTasks[task.id],
              onToggleExpand: () => toggleExpand(task.id),
              onStatusChange: (status) => updateStatus(task.id, status),
              onDelete: () => deleteTask(task.id),
              onConclusionAdded: refresh,
            })
          )
    ),

    // 新建任务弹窗
    showCreateModal &&
      createElement(CreateTaskModal, {
        workspacePath: workspace.path,
        onClose: () => setShowCreateModal(false),
        onCreated: () => {
          setShowCreateModal(false);
          refresh();
        },
      })
  );
}

// ---------------- 任务卡片组件 ----------------

const DEFAULT_STATUS_OPTION: { id: TaskStatus; label: string; color: string; bg: string } = {
  id: "todo",
  label: "待办",
  color: "#64748b",
  bg: "rgba(100, 116, 139, 0.14)",
};

const STATUS_OPTIONS: { id: TaskStatus; label: string; color: string; bg: string }[] = [
  DEFAULT_STATUS_OPTION,
  { id: "in_progress", label: "进行中", color: "#2563eb", bg: "rgba(37, 99, 235, 0.14)" },
  { id: "review", label: "审查中", color: "#7c3aed", bg: "rgba(124, 58, 237, 0.14)" },
  { id: "done", label: "已完成", color: "#059669", bg: "rgba(5, 150, 105, 0.14)" },
  { id: "blocked", label: "已阻塞", color: "#dc2626", bg: "rgba(220, 38, 38, 0.14)" },
];

function StatusDropdown({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (s: TaskStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = STATUS_OPTIONS.find((o) => o.id === status) ?? DEFAULT_STATUS_OPTION;

  useEffect(() => {
    if (!open) return;
    const handleOutside = () => setOpen(false);
    window.addEventListener("click", handleOutside);
    return () => window.removeEventListener("click", handleOutside);
  }, [open]);

  return createElement(
    "div",
    { style: { position: "relative", display: "inline-block" } },
    createElement(
      "button",
      {
        type: "button",
        onClick: (e: any) => {
          e.stopPropagation();
          setOpen(!open);
        },
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          padding: "3px 8px",
          borderRadius: "12px",
          fontSize: "11px",
          fontWeight: "500",
          color: current.color,
          backgroundColor: current.bg,
          border: `1px solid ${current.color}40`,
          cursor: "pointer",
          outline: "none",
        },
      },
      createElement("span", {
        style: {
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: current.color,
        },
      }),
      current.label,
      createElement("span", { style: { fontSize: "8px", opacity: 0.7, marginLeft: 1 } }, "▼")
    ),
    open &&
      createElement(
        "div",
        {
          onClick: (e: any) => e.stopPropagation(),
          style: {
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            backgroundColor: "var(--dsw-alias-bg-layer-2, #ffffff)",
            border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
            borderRadius: "8px",
            boxShadow: "var(--dsw-shadow-lv3, 0 8px 20px rgba(0, 0, 0, 0.15))",
            padding: "4px",
            zIndex: 100,
            minWidth: "105px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          },
        },
        STATUS_OPTIONS.map((opt) =>
          createElement(
            "button",
            {
              type: "button",
              key: opt.id,
              onClick: () => {
                onChange(opt.id);
                setOpen(false);
              },
              style: {
                display: "flex",
                alignItems: "center",
                gap: "6px",
                width: "100%",
                padding: "6px 8px",
                border: "none",
                borderRadius: "5px",
                backgroundColor: opt.id === status ? opt.bg : "transparent",
                color: opt.id === status ? opt.color : "var(--dsw-alias-label-primary, #0f172a)",
                fontSize: "12px",
                cursor: "pointer",
                textAlign: "left",
              },
            },
            createElement("span", {
              style: {
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: opt.color,
              },
            }),
            opt.label
          )
        )
      )
  );
}

function TaskCard({
  task,
  workspacePath,
  workspaceId,
  currentSessionId,
  isExpanded,
  onToggleExpand,
  onStatusChange,
  onDelete,
  onConclusionAdded,
}: {
  task: ProjectTask;
  workspacePath: string;
  workspaceId?: string;
  currentSessionId?: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (status: TaskStatus) => void;
  onDelete: () => void;
  onConclusionAdded: () => void;
}) {
  const [showAddConc, setShowAddConc] = useState(false);
  const [concSummary, setConcSummary] = useState("");
  const [concDeliverables, setConcDeliverables] = useState("");
  const [concInsights, setConcInsights] = useState("");
  const [savingConc, setSavingConc] = useState(false);
  const [assignedStatus, setAssignedStatus] = useState<"dispatched" | "filled" | null>(null);

  const handleAssignToAgent = async () => {
    const prompt = [
      `请执行工作区任务 [${task.id}]：${task.title}`,
      workspacePath ? `【工作区根目录】：${workspacePath}` : "",
      task.description ? `\n【需求背景与详细要求】\n${task.description}` : "",
      `\n【执行规范与标准流程】`,
      `1. 开始执行时，先调用 workspace_task 工具（action: "update", taskId: "${task.id}", status: "in_progress", assignee: "agent"${workspacePath ? `, workspacePath: "${workspacePath}"` : ""}) 将本任务标记为进行中。`,
      `2. 完成代码实现与验证测试。`,
      `3. 验证通过后，调用 workspace_task 工具的 conclude 操作（action: "conclude", taskId: "${task.id}"${workspacePath ? `, workspacePath: "${workspacePath}"` : ""})，提交总结摘要、产出文件清单和关键经验心得，自动将任务标记为完成。`,
    ]
      .filter(Boolean)
      .join("\n");

    let dispatched = false;

    try {
      const dshCtx = (window as unknown as { __DSH_TASK_CLIENT_CTX__?: any }).__DSH_TASK_CLIENT_CTX__;
      let targetSessionId = currentSessionId;

      if (!targetSessionId && dshCtx) {
        targetSessionId =
          dshCtx.uiWorkspace?.mainReference?.sessionId ||
          dshCtx.uiWorkspace?.selection?.getSnapshot?.()?.sessionId;
      }

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

      // 如果当前没有会话，且已知 workspaceId，通过 uiWorkspace 连接会话
      if (!targetSessionId && workspaceId && dshCtx?.uiWorkspace?.connectWorkspace) {
        try {
          targetSessionId = await dshCtx.uiWorkspace.connectWorkspace(workspaceId);
          if (targetSessionId && dshCtx.uiWorkspace?.openSession) {
            dshCtx.uiWorkspace.openSession(targetSessionId);
          }
        } catch (e) {
          console.warn("Failed to auto-connect workspace session", e);
        }
      }

      if (targetSessionId && dshCtx) {
        // 方法 1: 尝试 binding.session.prompt
        try {
          const binding = dshCtx.sessions?.binding?.(targetSessionId);
          if (binding?.session?.prompt) {
            const res = await binding.session.prompt([{ type: "text", text: prompt }], "queue");
            if (!res || res.ok !== false) {
              dispatched = true;
            }
          }
        } catch (e) {
          console.warn("binding.session.prompt error", e);
        }

        // 方法 2: 尝试 scopedCtx.conversation.send
        if (!dispatched) {
          try {
            const scopedCtx = dshCtx.sessions?.scope?.(targetSessionId);
            if (scopedCtx?.conversation?.send) {
              await scopedCtx.conversation.send(prompt);
              dispatched = true;
            }
          } catch (e) {
            console.warn("scopedCtx.conversation.send error", e);
          }
        }
      }
    } catch (err) {
      console.warn("Direct dispatch to agent failed, falling back to editor/clipboard:", err);
    }

    // 填入输入框，保证无论是否直派成功，用户都能在屏幕上即刻看到提示词
    try {
      // 1. Lexical contenteditable 输入区（DSH 主聊天区域）
      const editableEl = document.querySelector<HTMLElement>('[contenteditable="true"]');
      if (editableEl) {
        editableEl.focus();
        document.execCommand("selectAll", false, undefined);
        document.execCommand("insertText", false, prompt);
      }

      // 2. 原生 textarea 兼容兜底
      const textarea = document.querySelector<HTMLTextAreaElement>("textarea:not([disabled])");
      if (textarea) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
        if (setter) {
          setter.call(textarea, prompt);
        } else {
          textarea.value = prompt;
        }
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.focus();
      }
    } catch (e) {
      console.warn("Failed to set composer value:", e);
    }

    // 复制到剪贴板
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {}

    setAssignedStatus(dispatched ? "dispatched" : "filled");
    setTimeout(() => setAssignedStatus(null), 3500);
  };

  const handleAddConclusion = async () => {
    if (!concSummary.trim()) return;
    setSavingConc(true);
    try {
      const deliverables = concDeliverables
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const insights = concInsights
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      await fetch(`${API_BASE}/conclude`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspacePath,
          taskId: task.id,
          summary: concSummary,
          deliverables,
          insights,
        }),
      });

      setConcSummary("");
      setConcDeliverables("");
      setConcInsights("");
      setShowAddConc(false);
      onConclusionAdded();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingConc(false);
    }
  };

  return createElement(
    "div",
    { style: taskCardStyle(task.status) },
    // 卡片顶部条
    createElement(
      "div",
      { style: cardHeaderStyle },
      createElement(
        "div",
        { style: cardMetaStyle },
        createElement("span", { style: taskIdStyle }, task.id),
        createElement(PriorityBadge, { priority: task.priority }),
        task.assignee && createElement("span", { style: assigneeBadgeStyle }, `@${task.assignee}`)
      ),
      createElement(
        "div",
        { style: cardRightActionsStyle },
        createElement(StatusDropdown, {
          status: task.status,
          onChange: onStatusChange,
        }),
        createElement(
          "button",
          {
            onClick: onDelete,
            style: deleteBtnStyle,
            title: "删除任务",
          },
          "×"
        )
      )
    ),

    // 标题
    createElement("div", { style: cardTitleStyle }, task.title),

    // 描述 (若有)
    task.description && createElement("div", { style: cardDescStyle }, task.description),

    // 结论指示栏与操作
    createElement(
      "div",
      { style: cardFooterStyle },
      createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 8 } },
        createElement(
          "button",
          {
            onClick: onToggleExpand,
            style: toggleExpandBtnStyle,
          },
          task.conclusions.length > 0
            ? `📝 ${task.conclusions.length} 条结论 ${isExpanded ? "▲" : "▼"}`
            : `📝 暂无结论 ${isExpanded ? "▲" : "▼"}`
        ),
        task.status !== "done" &&
          createElement(
            "button",
            {
              type: "button",
              onClick: handleAssignToAgent,
              style: assignBtnStyle(!!assignedStatus),
              title: "一键将任务派发给 Agent 执行并填入对话框",
            },
            assignedStatus === "dispatched"
              ? "✓ 已直接派发"
              : assignedStatus === "filled"
              ? "✓ 已填入对话框"
              : "🤖 交给 Agent"
          )
      ),
      createElement(
        "span",
        { style: timeStyle },
        new Date(task.updatedAt).toLocaleDateString()
      )
    ),

    // 展开后的结论列表与添加框
    isExpanded &&
      createElement(
        "div",
        { style: conclusionDrawerStyle },
        task.conclusions.map((conc, idx) =>
          createElement(
            "div",
            { key: conc.id || idx, style: conclusionItemStyle },
            createElement(
              "div",
              { style: concTimeStyle },
              `完成于 ${new Date(conc.completedAt).toLocaleString()}`
            ),
            createElement("div", { style: concSummaryStyle }, conc.summary),
            conc.deliverables &&
              conc.deliverables.length > 0 &&
              createElement(
                "div",
                { style: concBlockStyle },
                createElement("span", { style: concLabelStyle }, "产出交付物:"),
                createElement(
                  "ul",
                  { style: concListStyle },
                  conc.deliverables.map((d, di) =>
                    createElement("li", { key: di, style: codeLiStyle }, d)
                  )
                )
              ),
            conc.insights &&
              conc.insights.length > 0 &&
              createElement(
                "div",
                { style: concBlockStyle },
                createElement("span", { style: concLabelStyle }, "经验心得:"),
                createElement(
                  "ul",
                  { style: concListStyle },
                  conc.insights.map((ins, ii) =>
                    createElement("li", { key: ii, style: insightLiStyle }, ins)
                  )
                )
              )
          )
        ),

        // 添加结论区块
        showAddConc
          ? createElement(
              "div",
              { style: addConcFormStyle },
              createElement("textarea", {
                placeholder: "执行结论总结（核心产出与解决要点）...",
                value: concSummary,
                onChange: (e: ChangeEvent<HTMLTextAreaElement>) => setConcSummary(e.target.value),
                style: textAreaStyle,
                rows: 2,
              }),
              createElement("textarea", {
                placeholder: "交付物文件路径（每行一个文件路径，选填）",
                value: concDeliverables,
                onChange: (e: ChangeEvent<HTMLTextAreaElement>) => setConcDeliverables(e.target.value),
                style: textAreaStyle,
                rows: 2,
              }),
              createElement("textarea", {
                placeholder: "关键经验/踩坑心得（每行一条，选填）",
                value: concInsights,
                onChange: (e: ChangeEvent<HTMLTextAreaElement>) => setConcInsights(e.target.value),
                style: textAreaStyle,
                rows: 2,
              }),
              createElement(
                "div",
                { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 } },
                createElement(
                  "button",
                  {
                    onClick: () => setShowAddConc(false),
                    style: cancelBtnStyle,
                  },
                  "取消"
                ),
                createElement(
                  "button",
                  {
                    onClick: handleAddConclusion,
                    disabled: savingConc || !concSummary.trim(),
                    style: primaryBtnStyle,
                  },
                  savingConc ? "保存中…" : "提交并标记完成"
                )
              )
            )
          : createElement(
              "button",
              {
                onClick: () => setShowAddConc(true),
                style: appendConcBtnStyle,
              },
              "+ 追加执行结论"
            )
      )
  );
}

// ---------------- 新建弹窗组件 ----------------

const PRIORITIES: { id: TaskPriority; label: string; desc: string; color: string; bg: string }[] = [
  { id: "P0", label: "P0 紧急", desc: "高危/阻断", color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" },
  { id: "P1", label: "P1 高优", desc: "标准推进", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)" },
  { id: "P2", label: "P2 普通", desc: "常规事务", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)" },
];

function CreateTaskModal({
  workspacePath,
  onClose,
  onCreated,
}: {
  workspacePath: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("P1");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetch(`${API_BASE}/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspacePath,
          title,
          description,
          priority,
        }),
      });
      onCreated();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return createElement(
    "div",
    { style: modalOverlayStyle, onClick: onClose },
    createElement(
      "div",
      { style: modalContentStyle, onClick: (e: any) => e.stopPropagation() },
      createElement(
        "div",
        { style: modalHeaderStyle },
        createElement("span", { style: { fontWeight: "600", fontSize: "16px", color: "var(--dsw-alias-label-primary, #0f172a)" } }, "新建工作区任务"),
        createElement("button", { onClick: onClose, style: closeBtnStyle }, "×")
      ),
      createElement(
        "div",
        { style: { marginBottom: 14 } },
        createElement("label", { style: fieldLabelStyle }, "任务标题 *"),
        createElement("input", {
          type: "text",
          placeholder: "例如：编写用户登录 API 与单元测试",
          value: title,
          onChange: (e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value),
          style: inputStyle,
          autoFocus: true,
        })
      ),
      createElement(
        "div",
        { style: { marginBottom: 14 } },
        createElement("label", { style: fieldLabelStyle }, "优先级"),
        createElement(
          "div",
          { style: { display: "flex", gap: "8px" } },
          PRIORITIES.map((p) => {
            const isSelected = priority === p.id;
            return createElement(
              "button",
              {
                type: "button",
                key: p.id,
                onClick: () => setPriority(p.id),
                style: {
                  flex: 1,
                  padding: "8px 6px",
                  borderRadius: "8px",
                  border: isSelected
                    ? `2px solid ${p.color}`
                    : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
                  backgroundColor: isSelected
                    ? p.bg
                    : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03))",
                  color: isSelected ? p.color : "var(--dsw-alias-label-secondary, #64748b)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "2px",
                  fontWeight: isSelected ? "600" : "400",
                  transition: "all 0.15s ease",
                },
              },
              createElement("span", { style: { fontSize: "13px" } }, p.label),
              createElement("span", { style: { fontSize: "11px", opacity: 0.8 } }, p.desc)
            );
          })
        )
      ),
      createElement(
        "div",
        { style: { marginBottom: 18 } },
        createElement("label", { style: fieldLabelStyle }, "需求背景与详细描述 (Markdown 选填)"),
        createElement("textarea", {
          placeholder: "详细说明任务验收条件、涉及模块或提示 Agent 需要注意的事项...",
          value: description,
          onChange: (e: ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value),
          style: textAreaStyle,
          rows: 4,
        })
      ),
      createElement(
        "div",
        { style: { display: "flex", justifyContent: "flex-end", gap: 10 } },
        createElement("button", { onClick: onClose, style: cancelBtnStyle }, "取消"),
        createElement(
          "button",
          {
            onClick: handleSubmit,
            disabled: submitting || !title.trim(),
            style: primaryBtnStyle,
          },
          submitting ? "创建中…" : "创建任务"
        )
      )
    )
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const colorMap = {
    P0: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444" },
    P1: { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b" },
    P2: { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6" },
  };
  const c = colorMap[priority] || colorMap.P1;
  return createElement(
    "span",
    {
      style: {
        fontSize: "11px",
        fontWeight: "600",
        padding: "1px 6px",
        borderRadius: "4px",
        backgroundColor: c.bg,
        color: c.text,
      },
    },
    priority
  );
}

// ---------------- 样式定义 (自适应深浅主题规范) ----------------

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  backgroundColor: "var(--dsw-alias-bg-base, #ffffff)",
  color: "var(--dsw-alias-label-primary, #1e293b)",
  boxSizing: "border-box",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: "13px",
  overflow: "hidden",
};

const titleWrapperStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontWeight: "500",
};

const inProgressBadgeStyle: CSSProperties = {
  marginLeft: 6,
  backgroundColor: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2f6fed)",
  color: "#ffffff",
  borderRadius: "10px",
  padding: "0 6px",
  fontSize: "10px",
  fontWeight: "bold",
  height: "16px",
  lineHeight: "16px",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
};

const headerLeftStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const headerTitleStyle: CSSProperties = {
  fontSize: "15px",
  fontWeight: "600",
  color: "var(--dsw-alias-label-primary, #0f172a)",
};

const countSubStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--dsw-alias-label-secondary, #64748b)",
};

const headerActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const filterBarStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "8px 16px",
  overflowX: "auto",
  borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
};

const filterTabStyle = (active: boolean): CSSProperties => ({
  border: active ? "1px solid transparent" : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
  background: active
    ? "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2f6fed)"
    : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03))",
  color: active ? "#ffffff" : "var(--dsw-alias-label-secondary, #64748b)",
  borderRadius: "6px",
  padding: "4px 10px",
  fontSize: "12px",
  fontWeight: active ? "600" : "400",
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const taskListStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const taskCardStyle = (status: TaskStatus): CSSProperties => ({
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
  borderRadius: "8px",
  backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  opacity: status === "done" ? 0.8 : 1,
});

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const cardMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const taskIdStyle: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "11px",
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};

const assigneeBadgeStyle: CSSProperties = {
  fontSize: "11px",
  color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb)",
};

const cardRightActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const deleteBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  cursor: "pointer",
  fontSize: "16px",
  lineHeight: "1",
  padding: "2px 6px",
  borderRadius: "4px",
};

const cardTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: "600",
  lineHeight: "1.4",
  color: "var(--dsw-alias-label-primary, #0f172a)",
};

const cardDescStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--dsw-alias-label-secondary, #475569)",
  lineHeight: "1.4",
  whiteSpace: "pre-wrap",
};

const cardFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 4,
};

const toggleExpandBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb)",
  fontSize: "11px",
  cursor: "pointer",
  padding: "0",
  fontWeight: "500",
};

const assignBtnStyle = (active: boolean): CSSProperties => ({
  background: active ? "rgba(37, 99, 235, 0.12)" : "transparent",
  border: active ? "1px solid #2563eb" : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
  color: active ? "#2563eb" : "var(--dsw-alias-label-secondary, #475569)",
  borderRadius: "12px",
  padding: "2px 8px",
  fontSize: "11px",
  fontWeight: "500",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "3px",
  transition: "all 0.15s ease",
});

const timeStyle: CSSProperties = {
  fontSize: "11px",
  color: "var(--dsw-alias-label-caption, #94a3b8)",
};

const conclusionDrawerStyle: CSSProperties = {
  borderTop: "1px dashed var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1))",
  paddingTop: 8,
  marginTop: 4,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const conclusionItemStyle: CSSProperties = {
  backgroundColor: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.03))",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
  borderRadius: "6px",
  padding: "8px 10px",
  fontSize: "12px",
};

const concTimeStyle: CSSProperties = {
  fontSize: "10px",
  color: "var(--dsw-alias-label-caption, #94a3b8)",
  marginBottom: 4,
};

const concSummaryStyle: CSSProperties = {
  fontWeight: "500",
  marginBottom: 6,
  color: "var(--dsw-alias-label-primary, #1e293b)",
};

const concBlockStyle: CSSProperties = {
  marginTop: 4,
};

const concLabelStyle: CSSProperties = {
  fontSize: "11px",
  color: "var(--dsw-alias-label-secondary, #64748b)",
  display: "block",
};

const concListStyle: CSSProperties = {
  margin: "2px 0 0 16px",
  padding: 0,
};

const codeLiStyle: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "11px",
  color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #0284c7)",
};

const insightLiStyle: CSSProperties = {
  fontSize: "11px",
  color: "#d97706",
};

const addConcFormStyle: CSSProperties = {
  backgroundColor: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.02))",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
  padding: 8,
  borderRadius: "6px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const appendConcBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px dashed var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
  color: "var(--dsw-alias-label-secondary, #64748b)",
  borderRadius: "6px",
  padding: "6px",
  fontSize: "11px",
  cursor: "pointer",
};

const primaryBtnStyle: CSSProperties = {
  backgroundColor: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--dsw-alias-brand-primary, #2f6fed))",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  padding: "6px 14px",
  fontSize: "12px",
  fontWeight: "500",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

const iconBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
  color: "var(--dsw-alias-label-secondary, #64748b)",
  borderRadius: "6px",
  padding: "5px 7px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const cancelBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
  color: "var(--dsw-alias-label-secondary, #475569)",
  borderRadius: "6px",
  padding: "6px 14px",
  fontSize: "12px",
  cursor: "pointer",
};

const emptyStyle: CSSProperties = {
  padding: "30px 10px",
  textAlign: "center",
  color: "var(--dsw-alias-label-secondary, #64748b)",
  border: "1px dashed var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1))",
  borderRadius: "8px",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.35))",
  backdropFilter: "var(--dsw-mask-blur, blur(2px))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalContentStyle: CSSProperties = {
  width: "min(480px, 92vw)",
  backgroundColor: "var(--dsw-alias-bg-layer-2, #ffffff)",
  color: "var(--dsw-alias-label-primary, #0f172a)",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
  borderRadius: "16px",
  padding: "20px 24px",
  boxShadow: "var(--dsw-shadow-lv3, 0 16px 36px rgba(0, 0, 0, 0.16))",
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

const closeBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: "20px",
  lineHeight: "1",
  cursor: "pointer",
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  padding: "2px 6px",
  borderRadius: "4px",
};

const fieldLabelStyle: CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: "500",
  marginBottom: 6,
  color: "var(--dsw-alias-label-secondary, #475569)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
  backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
  color: "var(--dsw-alias-label-primary, #0f172a)",
  fontSize: "13px",
  outline: "none",
};

const textAreaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
  backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
  color: "var(--dsw-alias-label-primary, #0f172a)",
  fontSize: "12px",
  fontFamily: "inherit",
  resize: "vertical",
  outline: "none",
};

const workspaceChipStyle = (isManual: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "2px 8px",
  borderRadius: "10px",
  fontSize: "11px",
  fontWeight: "500",
  color: isManual ? "var(--dsw-alias-color-primary, #2563eb)" : "var(--dsw-alias-label-secondary, #475569)",
  backgroundColor: isManual ? "rgba(37, 99, 235, 0.1)" : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.04))",
  border: isManual ? "1px solid rgba(37, 99, 235, 0.3)" : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
  cursor: "pointer",
  outline: "none",
  maxWidth: "160px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const manualTagStyle: CSSProperties = {
  fontSize: "9px",
  padding: "1px 4px",
  borderRadius: "4px",
  backgroundColor: "var(--dsw-alias-color-primary, #2563eb)",
  color: "#ffffff",
  marginLeft: "2px",
};

const workspaceMenuStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  backgroundColor: "var(--dsw-alias-bg-layer-2, #ffffff)",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
  borderRadius: "8px",
  boxShadow: "var(--dsw-shadow-lv3, 0 8px 20px rgba(0, 0, 0, 0.15))",
  padding: "4px",
  zIndex: 100,
  minWidth: "160px",
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const menuHeaderStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: "600",
  padding: "4px 8px",
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
  marginBottom: "2px",
};

const menuItemStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "6px 8px",
  border: "none",
  borderRadius: "5px",
  backgroundColor: active ? "rgba(37, 99, 235, 0.1)" : "transparent",
  color: active ? "var(--dsw-alias-color-primary, #2563eb)" : "var(--dsw-alias-label-primary, #0f172a)",
  fontSize: "12px",
  cursor: "pointer",
  textAlign: "left",
  outline: "none",
});
