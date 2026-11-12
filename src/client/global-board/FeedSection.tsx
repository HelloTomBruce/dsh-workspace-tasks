import type { ActivityEntry, DispatchLogItem } from "../../store/global.ts";
import { DISPATCH_STATUS_META, activityText } from "./utils.ts";
import { RowAction } from "./primitives.tsx";
import {
  dispatchBadgeStyle,
  feedEmptyStyle,
  feedItemStyle,
  feedPanelStyle,
  feedRowStyle,
  feedTextStyle,
  feedTimeStyle,
  feedTitleStyle,
  feedWsStyle,
  rowActionsStyle,
  rowIdStyle,
} from "./styles.ts";

/**
 * 中台动态流：左栏「最近动态」（跨工作区检查点+决策），右栏「派发记录」。
 * 观察模式的 would-dispatch / 待取件的 queued 条目可直接执行或忽略。
 */
export function FeedSection({
  activity,
  dispatches,
  onExecuteDispatch,
  onIgnoreDispatch,
}: {
  activity: ActivityEntry[];
  dispatches: DispatchLogItem[];
  onExecuteDispatch: (item: DispatchLogItem) => void;
  onIgnoreDispatch: (item: DispatchLogItem) => void;
}) {
  if (activity.length === 0 && dispatches.length === 0) return null;
  return (
    <div style={feedRowStyle}>
      {/* 左：最近动态 */}
      <div style={feedPanelStyle}>
        <div style={feedTitleStyle}>🕘 最近动态</div>
        {activity.length === 0 ? (
          <div style={feedEmptyStyle}>暂无动态</div>
        ) : (
          activity.map((a, i) => (
            <div
              key={`${a.taskId}-${a.at}-${i}`}
              style={feedItemStyle}
              title={`${a.wsTitle} · ${a.taskTitle}`}
            >
              <span style={feedTimeStyle}>{new Date(a.at).toLocaleTimeString()}</span>
              <span style={feedWsStyle}>{a.wsTitle}</span>
              <span style={rowIdStyle}>{a.taskId}</span>
              <span style={feedTextStyle}>{activityText(a)}</span>
            </div>
          ))
        )}
      </div>
      {/* 右：派发记录 */}
      <div style={feedPanelStyle}>
        <div style={feedTitleStyle}>📜 派发记录</div>
        {dispatches.length === 0 ? (
          <div style={feedEmptyStyle}>暂无派发记录</div>
        ) : (
          dispatches.map((item) => {
            const meta = DISPATCH_STATUS_META[item.record.status] ?? {
              icon: "?",
              label: item.record.status,
              color: "#94a3b8",
            };
            const actionable = item.record.status === "would-dispatch" || item.record.status === "queued";
            return (
              <div
                key={`${item.workspacePath}-${item.record.id}`}
                style={feedItemStyle}
                title={`${item.wsTitle} · ${item.record.taskTitle ?? item.record.taskId}`}
              >
                <span style={dispatchBadgeStyle(meta.color)}>{`${meta.icon} ${meta.label}`}</span>
                <span style={feedWsStyle}>{item.wsTitle}</span>
                <span style={rowIdStyle}>{item.record.taskId}</span>
                <span style={feedTextStyle}>{`hop${item.record.hop}`}</span>
                {actionable && (
                  <span style={rowActionsStyle}>
                    <RowAction label="执行" title="立即派发该任务给 Agent" onClick={() => onExecuteDispatch(item)} />
                    <RowAction label="忽略" title="忽略该条派发（不执行任务）" onClick={() => onIgnoreDispatch(item)} />
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
