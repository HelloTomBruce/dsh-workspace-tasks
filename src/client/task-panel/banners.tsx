import type { ApprovalRequest, ProjectTask } from "../../store/types.ts";
import type { DispatchLogEntry } from "./hooks.ts";
import {
  approvalActionBtnStyle,
  approvalBannerStyle,
  observeBannerStyle,
  observeEntryRowStyle,
  observeIgnoreBtnStyle,
  observeRunBtnStyle,
  readyActionBtnStyle,
  readyBannerStyle,
  staleBannerStyle,
  trippedBannerStyle,
} from "./styles.ts";

// ---------------- 顶部横幅（待拍板 / 熔断 / 停滞 / 观察 / 就绪） ----------------

// 派发链熔断告警（最严重，置顶）：TTL 超 8 层自动熔断，目标已转 blocked 等人处置
export function TrippedBanner({
  entries,
  onNavigateToTask,
  onIgnore,
}: {
  entries: DispatchLogEntry[];
  onNavigateToTask: (taskId: string) => void;
  onIgnore: (id: string) => void;
}) {
  return (
    <div style={trippedBannerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "11.5px", color: "#dc2626" }}>
        <span style={{ fontSize: "14px" }}>🛑</span>
        <span>
          {`派发链熔断：${entries.length} 条链路超过 8 层已自动停派（目标已转阻塞，需人工处置）`}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
        {entries.slice(0, 3).map((entry) => (
          <div key={entry.id} style={observeEntryRowStyle}>
            <span style={{ fontSize: "11.5px" }}>
              {`「${entry.taskTitle ?? entry.taskId}」 @ ${entry.taskId} · hop ${entry.hop}${entry.triggerTaskId ? ` · 链自 ${entry.triggerTaskId}` : ""}`}
            </span>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                style={observeRunBtnStyle}
                title="定位到该任务卡片处置（可改回 todo 重新入队）"
                onClick={() => onNavigateToTask(entry.taskId)}
              >
                去处理
              </button>
              <button
                type="button"
                style={observeIgnoreBtnStyle}
                title="确认已知悉，消除此告警"
                onClick={() => onIgnore(entry.id)}
              >
                知道了
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 停滞提醒（Watchdog）：in_progress 超过阈值无新检查点
export function StaleBanner({
  tasks,
  staleHours,
  onNavigateToTask,
  onDemoteToTodo,
}: {
  tasks: ProjectTask[];
  staleHours: number;
  onNavigateToTask: (taskId: string) => void;
  onDemoteToTodo: (taskId: string) => void;
}) {
  return (
    <div style={staleBannerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "11.5px", color: "#b45309" }}>
        <span style={{ fontSize: "14px" }}>⏰</span>
        <span>
          {`${tasks.length} 个任务疑似停滞（进行中超过 ${staleHours} 小时无新进展）——Agent 可能已中断`}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
        {tasks.slice(0, 3).map((t) => (
          <div key={t.id} style={observeEntryRowStyle}>
            <span style={{ fontSize: "11.5px" }}>
              {`「${t.title}」 @ ${t.id}${t.claim ? ` · 持锁 ${t.claim.owner}` : ""}`}
            </span>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                style={observeIgnoreBtnStyle}
                title="查看任务卡片"
                onClick={() => onNavigateToTask(t.id)}
              >
                查看
              </button>
              <button
                type="button"
                style={observeRunBtnStyle}
                title="降级回待办，释放后重新进入就绪队列（同时释放认领锁）"
                onClick={() => onDemoteToTodo(t.id)}
              >
                ↩️ 降级回待办
              </button>
            </div>
          </div>
        ))}
        {tasks.length > 3 &&
          <div style={{ fontSize: 10.5, color: "#b45309", paddingLeft: 8 }}>{`…还有 ${tasks.length - 3} 个停滞任务`}</div>}
      </div>
    </div>
  );
}

// 待拍板横幅（票拟→批红：人只在需要拍板时被打扰）
export function ApprovalBanner({
  pendingApprovals,
  onNavigateToTask,
}: {
  pendingApprovals: Array<{ task: ProjectTask; approval: ApprovalRequest }>;
  onNavigateToTask: (taskId: string) => void;
}) {
  return (
    <div style={approvalBannerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "11.5px", color: "#d97706" }}>
        <span style={{ fontSize: "14px" }}>🔔</span>
        <span>
          {"待拍板：有 "}
          <strong>{`${pendingApprovals.length}`}</strong>
          {" 项决策请求等待你批红"}
          {pendingApprovals[0]
            ? `（最早：「${pendingApprovals[0].approval.title}」 @ ${pendingApprovals[0].task.id}）`
            : ""}
        </span>
      </div>
      <button
        type="button"
        onClick={() => pendingApprovals[0] && onNavigateToTask(pendingApprovals[0].task.id)}
        style={approvalActionBtnStyle}
        title={
          pendingApprovals[0]
            ? `定位到 [${pendingApprovals[0].task.id}] 的批红卡片：「${pendingApprovals[0].approval.title}」`
            : "定位到待批任务"
        }
      >
        {pendingApprovals[0] ? `🖋️ 去批红 ${pendingApprovals[0].task.id}` : "🖋️ 去批红"}
      </button>
    </div>
  );
}

// 观察模式横幅：引擎「本会派发」的记录，人确认后一键执行或忽略
export function ObserveBanner({
  log,
  onExecute,
  onIgnore,
}: {
  log: DispatchLogEntry[];
  onExecute: (entry: DispatchLogEntry) => void;
  onIgnore: (id: string) => void;
}) {
  return (
    <div style={observeBannerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "11.5px", color: "#7c3aed" }}>
        <span style={{ fontSize: "14px" }}>👁️</span>
        <span>
          {`观察模式：本会派发 ${log.filter((e) => e.status === "would-dispatch").length} 个任务（验证判断靠谱后可切「⚡ 自动」）`}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
        {log
          .filter((e) => e.status === "would-dispatch")
          .slice(0, 3)
          .map((entry) => (
            <div key={entry.id} style={observeEntryRowStyle}>
              <span style={{ fontSize: "11.5px" }}>
                {`「${entry.taskTitle ?? entry.taskId}」 @ ${entry.taskId} · hop ${entry.hop}`}
              </span>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  style={observeRunBtnStyle}
                  title="立即派发该任务给 Agent（并标记为已发送）"
                  onClick={() => onExecute(entry)}
                >
                  ⚡ 立即执行
                </button>
                <button
                  type="button"
                  style={observeIgnoreBtnStyle}
                  title="忽略本次观察记录（忽略后该任务可被引擎重新观察）"
                  onClick={() => onIgnore(entry.id)}
                >
                  忽略
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// 就绪任务快捷横幅
export function ReadyBanner({
  readyTasks,
  onDispatch,
}: {
  readyTasks: ProjectTask[];
  onDispatch: () => void;
}) {
  return (
    <div style={readyBannerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "11.5px", color: "#059669" }}>
        <span style={{ fontSize: "14px" }}>🎯</span>
        <span>
          {"依赖已就绪：当前有 "}
          <strong>{`${readyTasks.length}`}</strong>
          {" 个任务就绪可执行"}
        </span>
      </div>
      <button
        type="button"
        onClick={onDispatch}
        style={readyActionBtnStyle}
        title={
          readyTasks[0]
            ? `立即派发下一个就绪任务 [${readyTasks[0].id}]: "${readyTasks[0].title}"`
            : "立即执行就绪任务"
        }
      >
        {readyTasks[0] ? `⚡ 立即执行 ${readyTasks[0].id}` : "⚡ 立即执行"}
      </button>
    </div>
  );
}
