import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment, useState } from "react";
import { MarkdownContent } from "../markdown.js";
import { openWorkspaceFileViaDsh } from "../dsh-open.js";
import { notifyApprovalResolved } from "../dispatch-agent.js";
import { API_BASE, STATUS_LABEL, buildDecisionChains, claimLabel, fmtCheckpointValue } from "./utils.js";
import { claimChipStyle, modalApprovalDetailStyle, modalApprovalMetaStyle, modalApprovalOptionsStyle, modalApprovalStyle, modalApprovalTitleStyle, modalChainConnectorStyle, modalCloseBtnStyle, modalContentStyle, modalDecisionChipStyle, modalDecisionIdStyle, modalDecisionStyle, modalDeliverableChipStyle, modalDeliverableWrapStyle, modalFieldBlockStyle, modalFieldLabelStyle, modalFooterStyle, modalHeaderStyle, modalHistoryLineStyle, modalIdStyle, modalInsightLineStyle, modalItemStyle, modalMetaLineStyle, modalOptionBtnStyle, modalOverlayStyle, modalRejectBtnStyle, modalRejectConfirmBtnStyle, modalRejectEditorStyle, modalRejectInputStyle, modalResolvedApprovalStyle, modalSectionStyle, modalSupersededBadgeStyle, modalTabBtnStyle, modalTabsRowStyle, modalTitleStyle, modalWsStyle, priorityChipStyle, statusChipStyle, } from "./styles.js";
/** 任务详情弹窗：中台自足——看详情、读决策、待拍板直接批红，不用离开中台 */
export function TaskDetailModal({ sel, onClose, onResolved, toast, }) {
    const { ws, task } = sel;
    const [resolving, setResolving] = useState(false);
    // 驳回备注内联编辑态：false=未展开
    const [rejecting, setRejecting] = useState(false);
    const [rejectNote, setRejectNote] = useState("");
    const pendingApproval = (task.approvals ?? []).find((a) => a.status === "pending");
    const resolvedApprovals = (task.approvals ?? []).filter((a) => a.status !== "pending");
    const decisions = task.decisionLog ?? [];
    // 动态 tab 展示完整历史，不再截断（tab 化后空间充裕）
    const history = task.history ?? [];
    const conclusions = task.conclusions ?? [];
    const traceRefs = task.traceRefs ?? [];
    /** 交付物一键直达：调用 DSH 原生 openPath 在编辑器打开对应文件 */
    const openDeliverable = async (file) => {
        try {
            const dshCtx = window.__DSH_TASK_CLIENT_CTX__;
            await openWorkspaceFileViaDsh(dshCtx, file, { workspacePath: ws.workspacePath });
            toast?.(`已打开 ${file}`, "ok");
        }
        catch (e) {
            console.warn(e);
            toast?.(`打开失败：${file}`, "err");
        }
    };
    const tabs = [];
    if (pendingApproval)
        tabs.push({ key: "approval", label: "🔔 待拍板" });
    if (task.description)
        tabs.push({ key: "desc", label: "📋 描述" });
    if (conclusions.length > 0)
        tabs.push({ key: "conclusions", label: `📝 结论 ${conclusions.length}` });
    if (decisions.length > 0)
        tabs.push({ key: "decisions", label: `⚖️ 决策 ${decisions.length}` });
    if (resolvedApprovals.length > 0)
        tabs.push({ key: "approvals", label: `🖋️ 审批 ${resolvedApprovals.length}` });
    if (traceRefs.length > 0)
        tabs.push({ key: "traces", label: `🔗 引用 ${traceRefs.length}` });
    if (history.length > 0)
        tabs.push({ key: "activity", label: `🕘 动态 ${history.length}` });
    const [activeTabOverride, setActiveTab] = useState(null);
    const activeTab = activeTabOverride && tabs.some((t) => t.key === activeTabOverride)
        ? activeTabOverride
        : tabs[0]?.key ?? "desc";
    const resolveApproval = async (approval, optionId) => {
        if (resolving)
            return;
        setResolving(true);
        try {
            const res = await fetch(`${API_BASE}/approval/resolve`, {
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
            const json = (await res.json().catch(() => null));
            if (!res.ok || json?.ok === false) {
                toast?.(`批红失败：${task.id}`, "err");
                return;
            }
            // 审批反馈闭环：按认领锁 sessionHint 定向唤醒原执行会话，人不用再手动告知
            const optionLabel = approval.options.find((o) => o.id === optionId)?.label ?? optionId;
            const wake = await notifyApprovalResolved({
                taskId: task.id,
                approvalTitle: approval.title,
                approved: true,
                optionLabel,
                sessionHint: task.claim?.sessionHint,
                workspacePath: ws.workspacePath,
            });
            toast?.(wake === "sent"
                ? `✓ 已批红并唤醒执行会话：${approval.title}`
                : `✓ 已批红${wake === "no-session" ? "；原执行会话未知" : "，但唤醒执行会话失败"}，如需继续请手动告知`, wake === "failed" ? "err" : "ok");
            onResolved();
        }
        catch (e) {
            console.error(e);
            toast?.(`批红失败：${task.id}`, "err");
        }
        finally {
            setResolving(false);
        }
    };
    const rejectApproval = async (approval, note) => {
        if (resolving)
            return;
        setResolving(true);
        try {
            const res = await fetch(`${API_BASE}/approval/reject`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ workspacePath: ws.workspacePath, taskId: task.id, approvalId: approval.id, note }),
            });
            const json = (await res.json().catch(() => null));
            if (!res.ok || json?.ok === false) {
                toast?.(`驳回失败：${task.id}`, "err");
                return;
            }
            // 驳回同样唤醒：Agent 需要知道被驳回并拿到备注，才能重新规划
            const wake = await notifyApprovalResolved({
                taskId: task.id,
                approvalTitle: approval.title,
                approved: false,
                note,
                sessionHint: task.claim?.sessionHint,
                workspacePath: ws.workspacePath,
            });
            toast?.(wake === "sent"
                ? `已驳回并通知执行会话：${approval.title}`
                : `已驳回${wake === "no-session" ? "；原执行会话未知" : "，但通知执行会话失败"}，请手动告知`, wake === "failed" ? "err" : "ok");
            onResolved();
        }
        catch (e) {
            console.error(e);
            toast?.(`驳回失败：${task.id}`, "err");
        }
        finally {
            setResolving(false);
        }
    };
    return (_jsx("div", { style: modalOverlayStyle, onClick: onClose, children: _jsxs("div", { style: modalContentStyle, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { style: modalHeaderStyle, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [_jsx("span", { style: modalIdStyle, children: task.id }), _jsx("span", { style: statusChipStyle, children: STATUS_LABEL[task.status] ?? task.status }), _jsx("span", { style: priorityChipStyle, children: task.priority }), claimLabel(task) && _jsx("span", { style: claimChipStyle, children: claimLabel(task) })] }), _jsx("h3", { style: modalTitleStyle, children: task.title }), _jsx("div", { style: modalWsStyle, children: `📁 ${ws.title} · ${ws.workspacePath}` })] }), tabs.length > 0 && (_jsx("div", { style: modalTabsRowStyle, children: tabs.map((t) => (_jsx("button", { type: "button", style: modalTabBtnStyle(t.key === activeTab, t.key === "approval"), onClick: () => setActiveTab(t.key), children: t.label }, t.key))) })), activeTab === "approval" && pendingApproval && (_jsxs("div", { style: modalApprovalStyle, children: [_jsx("div", { style: modalApprovalTitleStyle, children: `🔔 待拍板：${pendingApproval.title}` }), pendingApproval.detail && (_jsx("div", { style: modalApprovalDetailStyle, children: pendingApproval.detail })), _jsxs("div", { style: modalApprovalOptionsStyle, children: [pendingApproval.options.map((opt) => (_jsx("button", { type: "button", disabled: resolving, style: modalOptionBtnStyle, onClick: () => resolveApproval(pendingApproval, opt.id), children: `✓ ${opt.label}` }, opt.id))), _jsx("button", { type: "button", disabled: resolving, style: modalRejectBtnStyle, onClick: () => {
                                        setRejecting((v) => !v);
                                        setRejectNote("");
                                    }, children: rejecting ? "收起驳回" : "✕ 驳回" })] }), rejecting && (_jsxs("div", { style: modalRejectEditorStyle, children: [_jsx("input", { style: modalRejectInputStyle, placeholder: "\u9A73\u56DE\u5907\u6CE8\uFF08\u53EF\u9009\uFF09", value: rejectNote, autoFocus: true, onChange: (e) => setRejectNote(e.target.value), onKeyDown: (e) => {
                                        if (e.key === "Enter")
                                            void rejectApproval(pendingApproval, rejectNote);
                                        if (e.key === "Escape")
                                            setRejecting(false);
                                    } }), _jsx("button", { type: "button", disabled: resolving, style: modalRejectConfirmBtnStyle, onClick: () => void rejectApproval(pendingApproval, rejectNote), children: "\u786E\u8BA4\u9A73\u56DE" }), _jsx("button", { type: "button", disabled: resolving, style: modalRejectBtnStyle, onClick: () => setRejecting(false), children: "\u53D6\u6D88" })] })), _jsx("div", { style: modalApprovalMetaStyle, children: "\u6279\u7EA2\u540E\u81EA\u52A8\u8BB0\u5F55\u4E0D\u53EF\u6539\u5199\u51B3\u7B56\u5E76\u6062\u590D\u4EFB\u52A1\u6267\u884C\uFF1B\u9A73\u56DE\u5219\u4FDD\u6301\u963B\u585E" })] })), activeTab === "desc" && task.description && (_jsx("div", { style: modalSectionStyle, children: _jsx(MarkdownContent, { content: task.description }) })), activeTab === "conclusions" && conclusions.length > 0 && (_jsx("div", { style: modalSectionStyle, children: conclusions.map((c) => (_jsxs("div", { style: modalItemStyle, children: [_jsx(MarkdownContent, { content: c.summary }), c.deliverables && c.deliverables.length > 0 && (_jsxs("div", { style: modalFieldBlockStyle, children: [_jsx("span", { style: modalFieldLabelStyle, children: "\uD83D\uDCE6 \u4EA4\u4ED8\u7269" }), _jsx("div", { style: modalDeliverableWrapStyle, children: c.deliverables.map((f) => (_jsx("button", { type: "button", style: modalDeliverableChipStyle, title: `在编辑器打开 ${f}`, onClick: () => void openDeliverable(f), children: `📄 ${f}` }, f))) })] })), c.insights && c.insights.length > 0 && (_jsxs("div", { style: modalFieldBlockStyle, children: [_jsx("span", { style: modalFieldLabelStyle, children: "\uD83D\uDCA1 \u7ECF\u9A8C\u5FC3\u5F97" }), c.insights.map((ins, i) => (_jsx("div", { style: modalInsightLineStyle, children: ins }, i)))] })), _jsx("div", { style: modalMetaLineStyle, children: `完成于 ${new Date(c.completedAt).toLocaleString()}` })] }, c.id))) })), activeTab === "decisions" && decisions.length > 0 && (_jsx("div", { style: modalSectionStyle, children: buildDecisionChains(decisions).map((chain, ci) => (_jsx("div", { style: { marginTop: ci > 0 ? 14 : 0 }, children: chain.map((d, di) => (_jsxs(Fragment, { children: [_jsxs("div", { style: modalDecisionStyle(Boolean(d.supersededBy)), children: [_jsxs("div", { style: {
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                gap: 6,
                                                flexWrap: "wrap",
                                            }, children: [_jsx("span", { style: { fontWeight: 600, fontSize: 12.5 }, children: d.title }), d.supersededBy ? (_jsx("span", { style: modalSupersededBadgeStyle, children: `已被 ${d.supersededBy} 取代` })) : (_jsx("span", { style: modalDecisionIdStyle, children: `${d.id} · 现行` }))] }), _jsx(MarkdownContent, { content: d.rationale }), d.alternatives && d.alternatives.length > 0 && (_jsx("div", { style: modalMetaLineStyle, children: `已否决备选：${d.alternatives.join("、")}` })), _jsx("div", { style: modalMetaLineStyle, children: `${d.actor ?? "unknown"} · ${new Date(d.decidedAt).toLocaleString()}${d.sessionId ? ` · 🧵 ${d.sessionId}` : ""}` })] }), di < chain.length - 1 && (_jsx("div", { style: modalChainConnectorStyle, children: "\u2193 \u6F14\u8FDB\u53D6\u4EE3" }))] }, d.id))) }, ci))) })), activeTab === "approvals" && resolvedApprovals.length > 0 && (_jsx("div", { style: modalSectionStyle, children: resolvedApprovals.map((a) => (_jsxs("div", { style: modalResolvedApprovalStyle(a.status === "approved"), children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [_jsx("span", { style: { fontWeight: 600, fontSize: 12 }, children: `${a.status === "approved" ? "✓ 已批红" : "✕ 已驳回"}：${a.title}` }), a.decisionId && (_jsx("span", { style: modalDecisionChipStyle, title: `批红自动落盘的决策记录（回链）\n${a.decisionId}`, children: `⚖️ ${a.decisionId.slice(0, 14)}…` }))] }), a.status === "approved" && a.resolvedOptionId && (_jsx("div", { style: modalMetaLineStyle, children: `批红选项：「${a.options.find((o) => o.id === a.resolvedOptionId)?.label ?? a.resolvedOptionId}」` })), a.resolveNote && (_jsx("div", { style: modalMetaLineStyle, children: `${a.status === "approved" ? "批注" : "驳回备注"}：${a.resolveNote}` })), a.resolvedAt && (_jsx("div", { style: modalMetaLineStyle, children: `⏱ ${new Date(a.resolvedAt).toLocaleString()}` }))] }, a.id))) })), activeTab === "traces" && traceRefs.length > 0 && (_jsx("div", { style: modalSectionStyle, children: traceRefs.map((r, i) => (_jsx("div", { style: modalMetaLineStyle, children: `${r.taskId} @ ${r.workspacePath}${r.note ? ` — ${r.note}` : ""}` }, i))) })), activeTab === "activity" && history.length > 0 && (_jsx("div", { style: modalSectionStyle, children: history.map((c, i) => (_jsx("div", { style: modalHistoryLineStyle, children: `${new Date(c.at).toLocaleString()} · ${c.field}: ${fmtCheckpointValue(c.from, 0)} → ${fmtCheckpointValue(c.to, 0)}` }, i))) })), _jsxs("div", { style: modalFooterStyle, children: [_jsx("span", { children: `创建于 ${new Date(task.createdAt).toLocaleString()} · 更新于 ${new Date(task.updatedAt).toLocaleString()}` }), _jsx("button", { type: "button", style: modalCloseBtnStyle, onClick: onClose, children: "\u5173\u95ED" })] })] }) }));
}
//# sourceMappingURL=TaskDetailModal.js.map