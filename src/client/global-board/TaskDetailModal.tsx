import { Fragment, useState } from "react";
import type { ApprovalRequest } from "../../store/types.ts";
import { MarkdownContent } from "../markdown.tsx";
import { openWorkspaceFileViaDsh } from "../dsh-open.ts";
import { notifyApprovalResolved } from "../dispatch-agent.ts";
import type { SelectedTask, ToastFn } from "./types.ts";
import { API_BASE, STATUS_LABEL, buildDecisionChains, claimLabel, fmtCheckpointValue } from "./utils.ts";
import {
  claimChipStyle,
  modalApprovalDetailStyle,
  modalApprovalMetaStyle,
  modalApprovalOptionsStyle,
  modalApprovalStyle,
  modalApprovalTitleStyle,
  modalChainConnectorStyle,
  modalCloseBtnStyle,
  modalContentStyle,
  modalDecisionChipStyle,
  modalDecisionIdStyle,
  modalDecisionStyle,
  modalDeliverableChipStyle,
  modalDeliverableWrapStyle,
  modalFieldBlockStyle,
  modalFieldLabelStyle,
  modalFooterStyle,
  modalHeaderStyle,
  modalHistoryLineStyle,
  modalIdStyle,
  modalInsightLineStyle,
  modalItemStyle,
  modalMetaLineStyle,
  modalOptionBtnStyle,
  modalOverlayStyle,
  modalRejectBtnStyle,
  modalRejectConfirmBtnStyle,
  modalRejectEditorStyle,
  modalRejectInputStyle,
  modalResolvedApprovalStyle,
  modalSectionStyle,
  modalSupersededBadgeStyle,
  modalTabBtnStyle,
  modalTabsRowStyle,
  modalTitleStyle,
  modalWsStyle,
  priorityChipStyle,
  statusChipStyle,
} from "./styles.ts";

