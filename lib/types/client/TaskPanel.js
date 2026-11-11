import { createElement, useEffect, useMemo, useState } from "react";
import { getReadyTasks, generateWorkspaceSummaryReport, isTaskStale } from "../store/pipeline.js";
import { PlusIcon, RefreshIcon, TaskTabIcon } from "./icons.js";
import { findCurrentSession, openWorkspaceFileViaDsh } from "./dsh-open.js";
import { dispatchPromptToAgent } from "./dispatch-agent.js";
import { MarkdownContent } from "./markdown.js";
import { decisionChipStyle, traceChipStyle, TraceSections } from "./TraceSections.js";
import { consumePendingNav } from "./pending-nav.js";
const API_BASE = "/__dsh-tasks__";
// 标签筛选栏收起时最多直接展示的标签数量，超出部分通过「展开/收起」查看
const TAG_COLLAPSE_LIMIT = 10;
export function findBestMatchingWorkspace(items, targetPath) {
    if (!targetPath || !items || items.length === 0)
        return null;
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
export function resolveActiveWorkspace(explicitSessionId, explicitWorkspacePath) {
    try {
        const dshCtx = window.__DSH_TASK_CLIENT_CTX__;
        const workspacesState = dshCtx?.workspaces?.list?.getSnapshot?.();
        const sessionsState = dshCtx?.sessions?.list?.getSnapshot?.();
        const items = workspacesState?.items ?? [];
        // 0. 如果显式指定了有效的工作区路径，优先按精准/最长前缀路径解析
        if (explicitWorkspacePath) {
            const match = findBestMatchingWorkspace(items, explicitWorkspacePath);
            if (match)
                return match;
            const title = explicitWorkspacePath.split("/").filter(Boolean).pop() || explicitWorkspacePath;
            return { id: undefined, path: explicitWorkspacePath, title };
        }
        // 1. 搜集当前候选 Session ID（按优先级排序）
        const candidateSessionIds = [];
        // 1.1 从 findCurrentSession 获取主视图活跃 Session
        const activeSession = findCurrentSession(dshCtx);
        if (activeSession?.sessionId && !candidateSessionIds.includes(activeSession.sessionId)) {
            candidateSessionIds.push(activeSession.sessionId);
        }
        // 1.2 显式传入（例如 TaskPanel 组件接收到的 props.sessionId）
        if (explicitSessionId && !candidateSessionIds.includes(explicitSessionId)) {
            candidateSessionIds.push(explicitSessionId);
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
            }
            catch { }
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
                if (matched)
                    return matched;
                const title = sessionCwd.split("/").filter(Boolean).pop() || sessionCwd;
                return { id: undefined, path: sessionCwd, title };
            }
        }
        // 3. 尝试从 DOM 激活项查找工作区
        if (typeof document !== "undefined" && items.length > 0) {
            const activeEl = document.querySelector("[data-workspace-id][aria-selected='true'], [data-workspace-id].active, [data-workspace-active='true']");
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
            let selected;
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
    }
    catch (e) {
        console.warn("Failed to resolve active workspace:", e);
    }
    return { path: "", title: "" };
}
export function useActiveWorkspace(explicitSessionId, explicitWorkspacePath) {
    const [workspace, setWorkspace] = useState(() => resolveActiveWorkspace(explicitSessionId, explicitWorkspacePath));
    useEffect(() => {
        const dshCtx = window.__DSH_TASK_CLIENT_CTX__;
        const update = () => {
            const current = resolveActiveWorkspace(explicitSessionId, explicitWorkspacePath);
            setWorkspace((prev) => {
                if (prev.path !== current.path ||
                    prev.id !== current.id ||
                    prev.title !== current.title) {
                    return current;
                }
                return prev;
            });
        };
        update();
        const unsubs = [];
        if (dshCtx?.workspaces?.list?.subscribe) {
            unsubs.push(dshCtx.workspaces.list.subscribe(update));
        }
        if (dshCtx?.sessions?.list?.subscribe) {
            unsubs.push(dshCtx.sessions.list.subscribe(update));
        }
        if (dshCtx?.uiWorkspace?.selection?.subscribe) {
            unsubs.push(dshCtx.uiWorkspace.selection.subscribe(update));
        }
        const onStorage = (e) => {
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
function useTasks(workspacePath) {
    const [tasks, setTasks] = useState([]);
    const [summary, setSummary] = useState({
        total: 0,
        todo: 0,
        inProgress: 0,
        review: 0,
        done: 0,
        blocked: 0,
        archived: 0,
    });
    const [loading, setLoading] = useState(false);
    const [tick, setTick] = useState(0);
    useEffect(() => {
        let alive = true;
        setLoading(true);
        const query = workspacePath ? `?workspacePath=${encodeURIComponent(workspacePath)}` : "";
        fetch(`${API_BASE}/list${query}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((res) => {
            if (!alive)
                return;
            if (res.ok && res.data) {
                setTasks(res.data.tasks);
                setSummary(res.data.summary);
            }
            else {
                setTasks([]);
                setSummary({ total: 0, todo: 0, inProgress: 0, review: 0, done: 0, blocked: 0, archived: 0 });
            }
        })
            .catch((err) => {
            console.error("Failed to load tasks", err);
        })
            .finally(() => {
            if (alive)
                setLoading(false);
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
                .then((r) => r.json())
                .then((res) => {
                if (res.ok && res.data) {
                    setTasks(res.data.tasks);
                    setSummary(res.data.summary);
                }
            })
                .catch(() => { });
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
function useDispatch(workspacePath) {
    const [rules, setRules] = useState(null);
    const [log, setLog] = useState([]);
    const [tick, setTick] = useState(0);
    useEffect(() => {
        let alive = true;
        const query = workspacePath ? `?workspacePath=${encodeURIComponent(workspacePath)}` : "";
        const load = () => {
            Promise.all([
                fetch(`${API_BASE}/dispatch/rules${query}`, { cache: "no-store" })
                    .then((r) => r.json())
                    .catch(() => null),
                fetch(`${API_BASE}/dispatch/log${query}&limit=20`, { cache: "no-store" })
                    .then((r) => r.json())
                    .catch(() => null),
            ]).then(([rulesRes, logRes]) => {
                if (!alive)
                    return;
                if (rulesRes?.ok && rulesRes.data)
                    setRules(rulesRes.data);
                if (logRes?.ok && Array.isArray(logRes.data))
                    setLog(logRes.data);
            });
        };
        load();
        const timer = setInterval(load, 3000);
        const onRefreshEvent = () => load();
        window.addEventListener("dsh-tasks:refresh", onRefreshEvent);
        return () => {
            alive = false;
            clearInterval(timer);
            window.removeEventListener("dsh-tasks:refresh", onRefreshEvent);
        };
    }, [workspacePath, tick]);
    return { rules, log, refresh: () => setTick((t) => t + 1) };
}
export function TaskPanelTitle(props) {
    const workspace = useActiveWorkspace(props?.sessionId);
    const { summary } = useTasks(workspace.path);
    return createElement("span", { style: titleWrapperStyle }, createElement(TaskTabIcon, { style: { marginRight: 6 } }), createElement("span", null, "工作区任务"), summary.inProgress > 0 &&
        createElement("span", { style: inProgressBadgeStyle }, String(summary.inProgress)));
}
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
        const prompt = `请帮我执行工作区就绪任务 [${target.id}]: "${target.title}"。\n${target.description ? `任务详情：\n${target.description}\n` : ""}\n请认领该任务并在完成后登记执行结论与交付物。`;
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
        const prompt = `请帮我执行工作区就绪任务 [${target.id}]: "${target.title}"。\n${target.description ? `任务详情：\n${target.description}\n` : ""}\n请认领该任务并在完成后登记执行结论与交付物。`;
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
    return createElement("div", {
        style: containerStyle,
        onPointerDown: () => {
            if (showWorkspaceMenu)
                setShowWorkspaceMenu(false);
            if (showMoreMenu)
                setShowMoreMenu(false);
        },
    }, 
    // 头部工具栏
    createElement("div", { style: headerStyle }, createElement("div", { style: headerLeftStyle }, createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, createElement("span", { style: headerTitleStyle }, "工作区任务看板"), allWorkspaces.length > 0 &&
        createElement("div", { style: { position: "relative", display: "inline-block" } }, createElement("button", {
            type: "button",
            onClick: (e) => {
                e.stopPropagation();
                setShowWorkspaceMenu(!showWorkspaceMenu);
            },
            style: workspaceChipStyle(!!manualWorkspacePath),
            title: manualWorkspacePath
                ? `已固定在: ${workspace.title || workspace.path} (点击切换或恢复自动跟随)`
                : `当前工作区: ${workspace.title || workspace.path} (点击可手动切换)`,
        }, `📁 ${workspace.title || "未选工作区"}`, manualWorkspacePath && createElement("span", { style: manualTagStyle }, "固定"), createElement("span", { style: { fontSize: "8px", opacity: 0.7, marginLeft: 2 } }, "▼")), showWorkspaceMenu &&
            createElement("div", {
                style: workspaceMenuStyle,
                // 关键：pointerdown 也要拦——根容器在 pointerdown 阶段关菜单，
                // 不拦的话菜单先卸载、click 落空（菜单项点了没反应）
                onPointerDown: (e) => e.stopPropagation(),
                onClick: (e) => e.stopPropagation(),
            }, createElement("div", { style: menuHeaderStyle }, "切换查看工作区任务"), createElement("button", {
                type: "button",
                onClick: () => {
                    setManualWorkspacePath(null);
                    setShowWorkspaceMenu(false);
                },
                style: menuItemStyle(manualWorkspacePath === null),
            }, "✨ 自动跟随当前工作区", manualWorkspacePath === null ? " ✓" : ""), allWorkspaces.map((ws) => createElement("button", {
                type: "button",
                key: ws.workspaceId || ws.path,
                onClick: () => {
                    setManualWorkspacePath(ws.path);
                    setShowWorkspaceMenu(false);
                },
                style: menuItemStyle(workspace.path === ws.path && manualWorkspacePath === ws.path),
            }, ws.title || ws.path, workspace.path === ws.path && manualWorkspacePath === ws.path ? " ✓" : ""))))), createElement("span", { style: countSubStyle }, `共 ${summary.total} 项，进行中 ${summary.inProgress}`)), createElement("div", { style: headerActionsStyle }, 
    // ⋯ 更多菜单：收敛自动派发三态 / 派发记录 / 导出报告（头部只留高频动作）
    createElement("div", { style: { position: "relative", display: "inline-block" } }, createElement("button", {
        type: "button",
        onClick: (e) => {
            e.stopPropagation();
            setShowMoreMenu(!showMoreMenu);
        },
        style: iconBtnStyle,
        title: "更多（自动派发 / 派发记录 / 导出报告）",
    }, "⋯"), showMoreMenu &&
        createElement("div", {
            style: moreMenuStyle,
            // pointerdown 也要拦：根容器在 pointerdown 阶段关菜单，不拦则菜单先卸载、click 落空
            onPointerDown: (e) => e.stopPropagation(),
            onClick: (e) => e.stopPropagation(),
        }, dispatchRules &&
            createElement("div", { style: menuHeaderStyle }, `自动派发 · 优先级 ${(dispatchRules.priorities ?? []).join("/") || "全部"} · 并发 ${dispatchRules.maxConcurrent}${dispatchRules.tagsExclude?.length ? ` · 排除 ${dispatchRules.tagsExclude.join(",")}` : ""}`), dispatchRules &&
            ["observe", "auto", "off"].map((m) => createElement("button", {
                key: m,
                type: "button",
                style: menuItemStyle(dispatchRules.mode === m),
                title: m === "observe"
                    ? "观察模式：任务完成后只记录「本会派发什么」，不自动发送（验证规则靠谱后再切自动）"
                    : m === "auto"
                        ? "自动模式：任务完成后自动派发下一个就绪任务（并发上限内）"
                        : "关闭自动派发",
                onClick: () => setDispatchMode(m),
            }, m === "observe" ? "👁️ 观察模式" : m === "auto" ? "⚡ 自动派发" : "⏸️ 关闭派发", dispatchRules.mode === m ? " ✓" : "")), dispatchRules && createElement("div", { style: menuDividerStyle }), createElement("button", {
            type: "button",
            style: menuItemStyle(crossWorkspaceOn),
            title: "跨工作区派发：开启后执行器轮询全部工作区的派发队列（默认只盯当前工作区）。立即生效，无需重启",
            onClick: async () => {
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
            },
        }, "🌐 跨工作区派发", crossWorkspaceOn ? " ✓" : ""), createElement("div", { style: menuDividerStyle }), createElement("button", {
            type: "button",
            style: menuItemStyle(showDispatchLog),
            onClick: () => {
                setShowDispatchLog(!showDispatchLog);
                setShowMoreMenu(false);
            },
        }, "📜 派发记录", showDispatchLog ? " ✓" : ""), createElement("button", {
            type: "button",
            style: menuItemStyle(false),
            onClick: () => {
                setShowReportModal(true);
                setShowMoreMenu(false);
            },
        }, "📋 导出报告"))), createElement("button", {
        onClick: refresh,
        style: iconBtnStyle,
        title: "刷新列表",
    }, createElement(RefreshIcon, { className: loading ? "spin" : undefined })), createElement("button", {
        onClick: () => setShowCreateModal(true),
        style: primaryBtnStyle,
    }, createElement(PlusIcon, { style: { marginRight: 4 } }), "新建任务"))), 
    // 搜索输入栏
    createElement("div", { style: searchContainerStyle }, createElement("input", {
        type: "text",
        placeholder: "🔍 搜索任务 ID、标题、描述、交付物或标签...",
        value: searchQuery,
        onChange: (e) => setSearchQuery(e.target.value),
        style: searchInputStyle,
    }), searchQuery &&
        createElement("button", {
            type: "button",
            onClick: () => setSearchQuery(""),
            style: clearSearchBtnStyle,
            title: "清空搜索",
        }, "×")), 
    // 标签选择栏（标签过多时支持展开/收起）
    allTags.length > 0 &&
        createElement("div", { style: tagFilterBarStyle }, createElement("button", {
            type: "button",
            style: tagFilterChipStyle(selectedTag === null),
            onClick: () => setSelectedTag(null),
        }, "全部标签"), visibleTags.map((tag) => createElement("button", {
            type: "button",
            key: tag,
            style: tagFilterChipStyle(selectedTag === tag),
            onClick: () => setSelectedTag(selectedTag === tag ? null : tag),
        }, `#${tag}`)), tagsOverflow > 0 &&
            createElement("button", {
                type: "button",
                key: "__tag_expand_toggle__",
                style: tagExpandToggleStyle,
                onClick: () => setTagsExpanded(!tagsExpanded),
                title: tagsExpanded
                    ? "收起标签筛选，仅展示高频标签"
                    : `还有 ${tagsOverflow} 个标签被折叠，点击展开全部 ${allTags.length} 个标签`,
            }, tagsExpanded ? "收起 ▴" : `展开 ${tagsOverflow} 个 ▾`)), 
    // 派发链熔断告警（最严重，置顶）：TTL 超 8 层自动熔断，目标已转 blocked 等人处置
    trippedDispatches.length > 0 &&
        createElement("div", { style: trippedBannerStyle }, createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: "11.5px", color: "#dc2626" } }, createElement("span", { style: { fontSize: "14px" } }, "🛑"), createElement("span", null, `派发链熔断：${trippedDispatches.length} 条链路超过 8 层已自动停派（目标已转阻塞，需人工处置）`)), createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4, marginTop: 6 } }, trippedDispatches.slice(0, 3).map((entry) => createElement("div", { key: entry.id, style: observeEntryRowStyle }, createElement("span", { style: { fontSize: "11.5px" } }, `「${entry.taskTitle ?? entry.taskId}」 @ ${entry.taskId} · hop ${entry.hop}${entry.triggerTaskId ? ` · 链自 ${entry.triggerTaskId}` : ""}`), createElement("div", { style: { display: "flex", gap: 6, flexShrink: 0 } }, createElement("button", {
            type: "button",
            style: observeRunBtnStyle,
            title: "定位到该任务卡片处置（可改回 todo 重新入队）",
            onClick: () => handleNavigateToTask(entry.taskId),
        }, "去处理"), createElement("button", {
            type: "button",
            style: observeIgnoreBtnStyle,
            title: "确认已知悉，消除此告警",
            onClick: () => handleIgnoreDispatch(entry.id),
        }, "知道了")))))), 
    // 停滞提醒（Watchdog）：in_progress 超过阈值无新检查点
    staleTasks.length > 0 &&
        createElement("div", { style: staleBannerStyle }, createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: "11.5px", color: "#b45309" } }, createElement("span", { style: { fontSize: "14px" } }, "⏰"), createElement("span", null, `${staleTasks.length} 个任务疑似停滞（进行中超过 ${staleHours} 小时无新进展）——Agent 可能已中断`)), createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4, marginTop: 6 } }, staleTasks.slice(0, 3).map((t) => createElement("div", { key: t.id, style: observeEntryRowStyle }, createElement("span", { style: { fontSize: "11.5px" } }, `「${t.title}」 @ ${t.id}${t.claim ? ` · 持锁 ${t.claim.owner}` : ""}`), createElement("div", { style: { display: "flex", gap: 6, flexShrink: 0 } }, createElement("button", {
            type: "button",
            style: observeIgnoreBtnStyle,
            title: "查看任务卡片",
            onClick: () => handleNavigateToTask(t.id),
        }, "查看"), createElement("button", {
            type: "button",
            style: observeRunBtnStyle,
            title: "降级回待办，释放后重新进入就绪队列（同时释放认领锁）",
            onClick: () => updateStatus(t.id, "todo"),
        }, "↩️ 降级回待办")))), staleTasks.length > 3 &&
            createElement("div", { style: { fontSize: 10.5, color: "#b45309", paddingLeft: 8 } }, `…还有 ${staleTasks.length - 3} 个停滞任务`))), 
    // 待拍板横幅（票拟→批红：人只在需要拍板时被打扰）
    pendingApprovals.length > 0 &&
        createElement("div", { style: approvalBannerStyle }, createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: "11.5px", color: "#d97706" } }, createElement("span", { style: { fontSize: "14px" } }, "🔔"), createElement("span", null, "待拍板：有 ", createElement("strong", null, `${pendingApprovals.length}`), " 项决策请求等待你批红", pendingApprovals[0]
            ? `（最早：「${pendingApprovals[0].approval.title}」 @ ${pendingApprovals[0].task.id}）`
            : "")), createElement("button", {
            type: "button",
            onClick: () => pendingApprovals[0] && handleNavigateToTask(pendingApprovals[0].task.id),
            style: approvalActionBtnStyle,
            title: pendingApprovals[0]
                ? `定位到 [${pendingApprovals[0].task.id}] 的批红卡片：「${pendingApprovals[0].approval.title}」`
                : "定位到待批任务",
        }, pendingApprovals[0] ? `🖋️ 去批红 ${pendingApprovals[0].task.id}` : "🖋️ 去批红")), 
    // 观察模式横幅：引擎「本会派发」的记录，人确认后一键执行或忽略
    dispatchLog.filter((e) => e.status === "would-dispatch").length > 0 &&
        createElement("div", { style: observeBannerStyle }, createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: "11.5px", color: "#7c3aed" } }, createElement("span", { style: { fontSize: "14px" } }, "👁️"), createElement("span", null, `观察模式：本会派发 ${dispatchLog.filter((e) => e.status === "would-dispatch").length} 个任务（验证判断靠谱后可切「⚡ 自动」）`)), createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4, marginTop: 6 } }, dispatchLog
            .filter((e) => e.status === "would-dispatch")
            .slice(0, 3)
            .map((entry) => createElement("div", { key: entry.id, style: observeEntryRowStyle }, createElement("span", { style: { fontSize: "11.5px" } }, `「${entry.taskTitle ?? entry.taskId}」 @ ${entry.taskId} · hop ${entry.hop}`), createElement("div", { style: { display: "flex", gap: 6, flexShrink: 0 } }, createElement("button", {
            type: "button",
            style: observeRunBtnStyle,
            title: "立即派发该任务给 Agent（并标记为已发送）",
            onClick: () => handleExecuteDispatch(entry),
        }, "⚡ 立即执行"), createElement("button", {
            type: "button",
            style: observeIgnoreBtnStyle,
            title: "忽略本次观察记录（忽略后该任务可被引擎重新观察）",
            onClick: () => handleIgnoreDispatch(entry.id),
        }, "忽略")))))), 
    // 自动派发记录（最近 20 条，可折叠）
    showDispatchLog &&
        createElement("div", { style: dispatchLogPanelStyle }, createElement("div", { style: dispatchLogTitleStyle }, `📜 自动派发记录（最近 ${Math.min(dispatchLog.length, 20)} 条）`), dispatchLog.length === 0
            ? createElement("div", { style: dispatchLogEmptyStyle }, "暂无派发记录——任务完成后引擎会按规则记录在这里")
            : dispatchLog.slice(0, 20).map((entry) => createElement("div", { key: entry.id, style: dispatchLogRowStyle }, createElement("span", { style: dispatchLogTimeStyle }, new Date(entry.createdAt).toLocaleString()), createElement("span", { style: dispatchLogTaskStyle, title: entry.taskTitle ?? entry.taskId }, `${entry.taskId}${entry.taskTitle ? `「${entry.taskTitle}」` : ""}`), entry.triggerTaskId &&
                createElement("span", { style: dispatchLogTriggerStyle }, `← ${entry.triggerTaskId}`), createElement("span", { style: dispatchLogHopStyle }, `hop ${entry.hop}`), createElement("span", { style: dispatchStatusBadgeStyle(entry.status) }, entry.status === "queued"
                ? "⏳ 排队中"
                : entry.status === "sent"
                    ? "✓ 已发送"
                    : entry.status === "failed"
                        ? "✕ 失败"
                        : entry.status === "ignored"
                            ? "— 已忽略"
                            : entry.status === "tripped"
                                ? "🛑 已熔断"
                                : "👁️ 会派发")))), 
    // 就绪任务快捷横幅
    readyTasks.length > 0 &&
        createElement("div", { style: readyBannerStyle }, createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: "11.5px", color: "#059669" } }, createElement("span", { style: { fontSize: "14px" } }, "🎯"), createElement("span", null, "依赖已就绪：当前有 ", createElement("strong", null, `${readyTasks.length}`), " 个任务就绪可执行")), createElement("button", {
            type: "button",
            onClick: handleDispatchNextReady,
            style: readyActionBtnStyle,
            title: readyTasks[0]
                ? `立即派发下一个就绪任务 [${readyTasks[0].id}]: "${readyTasks[0].title}"`
                : "立即执行就绪任务",
        }, readyTasks[0] ? `⚡ 立即执行 ${readyTasks[0].id}` : "⚡ 立即执行")), 
    // 状态过滤分段标签
    createElement("div", { style: filterBarStyle }, [
        { key: "all", label: `全部 (${summary.total})` },
        { key: "todo", label: `待办 (${summary.todo})` },
        { key: "in_progress", label: `进行中 (${summary.inProgress})` },
        { key: "review", label: `审查 (${summary.review})` },
        { key: "done", label: `已完成 (${summary.done})` },
        { key: "blocked", label: `阻塞 (${summary.blocked})` },
        { key: "archived", label: `已归档 (${summary.archived ?? 0})` },
    ].map((tab) => createElement("button", {
        key: tab.key,
        style: filterTabStyle(filter === tab.key),
        onClick: () => setFilter(tab.key),
    }, tab.label))), 
    // 任务列表内容
    createElement("div", { style: taskListStyle }, filteredTasks.length === 0
        ? createElement("div", { style: emptyStyle }, loading
            ? "加载任务中…"
            : filter === "archived"
                ? "暂无已归档任务"
                : searchQuery || selectedTag
                    ? "未找到匹配的搜索或标签任务"
                    : "暂无相关任务，点击右上角【新建任务】开始")
        : filteredTasks.map((task) => createElement(TaskCard, {
            key: task.id,
            task,
            allTasks: tasks,
            workspacePath: workspace.path,
            workspaceId: workspace.id,
            isExpanded: !!expandedTasks[task.id],
            isReady: readyTaskIdSet.has(task.id),
            onToggleExpand: () => toggleExpand(task.id),
            onStatusChange: (status) => updateStatus(task.id, status),
            onDelete: () => deleteTask(task.id),
            onConclusionAdded: refresh,
            onNavigateToTask: handleNavigateToTask,
            onSelectTag: (t) => setSelectedTag(t),
            openFile: handleOpenFileProp,
        }))), 
    // 新建任务弹窗
    showCreateModal &&
        createElement(CreateTaskModal, {
            workspacePath: workspace.path,
            existingTasks: tasks,
            onClose: () => setShowCreateModal(false),
            onCreated: () => {
                setShowCreateModal(false);
                refresh();
            },
        }), 
    // 导出全景总结报告弹窗
    showReportModal &&
        createElement(ExportReportModal, {
            markdown: summaryReportMarkdown,
            onClose: () => setShowReportModal(false),
        }));
}
// ---------------- 任务卡片组件 ----------------
const DEFAULT_STATUS_OPTION = {
    id: "todo",
    label: "待办",
    color: "#64748b",
    bg: "rgba(100, 116, 139, 0.14)",
};
const STATUS_OPTIONS = [
    DEFAULT_STATUS_OPTION,
    { id: "in_progress", label: "进行中", color: "#2563eb", bg: "rgba(37, 99, 235, 0.14)" },
    { id: "review", label: "审查中", color: "#7c3aed", bg: "rgba(124, 58, 237, 0.14)" },
    { id: "done", label: "已完成", color: "#059669", bg: "rgba(5, 150, 105, 0.14)" },
    { id: "blocked", label: "已阻塞", color: "#dc2626", bg: "rgba(220, 38, 38, 0.14)" },
    { id: "archived", label: "已归档", color: "#475569", bg: "rgba(71, 85, 105, 0.14)" },
];
function StatusDropdown({ status, onChange, }) {
    const [open, setOpen] = useState(false);
    const current = STATUS_OPTIONS.find((o) => o.id === status) ?? DEFAULT_STATUS_OPTION;
    useEffect(() => {
        if (!open)
            return;
        const handleOutside = () => setOpen(false);
        window.addEventListener("click", handleOutside);
        return () => window.removeEventListener("click", handleOutside);
    }, [open]);
    return createElement("div", { style: { position: "relative", display: "inline-block" } }, createElement("button", {
        type: "button",
        onClick: (e) => {
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
    }, createElement("span", {
        style: {
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: current.color,
        },
    }), current.label, createElement("span", { style: { fontSize: "8px", opacity: 0.7, marginLeft: 1 } }, "▼")), open &&
        createElement("div", {
            onClick: (e) => e.stopPropagation(),
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
        }, STATUS_OPTIONS.map((opt) => createElement("button", {
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
        }, createElement("span", {
            style: {
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: opt.color,
            },
        }), opt.label))));
}
function TaskCard({ task, allTasks = [], workspacePath, workspaceId, isExpanded, isReady, onToggleExpand, onStatusChange, onDelete, onConclusionAdded, onNavigateToTask, onSelectTag, openFile, }) {
    const [showAddConc, setShowAddConc] = useState(false);
    const [concSummary, setConcSummary] = useState("");
    const [concDeliverables, setConcDeliverables] = useState("");
    const [concInsights, setConcInsights] = useState("");
    const [savingConc, setSavingConc] = useState(false);
    const [assignedStatus, setAssignedStatus] = useState(null);
    const [openingFile, setOpeningFile] = useState(null);
    const [fileStatus, setFileStatus] = useState({});
    const [resolvedTraces, setResolvedTraces] = useState(null);
    const decisions = task.decisionLog ?? [];
    const checkpoints = task.history ?? [];
    const traceRefs = task.traceRefs ?? [];
    // 认领锁展示：活跃锁显示 owner 与剩余租约；过期锁灰显提示（惰性释放语义）
    const claim = task.claim;
    const claimLeaseEnd = claim ? new Date(claim.leaseUntil).getTime() : 0;
    const claimActive = Boolean(claim && !Number.isNaN(claimLeaseEnd) && claimLeaseEnd > Date.now());
    const claimRemainMin = claimActive ? Math.max(1, Math.ceil((claimLeaseEnd - Date.now()) / 60000)) : 0;
    // 待拍板审批（票拟）：blocked 期间卡片渲染为可点批红卡片
    const pendingApproval = (task.approvals ?? []).find((a) => a.status === "pending");
    const [resolvingApproval, setResolvingApproval] = useState(false);
    // 批红（批准）：选中选项 → 自动落一条不可改写的决策并恢复任务
    const handleResolveApproval = async (approvalId, optionId, optionLabel) => {
        if (resolvingApproval)
            return;
        if (!confirm(`批准选项「${optionLabel}」？\n此操作会记录一条不可改写的决策（含选项原话），并恢复任务执行。`))
            return;
        setResolvingApproval(true);
        try {
            await fetch(`${API_BASE}/approval/resolve`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ workspacePath, taskId: task.id, approvalId, optionId, actor: "human" }),
            });
            onConclusionAdded();
        }
        catch (e) {
            console.error(e);
        }
        finally {
            setResolvingApproval(false);
        }
    };
    // 驳回：不落决策，任务保持 blocked 等待 Agent 重新规划
    const handleRejectApproval = async (approvalId) => {
        if (resolvingApproval)
            return;
        if (!confirm("确定驳回这项请求吗？任务将保持阻塞，等待 Agent 重新规划。"))
            return;
        const note = prompt("驳回备注（可选）：") ?? "";
        setResolvingApproval(true);
        try {
            await fetch(`${API_BASE}/approval/reject`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ workspacePath, taskId: task.id, approvalId, note }),
            });
            onConclusionAdded();
        }
        catch (e) {
            console.error(e);
        }
        finally {
            setResolvingApproval(false);
        }
    };
    // 人力强制释放死锁（如持有锁的会话已崩溃/关闭）
    const handleForceRelease = async () => {
        if (!claim)
            return;
        if (!confirm(`确定强制释放 ${task.id} 上 ${claim.owner} 的认领锁吗？`))
            return;
        try {
            await fetch(`${API_BASE}/release`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ workspacePath, taskId: task.id, owner: "human", force: true }),
            });
            onConclusionAdded();
        }
        catch (e) {
            console.error(e);
        }
    };
    // 展开且有跨工作区引用时，按需解析来源标题/结论摘要（悬挂降级由后端完成）
    useEffect(() => {
        if (!isExpanded || traceRefs.length === 0 || resolvedTraces)
            return;
        let alive = true;
        const query = `?taskId=${encodeURIComponent(task.id)}${workspacePath ? `&workspacePath=${encodeURIComponent(workspacePath)}` : ""}`;
        fetch(`${API_BASE}/trace${query}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((res) => {
            if (alive && res.ok && res.data)
                setResolvedTraces(res.data);
        })
            .catch(() => { });
        return () => {
            alive = false;
        };
    }, [isExpanded, traceRefs.length, resolvedTraces, task.id, workspacePath]);
    // 计算前置依赖未完成项
    const unmetDeps = (task.dependsOn ?? []).filter((depId) => {
        const dep = allTasks.find((t) => t.id === depId);
        return !dep || dep.status !== "done";
    });
    const hasUnmetDeps = unmetDeps.length > 0;
    const handleOpenFile = async (relPath) => {
        const cleanRel = relPath.trim();
        if (!cleanRel)
            return;
        setOpeningFile(cleanRel);
        const dshCtx = window.__DSH_TASK_CLIENT_CTX__;
        const absPath = cleanRel.startsWith("/") || /^[A-Za-z]:[/\\]/.test(cleanRel) || cleanRel.startsWith("\\\\")
            ? cleanRel
            : workspacePath
                ? `${workspacePath.replace(/[/\\]+$/, "")}/${cleanRel.replace(/^[/\\]+/, "")}`
                : cleanRel;
        let opened = false;
        // 仅通过 DSH 官方体系打开（在 DSH 右侧栏打开文件预览/编辑 Tab）
        try {
            if (openFile) {
                await openFile(cleanRel, workspacePath);
                opened = true;
            }
            else {
                await openWorkspaceFileViaDsh(dshCtx, cleanRel, {
                    workspacePath,
                });
                opened = true;
            }
        }
        catch (e) {
            console.warn("[dsh-workspace-tasks] DSH openResource failed:", e);
        }
        if (opened) {
            setFileStatus((prev) => ({ ...prev, [cleanRel]: "opened" }));
        }
        else {
            // 若 DSH 打开遇到异常，贴心复制路径到剪贴板兜底
            try {
                await navigator.clipboard.writeText(cleanRel);
            }
            catch { }
            setFileStatus((prev) => ({ ...prev, [cleanRel]: "failed" }));
        }
        setOpeningFile(null);
        setTimeout(() => {
            setFileStatus((prev) => {
                const next = { ...prev };
                delete next[cleanRel];
                return next;
            });
        }, 2800);
    };
    const handleAssignToAgent = async () => {
        if (hasUnmetDeps) {
            const depNames = unmetDeps.join(", ");
            const ok = typeof window !== "undefined" &&
                window.confirm(`【依赖未完成提示】\n任务 [${task.id}] 的前置依赖 [${depNames}] 尚未完成。\n\n是否仍要强制派发给 Agent 执行？`);
            if (!ok)
                return;
        }
        const prompt = [
            `请执行工作区任务 [${task.id}]：${task.title}`,
            workspacePath ? `【工作区根目录】：${workspacePath}` : "",
            task.description ? `\n【需求背景与详细要求】\n${task.description}` : "",
            task.dependsOn && task.dependsOn.length > 0 ? `【前置依赖】：${task.dependsOn.join(", ")}` : "",
            `\n【执行规范与标准流程】`,
            `1. 开始执行时，先调用 workspace_task 工具（action: "update", taskId: "${task.id}", status: "in_progress", assignee: "agent"${workspacePath ? `, workspacePath: "${workspacePath}"` : ""}) 将本任务标记为进行中。`,
            `2. 完成代码实现与验证测试。`,
            `3. 验证通过后，调用 workspace_task 工具的 conclude 操作（action: "conclude", taskId: "${task.id}"${workspacePath ? `, workspacePath: "${workspacePath}"` : ""})，提交总结摘要、产出文件清单和关键经验心得，自动将任务标记为完成。`,
        ]
            .filter(Boolean)
            .join("\n");
        // 统一派发通道（dispatch-agent.ts）：会话解析 + binding.prompt / scoped conversation.send
        const dispatched = await dispatchPromptToAgent(prompt, { workspaceId });
        setAssignedStatus(dispatched ? "dispatched" : "failed");
        setTimeout(() => setAssignedStatus(null), 3000);
    };
    const handleAddConclusion = async () => {
        if (!concSummary.trim())
            return;
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
        }
        catch (e) {
            console.error(e);
        }
        finally {
            setSavingConc(false);
        }
    };
    return createElement("div", { id: `task-card-${task.id}`, style: taskCardStyle(task.status) }, 
    // 卡片顶部条
    createElement("div", { style: cardHeaderStyle }, createElement("div", { style: cardMetaStyle }, createElement("span", { style: taskIdStyle }, task.id), createElement(PriorityBadge, { priority: task.priority }), isReady &&
        task.status !== "done" &&
        task.status !== "archived" &&
        createElement("span", { style: readyBadgeStyle }, "✓ 就绪"), task.assignee && createElement("span", { style: assigneeBadgeStyle }, `@${task.assignee}`)), createElement("div", { style: cardRightActionsStyle }, createElement(StatusDropdown, {
        status: task.status,
        onChange: onStatusChange,
    }), createElement("button", {
        onClick: onDelete,
        style: deleteBtnStyle,
        title: "删除任务",
    }, "×"))), 
    // 依赖关系展示条
    task.dependsOn &&
        task.dependsOn.length > 0 &&
        createElement("div", { style: depsRowStyle }, createElement("span", { style: depsLabelStyle }, hasUnmetDeps ? "🔒 前置依赖:" : "✓ 依赖已就绪:"), task.dependsOn.map((depId) => {
            const dep = allTasks.find((t) => t.id === depId);
            const isDone = dep?.status === "done";
            return createElement("button", {
                type: "button",
                key: depId,
                style: depChipStyle(isDone),
                title: dep
                    ? `[${dep.id}] ${dep.title} (${dep.status}) - 点击定位`
                    : `${depId} (未在列表中找到) - 点击定位`,
                onClick: () => onNavigateToTask?.(depId),
            }, isDone ? `✓ ${depId}` : `⏳ ${depId}`);
        })), 
    // 标题
    createElement("div", { style: cardTitleStyle }, task.title), 
    // 标签分类 (Tags)
    task.tags &&
        task.tags.length > 0 &&
        createElement("div", { style: tagsRowStyle }, task.tags.map((tag) => createElement("button", {
            type: "button",
            key: tag,
            style: tagChipStyle,
            title: `点击按标签 #${tag} 过滤`,
            onClick: (e) => {
                e.stopPropagation();
                onSelectTag?.(tag);
            },
        }, `#${tag}`))), 
    // 待拍板批红卡片（票拟：人点选即批红，自动落决策）
    pendingApproval &&
        createElement("div", { style: approvalCardStyle }, createElement("div", { style: approvalCardTitleStyle }, createElement("span", { style: { fontSize: "13px" } }, "🔔"), createElement("span", null, `待拍板：${pendingApproval.title}`)), pendingApproval.detail &&
            createElement("div", { style: approvalCardDetailStyle }, pendingApproval.detail), createElement("div", { style: approvalOptionsRowStyle }, pendingApproval.options.map((opt) => createElement("button", {
            type: "button",
            key: opt.id,
            disabled: resolvingApproval,
            style: approvalOptionBtnStyle,
            title: `批准「${opt.label}」：记录决策并恢复任务`,
            onClick: (e) => {
                e.stopPropagation();
                handleResolveApproval(pendingApproval.id, opt.id, opt.label);
            },
        }, `✓ ${opt.label}`)), createElement("button", {
            type: "button",
            disabled: resolvingApproval,
            style: approvalRejectBtnStyle,
            title: "驳回：不落决策，任务保持阻塞，等待 Agent 重新规划",
            onClick: (e) => {
                e.stopPropagation();
                handleRejectApproval(pendingApproval.id);
            },
        }, "✕ 驳回")), createElement("div", { style: approvalCardMetaStyle }, `发起于 ${pendingApproval.createdAt.replace("T", " ").slice(0, 19)} · 批红后自动记录不可改写决策并恢复任务执行`)), 
    // 描述 (Markdown 渲染)
    task.description && createElement(MarkdownContent, { content: task.description, style: cardDescStyle }), 
    // 结论指示栏与操作
    createElement("div", { style: cardFooterStyle }, createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, createElement("button", {
        onClick: onToggleExpand,
        style: toggleExpandBtnStyle,
    }, task.conclusions.length > 0
        ? `📝 ${task.conclusions.length} 条结论 ${isExpanded ? "▲" : "▼"}`
        : `📝 暂无结论 ${isExpanded ? "▲" : "▼"}`), decisions.length > 0 &&
        createElement("span", {
            style: decisionChipStyle,
            title: decisions
                .map((d) => `${d.id}: ${d.title}${d.supersededBy ? `（已被 ${d.supersededBy} 取代）` : ""}`)
                .join("\n"),
        }, `⚖️ ${decisions.length} 决策`), traceRefs.length > 0 &&
        createElement("span", {
            style: traceChipStyle,
            title: traceRefs.map((r) => `${r.taskId} @ ${r.workspacePath}`).join("\n"),
        }, `🔗 ${traceRefs.length} 引用`), claim &&
        createElement("span", {
            style: claimChipStyle(claimActive),
            title: claimActive
                ? `认领者: ${claim.owner}\n认领时间: ${claim.claimedAt}\n租约到期: ${claim.leaseUntil}${claim.sessionHint ? `\n会话线索: ${claim.sessionHint}（可悬挂）` : ""}`
                : `认领锁已过期（读取时惰性释放）\n原认领者: ${claim.owner}\n租约到期: ${claim.leaseUntil}`,
        }, claimActive ? `🔒 ${claim.owner} · 剩 ${claimRemainMin} 分钟` : `🔓 锁已过期`), claim &&
        createElement("button", {
            type: "button",
            style: claimReleaseBtnStyle,
            title: "人力强制释放认领锁（如持锁会话已崩溃）",
            onClick: (e) => {
                e.stopPropagation();
                handleForceRelease();
            },
        }, "✕"), task.status !== "done" &&
        task.status !== "archived" &&
        createElement("button", {
            type: "button",
            onClick: handleAssignToAgent,
            style: assignBtnStyle(assignedStatus),
            title: hasUnmetDeps
                ? `前置依赖 [${unmetDeps.join(", ")}] 尚未完成，点击可确认强制派发`
                : "一键将任务派发给 Agent 执行",
        }, assignedStatus === "dispatched"
            ? "✓ 已发送给 Agent"
            : assignedStatus === "failed"
                ? "✕ 发送失败"
                : hasUnmetDeps
                    ? "⚠️ 强制交给 Agent"
                    : "🤖 交给 Agent"), task.status === "done" &&
        createElement("button", {
            type: "button",
            onClick: () => onStatusChange("archived"),
            style: archiveBtnStyle,
            title: "归档此任务，移出活跃任务列表，可在【已归档】中查看",
        }, "📦 归档"), task.status === "archived" &&
        createElement("button", {
            type: "button",
            onClick: () => onStatusChange("done"),
            style: archiveBtnStyle,
            title: "恢复任务到已完成状态",
        }, "↩ 恢复")), createElement("span", { style: timeStyle }, new Date(task.updatedAt).toLocaleDateString())), 
    // 展开后的结论列表与添加框
    isExpanded &&
        createElement("div", { style: conclusionDrawerStyle }, task.conclusions.map((conc, idx) => createElement("div", { key: conc.id || idx, style: conclusionItemStyle }, createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 } }, createElement("span", { style: concTimeStyle }, `完成于 ${new Date(conc.completedAt).toLocaleString()}`)), createElement(MarkdownContent, { content: conc.summary, style: concSummaryStyle }), conc.deliverables &&
            conc.deliverables.length > 0 &&
            createElement("div", { style: concBlockStyle }, createElement("span", { style: concLabelStyle }, "产出交付物 (点击通过 DSH 打开):"), createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 } }, conc.deliverables.map((d, di) => {
                const isOpening = openingFile === d;
                const status = fileStatus[d];
                return createElement("button", {
                    type: "button",
                    key: di,
                    style: deliverableLiStyle(status),
                    title: status === "opened"
                        ? `✓ 已在 DSH 侧边栏打开: ${d}`
                        : status === "failed"
                            ? `⚠️ DSH 打开未完成，已复制路径: ${d}`
                            : status === "copied"
                                ? `📋 已复制文件路径到剪贴板: ${d}`
                                : `点击在 DSH 中预览/打开: ${d}`,
                    onClick: () => handleOpenFile(d),
                }, createElement("span", { style: { marginRight: 4 } }, isOpening ? "⏳" : status === "opened" ? "✓" : status === "failed" ? "⚠️" : status === "copied" ? "📋" : "📄"), createElement("span", { style: deliverablePathStyle }, d), createElement("span", { style: deliverableActionStyle(status) }, isOpening
                    ? "打开中…"
                    : status === "opened"
                        ? "已打开"
                        : status === "failed"
                            ? "打开失败(已复制)"
                            : status === "copied"
                                ? "已复制路径"
                                : "↗ 打开"));
            }))), conc.insights &&
            conc.insights.length > 0 &&
            createElement("div", { style: concBlockStyle }, createElement("span", { style: concLabelStyle }, "经验心得:"), createElement("ul", { style: concListStyle }, conc.insights.map((ins, ii) => createElement("li", { key: ii, style: insightLiStyle }, createElement(MarkdownContent, { content: ins }))))))), 
        // 添加结论区块
        showAddConc
            ? createElement("div", { style: addConcFormStyle }, createElement("textarea", {
                placeholder: "执行结论总结（核心产出与解决要点）...",
                value: concSummary,
                onChange: (e) => setConcSummary(e.target.value),
                style: textAreaStyle,
                rows: 2,
            }), createElement("textarea", {
                placeholder: "交付物文件路径（每行一个文件路径，选填）",
                value: concDeliverables,
                onChange: (e) => setConcDeliverables(e.target.value),
                style: textAreaStyle,
                rows: 2,
            }), createElement("textarea", {
                placeholder: "关键经验/踩坑心得（每行一条，选填）",
                value: concInsights,
                onChange: (e) => setConcInsights(e.target.value),
                style: textAreaStyle,
                rows: 2,
            }), createElement("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 } }, createElement("button", {
                onClick: () => setShowAddConc(false),
                style: cancelBtnStyle,
            }, "取消"), createElement("button", {
                onClick: handleAddConclusion,
                disabled: savingConc || !concSummary.trim(),
                style: primaryBtnStyle,
            }, savingConc ? "保存中…" : "提交并标记完成")))
            : createElement("button", {
                onClick: () => setShowAddConc(true),
                style: appendConcBtnStyle,
            }, "+ 追加执行结论"), createElement(TraceSections, {
            decisions,
            checkpoints,
            traceRefs,
            resolvedTraces,
            approvals: task.approvals,
        })));
}
// ---------------- 新建弹窗组件 ----------------
const PRIORITIES = [
    { id: "P0", label: "P0 紧急", desc: "高危/阻断", color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" },
    { id: "P1", label: "P1 高优", desc: "标准推进", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)" },
    { id: "P2", label: "P2 普通", desc: "常规事务", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)" },
];
function ExportReportModal({ markdown, onClose, }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(markdown);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch (e) {
            console.error(e);
        }
    };
    return createElement("div", { style: modalOverlayStyle, onClick: onClose }, createElement("div", {
        style: {
            ...modalContentStyle,
            width: "min(680px, 94vw)",
            maxHeight: "88vh",
            display: "flex",
            flexDirection: "column",
        },
        onClick: (e) => e.stopPropagation(),
    }, createElement("div", { style: modalHeaderStyle }, createElement("span", {
        style: {
            fontWeight: "600",
            fontSize: "15px",
            color: "var(--dsw-alias-label-primary, #0f172a)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
        },
    }, "📋 工作区交付与工程总结报告"), createElement("button", { onClick: onClose, style: closeBtnStyle }, "×")), createElement("div", {
        style: {
            flex: 1,
            overflowY: "auto",
            padding: "12px",
            backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.02))",
            borderRadius: "8px",
            border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
            marginBottom: "16px",
        },
    }, createElement(MarkdownContent, { content: markdown })), createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: "10px" } }, createElement("button", {
        onClick: handleCopy,
        style: {
            ...primaryBtnStyle,
            backgroundColor: copied ? "#059669" : "#2563eb",
            color: "#ffffff",
            border: "none",
        },
    }, copied ? "✓ 已复制 Markdown" : "📄 复制 Markdown 报告"), createElement("button", { onClick: onClose, style: cancelBtnStyle }, "关闭"))));
}
function CreateTaskModal({ workspacePath, existingTasks = [], onClose, onCreated, }) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState("P1");
    const [tagsInput, setTagsInput] = useState("");
    const [selectedDeps, setSelectedDeps] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    // 过滤出可作为依赖的前置任务（非归档）
    const candidateTasks = existingTasks.filter((t) => t.status !== "archived");
    const toggleDep = (taskId) => {
        setSelectedDeps((prev) => prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]);
    };
    const handleSubmit = async () => {
        if (!title.trim() || submitting)
            return;
        setSubmitting(true);
        try {
            const parsedTags = tagsInput
                .split(/[,，\s]+/)
                .map((t) => t.trim())
                .filter(Boolean);
            await fetch(`${API_BASE}/create`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    workspacePath,
                    title,
                    description,
                    priority,
                    tags: parsedTags,
                    dependsOn: selectedDeps,
                }),
            });
            onCreated();
        }
        catch (e) {
            console.error(e);
        }
        finally {
            setSubmitting(false);
        }
    };
    return createElement("div", { style: modalOverlayStyle, onClick: onClose }, createElement("div", { style: modalContentStyle, onClick: (e) => e.stopPropagation() }, createElement("div", { style: modalHeaderStyle }, createElement("span", { style: { fontWeight: "600", fontSize: "16px", color: "var(--dsw-alias-label-primary, #0f172a)" } }, "新建工作区任务"), createElement("button", { onClick: onClose, style: closeBtnStyle }, "×")), createElement("div", { style: { marginBottom: 14 } }, createElement("label", { style: fieldLabelStyle }, "任务标题 *"), createElement("input", {
        type: "text",
        placeholder: "例如：编写用户登录 API 与单元测试",
        value: title,
        onChange: (e) => setTitle(e.target.value),
        style: inputStyle,
        autoFocus: true,
    })), createElement("div", { style: { marginBottom: 14 } }, createElement("label", { style: fieldLabelStyle }, "优先级"), createElement("div", { style: { display: "flex", gap: "8px" } }, PRIORITIES.map((p) => {
        const isSelected = priority === p.id;
        return createElement("button", {
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
        }, createElement("span", { style: { fontSize: "13px" } }, p.label), createElement("span", { style: { fontSize: "11px", opacity: 0.8 } }, p.desc));
    }))), createElement("div", { style: { marginBottom: 14 } }, createElement("label", { style: fieldLabelStyle }, "标签分类 (以逗号或空格分隔，选填)"), createElement("input", {
        type: "text",
        placeholder: "例如：frontend, api, bugfix",
        value: tagsInput,
        onChange: (e) => setTagsInput(e.target.value),
        style: inputStyle,
    })), candidateTasks.length > 0 &&
        createElement("div", { style: { marginBottom: 14 } }, createElement("label", { style: fieldLabelStyle }, "前置依赖任务 (可选点击勾选)"), createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, maxHeight: "88px", overflowY: "auto", padding: "4px 0" } }, candidateTasks.map((ct) => {
            const isChecked = selectedDeps.includes(ct.id);
            return createElement("button", {
                type: "button",
                key: ct.id,
                onClick: () => toggleDep(ct.id),
                style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px",
                    borderRadius: "6px",
                    fontSize: "11.5px",
                    cursor: "pointer",
                    border: isChecked ? "1px solid #2563eb" : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
                    background: isChecked ? "rgba(37, 99, 235, 0.1)" : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
                    color: isChecked ? "#2563eb" : "var(--dsw-alias-label-secondary, #475569)",
                    transition: "all 0.15s ease",
                },
                title: `${ct.id}: ${ct.title} (${ct.status})`,
            }, isChecked ? `✓ ${ct.id}` : `+ ${ct.id}`, createElement("span", { style: { opacity: 0.75, maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, ct.title));
        }))), createElement("div", { style: { marginBottom: 18 } }, createElement("label", { style: fieldLabelStyle }, "需求背景与详细描述 (Markdown 选填)"), createElement("textarea", {
        placeholder: "详细说明任务验收条件、涉及模块或提示 Agent 需要注意的事项...",
        value: description,
        onChange: (e) => setDescription(e.target.value),
        style: textAreaStyle,
        rows: 4,
    })), createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 10 } }, createElement("button", { onClick: onClose, style: cancelBtnStyle }, "取消"), createElement("button", {
        onClick: handleSubmit,
        disabled: submitting || !title.trim(),
        style: primaryBtnStyle,
    }, submitting ? "创建中…" : "创建任务"))));
}
function PriorityBadge({ priority }) {
    const colorMap = {
        P0: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444" },
        P1: { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b" },
        P2: { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6" },
    };
    const c = colorMap[priority] || colorMap.P1;
    return createElement("span", {
        style: {
            fontSize: "11px",
            fontWeight: "600",
            padding: "1px 6px",
            borderRadius: "4px",
            backgroundColor: c.bg,
            color: c.text,
        },
    }, priority);
}
// ---------------- 样式定义 (自适应深浅主题规范) ----------------
const containerStyle = {
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
const titleWrapperStyle = {
    display: "inline-flex",
    alignItems: "center",
    fontWeight: "500",
};
const inProgressBadgeStyle = {
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
const headerStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
};
const headerLeftStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 2,
};
const headerTitleStyle = {
    fontSize: "15px",
    fontWeight: "600",
    color: "var(--dsw-alias-label-primary, #0f172a)",
};
const countSubStyle = {
    fontSize: "12px",
    color: "var(--dsw-alias-label-secondary, #64748b)",
};
const headerActionsStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
};
const filterBarStyle = {
    display: "flex",
    gap: 4,
    padding: "8px 16px",
    overflowX: "auto",
    borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
};
const filterTabStyle = (active) => ({
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
const taskListStyle = {
    flex: 1,
    overflowY: "auto",
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
};
const taskCardStyle = (status) => ({
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
const cardHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
};
const cardMetaStyle = {
    display: "flex",
    alignItems: "center",
    gap: 6,
};
const taskIdStyle = {
    fontFamily: "monospace",
    fontSize: "11px",
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};
const assigneeBadgeStyle = {
    fontSize: "11px",
    color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb)",
};
const cardRightActionsStyle = {
    display: "flex",
    alignItems: "center",
    gap: 6,
};
const deleteBtnStyle = {
    background: "transparent",
    border: "none",
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    cursor: "pointer",
    fontSize: "16px",
    lineHeight: "1",
    padding: "2px 6px",
    borderRadius: "4px",
};
const cardTitleStyle = {
    fontSize: "13px",
    fontWeight: "600",
    lineHeight: "1.4",
    color: "var(--dsw-alias-label-primary, #0f172a)",
};
const cardDescStyle = {
    fontSize: "12px",
    color: "var(--dsw-alias-label-secondary, #475569)",
    lineHeight: "1.5",
    margin: "4px 0 6px 0",
};
const cardFooterStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
};
const toggleExpandBtnStyle = {
    background: "transparent",
    border: "none",
    color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb)",
    fontSize: "11px",
    cursor: "pointer",
    padding: "0",
    fontWeight: "500",
};
const assignBtnStyle = (status) => ({
    background: status === "dispatched"
        ? "rgba(37, 99, 235, 0.12)"
        : status === "failed"
            ? "rgba(239, 68, 68, 0.12)"
            : "transparent",
    border: status === "dispatched"
        ? "1px solid #2563eb"
        : status === "failed"
            ? "1px solid #ef4444"
            : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
    color: status === "dispatched"
        ? "#2563eb"
        : status === "failed"
            ? "#ef4444"
            : "var(--dsw-alias-label-secondary, #475569)",
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
const depsRowStyle = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "4px",
    margin: "4px 0 6px 0",
};
const depsLabelStyle = {
    fontSize: "11px",
    fontWeight: "500",
    color: "var(--dsw-alias-label-secondary, #64748b)",
    marginRight: "2px",
};
const depChipStyle = (isDone) => ({
    background: isDone ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.12)",
    border: isDone ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(245, 158, 11, 0.35)",
    color: isDone ? "#059669" : "#d97706",
    borderRadius: "8px",
    padding: "1px 6px",
    fontSize: "10.5px",
    fontWeight: "500",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    transition: "all 0.15s ease",
});
const deliverableLiStyle = (status) => ({
    fontFamily: "var(--dsw-alias-font-mono, monospace)",
    fontSize: "11px",
    color: status === "opened"
        ? "#059669"
        : status === "failed" || status === "missing"
            ? "#d97706"
            : status === "copied"
                ? "#2563eb"
                : "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #0284c7)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 8px",
    borderRadius: "5px",
    backgroundColor: status === "opened"
        ? "rgba(16, 185, 129, 0.12)"
        : status === "failed" || status === "missing"
            ? "rgba(245, 158, 11, 0.12)"
            : status === "copied"
                ? "rgba(37, 99, 235, 0.12)"
                : "var(--dsw-alias-surface-elevation-1, rgba(0, 0, 0, 0.04))",
    border: status === "opened"
        ? "1px solid rgba(16, 185, 129, 0.4)"
        : status === "failed" || status === "missing"
            ? "1px solid rgba(245, 158, 11, 0.4)"
            : status === "copied"
                ? "1px solid rgba(37, 99, 235, 0.4)"
                : "1px solid var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.08))",
    marginBottom: "4px",
    marginRight: "4px",
    transition: "all 0.18s ease",
});
const deliverablePathStyle = {
    wordBreak: "break-all",
};
const deliverableActionStyle = (status) => ({
    fontSize: "10px",
    marginLeft: "6px",
    opacity: 0.85,
    fontWeight: status ? "600" : "400",
    color: status === "opened"
        ? "#059669"
        : status === "failed" || status === "missing"
            ? "#d97706"
            : status === "copied"
                ? "#2563eb"
                : "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb)",
});
const archiveBtnStyle = {
    background: "transparent",
    border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
    color: "var(--dsw-alias-label-secondary, #475569)",
    borderRadius: "12px",
    padding: "2px 8px",
    fontSize: "11px",
    fontWeight: "500",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
    transition: "all 0.15s ease",
};
const timeStyle = {
    fontSize: "11px",
    color: "var(--dsw-alias-label-caption, #94a3b8)",
};
const conclusionDrawerStyle = {
    borderTop: "1px dashed var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1))",
    paddingTop: 8,
    marginTop: 4,
    display: "flex",
    flexDirection: "column",
    gap: 8,
};
const conclusionItemStyle = {
    backgroundColor: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.03))",
    border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
    borderRadius: "6px",
    padding: "8px 10px",
    fontSize: "12px",
};
const concTimeStyle = {
    fontSize: "10px",
    color: "var(--dsw-alias-label-caption, #94a3b8)",
    marginBottom: 4,
};
const concSummaryStyle = {
    fontWeight: "500",
    marginBottom: 6,
    color: "var(--dsw-alias-label-primary, #1e293b)",
};
const concBlockStyle = {
    marginTop: 4,
};
const concLabelStyle = {
    fontSize: "11px",
    color: "var(--dsw-alias-label-secondary, #64748b)",
    display: "block",
};
const concListStyle = {
    margin: "2px 0 0 16px",
    padding: 0,
};
const codeLiStyle = {
    fontFamily: "monospace",
    fontSize: "11px",
    color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #0284c7)",
};
const insightLiStyle = {
    fontSize: "11px",
    color: "#d97706",
};
const addConcFormStyle = {
    backgroundColor: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.02))",
    border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
    padding: 8,
    borderRadius: "6px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
};
const appendConcBtnStyle = {
    background: "transparent",
    border: "1px dashed var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
    color: "var(--dsw-alias-label-secondary, #64748b)",
    borderRadius: "6px",
    padding: "6px",
    fontSize: "11px",
    cursor: "pointer",
};
const primaryBtnStyle = {
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
const iconBtnStyle = {
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
const cancelBtnStyle = {
    background: "transparent",
    border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
    color: "var(--dsw-alias-label-secondary, #475569)",
    borderRadius: "6px",
    padding: "6px 14px",
    fontSize: "12px",
    cursor: "pointer",
};
const emptyStyle = {
    padding: "30px 10px",
    textAlign: "center",
    color: "var(--dsw-alias-label-secondary, #64748b)",
    border: "1px dashed var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1))",
    borderRadius: "8px",
};
const modalOverlayStyle = {
    position: "fixed",
    inset: 0,
    backgroundColor: "var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.35))",
    backdropFilter: "var(--dsw-mask-blur, blur(2px))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
};
const modalContentStyle = {
    width: "min(480px, 92vw)",
    backgroundColor: "var(--dsw-alias-bg-layer-2, #ffffff)",
    color: "var(--dsw-alias-label-primary, #0f172a)",
    border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
    borderRadius: "16px",
    padding: "20px 24px",
    boxShadow: "var(--dsw-shadow-lv3, 0 16px 36px rgba(0, 0, 0, 0.16))",
};
const modalHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
};
const closeBtnStyle = {
    background: "transparent",
    border: "none",
    fontSize: "20px",
    lineHeight: "1",
    cursor: "pointer",
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    padding: "2px 6px",
    borderRadius: "4px",
};
const fieldLabelStyle = {
    display: "block",
    fontSize: "12px",
    fontWeight: "500",
    marginBottom: 6,
    color: "var(--dsw-alias-label-secondary, #475569)",
};
const inputStyle = {
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
const textAreaStyle = {
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
const workspaceChipStyle = (isManual) => ({
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
const manualTagStyle = {
    fontSize: "9px",
    padding: "1px 4px",
    borderRadius: "4px",
    backgroundColor: "var(--dsw-alias-color-primary, #2563eb)",
    color: "#ffffff",
    marginLeft: "2px",
};
const workspaceMenuStyle = {
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
const menuHeaderStyle = {
    fontSize: "11px",
    fontWeight: "600",
    padding: "4px 8px",
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
    marginBottom: "2px",
};
const menuItemStyle = (active) => ({
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
const readyBadgeStyle = {
    background: "rgba(16, 185, 129, 0.12)",
    color: "#059669",
    border: "1px solid rgba(16, 185, 129, 0.3)",
    borderRadius: "10px",
    padding: "1px 6px",
    fontSize: "10px",
    fontWeight: "600",
};
const tagsRowStyle = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "4px",
    margin: "2px 0 4px 0",
};
const tagChipStyle = {
    fontSize: "10px",
    fontWeight: "500",
    padding: "1px 6px",
    borderRadius: "6px",
    backgroundColor: "rgba(37, 99, 235, 0.08)",
    color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb)",
    border: "1px solid rgba(37, 99, 235, 0.2)",
    display: "inline-flex",
    alignItems: "center",
    cursor: "pointer",
};
const searchContainerStyle = {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "10px 16px 8px 16px",
    position: "relative",
};
const searchInputStyle = {
    flex: 1,
    padding: "5px 10px",
    borderRadius: "6px",
    border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
    backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
    fontSize: "11.5px",
    color: "var(--dsw-alias-label-primary, #0f172a)",
    outline: "none",
};
const clearSearchBtnStyle = {
    position: "absolute",
    right: "24px",
    top: "calc(50% + 1px)",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    cursor: "pointer",
    fontSize: "14px",
    lineHeight: "1",
    padding: 0,
};
const tagFilterBarStyle = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "4px",
    padding: "0 16px 8px 16px",
};
const tagFilterChipStyle = (active) => ({
    border: active ? "1px solid #2563eb" : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
    backgroundColor: active ? "rgba(37, 99, 235, 0.12)" : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
    color: active ? "#2563eb" : "var(--dsw-alias-label-secondary, #64748b)",
    borderRadius: "10px",
    padding: "2px 8px",
    fontSize: "10.5px",
    fontWeight: active ? "600" : "400",
    cursor: "pointer",
    transition: "all 0.15s ease",
});
const tagExpandToggleStyle = {
    background: "transparent",
    border: "none",
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    fontSize: "10.5px",
    fontWeight: "500",
    padding: "2px 6px",
    borderRadius: "10px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    whiteSpace: "nowrap",
    transition: "all 0.15s ease",
};
const readyBannerStyle = {
    margin: "0 16px 8px 16px",
    padding: "8px 12px",
    borderRadius: "8px",
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    border: "1px solid rgba(16, 185, 129, 0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
};
// 认领锁 Chip：活跃=琥珀警示色，过期=灰色降级
const claimChipStyle = (active) => ({
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 10,
    backgroundColor: active ? "rgba(245, 158, 11, 0.14)" : "rgba(148, 163, 184, 0.12)",
    color: active ? "#d97706" : "var(--dsw-alias-label-secondary, #64748b)",
    whiteSpace: "nowrap",
    cursor: "default",
});
const claimReleaseBtnStyle = {
    fontSize: 10,
    lineHeight: "16px",
    width: 18,
    height: 18,
    padding: 0,
    borderRadius: "50%",
    border: "1px solid rgba(245, 158, 11, 0.35)",
    backgroundColor: "transparent",
    color: "#d97706",
    cursor: "pointer",
    flexShrink: 0,
};
// ===== 待拍板（票拟→批红） =====
const approvalBannerStyle = {
    margin: "0 16px 8px 16px",
    padding: "8px 12px",
    borderRadius: "8px",
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    border: "1px solid rgba(245, 158, 11, 0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
};
const approvalActionBtnStyle = {
    fontSize: "11.5px",
    padding: "4px 12px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "#d97706",
    color: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
};
const approvalCardStyle = {
    marginTop: 8,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid rgba(245, 158, 11, 0.4)",
    borderLeft: "3px solid #d97706",
    backgroundColor: "rgba(245, 158, 11, 0.06)",
};
const approvalCardTitleStyle = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: "12.5px",
    fontWeight: 600,
    color: "var(--dsw-alias-label-primary, #1f2328)",
};
const approvalCardDetailStyle = {
    marginTop: 6,
    fontSize: "11.5px",
    lineHeight: 1.6,
    color: "var(--dsw-alias-label-secondary, #64748b)",
    whiteSpace: "pre-wrap",
};
const approvalOptionsRowStyle = {
    marginTop: 8,
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
};
const approvalOptionBtnStyle = {
    fontSize: "11.5px",
    padding: "5px 12px",
    borderRadius: 6,
    border: "1px solid rgba(217, 119, 6, 0.5)",
    backgroundColor: "var(--dsw-alias-bg-layer-1, #fff)",
    color: "#d97706",
    cursor: "pointer",
    fontWeight: 500,
};
const approvalRejectBtnStyle = {
    fontSize: "11.5px",
    padding: "5px 12px",
    borderRadius: 6,
    border: "1px solid rgba(148, 163, 184, 0.4)",
    backgroundColor: "transparent",
    color: "var(--dsw-alias-label-secondary, #64748b)",
    cursor: "pointer",
};
const approvalCardMetaStyle = {
    marginTop: 8,
    fontSize: 10.5,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};
// ===== 自动派发（Fast Path） =====
const trippedBannerStyle = {
    margin: "0 16px 8px 16px",
    padding: "8px 12px",
    borderRadius: "8px",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.35)",
};
const staleBannerStyle = {
    margin: "0 16px 8px 16px",
    padding: "8px 12px",
    borderRadius: "8px",
    backgroundColor: "rgba(245, 158, 11, 0.06)",
    border: "1px solid rgba(245, 158, 11, 0.3)",
};
// 「更多」下拉菜单（右对齐，复用工作区菜单的视觉语言）
const moreMenuStyle = {
    position: "absolute",
    top: "calc(100% + 4px)",
    right: 0,
    backgroundColor: "var(--dsw-alias-bg-layer-2, #ffffff)",
    border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
    borderRadius: "8px",
    boxShadow: "var(--dsw-shadow-lv3, 0 8px 20px rgba(0, 0, 0, 0.15))",
    padding: "4px",
    zIndex: 100,
    minWidth: "200px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
};
const menuDividerStyle = {
    height: 1,
    backgroundColor: "var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
    margin: "3px 4px",
};
const observeBannerStyle = {
    margin: "0 16px 8px 16px",
    padding: "8px 12px",
    borderRadius: "8px",
    backgroundColor: "rgba(124, 58, 237, 0.06)",
    border: "1px solid rgba(124, 58, 237, 0.25)",
};
const observeEntryRowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "4px 8px",
    borderRadius: 6,
    backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.5))",
    border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.06))",
};
const observeRunBtnStyle = {
    fontSize: 11,
    padding: "2px 10px",
    borderRadius: 5,
    border: "none",
    backgroundColor: "#7c3aed",
    color: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
};
const observeIgnoreBtnStyle = {
    fontSize: 11,
    padding: "2px 10px",
    borderRadius: 5,
    border: "1px solid rgba(148, 163, 184, 0.4)",
    backgroundColor: "transparent",
    color: "var(--dsw-alias-label-secondary, #64748b)",
    cursor: "pointer",
    whiteSpace: "nowrap",
};
const dispatchLogPanelStyle = {
    margin: "0 16px 8px 16px",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
    backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.02))",
};
const dispatchLogTitleStyle = {
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--dsw-alias-label-secondary, #64748b)",
    marginBottom: 6,
};
const dispatchLogEmptyStyle = {
    fontSize: 11.5,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};
const dispatchLogRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "3px 0",
    fontSize: 11,
    flexWrap: "wrap",
};
const dispatchLogTimeStyle = {
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    fontSize: 10.5,
    flexShrink: 0,
};
const dispatchLogTaskStyle = {
    color: "var(--dsw-alias-label-primary, #1f2328)",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "40%",
};
const dispatchLogTriggerStyle = {
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    fontSize: 10.5,
    fontFamily: "monospace",
};
const dispatchLogHopStyle = {
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    fontSize: 10.5,
    fontFamily: "monospace",
};
const dispatchStatusBadgeStyle = (status) => ({
    fontSize: 10,
    padding: "1px 8px",
    borderRadius: 9,
    marginLeft: "auto",
    flexShrink: 0,
    backgroundColor: status === "sent"
        ? "rgba(5, 150, 105, 0.12)"
        : status === "failed"
            ? "rgba(239, 68, 68, 0.12)"
            : status === "tripped"
                ? "rgba(220, 38, 38, 0.16)"
                : status === "queued"
                    ? "rgba(245, 158, 11, 0.14)"
                    : status === "would-dispatch"
                        ? "rgba(124, 58, 237, 0.12)"
                        : "rgba(148, 163, 184, 0.12)",
    color: status === "sent"
        ? "#059669"
        : status === "failed"
            ? "#ef4444"
            : status === "tripped"
                ? "#dc2626"
                : status === "queued"
                    ? "#d97706"
                    : status === "would-dispatch"
                        ? "#7c3aed"
                        : "#64748b",
});
const readyActionBtnStyle = {
    backgroundColor: "#059669",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 1px 2px rgba(5, 150, 105, 0.3)",
};
//# sourceMappingURL=TaskPanel.js.map