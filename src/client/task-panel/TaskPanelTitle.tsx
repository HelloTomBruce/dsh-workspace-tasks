import { TaskTabIcon } from "../icons.tsx";
import { useTasks } from "./hooks.ts";
import { inProgressBadgeStyle, titleWrapperStyle } from "./styles.ts";
import { useActiveWorkspace } from "./workspace.ts";

// ---------------- 面板标题（侧栏 Tab 标题：名称 + 进行中计数徽标） ----------------

export function TaskPanelTitle(props?: { sessionId?: string; useTabInfo?: () => any }) {
  const workspace = useActiveWorkspace(props?.sessionId);
  const { summary } = useTasks(workspace.path);
  return (
    <span style={titleWrapperStyle}>
      <TaskTabIcon style={{ marginRight: 6 }} />
      <span>工作区任务</span>
      {summary.inProgress > 0 && (
        <span style={inProgressBadgeStyle}>{String(summary.inProgress)}</span>
      )}
    </span>
  );
}
