import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import type { ApprovalRequest, ProjectTask, TaskStatus } from "../../store/types.ts";
import { getReadyTasks, generateWorkspaceSummaryReport, isTaskStale } from "../../store/pipeline.ts";
import { PlusIcon, RefreshIcon } from "../icons.tsx";
import { findCurrentSession, openWorkspaceFileViaDsh } from "../dsh-open.ts";
import { buildDispatchPrompt, dispatchPromptToAgent } from "../dispatch-agent.ts";
import { consumePendingNav } from "../pending-nav.ts";
import { ApprovalBanner, ObserveBanner, ReadyBanner, StaleBanner, TrippedBanner } from "./banners.tsx";
import { CrossWorkspaceMenuItem, DispatchLogSection, DispatchModeMenuItems } from "./DispatchSections.tsx";
import { CreateTaskModal } from "./CreateTaskModal.tsx";
import { ExportReportModal } from "./ExportReportModal.tsx";
import { TaskCard } from "./TaskCard.tsx";
import { API_BASE, useDispatch, useTasks } from "./hooks.ts";
import type { DispatchLogEntry } from "./hooks.ts";
import { useActiveWorkspace } from "./workspace.ts";
import {
  clearSearchBtnStyle,
  containerStyle,
  countSubStyle,
  emptyStyle,
  filterBarStyle,
  filterTabStyle,
  headerActionsStyle,
  headerLeftStyle,
  headerStyle,
  headerTitleStyle,
  iconBtnStyle,
  manualTagStyle,
  menuHeaderStyle,
  menuItemStyle,
  menuDividerStyle,
  moreMenuStyle,
  primaryBtnStyle,
  searchContainerStyle,
  searchInputStyle,
  tagExpandToggleStyle,
  tagFilterBarStyle,
  tagFilterChipStyle,
  taskListStyle,
  workspaceChipStyle,
  workspaceMenuStyle,
} from "./styles.ts";

// 标签筛选栏收起时最多直接展示的标签数量，超出部分通过「展开/收起」查看
const TAG_COLLAPSE_LIMIT = 10;

// ---------------- 主面板（工作区任务看板） ----------------