/** 任务详情弹窗：中台自足——看详情、读决策、待拍板直接批红，不用离开中台 */
export function TaskDetailModal({
  sel,
  onClose,
  onResolved,
  toast,
}: {
  sel: SelectedTask;
  onClose: () => void;
  onResolved: () => void;
  /** 操作失败反馈（成功由 onResolved 后的刷新体现） */
  toast?: ToastFn;
}) {
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
  const openDeliverable = async (file: string) => {
    try {
      const dshCtx = (window as unknown as { __DSH_TASK_CLIENT_CTX__?: unknown }).__DSH_TASK_CLIENT_CTX__;
      await openWorkspaceFileViaDsh(dshCtx, file, { workspacePath: ws.workspacePath });
      toast?.(`已打开 ${file}`, "ok");
    } catch (e) {
      console.warn(e);
      toast?.(`打开失败：${file}`, "err");
    }
  };

  // ===== Tab 结构：待拍板（有则默认选中）→ 描述 → 结论 → 决策 → 审批 → 引用 → 动态 =====
  type TabKey = "approval" | "desc" | "conclusions" | "decisions" | "approvals" | "traces" | "activity";
  const tabs: Array<{ key: TabKey; label: string }> = [];
  if (pendingApproval) tabs.push({ key: "approval", label: "🔔 待拍板" });
  if (task.description) tabs.push({ key: "desc", label: "📋 描述" });
  if (conclusions.length > 0) tabs.push({ key: "conclusions", label: `📝 结论 ${conclusions.length}` });
  if (decisions.length > 0) tabs.push({ key: "decisions", label: `⚖️ 决策 ${decisions.length}` });
  if (resolvedApprovals.length > 0) tabs.push({ key: "approvals", label: `🖋️ 审批 ${resolvedApprovals.length}` });
  if (traceRefs.length > 0) tabs.push({ key: "traces", label: `🔗 引用 ${traceRefs.length}` });
  if (history.length > 0) tabs.push({ key: "activity", label: `🕘 动态 ${history.length}` });

  const [activeTabOverride, setActiveTab] = useState<TabKey | null>(null);
  const activeTab: TabKey =
    activeTabOverride && tabs.some((t) => t.key === activeTabOverride)
      ? activeTabOverride
      : tabs[0]?.key ?? "desc";

  const resolveApproval = async (approval: ApprovalRequest, optionId: string) => {
    if (resolving) return;
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
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
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
      toast?.(
        wake === "sent"
          ? `✓ 已批红并唤醒执行会话：${approval.title}`
          : `✓ 已批红${wake === "no-session" ? "；原执行会话未知" : "，但唤醒执行会话失败"}，如需继续请手动告知`,
        wake === "failed" ? "err" : "ok"
      );
      onResolved();
    } catch (e) {
      console.error(e);
      toast?.(`批红失败：${task.id}`, "err");
    } finally {
      setResolving(false);
    }
  };

  const rejectApproval = async (approval: ApprovalRequest, note: string) => {
    if (resolving) return;
    setResolving(true);
    try {
      const res = await fetch(`${API_BASE}/approval/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspacePath: ws.workspacePath, taskId: task.id, approvalId: approval.id, note }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
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
      toast?.(
        wake === "sent"
          ? `已驳回并通知执行会话：${approval.title}`
          : `已驳回${wake === "no-session" ? "；原执行会话未知" : "，但通知执行会话失败"}，请手动告知`,
        wake === "failed" ? "err" : "ok"
      );
      onResolved();
    } catch (e) {
      console.error(e);
      toast?.(`驳回失败：${task.id}`, "err");
    } finally {
      setResolving(false);
    }
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        {/* 头部：优先级 + ID + 标题 + 状态 */}
        <div style={modalHeaderStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={modalIdStyle}>{task.id}</span>
            <span style={statusChipStyle}>{STATUS_LABEL[task.status] ?? task.status}</span>
            <span style={priorityChipStyle}>{task.priority}</span>
            {claimLabel(task) && <span style={claimChipStyle}>{claimLabel(task)}</span>}
          </div>
          <h3 style={modalTitleStyle}>{task.title}</h3>
          <div style={modalWsStyle}>{`📁 ${ws.title} · ${ws.workspacePath}`}</div>
        </div>

        {/* Tab 栏 */}
        {tabs.length > 0 && (
          <div style={modalTabsRowStyle}>
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                style={modalTabBtnStyle(t.key === activeTab, t.key === "approval")}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ===== Tab 内容区 ===== */}

        {/* 待拍板：弹窗内直接批红（中台的核心动作） */}
        {activeTab === "approval" && pendingApproval && (
          <div style={modalApprovalStyle}>
            <div style={modalApprovalTitleStyle}>{`🔔 待拍板：${pendingApproval.title}`}</div>
            {pendingApproval.detail && (
              <div style={modalApprovalDetailStyle}>{pendingApproval.detail}</div>
            )}
            <div style={modalApprovalOptionsStyle}>
              {pendingApproval.options.map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  disabled={resolving}
                  style={modalOptionBtnStyle}
                  onClick={() => resolveApproval(pendingApproval, opt.id)}
                >
                  {`✓ ${opt.label}`}
                </button>
              ))}
              <button
                type="button"
                disabled={resolving}
                style={modalRejectBtnStyle}
                onClick={() => {
                  setRejecting((v) => !v);
                  setRejectNote("");
                }}
              >
                {rejecting ? "收起驳回" : "✕ 驳回"}
              </button>
            </div>
            {/* 驳回备注内联输入：替代原生 prompt() */}
            {rejecting && (
              <div style={modalRejectEditorStyle}>
                <input
                  style={modalRejectInputStyle}
                  placeholder="驳回备注（可选）"
                  value={rejectNote}
                  autoFocus
                  onChange={(e) => setRejectNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void rejectApproval(pendingApproval, rejectNote);
                    if (e.key === "Escape") setRejecting(false);
                  }}
                />
                <button
                  type="button"
                  disabled={resolving}
                  style={modalRejectConfirmBtnStyle}
                  onClick={() => void rejectApproval(pendingApproval, rejectNote)}
                >
                  确认驳回
                </button>
                <button
                  type="button"
                  disabled={resolving}
                  style={modalRejectBtnStyle}
                  onClick={() => setRejecting(false)}
                >
                  取消
                </button>
              </div>
            )}
            <div style={modalApprovalMetaStyle}>
              批红后自动记录不可改写决策并恢复任务执行；驳回则保持阻塞
            </div>
          </div>
        )}

        {/* 描述 */}
        {activeTab === "desc" && task.description && (
          <div style={modalSectionStyle}>
            <MarkdownContent content={task.description} />
          </div>
        )}

        {/* 结论：摘要 + 交付物（可点击直达文件）+ 经验心得 */}
        {activeTab === "conclusions" && conclusions.length > 0 && (
          <div style={modalSectionStyle}>
            {conclusions.map((c) => (
              <div key={c.id} style={modalItemStyle}>
                <MarkdownContent content={c.summary} />
                {c.deliverables && c.deliverables.length > 0 && (
                  <div style={modalFieldBlockStyle}>
                    <span style={modalFieldLabelStyle}>📦 交付物</span>
                    <div style={modalDeliverableWrapStyle}>
                      {c.deliverables.map((f) => (
                        <button
                          key={f}
                          type="button"
                          style={modalDeliverableChipStyle}
                          title={`在编辑器打开 ${f}`}
                          onClick={() => void openDeliverable(f)}
                        >
                          {`📄 ${f}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {c.insights && c.insights.length > 0 && (
                  <div style={modalFieldBlockStyle}>
                    <span style={modalFieldLabelStyle}>💡 经验心得</span>
                    {c.insights.map((ins, i) => (
                      <div key={i} style={modalInsightLineStyle}>
                        {ins}
                      </div>
                    ))}
                  </div>
                )}
                <div style={modalMetaLineStyle}>
                  {`完成于 ${new Date(c.completedAt).toLocaleString()}`}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 决策演进链：oldest → newest，灰色已被取代 → 紫色现行，含已否决备选 */}
        {activeTab === "decisions" && decisions.length > 0 && (
          <div style={modalSectionStyle}>
            {buildDecisionChains(decisions).map((chain, ci) => (
              <div key={ci} style={{ marginTop: ci > 0 ? 14 : 0 }}>
                {chain.map((d, di) => (
                  <Fragment key={d.id}>
                    <div style={modalDecisionStyle(Boolean(d.supersededBy))}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 12.5 }}>{d.title}</span>
                        {d.supersededBy ? (
                          <span style={modalSupersededBadgeStyle}>{`已被 ${d.supersededBy} 取代`}</span>
                        ) : (
                          <span style={modalDecisionIdStyle}>{`${d.id} · 现行`}</span>
                        )}
                      </div>
                      <MarkdownContent content={d.rationale} />
                      {d.alternatives && d.alternatives.length > 0 && (
                        <div style={modalMetaLineStyle}>
                          {`已否决备选：${d.alternatives.join("、")}`}
                        </div>
                      )}
                      <div style={modalMetaLineStyle}>
                        {`${d.actor ?? "unknown"} · ${new Date(d.decidedAt).toLocaleString()}${d.sessionId ? ` · 🧵 ${d.sessionId}` : ""}`}
                      </div>
                    </div>
                    {/* 链内演进连接符 */}
                    {di < chain.length - 1 && (
                      <div style={modalChainConnectorStyle}>↓ 演进取代</div>
                    )}
                  </Fragment>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* 已决审批：票拟→批红的历史（批准自动落决策并回链） */}
        {activeTab === "approvals" && resolvedApprovals.length > 0 && (
          <div style={modalSectionStyle}>
            {resolvedApprovals.map((a) => (
              <div key={a.id} style={modalResolvedApprovalStyle(a.status === "approved")}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>
                    {`${a.status === "approved" ? "✓ 已批红" : "✕ 已驳回"}：${a.title}`}
                  </span>
                  {a.decisionId && (
                    <span
                      style={modalDecisionChipStyle}
                      title={`批红自动落盘的决策记录（回链）\n${a.decisionId}`}
                    >
                      {`⚖️ ${a.decisionId.slice(0, 14)}…`}
                    </span>
                  )}
                </div>
                {a.status === "approved" && a.resolvedOptionId && (
                  <div style={modalMetaLineStyle}>
                    {`批红选项：「${a.options.find((o) => o.id === a.resolvedOptionId)?.label ?? a.resolvedOptionId}」`}
                  </div>
                )}
                {a.resolveNote && (
                  <div style={modalMetaLineStyle}>
                    {`${a.status === "approved" ? "批注" : "驳回备注"}：${a.resolveNote}`}
                  </div>
                )}
                {a.resolvedAt && (
                  <div style={modalMetaLineStyle}>
                    {`⏱ ${new Date(a.resolvedAt).toLocaleString()}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 跨工作区引用 */}
        {activeTab === "traces" && traceRefs.length > 0 && (
          <div style={modalSectionStyle}>
            {traceRefs.map((r, i) => (
              <div key={i} style={modalMetaLineStyle}>
                {`${r.taskId} @ ${r.workspacePath}${r.note ? ` — ${r.note}` : ""}`}
              </div>
            ))}
          </div>
        )}

        {/* 动态：完整检查点历史，from→to 不截断、可换行 */}
        {activeTab === "activity" && history.length > 0 && (
          <div style={modalSectionStyle}>
            {history.map((c, i) => (
              <div key={i} style={modalHistoryLineStyle}>
                {`${new Date(c.at).toLocaleString()} · ${c.field}: ${fmtCheckpointValue(c.from, 0)} → ${fmtCheckpointValue(c.to, 0)}`}
              </div>
            ))}
          </div>
        )}

        {/* 底部 */}
        <div style={modalFooterStyle}>
          <span>
            {`创建于 ${new Date(task.createdAt).toLocaleString()} · 更新于 ${new Date(task.updatedAt).toLocaleString()}`}
          </span>
          <button type="button" style={modalCloseBtnStyle} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
