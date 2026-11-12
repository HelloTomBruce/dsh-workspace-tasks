import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { buildDispatchPrompt, dispatchPromptToAgent } from "../dispatch-agent.js";
import { API_BASE } from "./utils.js";
import { EmptyState } from "./primitives.js";
import { TaskDetailModal } from "./TaskDetailModal.js";
import { WorkspaceCard } from "./WorkspaceCard.js";
import { FeedSection } from "./FeedSection.js";
import { approvalBannerBtnStyle, approvalBannerMoreStyle, approvalBannerStyle, approvalBannerTitleStyle, generatedAtStyle, gridStyle, headerStyle, headerTopRowStyle, rootStyle, searchInputStyle, titleStyle, toastItemStyle, toastWrapStyle, totalChipBtnStyle, totalsRowStyle, } from "./styles.js";
/**
 * 任务中台（跨工作区全局看板）：主区域全宽面板。
 * 只回答一个问题——「现在哪里需要我」：待拍板 / 阻塞 / 待验收 / 进行中 / 就绪 / 待归档。
 * 点击任务行打开详情弹窗（自足的，不跨界面跳）；待拍板的任务在弹窗里直接批红。
 * 点进左侧菜单入口才挂载，轮询随卸载停止。
 */
function useGlobalOverview() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tick, setTick] = useState(0);
    useEffect(() => {
        let alive = true;
        const load = () => {
            fetch(`${API_BASE}/global`, { cache: "no-store" })
                .then((r) => r.json())
                .then((res) => {
                if (alive && res.ok && res.data)
                    setData(res.data);
            })
                .catch(() => { })
                .finally(() => {
                if (alive)
                    setLoading(false);
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
export function GlobalBoardPanel() {
    const { data, loading, refresh } = useGlobalOverview();
    const [selected, setSelected] = useState(null);
    const [toasts, setToasts] = useState([]);
    /** 轻量 toast：右上角浮现 ~2.4s 自动消失，替代静默 catch */
    const toast = (text, kind = "ok") => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, text, kind }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2400);
    };
    /** 统一 POST：返回是否成功（HTTP 2xx 且业务 ok 非 false） */
    const post = async (path, body) => {
        try {
            const res = await fetch(`${API_BASE}${path}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => null));
            return res.ok && json?.ok !== false;
        }
        catch {
            return false;
        }
    };
    /** 就绪任务一键派发：统一派发通道注入提示词 → 置 in_progress 触发认领锁 */
    const handleDispatch = async (ws, task) => {
        const prompt = buildDispatchPrompt(task, { workspacePath: ws.workspacePath });
        const sent = await dispatchPromptToAgent(prompt, { workspacePath: ws.workspacePath });
        if (!sent) {
            // 降级：复制提示词到剪贴板，人工粘贴发送
            try {
                await navigator.clipboard.writeText(prompt);
                toast(`未找到可用会话，${task.id} 派发提示词已复制到剪贴板`, "err");
            }
            catch {
                toast(`派发失败：未找到可用会话`, "err");
            }
            return;
        }
        const ok = await post("/update", { workspacePath: ws.workspacePath, taskId: task.id, status: "in_progress" });
        toast(ok ? `⚡ 已派发 ${task.id} 给 Agent` : `提示词已发送，但 ${task.id} 状态更新失败`, ok ? "ok" : "err");
        refresh();
    };
    const handleReview = async (ws, task, pass) => {
        const ok = await post("/update", {
            workspacePath: ws.workspacePath,
            taskId: task.id,
            status: pass ? "done" : "in_progress",
        });
        toast(ok ? (pass ? `✓ ${task.id} 验收通过` : `↩ ${task.id} 已打回重做`) : `${task.id} 操作失败`, ok ? "ok" : "err");
        if (ok)
            refresh();
    };
    const handleArchive = async (ws, task) => {
        const ok = await post("/update", { workspacePath: ws.workspacePath, taskId: task.id, status: "archived" });
        toast(ok ? `📦 ${task.id} 已归档` : `${task.id} 归档失败`, ok ? "ok" : "err");
        if (ok)
            refresh();
    };
    const handleArchiveAll = async (ws) => {
        let okCount = 0;
        for (const t of ws.done) {
            if (await post("/update", { workspacePath: ws.workspacePath, taskId: t.id, status: "archived" }))
                okCount++;
        }
        toast(`📦 ${ws.title}：已归档 ${okCount}/${ws.done.length} 项`, okCount === ws.done.length ? "ok" : "err");
        refresh();
    };
    /** 人力强制释放死锁（确认交互已前置到 ConfirmRowAction 二次点击） */
    const handleRelease = async (ws, task) => {
        if (!task.claim)
            return;
        const ok = await post("/release", {
            workspacePath: ws.workspacePath,
            taskId: task.id,
            owner: "human",
            force: true,
        });
        toast(ok ? `🔓 ${task.id} 认领锁已释放` : `${task.id} 释放失败`, ok ? "ok" : "err");
        if (ok)
            refresh();
    };
    /** 派发记录「执行」：拉任务详情构造提示词 → 统一通道派发 → 置 in_progress → ack 回执 */
    const handleExecuteDispatch = async (item) => {
        const { workspacePath, record } = item;
        try {
            const listRes = await fetch(`${API_BASE}/list?workspacePath=${encodeURIComponent(workspacePath)}`, {
                cache: "no-store",
            });
            const listJson = (await listRes.json());
            const task = listJson?.data?.tasks?.find((t) => t.id === record.taskId);
            if (!task) {
                toast(`找不到任务 ${record.taskId}，无法派发`, "err");
                return;
            }
            const prompt = buildDispatchPrompt(task, { workspacePath });
            const sent = await dispatchPromptToAgent(prompt, { workspacePath });
            if (sent) {
                await post("/update", { workspacePath, taskId: task.id, status: "in_progress" });
            }
            await post("/dispatch/ack", { workspacePath, id: record.id, status: sent ? "sent" : "failed" });
            toast(sent ? `⚡ 已派发 ${record.taskId} 给 Agent` : `派发通道不可用，已标记 failed`, sent ? "ok" : "err");
            refresh();
        }
        catch {
            toast("派发执行失败", "err");
        }
    };
    /** 派发记录「忽略」：标记 ignored，不执行任务 */
    const handleIgnoreDispatch = async (item) => {
        const ok = await post("/dispatch/ignore", { workspacePath: item.workspacePath, id: item.record.id });
        toast(ok ? `已忽略 ${item.record.taskId} 的派发` : "忽略失败", ok ? "ok" : "err");
        if (ok)
            refresh();
    };
    const cardHandlers = {
        onDispatch: (ws, t) => void handleDispatch(ws, t),
        onReview: (ws, t, pass) => void handleReview(ws, t, pass),
        onArchive: (ws, t) => void handleArchive(ws, t),
        onArchiveAll: (ws) => void handleArchiveAll(ws),
        onRelease: (ws, t) => void handleRelease(ws, t),
    };
    // ===== 注意力导航：顶部计数 chip 点击定位 + 工作区搜索过滤 =====
    const rootRef = useRef(null);
    const [flashGroup, setFlashGroup] = useState(null);
    const [query, setQuery] = useState("");
    /** 点击 chip：平滑滚动到第一个命中分组并短暂高亮；再点同一个取消 */
    const focusGroup = (kind) => {
        if (flashGroup === kind) {
            setFlashGroup(null);
            return;
        }
        setFlashGroup(kind);
        // 等本轮渲染（高亮样式落上）后再滚动定位
        setTimeout(() => {
            rootRef.current
                ?.querySelector(`[data-group="${kind}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 30);
        setTimeout(() => setFlashGroup((cur) => (cur === kind ? null : cur)), 1800);
    };
    if (loading && !data) {
        return (_jsx("div", { style: rootStyle, children: _jsx(EmptyState, { icon: "\uD83D\uDDC2\uFE0F", title: "\u52A0\u8F7D\u4E2D\u53F0\u6570\u636E\u4E2D\u2026", sub: "\u6B63\u5728\u626B\u63CF\u672C\u5730\u5DE5\u4F5C\u533A\u4EFB\u52A1\u5B58\u50A8" }) }));
    }
    if (!data || data.workspaces.length === 0) {
        return (_jsx("div", { style: rootStyle, children: _jsx(EmptyState, { icon: "\uD83C\uDFAF", title: "\u6682\u65E0\u4EFB\u4F55\u5DE5\u4F5C\u533A\u4EFB\u52A1\u6570\u636E", sub: "\u5728\u67D0\u4E2A\u5DE5\u4F5C\u533A\u91CC\u5BF9 Agent \u8BF4\u300C\u628A\u8FD9\u4E2A\u9700\u6C42\u62C6\u89E3\u6210\u4EFB\u52A1\u300D\uFF0C\u6216\u8C03\u7528 workspace_task \u5EFA\u51E0\u5F20\u4EFB\u52A1\u5361\uFF0C\u4E2D\u53F0\u5C31\u4F1A\u81EA\u52A8\u4EAE\u8D77\u6765\u3002" }) }));
    }
    const t = data.totals;
    // 搜索过滤：工作区名 / 路径 / 任务 ID / 标题
    const q = query.trim().toLowerCase();
    const matchWorkspace = (ws) => {
        if (!q)
            return true;
        if (ws.title.toLowerCase().includes(q) || ws.workspacePath.toLowerCase().includes(q))
            return true;
        const tasks = [
            ...ws.pendingApprovals.map((p) => p.task),
            ...ws.inProgress,
            ...ws.review,
            ...ws.done,
            ...ws.blocked,
            ...ws.readyPreview.tasks,
        ];
        return tasks.some((task) => task.id.toLowerCase().includes(q) || task.title.toLowerCase().includes(q));
    };
    const visibleWorkspaces = data.workspaces.filter(matchWorkspace);
    // 待拍板全局横幅：跨工作区汇总，直达批红弹窗
    const pendingAll = data.workspaces.flatMap((ws) => ws.pendingApprovals.map((p) => ({ ws, ...p })));
    // chip 顺序与卡片分组顺序一致（注意力优先级）
    const chips = [
        { kind: "approvals", icon: "🔔", label: "待拍板", count: t.pendingApprovals, color: "#d97706" },
        { kind: "blocked", icon: "🔒", label: "阻塞", count: t.blocked, color: "#ef4444" },
        { kind: "review", icon: "🔍", label: "待验收", count: t.review, color: "#7c3aed" },
        { kind: "inProgress", icon: "⚡", label: "进行中", count: t.inProgress, color: "#2563eb" },
        { kind: "ready", icon: "🎯", label: "就绪", count: t.ready, color: "#059669" },
        { kind: "done", icon: "✅", label: "待归档", count: t.done, color: "#059669" },
    ];
    return (_jsxs("div", { style: rootStyle, ref: rootRef, children: [_jsx("style", { children: "@keyframes dshTasksChipPulse{0%,100%{box-shadow:0 0 0 0 rgba(217,119,6,.45)}50%{box-shadow:0 0 0 5px rgba(217,119,6,0)}}@keyframes dshTasksSpin{to{transform:rotate(360deg)}}" }), _jsxs("div", { style: headerStyle, children: [_jsxs("div", { style: headerTopRowStyle, children: [_jsx("div", { style: titleStyle, children: "\uD83D\uDDC2\uFE0F \u4EFB\u52A1\u4E2D\u53F0" }), _jsx("input", { style: searchInputStyle, placeholder: "\u641C\u7D22\u5DE5\u4F5C\u533A / \u4EFB\u52A1 ID / \u6807\u9898\u2026", value: query, onChange: (e) => setQuery(e.target.value) })] }), _jsx("div", { style: totalsRowStyle, children: chips.map((c) => (_jsx("button", { type: "button", style: totalChipBtnStyle(c.color, {
                                active: flashGroup === c.kind,
                                dim: c.count === 0,
                                pulse: c.kind === "approvals" && c.count > 0,
                            }), title: c.count > 0 ? "定位到第一个命中分组（再点取消高亮）" : "当前没有该类任务", onClick: () => {
                                if (c.count > 0)
                                    focusGroup(c.kind);
                            }, children: `${c.icon} ${c.label} ${c.count}` }, c.kind))) }), _jsx("div", { style: generatedAtStyle, children: `${t.workspaces} 个工作区 · 更新于 ${new Date(data.generatedAt).toLocaleTimeString()} · 点击任务查看详情，可直接批红 / 验收 / 归档 / 派发` })] }), pendingAll.length > 0 && (_jsxs("div", { style: approvalBannerStyle, children: [_jsx("span", { style: approvalBannerTitleStyle, children: `🔔 ${pendingAll.length} 条票拟待你批红` }), pendingAll.slice(0, 3).map((p) => (_jsx("button", { type: "button", style: approvalBannerBtnStyle, title: `${p.ws.title} · ${p.taskTitle}`, onClick: () => setSelected({ ws: p.ws, task: p.task }), children: `「${p.approval.title}」去批红 →` }, p.approval.id))), pendingAll.length > 3 && (_jsx("span", { style: approvalBannerMoreStyle, children: `…等 ${pendingAll.length} 条` }))] })), _jsx(FeedSection, { activity: data.recentActivity ?? [], dispatches: data.recentDispatches ?? [], onExecuteDispatch: (item) => void handleExecuteDispatch(item), onIgnoreDispatch: (item) => void handleIgnoreDispatch(item) }), visibleWorkspaces.length === 0 ? (_jsx(EmptyState, { icon: "\uD83D\uDD0D", title: `没有匹配「${query}」的工作区或任务`, sub: "\u8BD5\u8BD5\u5DE5\u4F5C\u533A\u6587\u4EF6\u5939\u540D\u3001\u4EFB\u52A1 ID\uFF08\u5982 TASK-001\uFF09\u6216\u6807\u9898\u5173\u952E\u8BCD" })) : (_jsx("div", { style: gridStyle, children: visibleWorkspaces.map((ws) => (_jsx(WorkspaceCard, { ws: ws, onOpenTask: (task) => setSelected({ ws, task }), handlers: cardHandlers, flashGroup: flashGroup }, ws.workspacePath || ws.fileName || ws.title))) })), _jsx("div", { style: toastWrapStyle, children: toasts.map((t) => (_jsx("div", { style: toastItemStyle(t.kind), children: t.text }, t.id))) }), selected && (_jsx(TaskDetailModal, { sel: selected, onClose: () => setSelected(null), onResolved: () => {
                    setSelected(null);
                    refresh();
                }, toast: toast }))] }));
}
//# sourceMappingURL=GlobalBoardPanel.js.map