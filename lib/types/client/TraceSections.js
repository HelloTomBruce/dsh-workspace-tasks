import { createElement, useState } from "react";
import { MarkdownContent } from "./markdown.js";
/**
 * 任务卡片内的「痕迹」可视化区块：决策演进链 / 跨工作区引用 / 过程检查点。
 * 视觉语义：
 * - 决策：紫色实线 = 现行；灰色实线 + 降低透明度 = 已被取代（supersededBy 徽标）
 * - 引用：蓝色实线 = 正常解析；橙色虚线 = 悬挂降级（来源被删/不可达）
 * - 检查点：默认折叠的时间线，最新在前，最多展示 50 条
 */
const CHECKPOINT_VISIBLE_LIMIT = 50;
export const decisionChipStyle = {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 10,
    backgroundColor: "rgba(124, 58, 237, 0.12)",
    color: "#7c3aed",
    whiteSpace: "nowrap",
    cursor: "default",
};
export const traceChipStyle = {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 10,
    backgroundColor: "rgba(14, 165, 233, 0.12)",
    color: "#0ea5e9",
    whiteSpace: "nowrap",
    cursor: "default",
};
const decisionItemStyle = (superseded) => ({
    border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
    borderLeft: superseded ? "3px solid rgba(148, 163, 184, 0.5)" : "3px solid #7c3aed",
    borderRadius: 6,
    padding: "6px 8px",
    marginTop: 4,
    opacity: superseded ? 0.72 : 1,
    backgroundColor: superseded
        ? "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))"
        : "rgba(124, 58, 237, 0.04)",
});
const supersededBadgeStyle = {
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 8,
    backgroundColor: "rgba(148, 163, 184, 0.18)",
    color: "var(--dsw-alias-label-secondary, #64748b)",
    whiteSpace: "nowrap",
    flexShrink: 0,
};
const decisionIdStyle = {
    fontSize: 10,
    fontFamily: "monospace",
    color: "#7c3aed",
    whiteSpace: "nowrap",
    flexShrink: 0,
};
const traceItemStyle = {
    border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
    borderLeft: "3px solid #0ea5e9",
    borderRadius: 6,
    padding: "5px 8px",
    backgroundColor: "rgba(14, 165, 233, 0.04)",
};
const traceDanglingStyle = {
    border: "1px dashed var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1))",
    borderLeft: "3px dashed rgba(245, 158, 11, 0.7)",
    borderRadius: 6,
    padding: "5px 8px",
    backgroundColor: "rgba(245, 158, 11, 0.06)",
    opacity: 0.85,
};
const historyToggleStyle = {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--dsw-alias-label-secondary, #64748b)",
    cursor: "pointer",
};
const checkpointFieldStyle = {
    fontSize: 10,
    fontFamily: "monospace",
    padding: "1px 6px",
    borderRadius: 8,
    backgroundColor: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.05))",
    color: "var(--dsw-alias-label-primary, #334155)",
    whiteSpace: "nowrap",
};
const sectionBlockStyle = {
    fontSize: 12,
    color: "var(--dsw-alias-label-secondary, #475569)",
    backgroundColor: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.03))",
    padding: "6px 8px",
    borderRadius: 6,
};
const sectionLabelStyle = {
    fontWeight: 600,
    fontSize: 11,
    color: "var(--dsw-alias-label-secondary, #64748b)",
};
const itemTextStyle = {
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--dsw-alias-label-secondary, #475569)",
};
const itemTimeStyle = {
    fontSize: 10,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};
