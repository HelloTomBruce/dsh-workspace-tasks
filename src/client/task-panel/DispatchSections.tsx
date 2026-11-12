import type { DispatchLogEntry, DispatchRuleInfo } from "./hooks.ts";
import {
  dispatchLogEmptyStyle,
  dispatchLogHopStyle,
  dispatchLogPanelStyle,
  dispatchLogRowStyle,
  dispatchLogTaskStyle,
  dispatchLogTimeStyle,
  dispatchLogTitleStyle,
  dispatchLogTriggerStyle,
  dispatchStatusBadgeStyle,
  menuDividerStyle,
  menuHeaderStyle,
  menuItemStyle,
} from "./styles.ts";

// ---------------- 自动派发区（三态开关 / 跨工作区开关 / 派发记录） ----------------

// 自动派发：模式切换（三态：👁️观察 / ⚡自动 / ⏸️关闭）——「⋯ 更多」菜单内的区块
export function DispatchModeMenuItems({
  rules,
  onSetMode,
}: {
  rules: DispatchRuleInfo;
  onSetMode: (mode: "observe" | "auto" | "off") => void;
}) {
  return (
    <>
      <div style={menuHeaderStyle}>
        {`自动派发 · 优先级 ${(rules.priorities ?? []).join("/") || "全部"} · 并发 ${rules.maxConcurrent}${
          rules.tagsExclude?.length ? ` · 排除 ${rules.tagsExclude.join(",")}` : ""
        }`}
      </div>
      {(["observe", "auto", "off"] as const).map((m) => (
        <button
          key={m}
          type="button"
          style={menuItemStyle(rules.mode === m)}
          title={
            m === "observe"
              ? "观察模式：任务完成后只记录「本会派发什么」，不自动发送（验证规则靠谱后再切自动）"
              : m === "auto"
              ? "自动模式：任务完成后自动派发下一个就绪任务（并发上限内）"
              : "关闭自动派发"
          }
          onClick={() => onSetMode(m)}
        >
          {m === "observe" ? "👁️ 观察模式" : m === "auto" ? "⚡ 自动派发" : "⏸️ 关闭派发"}
          {rules.mode === m ? " ✓" : ""}
        </button>
      ))}
      <div style={menuDividerStyle} />
    </>
  );
}

// 跨工作区派发开关菜单项（插件配置，宿主持久化；点击即 POST 立即生效）
export function CrossWorkspaceMenuItem({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      style={menuItemStyle(on)}
      title="跨工作区派发：开启后执行器轮询全部工作区的派发队列（默认只盯当前工作区）。立即生效，无需重启"
      onClick={onToggle}
    >
      🌐 跨工作区派发
      {on ? " ✓" : ""}
    </button>
  );
}

// 自动派发记录（最近 20 条，可折叠）
export function DispatchLogSection({ log }: { log: DispatchLogEntry[] }) {
  return (
    <div style={dispatchLogPanelStyle}>
      <div style={dispatchLogTitleStyle}>
        {`📜 自动派发记录（最近 ${Math.min(log.length, 20)} 条）`}
      </div>
      {log.length === 0
        ? <div style={dispatchLogEmptyStyle}>暂无派发记录——任务完成后引擎会按规则记录在这里</div>
        : log.slice(0, 20).map((entry) => (
            <div key={entry.id} style={dispatchLogRowStyle}>
              <span style={dispatchLogTimeStyle}>
                {new Date(entry.createdAt).toLocaleString()}
              </span>
              <span style={dispatchLogTaskStyle} title={entry.taskTitle ?? entry.taskId}>
                {`${entry.taskId}${entry.taskTitle ? `「${entry.taskTitle}」` : ""}`}
              </span>
              {entry.triggerTaskId &&
                <span style={dispatchLogTriggerStyle}>{`← ${entry.triggerTaskId}`}</span>}
              <span style={dispatchLogHopStyle}>{`hop ${entry.hop}`}</span>
              <span style={dispatchStatusBadgeStyle(entry.status)}>
                {entry.status === "queued"
                  ? "⏳ 排队中"
                  : entry.status === "sent"
                  ? "✓ 已发送"
                  : entry.status === "failed"
                  ? "✕ 失败"
                  : entry.status === "ignored"
                  ? "— 已忽略"
                  : entry.status === "tripped"
                  ? "🛑 已熔断"
                  : "👁️ 会派发"}
              </span>
            </div>
          ))}
    </div>
  );
}