export function TaskPanelBody(props?: {
  sessionId?: string;
  useTabInfo?: () => any;
  openFile?: (path: string, workspacePath?: string) => Promise<void>;
}) {
  const [manualWorkspacePath, setManualWorkspacePath] = useState<string | null>(null);
  const workspace = useActiveWorkspace(props?.sessionId, manualWorkspacePath || undefined);
  const { tasks, summary, loading, refresh } = useTasks(workspace.path);
  const { rules: dispatchRules, log: dispatchLog, refresh: refreshDispatch } = useDispatch(workspace.path);
  const [showDispatchLog, setShowDispatchLog] = useState(false);

  // 自动派发：模式切换（三态：👁️观察 / ⚡自动 / ⏸️关闭）
  const setDispatchMode = async (mode: "observe" | "auto" | "off") => {
    try {
      await fetch(`${API_BASE}/dispatch/rules`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspacePath: workspace.path, mode }),
      });
      refreshDispatch();
    } catch (e) {
      console.error(e);
    }
  };

  // 忽略一条「本会派发」观察记录
  const handleIgnoreDispatch = async (id: string) => {
    try {
      await fetch(`${API_BASE}/dispatch/ignore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspacePath: workspace.path, id }),
      });
      refreshDispatch();
    } catch (e) {
      console.error(e);
    }
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [filter, setFilter] = useState<"all" | TaskStatus>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  // 跨工作区派发开关（插件配置，宿主持久化；此处为 UI 态，点击即 POST 立即生效）
  const [crossWorkspaceOn, setCrossWorkspaceOn] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/dispatch/config`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; data?: { crossWorkspaceDispatch?: boolean } }>)
      .then((res) => {
        if (res.ok && res.data) setCrossWorkspaceOn(res.data.crossWorkspaceDispatch === true);
      })
      .catch(() => {});
  }, []);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  const dshCtx = (window as unknown as { __DSH_TASK_CLIENT_CTX__?: any }).__DSH_TASK_CLIENT_CTX__;
  const activeSession = findCurrentSession(dshCtx);
  const currentSessionId = props?.sessionId || activeSession?.sessionId;

  const allWorkspaces: Array<{ workspaceId: string; path: string; title: string }> =
    dshCtx?.workspaces?.list?.getSnapshot?.()?.items ?? [];

  const tabInfo = typeof props?.useTabInfo === "function" ? props.useTabInfo() : null;
  const tabActions = tabInfo?.tab?.actions;

  const handleOpenFileProp = (path: string, wsPath?: string) => {
    if (props?.openFile) {
      return props.openFile(path, wsPath);
    }
    return openWorkspaceFileViaDsh(dshCtx, path, {
      sessionId: currentSessionId,
      workspacePath: wsPath || workspace.path,
      tabActions,
    });
  };

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const t of tasks) {
      for (const tag of t.tags || []) s.add(tag);
    }
    return Array.from(s).sort();
  }, [tasks]);

  // 标签过多时收起仅展示前 TAG_COLLAPSE_LIMIT 个；若当前选中的标签被折叠隐藏，则追加到末尾，确保筛选状态始终可见
  const visibleTags = useMemo(() => {
    if (tagsExpanded || allTags.length <= TAG_COLLAPSE_LIMIT) return allTags;
    const collapsed = allTags.slice(0, TAG_COLLAPSE_LIMIT);
    if (selectedTag && allTags.includes(selectedTag) && !collapsed.includes(selectedTag)) {
      collapsed.push(selectedTag);
    }
    return collapsed;
  }, [allTags, tagsExpanded, selectedTag]);

  const tagsOverflow = allTags.length - Math.min(allTags.length, TAG_COLLAPSE_LIMIT);

  const readyTasks = useMemo(() => {
    return getReadyTasks(tasks);
  }, [tasks]);

  const readyTaskIdSet = useMemo(() => {
    return new Set(readyTasks.map((t) => t.id));
  }, [readyTasks]);

  // 跨任务收集所有待拍板审批（票拟），驱动头部 🔔 横幅
  const pendingApprovals = useMemo(() => {
    const list: Array<{ task: ProjectTask; approval: ApprovalRequest }> = [];
    for (const t of tasks) {
      if (t.status === "archived") continue;
      for (const a of t.approvals ?? []) {
        if (a.status === "pending") list.push({ task: t, approval: a });
      }
    }
    return list;
  }, [tasks]);

  // 停滞检测（Watchdog）：in_progress 超过 staleHours 无新检查点的任务
  const staleHours = dispatchRules?.staleHours ?? 24;
  const staleTasks = useMemo(() => {
    return tasks.filter((t) => isTaskStale(t, staleHours));
  }, [tasks, staleHours]);

  // 派发链熔断告警：未确认的 tripped 记录
  const trippedDispatches = useMemo(() => {
    return dispatchLog.filter((e) => e.status === "tripped");
  }, [dispatchLog]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === "all") {
        if (t.status === "archived") return false;
      } else if (t.status !== filter) {
        return false;
      }
      if (selectedTag) {
        if (!t.tags || !t.tags.includes(selectedTag)) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = t.id.toLowerCase().includes(q);
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchDesc = t.description?.toLowerCase().includes(q) ?? false;
        const matchDeliverables = t.conclusions.some((c) =>
          c.deliverables?.some((d) => d.toLowerCase().includes(q))
        );
        const matchTags = t.tags?.some((tag) => tag.toLowerCase().includes(q)) ?? false;
        if (!matchId && !matchTitle && !matchDesc && !matchDeliverables && !matchTags) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, filter, selectedTag, searchQuery]);

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

  const handleNavigateToTask = (targetId: string) => {
    const el = document.getElementById(`task-card-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.transition = "box-shadow 0.3s ease, border-color 0.3s ease";
      el.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.4)";
      el.style.borderColor = "#2563eb";
      setTimeout(() => {
        el.style.boxShadow = "";
        el.style.borderColor = "";
      }, 1800);
    }
  };

  // 滚动定位（带重试）：工作区切换后列表异步加载，目标卡片可能晚到，最多重试 6 次
  const scrollToTaskWithRetry = (targetId: string, attempt = 0) => {
    const el = document.getElementById(`task-card-${targetId}`);
    if (el) {
      handleNavigateToTask(targetId);
      return;
    }
    if (attempt < 6) setTimeout(() => scrollToTaskWithRetry(targetId, attempt + 1), 400);
  };

  // 中台（主区域全局看板）跳转请求：挂单（挂载时消费，兜底 openTab 后异步挂载的场景）
  // + 事件（看板已打开时的即时响应）。两条路径都会先清挂单，避免重复消费。
  useEffect(() => {
    const applyNav = (detail: { workspacePath?: string; taskId?: string }) => {
      if (!detail?.workspacePath) return;
      // 重置筛选状态，保证目标卡片在列表中渲染（否则滚动定位找不到节点）
      setFilter("all");
      setSelectedTag(null);
      setSearchQuery("");
      setManualWorkspacePath(detail.workspacePath);
      if (detail.taskId) scrollToTaskWithRetry(detail.taskId);
    };
    // 挂载时主动消费挂单：openTab 打开看板 → React 异步挂载完成 → 在这里取出跳转请求
    const pending = consumePendingNav();
    if (pending) applyNav(pending);
    const onOpenWorkspace = (e: Event) => {
      consumePendingNav(); // 事件路径优先，挂单作废
      applyNav((e as CustomEvent<{ workspacePath?: string; taskId?: string }>).detail ?? {});
    };
    window.addEventListener("dsh-tasks:open-workspace", onOpenWorkspace);
    return () => window.removeEventListener("dsh-tasks:open-workspace", onOpenWorkspace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDispatchNextReady = async () => {
    const target = readyTasks[0];
    if (!target) return;
    const prompt = buildDispatchPrompt(target, { workspacePath: workspace.path });
    const dispatched = await dispatchPromptToAgent(prompt, { workspaceId: workspace.id });
    if (!dispatched) {
      try {
        await navigator.clipboard.writeText(prompt);
        alert(`已复制派发提示词到剪贴板，请直接粘贴发送给 Agent！`);
      } catch {}
    }
    try {
      await fetch(`${API_BASE}/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspacePath: workspace.path,
          taskId: target.id,
          status: "in_progress",
        }),
      });
      refresh();
    } catch {}
  };

  // 观察记录「立即执行」：统一派发通道注入提示词，置 in_progress 并 ack
  const handleExecuteDispatch = async (entry: DispatchLogEntry) => {
    const target = tasks.find((t) => t.id === entry.taskId);
    if (!target) return;
    const prompt = buildDispatchPrompt(target, { workspacePath: workspace.path });
    const dispatched = await dispatchPromptToAgent(prompt, { workspaceId: workspace.id });
    if (!dispatched) {
      try {
        await navigator.clipboard.writeText(prompt);
        alert(`已复制派发提示词到剪贴板，请直接粘贴发送给 Agent！`);
      } catch {}
    }
    try {
      await fetch(`${API_BASE}/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspacePath: workspace.path,
          taskId: target.id,
          status: "in_progress",
        }),
      });
      await fetch(`${API_BASE}/dispatch/ack`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspacePath: workspace.path, id: entry.id, status: dispatched ? "sent" : "failed" }),
      });
      refresh();
      refreshDispatch();
    } catch {}
  };

  const summaryReportMarkdown = useMemo(() => {
    return generateWorkspaceSummaryReport(tasks, workspace.path);
  }, [tasks, workspace.path]);

  return (
    <div
      style={containerStyle}
      onPointerDown={() => {
        if (showWorkspaceMenu) setShowWorkspaceMenu(false);
        if (showMoreMenu) setShowMoreMenu(false);
      }}
    >
      {/* 头部工具栏 */}
      <div style={headerStyle}>
        <div style={headerLeftStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={headerTitleStyle}>工作区任务看板</span>
            {allWorkspaces.length > 0 && (
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  type="button"
                  onClick={(e: any) => {
                    e.stopPropagation();
                    setShowWorkspaceMenu(!showWorkspaceMenu);
                  }}
                  style={workspaceChipStyle(!!manualWorkspacePath)}
                  title={
                    manualWorkspacePath
                      ? `已固定在: ${workspace.title || workspace.path} (点击切换或恢复自动跟随)`
                      : `当前工作区: ${workspace.title || workspace.path} (点击可手动切换)`
                  }
                >
                  {`📁 ${workspace.title || "未选工作区"}`}
                  {manualWorkspacePath && <span style={manualTagStyle}>固定</span>}
                  <span style={{ fontSize: "8px", opacity: 0.7, marginLeft: 2 }}>▼</span>
                </button>
                {showWorkspaceMenu && (
                  <div
                    style={workspaceMenuStyle}
                    // 关键：pointerdown 也要拦——根容器在 pointerdown 阶段关菜单，
                    // 不拦的话菜单先卸载、click 落空（菜单项点了没反应）
                    onPointerDown={(e: any) => e.stopPropagation()}
                    onClick={(e: any) => e.stopPropagation()}
                  >
                    <div style={menuHeaderStyle}>切换查看工作区任务</div>
                    <button
                      type="button"
                      onClick={() => {
                        setManualWorkspacePath(null);
                        setShowWorkspaceMenu(false);
                      }}
                      style={menuItemStyle(manualWorkspacePath === null)}
                    >
                      ✨ 自动跟随当前工作区
                      {manualWorkspacePath === null ? " ✓" : ""}
                    </button>
                    {allWorkspaces.map((ws) => (
                      <button
                        type="button"
                        key={ws.workspaceId || ws.path}
                        onClick={() => {
                          setManualWorkspacePath(ws.path);
                          setShowWorkspaceMenu(false);
                        }}
                        style={menuItemStyle(workspace.path === ws.path && manualWorkspacePath === ws.path)}
                      >
                        {ws.title || ws.path}
                        {workspace.path === ws.path && manualWorkspacePath === ws.path ? " ✓" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <span style={countSubStyle}>
            {`共 ${summary.total} 项，进行中 ${summary.inProgress}`}
          </span>
        </div>
        <div style={headerActionsStyle}>
          {/* ⋯ 更多菜单：收敛自动派发三态 / 派发记录 / 导出报告（头部只留高频动作） */}
          <div style={{ position: "relative", display: "inline-block" }}>
            <button
              type="button"
              onClick={(e: any) => {
                e.stopPropagation();
                setShowMoreMenu(!showMoreMenu);
              }}
              style={iconBtnStyle}
              title="更多（自动派发 / 派发记录 / 导出报告）"
            >
              ⋯
            </button>
            {showMoreMenu && (
              <div
                style={moreMenuStyle}
                // pointerdown 也要拦：根容器在 pointerdown 阶段关菜单，不拦则菜单先卸载、click 落空
                onPointerDown={(e: any) => e.stopPropagation()}
                onClick={(e: any) => e.stopPropagation()}
              >
                {dispatchRules && (
                  <DispatchModeMenuItems rules={dispatchRules} onSetMode={setDispatchMode} />
                )}
                <CrossWorkspaceMenuItem
                  on={crossWorkspaceOn}
                  onToggle={async () => {
                    const next = !crossWorkspaceOn;
                    setCrossWorkspaceOn(next);
                    try {
                      await fetch(`${API_BASE}/dispatch/config`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ crossWorkspaceDispatch: next }),
                      });
                    } catch (e) {
                      console.error(e);
                      setCrossWorkspaceOn(!next);
                    }
                  }}
                />
                <div style={menuDividerStyle} />
                <button
                  type="button"
                  style={menuItemStyle(showDispatchLog)}
                  onClick={() => {
                    setShowDispatchLog(!showDispatchLog);
                    setShowMoreMenu(false);
                  }}
                >
                  📜 派发记录
                  {showDispatchLog ? " ✓" : ""}
                </button>
                <button
                  type="button"
                  style={menuItemStyle(false)}
                  onClick={() => {
                    setShowReportModal(true);
                    setShowMoreMenu(false);
                  }}
                >
                  📋 导出报告
                </button>
              </div>
            )}
          </div>
          <button
            onClick={refresh}
            style={iconBtnStyle}
            title="刷新列表"
          >
            <RefreshIcon className={loading ? "spin" : undefined} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            style={primaryBtnStyle}
          >
            <PlusIcon style={{ marginRight: 4 }} />
            新建任务
          </button>
        </div>
      </div>

      {/* 搜索输入栏 */}
      <div style={searchContainerStyle}>
        <input
          type="text"
          placeholder="🔍 搜索任务 ID、标题、描述、交付物或标签..."
          value={searchQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          style={searchInputStyle}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            style={clearSearchBtnStyle}
            title="清空搜索"
          >
            ×
          </button>
        )}
      </div>

      {/* 标签选择栏（标签过多时支持展开/收起） */}
      {allTags.length > 0 && (
        <div style={tagFilterBarStyle}>
          <button
            type="button"
            style={tagFilterChipStyle(selectedTag === null)}
            onClick={() => setSelectedTag(null)}
          >
            全部标签
          </button>
          {visibleTags.map((tag) => (
            <button
              type="button"
              key={tag}
              style={tagFilterChipStyle(selectedTag === tag)}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
            >
              {`#${tag}`}
            </button>
          ))}
          {tagsOverflow > 0 && (
            <button
              type="button"
              key="__tag_expand_toggle__"
              style={tagExpandToggleStyle}
              onClick={() => setTagsExpanded(!tagsExpanded)}
              title={
                tagsExpanded
                  ? "收起标签筛选，仅展示高频标签"
                  : `还有 ${tagsOverflow} 个标签被折叠，点击展开全部 ${allTags.length} 个标签`
              }
            >
              {tagsExpanded ? "收起 ▴" : `展开 ${tagsOverflow} 个 ▾`}
            </button>
          )}
        </div>
      )}

      {/* 派发链熔断告警（最严重，置顶）：TTL 超 8 层自动熔断，目标已转 blocked 等人处置 */}
      {trippedDispatches.length > 0 && (
        <TrippedBanner
          entries={trippedDispatches}
          onNavigateToTask={handleNavigateToTask}
          onIgnore={handleIgnoreDispatch}
        />
      )}

      {/* 停滞提醒（Watchdog）：in_progress 超过阈值无新检查点 */}
      {staleTasks.length > 0 && (
        <StaleBanner
          tasks={staleTasks}
          staleHours={staleHours}
          onNavigateToTask={handleNavigateToTask}
          onDemoteToTodo={(id) => updateStatus(id, "todo")}
        />
      )}

      {/* 待拍板横幅（票拟→批红：人只在需要拍板时被打扰） */}
      {pendingApprovals.length > 0 && (
        <ApprovalBanner
          pendingApprovals={pendingApprovals}
          onNavigateToTask={handleNavigateToTask}
        />
      )}

      {/* 观察模式横幅：引擎「本会派发」的记录，人确认后一键执行或忽略 */}
      {dispatchLog.filter((e) => e.status === "would-dispatch").length > 0 && (
        <ObserveBanner
          log={dispatchLog}
          onExecute={handleExecuteDispatch}
          onIgnore={handleIgnoreDispatch}
        />
      )}

      {/* 自动派发记录（最近 20 条，可折叠） */}
      {showDispatchLog && <DispatchLogSection log={dispatchLog} />}

      {/* 就绪任务快捷横幅 */}
      {readyTasks.length > 0 && (
        <ReadyBanner readyTasks={readyTasks} onDispatch={handleDispatchNextReady} />
      )}

      {/* 状态过滤分段标签 */}
      <div style={filterBarStyle}>
        {[
          { key: "all", label: `全部 (${summary.total})` },
          { key: "todo", label: `待办 (${summary.todo})` },
          { key: "in_progress", label: `进行中 (${summary.inProgress})` },
          { key: "review", label: `审查 (${summary.review})` },
          { key: "done", label: `已完成 (${summary.done})` },
          { key: "blocked", label: `阻塞 (${summary.blocked})` },
          { key: "archived", label: `已归档 (${summary.archived ?? 0})` },
        ].map((tab) => (
          <button
            key={tab.key}
            style={filterTabStyle(filter === tab.key)}
            onClick={() => setFilter(tab.key as "all" | TaskStatus)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 任务列表内容 */}
      <div style={taskListStyle}>
        {filteredTasks.length === 0
          ? (
            <div style={emptyStyle}>
              {loading
                ? "加载任务中…"
                : filter === "archived"
                ? "暂无已归档任务"
                : searchQuery || selectedTag
                ? "未找到匹配的搜索或标签任务"
                : "暂无相关任务，点击右上角【新建任务】开始"}
            </div>
          )
          : filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                allTasks={tasks}
                workspacePath={workspace.path}
                workspaceId={workspace.id}
                isExpanded={!!expandedTasks[task.id]}
                isReady={readyTaskIdSet.has(task.id)}
                onToggleExpand={() => toggleExpand(task.id)}
                onStatusChange={(status) => updateStatus(task.id, status)}
                onDelete={() => deleteTask(task.id)}
                onConclusionAdded={refresh}
                onNavigateToTask={handleNavigateToTask}
                onSelectTag={(t) => setSelectedTag(t)}
                openFile={handleOpenFileProp}
              />
            ))}
      </div>

      {/* 新建任务弹窗 */}
      {showCreateModal && (
        <CreateTaskModal
          workspacePath={workspace.path}
          existingTasks={tasks}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            refresh();
          }}
        />
      )}

      {/* 导出全景总结报告弹窗 */}
      {showReportModal && (
        <ExportReportModal
          markdown={summaryReportMarkdown}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}
