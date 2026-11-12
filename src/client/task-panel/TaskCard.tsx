import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import type { ProjectTask, TaskPriority, TaskStatus, TraceRef } from "../../store/types.ts";
import { openWorkspaceFileViaDsh } from "../dsh-open.ts";
import { dispatchPromptToAgent, notifyApprovalResolved } from "../dispatch-agent.ts";
import { MarkdownContent } from "../markdown.tsx";
import { decisionChipStyle, traceChipStyle, TraceSections } from "../TraceSections.tsx";
import { API_BASE } from "./hooks.ts";
import {
  addConcFormStyle,
  appendConcBtnStyle,
  approvalCardDetailStyle,
  approvalCardMetaStyle,
  approvalCardStyle,
  approvalCardTitleStyle,
  approvalOptionBtnStyle,
  approvalOptionsRowStyle,
  approvalRejectBtnStyle,
  archiveBtnStyle,
  assignBtnStyle,
  assigneeBadgeStyle,
  cancelBtnStyle,
  cardDescStyle,
  cardFooterStyle,
  cardHeaderStyle,
  cardMetaStyle,
  cardRightActionsStyle,
  cardTitleStyle,
  claimChipStyle,
  claimReleaseBtnStyle,
  concBlockStyle,
  concLabelStyle,
  concListStyle,
  concSummaryStyle,
  concTimeStyle,
  conclusionDrawerStyle,
  conclusionItemStyle,
  deleteBtnStyle,
  deliverableActionStyle,
  deliverableLiStyle,
  deliverablePathStyle,
  depChipStyle,
  depsLabelStyle,
  depsRowStyle,
  insightLiStyle,
  primaryBtnStyle,
  readyBadgeStyle,
  tagChipStyle,
  tagsRowStyle,
  taskCardStyle,
  taskIdStyle,
  textAreaStyle,
  timeStyle,
  toggleExpandBtnStyle,
} from "./styles.ts";

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
  { id: "archived", label: "已归档", color: "#475569", bg: "rgba(71, 85, 105, 0.14)" },
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

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={(e: any) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        style={{
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
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: current.color,
          }}
        />
        {current.label}
        <span style={{ fontSize: "8px", opacity: 0.7, marginLeft: 1 }}>▼</span>
      </button>
      {open && (
        <div
          onClick={(e: any) => e.stopPropagation()}
          style={{
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
          }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.id}
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
              style={{
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
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: opt.color,
                }}
              />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskCard({
  task,
  allTasks = [],
  workspacePath,
  workspaceId,
  isExpanded,
  isReady,
  onToggleExpand,
  onStatusChange,
  onDelete,
  onConclusionAdded,
  onNavigateToTask,
  onSelectTag,
  openFile,
}: {
  task: ProjectTask;
  allTasks?: ProjectTask[];
  workspacePath: string;
  workspaceId?: string;
  isExpanded: boolean;
  isReady?: boolean;
  onToggleExpand: () => void;
  onStatusChange: (status: TaskStatus) => void;
  onDelete: () => void;
  onConclusionAdded: () => void;
  onNavigateToTask?: (taskId: string) => void;
  onSelectTag?: (tag: string) => void;
  openFile?: (path: string, workspacePath?: string) => Promise<void>;
}) {
  const [showAddConc, setShowAddConc] = useState(false);
  const [concSummary, setConcSummary] = useState("");
  const [concDeliverables, setConcDeliverables] = useState("");
  const [concInsights, setConcInsights] = useState("");
  const [savingConc, setSavingConc] = useState(false);
  const [assignedStatus, setAssignedStatus] = useState<"dispatched" | "failed" | null>(null);
  const [openingFile, setOpeningFile] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState<Record<string, "opened" | "copied" | "missing" | "failed">>({});
  const [resolvedTraces, setResolvedTraces] = useState<TraceRef[] | null>(null);

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

  // 批红（批准）：选中选项 → 自动落一条不可改写的决策并恢复任务 → 唤醒原执行会话
  const handleResolveApproval = async (approvalId: string, optionId: string, optionLabel: string) => {
    if (resolvingApproval) return;
    if (!confirm(`批准选项「${optionLabel}」？\n此操作会记录一条不可改写的决策（含选项原话），并恢复任务执行。`)) return;
    setResolvingApproval(true);
    try {
      await fetch(`${API_BASE}/approval/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspacePath, taskId: task.id, approvalId, optionId, actor: "human" }),
      });
      // 审批反馈闭环：按认领锁 sessionHint 唤醒原执行会话，无需人再手动告知
      const wake = await notifyApprovalResolved({
        taskId: task.id,
        approvalTitle: pendingApproval?.title ?? "",
        approved: true,
        optionLabel,
        sessionHint: claim?.sessionHint,
        workspacePath,
      });
      if (wake !== "sent") {
        alert("已批红，但未能自动唤醒执行会话（会话可能已关闭），请手动告知 Agent 继续。");
      }
      onConclusionAdded();
    } catch (e) {
      console.error(e);
    } finally {
      setResolvingApproval(false);
    }
  };

  // 驳回：不落决策，任务保持 blocked 等待 Agent 重新规划（驳回同样唤醒，Agent 需要拿到备注）
  const handleRejectApproval = async (approvalId: string) => {
    if (resolvingApproval) return;
    if (!confirm("确定驳回这项请求吗？任务将保持阻塞，等待 Agent 重新规划。")) return;
    const note = prompt("驳回备注（可选）：") ?? "";
    setResolvingApproval(true);
    try {
      await fetch(`${API_BASE}/approval/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspacePath, taskId: task.id, approvalId, note }),
      });
      const wake = await notifyApprovalResolved({
        taskId: task.id,
        approvalTitle: pendingApproval?.title ?? "",
        approved: false,
        note,
        sessionHint: claim?.sessionHint,
        workspacePath,
      });
      if (wake !== "sent") {
        alert("已驳回，但未能自动通知执行会话（会话可能已关闭），请手动告知 Agent。");
      }
      onConclusionAdded();
    } catch (e) {
      console.error(e);
    } finally {
      setResolvingApproval(false);
    }
  };

  // 人力强制释放死锁（如持有锁的会话已崩溃/关闭）
  const handleForceRelease = async () => {
    if (!claim) return;
    if (!confirm(`确定强制释放 ${task.id} 上 ${claim.owner} 的认领锁吗？`)) return;
    try {
      await fetch(`${API_BASE}/release`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspacePath, taskId: task.id, owner: "human", force: true }),
      });
      onConclusionAdded();
    } catch (e) {
      console.error(e);
    }
  };

  // 展开且有跨工作区引用时，按需解析来源标题/结论摘要（悬挂降级由后端完成）
  useEffect(() => {
    if (!isExpanded || traceRefs.length === 0 || resolvedTraces) return;
    let alive = true;
    const query = `?taskId=${encodeURIComponent(task.id)}${workspacePath ? `&workspacePath=${encodeURIComponent(workspacePath)}` : ""}`;
    fetch(`${API_BASE}/trace${query}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; data?: TraceRef[] }>)
      .then((res) => {
        if (alive && res.ok && res.data) setResolvedTraces(res.data);
      })
      .catch(() => {});
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

  const handleOpenFile = async (relPath: string) => {
    const cleanRel = relPath.trim();
    if (!cleanRel) return;
    setOpeningFile(cleanRel);

    const dshCtx = (window as unknown as { __DSH_TASK_CLIENT_CTX__?: any }).__DSH_TASK_CLIENT_CTX__;
    const absPath =
      cleanRel.startsWith("/") || /^[A-Za-z]:[/\\]/.test(cleanRel) || cleanRel.startsWith("\\\\")
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
      } else {
        await openWorkspaceFileViaDsh(dshCtx, cleanRel, {
          workspacePath,
        });
        opened = true;
      }
    } catch (e) {
      console.warn("[dsh-workspace-tasks] DSH openResource failed:", e);
    }

    if (opened) {
      setFileStatus((prev) => ({ ...prev, [cleanRel]: "opened" }));
    } else {
      // 若 DSH 打开遇到异常，贴心复制路径到剪贴板兜底
      try {
        await navigator.clipboard.writeText(cleanRel);
      } catch {}
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
      const ok =
        typeof window !== "undefined" &&
        window.confirm(
          `【依赖未完成提示】\n任务 [${task.id}] 的前置依赖 [${depNames}] 尚未完成。\n\n是否仍要强制派发给 Agent 执行？`
        );
      if (!ok) return;
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

  return (
    <div id={`task-card-${task.id}`} style={taskCardStyle(task.status)}>
      {/* 卡片顶部条 */}
      <div style={cardHeaderStyle}>
        <div style={cardMetaStyle}>
          <span style={taskIdStyle}>{task.id}</span>
          <PriorityBadge priority={task.priority} />
          {isReady &&
            task.status !== "done" &&
            task.status !== "archived" && (
              <span style={readyBadgeStyle}>✓ 就绪</span>
            )}
          {task.assignee && <span style={assigneeBadgeStyle}>@{task.assignee}</span>}
        </div>
        <div style={cardRightActionsStyle}>
          <StatusDropdown status={task.status} onChange={onStatusChange} />
          <button
            onClick={onDelete}
            style={deleteBtnStyle}
            title="删除任务"
          >
            ×
          </button>
        </div>
      </div>

      {/* 依赖关系展示条 */}
      {task.dependsOn &&
        task.dependsOn.length > 0 && (
          <div style={depsRowStyle}>
            <span style={depsLabelStyle}>
              {hasUnmetDeps ? "🔒 前置依赖:" : "✓ 依赖已就绪:"}
            </span>
            {task.dependsOn.map((depId) => {
              const dep = allTasks.find((t) => t.id === depId);
              const isDone = dep?.status === "done";
              return (
                <button
                  type="button"
                  key={depId}
                  style={depChipStyle(isDone)}
                  title={
                    dep
                      ? `[${dep.id}] ${dep.title} (${dep.status}) - 点击定位`
                      : `${depId} (未在列表中找到) - 点击定位`
                  }
                  onClick={() => onNavigateToTask?.(depId)}
                >
                  {isDone ? `✓ ${depId}` : `⏳ ${depId}`}
                </button>
              );
            })}
          </div>
        )}

      {/* 标题 */}
      <div style={cardTitleStyle}>{task.title}</div>

      {/* 标签分类 (Tags) */}
      {task.tags &&
        task.tags.length > 0 && (
          <div style={tagsRowStyle}>
            {task.tags.map((tag) => (
              <button
                type="button"
                key={tag}
                style={tagChipStyle}
                title={`点击按标签 #${tag} 过滤`}
                onClick={(e: any) => {
                  e.stopPropagation();
                  onSelectTag?.(tag);
                }}
              >
                {`#${tag}`}
              </button>
            ))}
          </div>
        )}

      {/* 待拍板批红卡片（票拟：人点选即批红，自动落决策） */}
      {pendingApproval && (
        <div style={approvalCardStyle}>
          <div style={approvalCardTitleStyle}>
            <span style={{ fontSize: "13px" }}>🔔</span>
            <span>{`待拍板：${pendingApproval.title}`}</span>
          </div>
          {pendingApproval.detail &&
            <div style={approvalCardDetailStyle}>{pendingApproval.detail}</div>}
          <div style={approvalOptionsRowStyle}>
            {pendingApproval.options.map((opt) => (
              <button
                type="button"
                key={opt.id}
                disabled={resolvingApproval}
                style={approvalOptionBtnStyle}
                title={`批准「${opt.label}」：记录决策并恢复任务`}
                onClick={(e: any) => {
                  e.stopPropagation();
                  handleResolveApproval(pendingApproval.id, opt.id, opt.label);
                }}
              >
                {`✓ ${opt.label}`}
              </button>
            ))}
            <button
              type="button"
              disabled={resolvingApproval}
              style={approvalRejectBtnStyle}
              title="驳回：不落决策，任务保持阻塞，等待 Agent 重新规划"
              onClick={(e: any) => {
                e.stopPropagation();
                handleRejectApproval(pendingApproval.id);
              }}
            >
              ✕ 驳回
            </button>
          </div>
          <div style={approvalCardMetaStyle}>
            {`发起于 ${pendingApproval.createdAt.replace("T", " ").slice(0, 19)} · 批红后自动记录不可改写决策并恢复任务执行`}
          </div>
        </div>
      )}

      {/* 描述 (Markdown 渲染) */}
      {task.description && <MarkdownContent content={task.description} style={cardDescStyle} />}

      {/* 结论指示栏与操作 */}
      <div style={cardFooterStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onToggleExpand}
            style={toggleExpandBtnStyle}
          >
            {task.conclusions.length > 0
              ? `📝 ${task.conclusions.length} 条结论 ${isExpanded ? "▲" : "▼"}`
              : `📝 暂无结论 ${isExpanded ? "▲" : "▼"}`}
          </button>
          {decisions.length > 0 && (
            <span
              style={decisionChipStyle}
              title={decisions
                .map((d) => `${d.id}: ${d.title}${d.supersededBy ? `（已被 ${d.supersededBy} 取代）` : ""}`)
                .join("\n")}
            >
              {`⚖️ ${decisions.length} 决策`}
            </span>
          )}
          {traceRefs.length > 0 && (
            <span
              style={traceChipStyle}
              title={traceRefs.map((r) => `${r.taskId} @ ${r.workspacePath}`).join("\n")}
            >
              {`🔗 ${traceRefs.length} 引用`}
            </span>
          )}
          {claim && (
            <span
              style={claimChipStyle(claimActive)}
              title={
                claimActive
                  ? `认领者: ${claim.owner}\n认领时间: ${claim.claimedAt}\n租约到期: ${claim.leaseUntil}${claim.sessionHint ? `\n会话线索: ${claim.sessionHint}（可悬挂）` : ""}`
                  : `认领锁已过期（读取时惰性释放）\n原认领者: ${claim.owner}\n租约到期: ${claim.leaseUntil}`
              }
            >
              {claimActive ? `🔒 ${claim.owner} · 剩 ${claimRemainMin} 分钟` : `🔓 锁已过期`}
            </span>
          )}
          {claim && (
            <button
              type="button"
              style={claimReleaseBtnStyle}
              title="人力强制释放认领锁（如持锁会话已崩溃）"
              onClick={(e: any) => {
                e.stopPropagation();
                handleForceRelease();
              }}
            >
              ✕
            </button>
          )}
          {task.status !== "done" &&
            task.status !== "archived" && (
              <button
                type="button"
                onClick={handleAssignToAgent}
                style={assignBtnStyle(assignedStatus)}
                title={
                  hasUnmetDeps
                    ? `前置依赖 [${unmetDeps.join(", ")}] 尚未完成，点击可确认强制派发`
                    : "一键将任务派发给 Agent 执行"
                }
              >
                {assignedStatus === "dispatched"
                  ? "✓ 已发送给 Agent"
                  : assignedStatus === "failed"
                  ? "✕ 发送失败"
                  : hasUnmetDeps
                  ? "⚠️ 强制交给 Agent"
                  : "🤖 交给 Agent"}
              </button>
            )}
          {task.status === "done" && (
            <button
              type="button"
              onClick={() => onStatusChange("archived")}
              style={archiveBtnStyle}
              title="归档此任务，移出活跃任务列表，可在【已归档】中查看"
            >
              📦 归档
            </button>
          )}
          {task.status === "archived" && (
            <button
              type="button"
              onClick={() => onStatusChange("done")}
              style={archiveBtnStyle}
              title="恢复任务到已完成状态"
            >
              ↩ 恢复
            </button>
          )}
        </div>
        <span style={timeStyle}>
          {new Date(task.updatedAt).toLocaleDateString()}
        </span>
      </div>

      {/* 展开后的结论列表与添加框 */}
      {isExpanded && (
        <div style={conclusionDrawerStyle}>
          {task.conclusions.map((conc, idx) => (
            <div key={conc.id || idx} style={conclusionItemStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={concTimeStyle}>
                  {`完成于 ${new Date(conc.completedAt).toLocaleString()}`}
                </span>
              </div>
              <MarkdownContent content={conc.summary} style={concSummaryStyle} />
              {conc.deliverables &&
                conc.deliverables.length > 0 && (
                  <div style={concBlockStyle}>
                    <span style={concLabelStyle}>产出交付物 (点击通过 DSH 打开):</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {conc.deliverables.map((d, di) => {
                        const isOpening = openingFile === d;
                        const status = fileStatus[d];
                        return (
                          <button
                            type="button"
                            key={di}
                            style={deliverableLiStyle(status)}
                            title={
                              status === "opened"
                                ? `✓ 已在 DSH 侧边栏打开: ${d}`
                                : status === "failed"
                                ? `⚠️ DSH 打开未完成，已复制路径: ${d}`
                                : status === "copied"
                                ? `📋 已复制文件路径到剪贴板: ${d}`
                                : `点击在 DSH 中预览/打开: ${d}`
                            }
                            onClick={() => handleOpenFile(d)}
                          >
                            <span style={{ marginRight: 4 }}>
                              {isOpening ? "⏳" : status === "opened" ? "✓" : status === "failed" ? "⚠️" : status === "copied" ? "📋" : "📄"}
                            </span>
                            <span style={deliverablePathStyle}>{d}</span>
                            <span style={deliverableActionStyle(status)}>
                              {isOpening
                                ? "打开中…"
                                : status === "opened"
                                ? "已打开"
                                : status === "failed"
                                ? "打开失败(已复制)"
                                : status === "copied"
                                ? "已复制路径"
                                : "↗ 打开"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              {conc.insights &&
                conc.insights.length > 0 && (
                  <div style={concBlockStyle}>
                    <span style={concLabelStyle}>经验心得:</span>
                    <ul style={concListStyle}>
                      {conc.insights.map((ins, ii) => (
                        <li key={ii} style={insightLiStyle}>
                          <MarkdownContent content={ins} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          ))}

          {/* 添加结论区块 */}
          {showAddConc
            ? (
              <div style={addConcFormStyle}>
                <textarea
                  placeholder="执行结论总结（核心产出与解决要点）..."
                  value={concSummary}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setConcSummary(e.target.value)}
                  style={textAreaStyle}
                  rows={2}
                />
                <textarea
                  placeholder="交付物文件路径（每行一个文件路径，选填）"
                  value={concDeliverables}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setConcDeliverables(e.target.value)}
                  style={textAreaStyle}
                  rows={2}
                />
                <textarea
                  placeholder="关键经验/踩坑心得（每行一条，选填）"
                  value={concInsights}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setConcInsights(e.target.value)}
                  style={textAreaStyle}
                  rows={2}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                  <button
                    onClick={() => setShowAddConc(false)}
                    style={cancelBtnStyle}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleAddConclusion}
                    disabled={savingConc || !concSummary.trim()}
                    style={primaryBtnStyle}
                  >
                    {savingConc ? "保存中…" : "提交并标记完成"}
                  </button>
                </div>
              </div>
            )
            : (
              <button
                onClick={() => setShowAddConc(true)}
                style={appendConcBtnStyle}
              >
                + 追加执行结论
              </button>
            )}

          <TraceSections
            decisions={decisions}
            checkpoints={checkpoints}
            traceRefs={traceRefs}
            resolvedTraces={resolvedTraces}
            approvals={task.approvals}
          />
        </div>
      )}
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const colorMap = {
    P0: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444" },
    P1: { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b" },
    P2: { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6" },
  };
  const c = colorMap[priority] || colorMap.P1;
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: "600",
        padding: "1px 6px",
        borderRadius: "4px",
        backgroundColor: c.bg,
        color: c.text,
      }}
    >
      {priority}
    </span>
  );
}