/** 检查点 from/to JSON 快照的缩略显示 */
function shortSnapshot(s) {
    try {
        const v = JSON.parse(s);
        if (v === null)
            return "∅";
        if (typeof v === "string")
            return v.length > 24 ? `${v.slice(0, 24)}…` : v;
        return JSON.stringify(v).slice(0, 36);
    }
    catch {
        return s.length > 24 ? `${s.slice(0, 24)}…` : s;
    }
}
export function TraceSections({ decisions = [], checkpoints = [], traceRefs = [], resolvedTraces, }) {
    const [showHistory, setShowHistory] = useState(false);
    return [
        // ===== 决策演进链（append-only，supersede 标识） =====
        decisions.length > 0 &&
            createElement("div", { style: { ...sectionBlockStyle, marginTop: 10 } }, createElement("span", { style: sectionLabelStyle }, "⚖️ 决策演进链 (自包含 · append-only):"), createElement("div", { style: { marginTop: 4 } }, decisions.map((d) => createElement("div", { key: d.id, style: decisionItemStyle(Boolean(d.supersededBy)) }, createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 } }, createElement("span", { style: { fontWeight: 600, fontSize: 12, color: "var(--dsw-alias-label-primary, #0f172a)" } }, d.title), d.supersededBy
                ? createElement("span", { style: supersededBadgeStyle }, `已被 ${d.supersededBy} 取代`)
                : createElement("span", { style: decisionIdStyle }, d.id)), createElement(MarkdownContent, { content: d.rationale, style: itemTextStyle }), d.alternatives && d.alternatives.length > 0
                ? createElement("div", { style: { marginTop: 2 } }, createElement("span", { style: sectionLabelStyle }, `已否决备选: ${d.alternatives.join("、")}`))
                : null, createElement("div", { style: { marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" } }, createElement("span", { style: itemTimeStyle }, `⏱ ${new Date(d.decidedAt).toLocaleString()}`), d.actor && createElement("span", { style: itemTimeStyle }, `👤 ${d.actor}`), d.sessionId && createElement("span", { style: itemTimeStyle, title: "装饰性溯源线索，可悬挂" }, `🧵 ${d.sessionId}`)))))),
        // ===== 跨工作区痕迹引用 =====
        traceRefs.length > 0 &&
            createElement("div", { style: { ...sectionBlockStyle, marginTop: 8 } }, createElement("span", { style: sectionLabelStyle }, "🔗 跨工作区痕迹引用 (只读):"), createElement("div", { style: { marginTop: 4, display: "flex", flexDirection: "column", gap: 4 } }, (resolvedTraces ?? traceRefs).map((r, ri) => {
                const dangling = r.resolved?.dangling;
                return createElement("div", { key: `${r.workspacePath}-${r.taskId}-${ri}`, style: dangling ? traceDanglingStyle : traceItemStyle }, createElement("span", { style: { fontWeight: 600, fontSize: 12 } }, dangling ? "⚠️ 已悬挂" : `📄 ${r.resolved?.title || r.taskId}`), !dangling && r.resolved?.latestSummary
                    ? createElement("div", { style: { marginTop: 2 } }, createElement(MarkdownContent, { content: r.resolved.latestSummary, style: itemTextStyle }))
                    : null, r.note ? createElement("div", { style: sectionLabelStyle }, `💬 ${r.note}`) : null, createElement("div", { style: itemTimeStyle }, `${r.taskId} @ ${r.workspacePath}`));
            }))),
        // ===== 过程检查点时间线（append-only 事件，最新在前） =====
        checkpoints.length > 0 &&
            createElement("div", { style: { marginTop: 8 } }, createElement("button", { onClick: () => setShowHistory((v) => !v), style: historyToggleStyle }, `${showHistory ? "▲" : "▼"} 🕘 过程检查点 (${checkpoints.length})`), showHistory &&
                createElement("div", {
                    style: {
                        marginTop: 6,
                        borderLeft: "2px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
                        padding: "4px 8px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                    },
                }, checkpoints.slice(0, CHECKPOINT_VISIBLE_LIMIT).map((c, ci) => createElement("div", { key: ci, style: { display: "flex", alignItems: "baseline", gap: 6, padding: "2px 0", flexWrap: "wrap" } }, createElement("span", { style: itemTimeStyle }, new Date(c.at).toLocaleString()), createElement("span", { style: checkpointFieldStyle }, c.field), createElement("span", { style: itemTextStyle, title: `${c.from} → ${c.to}` }, `${shortSnapshot(c.from)} → ${shortSnapshot(c.to)}`))), checkpoints.length > CHECKPOINT_VISIBLE_LIMIT
                    ? createElement("div", { style: sectionLabelStyle }, `…其余 ${checkpoints.length - CHECKPOINT_VISIBLE_LIMIT} 条已折叠`)
                    : null)),
    ];
}
//# sourceMappingURL=TraceSections.js.map