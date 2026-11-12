import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { getReadyTasks, generateWorkspaceSummaryReport, isTaskStale } from "../../store/pipeline.js";
import { PlusIcon, RefreshIcon } from "../icons.js";
import { findCurrentSession, openWorkspaceFileViaDsh } from "../dsh-open.js";
import { buildDispatchPrompt, dispatchPromptToAgent } from "../dispatch-agent.js";
import { consumePendingNav } from "../pending-nav.js";
import { ApprovalBanner, ObserveBanner, ReadyBanner, StaleBanner, TrippedBanner } from "./banners.js";
import { CrossWorkspaceMenuItem, DispatchLogSection, DispatchModeMenuItems } from "./DispatchSections.js";
import { CreateTaskModal } from "./CreateTaskModal.js";
import { ExportReportModal } from "./ExportReportModal.js";
import { TaskCard } from "./TaskCard.js";
import { API_BASE, useDispatch, useTasks } from "./hooks.js";
import { useActiveWorkspace } from "./workspace.js";
import { clearSearchBtnStyle, containerStyle, countSubStyle, emptyStyle, filterBarStyle, filterTabStyle, headerActionsStyle, headerLeftStyle, headerStyle, headerTitleStyle, iconBtnStyle, manualTagStyle, menuHeaderStyle, menuItemStyle, menuDividerStyle, moreMenuStyle, primaryBtnStyle, searchContainerStyle, searchInputStyle, tagExpandToggleStyle, tagFilterBarStyle, tagFilterChipStyle, taskListStyle, workspaceChipStyle, workspaceMenuStyle, } from "./styles.js";
// 标签筛选栏收起时最多直接展示的标签数量，超出部分通过「展开/收起」查看
const TAG_COLLAPSE_LIMIT = 10;
// ---------------- 主面板（工作区任务看板） ----------------
export function TaskPanelBody(props) {
    const [manualWorkspacePath, setManualWorkspacePath] = useState(null);
    const workspace = useActiveWorkspace(props?.sessionId, manualWorkspacePath || undefined);
    const { tasks, summary, loading, refresh } = useTasks(workspace.path);
    const { rules: dispatchRules, log: dispatchLog, refresh: refreshDispatch } = useDispatch(workspace.path);
    const [showDispatchLog, setShowDispatchLog] = useState(false);
    // 自动派发：模式切换（三态：👁️观察 / ⚡自动 / ⏸️关闭）
    const setDispatchMode = async (mode) => {
        try {
            await fetch(`${API_BASE}/dispatch/rules`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ workspacePath: workspace.path, mode }),
            });
            refreshDispatch();
        }
        catch (e) {
            console.error(e);
        }
    };
    // 忽略一条「本会派发」观察记录
    const handleIgnoreDispatch = async (id) => {
        try {
            await fetch(`${API_BASE}/dispatch/ignore`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ workspacePath: workspace.path, id }),
            });
            refreshDispatch();
        }
        catch (e) {
            console.error(e);
        }
    };
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTag, setSelectedTag] = useState(null);
    const [tagsExpanded, setTagsExpanded] = useState(false);
    const [filter, setFilter] = useState("all");
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    // 跨工作区派发开关（插件配置，宿主持久化；此处为 UI 态，点击即 POST 立即生效）
    const [crossWorkspaceOn, setCrossWorkspaceOn] = useState(false);
    useEffect(() => {
        fetch(`${API_BASE}/dispatch/config`, { cache: "no-store" })
            .then((r) => r.json())
            .then((res) => {
            if (res.ok && res.data)
                setCrossWorkspaceOn(res.data.crossWorkspaceDispatch === true);
        })
            .catch(() => { });
    }, []);
    const [expandedTasks, setExpandedTasks] = useState({});
    const dshCtx = window.__DSH_TASK_CLIENT_CTX__;
    const activeSession = findCurrentSession(dshCtx);
    const currentSessionId = props?.sessionId || activeSession?.sessionId;
    const allWorkspaces = dshCtx?.workspaces?.list?.getSnapshot?.()?.items ?? [];
    const tabInfo = typeof props?.useTabInfo === "function" ? props.useTabInfo() : null;
    const tabActions = tabInfo?.tab?.actions;
    const handleOpenFileProp = (path, wsPath) => {
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
        const s = new Set();
        for (const t of tasks) {
            for (const tag of t.tags || [])
                s.add(tag);
        }
        return Array.from(s).sort();
    }, [tasks]);
    // 标签过多时收起仅展示前 TAG_COLLAPSE_LIMIT 个；若当前选中的标签被折叠隐藏，则追加到末尾，确保筛选状态始终可见
    const visibleTags = useMemo(() => {
        if (tagsExpanded || allTags.length <= TAG_COLLAPSE_LIMIT)
            return allTags;
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
        const list = [];
        for (const t of tasks) {
            if (t.status === "archived")
                continue;
            for (const a of t.approvals ?? []) {
                if (a.status === "pending")
                    list.push({ task: t, approval: a });
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
                if (t.status === "archived")
                    return false;
            }
            else if (t.status !== filter) {
                return false;
            }
            if (selectedTag) {
                if (!t.tags || !t.tags.includes(selectedTag))
                    return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchId = t.id.toLowerCase().includes(q);
                const matchTitle = t.title.toLowerCase().includes(q);
                const matchDesc = t.description?.toLowerCase().includes(q) ?? false;
                const matchDeliverables = t.conclusions.some((c) => c.deliverables?.some((d) => d.toLowerCase().includes(q)));
                const matchTags = t.tags?.some((tag) => tag.toLowerCase().includes(q)) ?? false;
                if (!matchId && !matchTitle && !matchDesc && !matchDeliverables && !matchTags) {
                    return false;
                }
            }
            return true;
        });
    }, [tasks, filter, selectedTag, searchQuery]);
    const toggleExpand = (id) => {
        setExpandedTasks((prev) => ({ ...prev, [id]: !prev[id] }));
    };
    const updateStatus = async (taskId, newStatus) => {
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
        }
        catch (e) {
            console.error(e);
        }
    };
    const deleteTask = async (taskId) => {
        if (!confirm(`确定删除任务 ${taskId} 吗？`))
            return;
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
        }
        catch (e) {
            console.error(e);
        }
    };
    const handleNavigateToTask = (targetId) => {
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
    const scrollToTaskWithRetry = (targetId, attempt = 0) => {
        const el = document.getElementById(`task-card-${targetId}`);
        if (el) {
            handleNavigateToTask(targetId);
            return;
        }
        if (attempt < 6)
            setTimeout(() => scrollToTaskWithRetry(targetId, attempt + 1), 400);
    };
    // 中台（主区域全局看板）跳转请求：挂单（挂载时消费，兜底 openTab 后异步挂载的场景）
    // + 事件（看板已打开时的即时响应）。两条路径都会先清挂单，避免重复消费。
    useEffect(() => {
        const applyNav = (detail) => {
            if (!detail?.workspacePath)
                return;
            // 重置筛选状态，保证目标卡片在列表中渲染（否则滚动定位找不到节点）
            setFilter("all");
            setSelectedTag(null);
            setSearchQuery("");
            setManualWorkspacePath(detail.workspacePath);
            if (detail.taskId)
                scrollToTaskWithRetry(detail.taskId);
        };
        // 挂载时主动消费挂单：openTab 打开看板 → React 异步挂载完成 → 在这里取出跳转请求
        const pending = consumePendingNav();
        if (pending)
            applyNav(pending);
        const onOpenWorkspace = (e) => {
            consumePendingNav(); // 事件路径优先，挂单作废
            applyNav(e.detail ?? {});
        };
        window.addEventListener("dsh-tasks:open-workspace", onOpenWorkspace);
        return () => window.removeEventListener("dsh-tasks:open-workspace", onOpenWorkspace);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const handleDispatchNextReady = async () => {
        const target = readyTasks[0];
        if (!target)
            return;
        const prompt = buildDispatchPrompt(target, { workspacePath: workspace.path });
        const dispatched = await dispatchPromptToAgent(prompt, { workspaceId: workspace.id });
        if (!dispatched) {
            try {
                await navigator.clipboard.writeText(prompt);
                alert(`已复制派发提示词到剪贴板，请直接粘贴发送给 Agent！`);
            }
            catch { }
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
        }
        catch { }
    };
    // 观察记录「立即执行」：统一派发通道注入提示词，置 in_progress 并 ack
    const handleExecuteDispatch = async (entry) => {
        const target = tasks.find((t) => t.id === entry.taskId);
        if (!target)
            return;
        const prompt = buildDispatchPrompt(target, { workspacePath: workspace.path });
        const dispatched = await dispatchPromptToAgent(prompt, { workspaceId: workspace.id });
        if (!dispatched) {
            try {
                await navigator.clipboard.writeText(prompt);
                alert(`已复制派发提示词到剪贴板，请直接粘贴发送给 Agent！`);
            }
            catch { }
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
        }
        catch { }
    };
    const summaryReportMarkdown = useMemo(() => {
        return generateWorkspaceSummaryReport(tasks, workspace.path);
    }, [tasks, workspace.path]);
    return (_jsxs("div", { style: containerStyle, onPointerDown: () => {
            if (showWorkspaceMenu)
                setShowWorkspaceMenu(false);
            if (showMoreMenu)
                setShowMoreMenu(false);
        }, children: [_jsxs("div", { style: headerStyle, children: [_jsxs("div", { style: headerLeftStyle, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("span", { style: headerTitleStyle, children: "\u5DE5\u4F5C\u533A\u4EFB\u52A1\u770B\u677F" }), allWorkspaces.length > 0 && (_jsxs("div", { style: { position: "relative", display: "inline-block" }, children: [_jsxs("button", { type: "button", onClick: (e) => {
                                                    e.stopPropagation();
                                                    setShowWorkspaceMenu(!showWorkspaceMenu);
                                                }, style: workspaceChipStyle(!!manualWorkspacePath), title: manualWorkspacePath
                                                    ? `已固定在: ${workspace.title || workspace.path} (点击切换或恢复自动跟随)`
                                                    : `当前工作区: ${workspace.title || workspace.path} (点击可手动切换)`, children: [`📁 ${workspace.title || "未选工作区"}`, manualWorkspacePath && _jsx("span", { style: manualTagStyle, children: "\u56FA\u5B9A" }), _jsx("span", { style: { fontSize: "8px", opacity: 0.7, marginLeft: 2 }, children: "\u25BC" })] }), showWorkspaceMenu && (_jsxs("div", { style: workspaceMenuStyle, 
                                                // 关键：pointerdown 也要拦——根容器在 pointerdown 阶段关菜单，
                                                // 不拦的话菜单先卸载、click 落空（菜单项点了没反应）
                                                onPointerDown: (e) => e.stopPropagation(), onClick: (e) => e.stopPropagation(), children: [_jsx("div", { style: menuHeaderStyle, children: "\u5207\u6362\u67E5\u770B\u5DE5\u4F5C\u533A\u4EFB\u52A1" }), _jsxs("button", { type: "button", onClick: () => {
                                                            setManualWorkspacePath(null);
                                                            setShowWorkspaceMenu(false);
                                                        }, style: menuItemStyle(manualWorkspacePath === null), children: ["\u2728 \u81EA\u52A8\u8DDF\u968F\u5F53\u524D\u5DE5\u4F5C\u533A", manualWorkspacePath === null ? " ✓" : ""] }), allWorkspaces.map((ws) => (_jsxs("button", { type: "button", onClick: () => {
                                                            setManualWorkspacePath(ws.path);
                                                            setShowWorkspaceMenu(false);
                                                        }, style: menuItemStyle(workspace.path === ws.path && manualWorkspacePath === ws.path), children: [ws.title || ws.path, workspace.path === ws.path && manualWorkspacePath === ws.path ? " ✓" : ""] }, ws.workspaceId || ws.path)))] }))] }))] }), _jsx("span", { style: countSubStyle, children: `共 ${summary.total} 项，进行中 ${summary.inProgress}` })] }), _jsxs("div", { style: headerActionsStyle, children: [_jsxs("div", { style: { position: "relative", display: "inline-block" }, children: [_jsx("button", { type: "button", onClick: (e) => {
                                            e.stopPropagation();
                                            setShowMoreMenu(!showMoreMenu);
                                        }, style: iconBtnStyle, title: "\u66F4\u591A\uFF08\u81EA\u52A8\u6D3E\u53D1 / \u6D3E\u53D1\u8BB0\u5F55 / \u5BFC\u51FA\u62A5\u544A\uFF09", children: "\u22EF" }), showMoreMenu && (_jsxs("div", { style: moreMenuStyle, 
                                        // pointerdown 也要拦：根容器在 pointerdown 阶段关菜单，不拦则菜单先卸载、click 落空
                                        onPointerDown: (e) => e.stopPropagation(), onClick: (e) => e.stopPropagation(), children: [dispatchRules && (_jsx(DispatchModeMenuItems, { rules: dispatchRules, onSetMode: setDispatchMode })), _jsx(CrossWorkspaceMenuItem, { on: crossWorkspaceOn, onToggle: async () => {
                                                    const next = !crossWorkspaceOn;
                                                    setCrossWorkspaceOn(next);
                                                    try {
                                                        await fetch(`${API_BASE}/dispatch/config`, {
                                                            method: "POST",
                                                            headers: { "content-type": "application/json" },
                                                            body: JSON.stringify({ crossWorkspaceDispatch: next }),
                                                        });
                                                    }
                                                    catch (e) {
                                                        console.error(e);
                                                        setCrossWorkspaceOn(!next);
                                                    }
                                                } }), _jsx("div", { style: menuDividerStyle }), _jsxs("button", { type: "button", style: menuItemStyle(showDispatchLog), onClick: () => {
                                                    setShowDispatchLog(!showDispatchLog);
                                                    setShowMoreMenu(false);
                                                }, children: ["\uD83D\uDCDC \u6D3E\u53D1\u8BB0\u5F55", showDispatchLog ? " ✓" : ""] }), _jsx("button", { type: "button", style: menuItemStyle(false), onClick: () => {
                                                    setShowReportModal(true);
                                                    setShowMoreMenu(false);
                                                }, children: "\uD83D\uDCCB \u5BFC\u51FA\u62A5\u544A" })] }))] }), _jsx("button", { onClick: refresh, style: iconBtnStyle, title: "\u5237\u65B0\u5217\u8868", children: _jsx(RefreshIcon, { className: loading ? "spin" : undefined }) }), _jsxs("button", { onClick: () => setShowCreateModal(true), style: primaryBtnStyle, children: [_jsx(PlusIcon, { style: { marginRight: 4 } }), "\u65B0\u5EFA\u4EFB\u52A1"] })] })] }), _jsxs("div", { style: searchContainerStyle, children: [_jsx("input", { type: "text", placeholder: "\uD83D\uDD0D \u641C\u7D22\u4EFB\u52A1 ID\u3001\u6807\u9898\u3001\u63CF\u8FF0\u3001\u4EA4\u4ED8\u7269\u6216\u6807\u7B7E...", value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), style: searchInputStyle }), searchQuery && (_jsx("button", { type: "button", onClick: () => setSearchQuery(""), style: clearSearchBtnStyle, title: "\u6E05\u7A7A\u641C\u7D22", children: "\u00D7" }))] }), allTags.length > 0 && (_jsxs("div", { style: tagFilterBarStyle, children: [_jsx("button", { type: "button", style: tagFilterChipStyle(selectedTag === null), onClick: () => setSelectedTag(null), children: "\u5168\u90E8\u6807\u7B7E" }), visibleTags.map((tag) => (_jsx("button", { type: "button", style: tagFilterChipStyle(selectedTag === tag), onClick: () => setSelectedTag(selectedTag === tag ? null : tag), children: `#${tag}` }, tag))), tagsOverflow > 0 && (_jsx("button", { type: "button", style: tagExpandToggleStyle, onClick: () => setTagsExpanded(!tagsExpanded), title: tagsExpanded
                            ? "收起标签筛选，仅展示高频标签"
                            : `还有 ${tagsOverflow} 个标签被折叠，点击展开全部 ${allTags.length} 个标签`, children: tagsExpanded ? "收起 ▴" : `展开 ${tagsOverflow} 个 ▾` }, "__tag_expand_toggle__"))] })), trippedDispatches.length > 0 && (_jsx(TrippedBanner, { entries: trippedDispatches, onNavigateToTask: handleNavigateToTask, onIgnore: handleIgnoreDispatch })), staleTasks.length > 0 && (_jsx(StaleBanner, { tasks: staleTasks, staleHours: staleHours, onNavigateToTask: handleNavigateToTask, onDemoteToTodo: (id) => updateStatus(id, "todo") })), pendingApprovals.length > 0 && (_jsx(ApprovalBanner, { pendingApprovals: pendingApprovals, onNavigateToTask: handleNavigateToTask })), dispatchLog.filter((e) => e.status === "would-dispatch").length > 0 && (_jsx(ObserveBanner, { log: dispatchLog, onExecute: handleExecuteDispatch, onIgnore: handleIgnoreDispatch })), showDispatchLog && _jsx(DispatchLogSection, { log: dispatchLog }), readyTasks.length > 0 && (_jsx(ReadyBanner, { readyTasks: readyTasks, onDispatch: handleDispatchNextReady })), _jsx("div", { style: filterBarStyle, children: [
                    { key: "all", label: `全部 (${summary.total})` },
                    { key: "todo", label: `待办 (${summary.todo})` },
                    { key: "in_progress", label: `进行中 (${summary.inProgress})` },
                    { key: "review", label: `审查 (${summary.review})` },
                    { key: "done", label: `已完成 (${summary.done})` },
                    { key: "blocked", label: `阻塞 (${summary.blocked})` },
                    { key: "archived", label: `已归档 (${summary.archived ?? 0})` },
                ].map((tab) => (_jsx("button", { style: filterTabStyle(filter === tab.key), onClick: () => setFilter(tab.key), children: tab.label }, tab.key))) }), _jsx("div", { style: taskListStyle, children: filteredTasks.length === 0
                    ? (_jsx("div", { style: emptyStyle, children: loading
                            ? "加载任务中…"
                            : filter === "archived"
                                ? "暂无已归档任务"
                                : searchQuery || selectedTag
                                    ? "未找到匹配的搜索或标签任务"
                                    : "暂无相关任务，点击右上角【新建任务】开始" }))
                    : filteredTasks.map((task) => (_jsx(TaskCard, { task: task, allTasks: tasks, workspacePath: workspace.path, workspaceId: workspace.id, isExpanded: !!expandedTasks[task.id], isReady: readyTaskIdSet.has(task.id), onToggleExpand: () => toggleExpand(task.id), onStatusChange: (status) => updateStatus(task.id, status), onDelete: () => deleteTask(task.id), onConclusionAdded: refresh, onNavigateToTask: handleNavigateToTask, onSelectTag: (t) => setSelectedTag(t), openFile: handleOpenFileProp }, task.id))) }), showCreateModal && (_jsx(CreateTaskModal, { workspacePath: workspace.path, existingTasks: tasks, onClose: () => setShowCreateModal(false), onCreated: () => {
                    setShowCreateModal(false);
                    refresh();
                } })), showReportModal && (_jsx(ExportReportModal, { markdown: summaryReportMarkdown, onClose: () => setShowReportModal(false) }))] }));
}
//# sourceMappingURL=TaskPanelBody.js.map