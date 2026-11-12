import { setPendingNav } from "../pending-nav.js";
import { findCurrentSession } from "../dsh-open.js";
/**
 * 任务中台纯逻辑：标签格式化 / 决策链重建 / 跳转导航。
 * 无 JSX、无 React 依赖——可单测、可被任意组件复用。
 */
export const API_BASE = "/__dsh-tasks__";
export function claimLabel(task) {
    if (!task.claim)
        return null;
    const remain = new Date(task.claim.leaseUntil).getTime() - Date.now();
    if (Number.isNaN(remain) || remain <= 0)
        return `🔓 锁已过期`;
    return `🔒 ${task.claim.owner} · 剩 ${Math.max(1, Math.ceil(remain / 60000))} 分钟`;
}
export const dispatchModeBadge = (mode) => mode === "auto" ? { icon: "⚡", label: "自动派发" } : mode === "observe" ? { icon: "👁️", label: "观察模式" } : { icon: "⏸️", label: "派发关闭" };
/** 派发记录状态徽标（中台派发记录面板用） */
export const DISPATCH_STATUS_META = {
    queued: { icon: "⚡", label: "待取件", color: "#d97706" },
    sent: { icon: "✓", label: "已送达", color: "#059669" },
    failed: { icon: "✗", label: "失败", color: "#ef4444" },
    ignored: { icon: "🚫", label: "已忽略", color: "#94a3b8" },
    "would-dispatch": { icon: "👁️", label: "观察", color: "#7c3aed" },
    tripped: { icon: "🔥", label: "熔断", color: "#ef4444" },
};
export const STATUS_LABEL = {
    todo: "待办",
    in_progress: "进行中",
    review: "待验收",
    done: "已完成",
    blocked: "阻塞",
    archived: "已归档",
};
/** 检查点 from/to 是 JSON 字符串（如 "\"todo\""），解析为可读值；状态码翻译为中文，超长截断（maxLen=0 不截断） */
export function fmtCheckpointValue(raw, maxLen = 48) {
    let v = raw;
    try {
        v = JSON.parse(raw);
    }
    catch {
        // 非 JSON：原文展示
    }
    let text;
    if (v === null || v === undefined)
        text = "∅";
    else if (typeof v === "string")
        text = STATUS_LABEL[v] ?? v;
    else
        text = JSON.stringify(v);
    return maxLen > 0 && text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}
/** 动态条目展示文本：决策=标题+操作者；检查点=字段 from→to（可读化） */
export function activityText(a) {
    if (a.kind === "decision")
        return `⚖️ ${a.decisionTitle}${a.actor ? ` · ${a.actor}` : ""}`;
    return `${a.field}: ${fmtCheckpointValue(a.from ?? "null")} → ${fmtCheckpointValue(a.to ?? "null")}`;
}
/**
 * 决策演进链重建：决策只有 supersededBy（旧→新）单向指针，
 * 从未被取代的「现行」链头向前回溯 predecessor，输出 oldest→newest 的链数组。
 * supersededBy 指向不存在/成环的悬挂节点兜底单节点链，不丢任何决策。
 */
export function buildDecisionChains(decisions) {
    const visited = new Set();
    const chains = [];
    for (const head of decisions.filter((d) => !d.supersededBy)) {
        const chain = [head];
        visited.add(head.id);
        let cur = head;
        for (;;) {
            const pred = decisions.find((d) => d.supersededBy === cur.id && !visited.has(d.id));
            if (!pred)
                break;
            chain.unshift(pred);
            visited.add(pred.id);
            cur = pred;
        }
        chains.push(chain);
    }
    for (const d of decisions)
        if (!visited.has(d.id))
            chains.push([d]);
    return chains;
}
/**
 * 跳回右栏工作区看板（工作区卡片标题用）。中台占据主区域时没有会话面板，
 * sidebarRight.openTab 会抛「no session surface is mounted」——先查会话再跳，避免噪音。
 */
export function navigateToWorkspaceBoard(workspacePath) {
    setPendingNav({ workspacePath });
    const dshCtx = window.__DSH_TASK_CLIENT_CTX__;
    const hasSession = Boolean(findCurrentSession(dshCtx)?.sessionId);
    if (!hasSession)
        return; // 中台在主区域时无会话面板，挂单已写，看板下次打开时会消费
    try {
        dshCtx?.sidebarRight?.openTab?.("workspace-tasks");
    }
    catch (e) {
        console.warn("[dsh-workspace-tasks] openTab failed:", e);
    }
    window.dispatchEvent(new CustomEvent("dsh-tasks:open-workspace", { detail: { workspacePath } }));
}
//# sourceMappingURL=utils.js.map