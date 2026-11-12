import { useState } from "react";
import type { ProjectTask } from "../../store/types.ts";
import type { WorkspaceOverview } from "../../store/global.ts";
import type { WorkspaceCardHandlers } from "./types.ts";
import { claimLabel, dispatchModeBadge, navigateToWorkspaceBoard } from "./utils.ts";
import { ConfirmRowAction, Group, RowAction, TaskRow } from "./primitives.tsx";
import {
  cardHeaderStyle,
  cardStyle,
  cardSubStyle,
  cardTitleBtnStyle,
  cardTitleStyle,
  collapsedDoneBtnStyle,
  collapsedDoneRowStyle,
  groupFlashStyle,
  groupStyle,
  modeDotStyle,
  moreStyle,
  rowActionsStyle,
  rowExtraStyle,
  rowIdStyle,
  rowStyle,
  rowTitleStyle,
  spinnerStyle,
} from "./styles.ts";

export function WorkspaceCard({
  ws,
  onOpenTask,
  handlers,
  flashGroup,
}: {
  ws: WorkspaceOverview;
  onOpenTask: (t: ProjectTask) => void;
  handlers: WorkspaceCardHandlers;
  /** 顶部计数 chip 定位命中的分组 kind，命中卡片对应分组短暂高亮 */
  flashGroup?: string | null;
}) {
  // 待归档默认折叠（低注意力分组），点击展开明细
  const [doneExpanded, setDoneExpanded] = useState(false);

  if (ws.dangling) {
    return (
      <div style={{ ...cardStyle, opacity: 0.7, borderStyle: "dashed" }}>
        <div style={cardTitleStyle}>{`⚠️ ${ws.title}`}</div>
        <div style={cardSubStyle}>
          {`存储文件损坏或不可读：${ws.fileName}（已降级跳过，不影响其他工作区）`}
        </div>
      </div>
    );
  }

  const modeBadge = dispatchModeBadge(ws.dispatchMode);
  const flash = (kind: string) => flashGroup === kind;

  return (
    <div style={cardStyle}>
      {/* 卡片头：派发模式色点（hover 出详情） + 标题（点击跳右栏看板） */}
      <div style={cardHeaderStyle}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={modeDotStyle(ws.dispatchMode)} title={`自动派发：${modeBadge.label}`} />
          <button
            type="button"
            style={cardTitleBtnStyle}
            title={`打开 ${ws.workspacePath} 的任务看板`}
            onClick={() => navigateToWorkspaceBoard(ws.workspacePath)}
          >
            {`📁 ${ws.title}`}
          </button>
        </span>
      </div>
      <div style={cardSubStyle}>
        {`共 ${ws.summary.total} 项 · 进行中 ${ws.summary.inProgress} · 阻塞 ${ws.summary.blocked}`}
      </div>

      {/* 分组顺序 = 人的注意力优先级：待拍板 → 阻塞 → 待验收 → 进行中 → 就绪 → 待归档（折叠） */}
      {/* 待拍板：票拟标题直接列出，点击弹窗内批红 */}
      <Group icon="🔔" label="待拍板" count={ws.pendingApprovals.length} color="#d97706" groupKind="approvals" flash={flash("approvals")}>
        {ws.pendingApprovals.map((p) => (
          <button
            type="button"
            key={p.approval.id}
            style={{ ...rowStyle, borderLeft: "2px solid #d97706" }}
            title={`查看并批红：${p.approval.title}`}
            onClick={() => onOpenTask(p.task)}
          >
            <span style={rowIdStyle}>{p.taskId}</span>
            <span style={rowTitleStyle}>{`「${p.approval.title}」`}</span>
            <span style={rowExtraStyle}>去批红 →</span>
          </button>
        ))}
      </Group>

      <Group icon="🔒" label="阻塞" count={ws.blocked.length} color="#ef4444" groupKind="blocked" flash={flash("blocked")}>
        {ws.blocked.map((t) => (
          <TaskRow key={t.id} task={t} onOpen={() => onOpenTask(t)} />
        ))}
      </Group>

      <Group icon="🔍" label="待验收" count={ws.review.length} color="#7c3aed" groupKind="review" flash={flash("review")}>
        {ws.review.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            actions={[
              <RowAction
                key="pass"
                label="✓ 通过"
                title="验收通过，置为已完成"
                onClick={() => handlers.onReview(ws, t, true)}
              />,
              <RowAction
                key="bounce"
                label="↩ 打回"
                title="打回重做，置为进行中"
                onClick={() => handlers.onReview(ws, t, false)}
              />,
            ]}
            onOpen={() => onOpenTask(t)}
          />
        ))}
      </Group>

      <Group icon="⚡" label="进行中" count={ws.inProgress.length} color="#2563eb" groupKind="inProgress" flash={flash("inProgress")}>
        {ws.inProgress.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            // 进行中：旋转 spinner 让人一眼看到「有活在跑」，后接锁信息
            extra={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                <span style={spinnerStyle} title="进行中" />
                {claimLabel(t)}
              </span>
            }
            // 死锁/过期锁人力兜底：二次点击确认后强制释放，与右栏看板同一 REST
            actions={
              t.claim ? (
                <ConfirmRowAction
                  label="🔓 释放"
                  confirmLabel="确认释放？"
                  title={`强制释放 ${t.claim.owner} 的认领锁（需二次确认）`}
                  onConfirm={() => handlers.onRelease(ws, t)}
                />
              ) : undefined
            }
            onOpen={() => onOpenTask(t)}
          />
        ))}
      </Group>

      <Group icon="🎯" label="就绪可派发" count={ws.readyPreview.count} color="#059669" groupKind="ready" flash={flash("ready")}>
        {ws.readyPreview.tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            extra={`[${t.priority}]`}
            // 中台直接派发：统一派发通道注入提示词 + 置 in_progress 触发认领锁
            actions={
              <RowAction
                label="⚡ 交给 Agent"
                title="后台派发提示词给 Agent 并置为进行中"
                onClick={() => handlers.onDispatch(ws, t)}
              />
            }
            onOpen={() => onOpenTask(t)}
          />
        ))}
        {ws.readyPreview.count > 3 && (
          <div style={moreStyle}>{`…还有 ${ws.readyPreview.count - 3} 个就绪`}</div>
        )}
      </Group>

      {/* 待归档：默认折叠为单行计数，展开后可逐条/全部归档 */}
      {ws.done.length > 0 &&
        (doneExpanded ? (
          <Group
            icon="✅"
            label="已完成待归档"
            count={ws.done.length}
            color="#059669"
            groupKind="done"
            flash={flash("done")}
            action={
              <span style={rowActionsStyle}>
                <RowAction
                  label="📦 全部归档"
                  title={`归档 ${ws.title} 全部 ${ws.done.length} 项已完成任务`}
                  onClick={() => handlers.onArchiveAll(ws)}
                />
                <RowAction label="收起 ▾" title="收起已完成列表" onClick={() => setDoneExpanded(false)} />
              </span>
            }
          >
            {ws.done.slice(0, 5).map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                actions={
                  <RowAction
                    label="📦 归档"
                    title="归档该任务（从看板移除，数据保留）"
                    onClick={() => handlers.onArchive(ws, t)}
                  />
                }
                onOpen={() => onOpenTask(t)}
              />
            ))}
            {ws.done.length > 5 && (
              <div style={moreStyle}>{`…还有 ${ws.done.length - 5} 项已完成`}</div>
            )}
          </Group>
        ) : (
          <div
            style={{ ...groupStyle, ...(flash("done") ? groupFlashStyle("#059669") : null) }}
            data-group="done"
          >
            <div style={collapsedDoneRowStyle}>
              <button
                type="button"
                style={collapsedDoneBtnStyle}
                title="展开已完成明细"
                onClick={() => setDoneExpanded(true)}
              >
                {`✅ ${ws.done.length} 项已完成待归档 ▸`}
              </button>
              <RowAction
                label="📦 全部归档"
                title={`归档 ${ws.title} 全部 ${ws.done.length} 项已完成任务`}
                onClick={() => handlers.onArchiveAll(ws)}
              />
            </div>
          </div>
        ))}
    </div>
  );
}
