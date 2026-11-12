import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { TaskTabIcon } from "../icons.js";
import { useTasks } from "./hooks.js";
import { inProgressBadgeStyle, titleWrapperStyle } from "./styles.js";
import { useActiveWorkspace } from "./workspace.js";
// ---------------- 面板标题（侧栏 Tab 标题：名称 + 进行中计数徽标） ----------------
export function TaskPanelTitle(props) {
    const workspace = useActiveWorkspace(props?.sessionId);
    const { summary } = useTasks(workspace.path);
    return (_jsxs("span", { style: titleWrapperStyle, children: [_jsx(TaskTabIcon, { style: { marginRight: 6 } }), _jsx("span", { children: "\u5DE5\u4F5C\u533A\u4EFB\u52A1" }), summary.inProgress > 0 && (_jsx("span", { style: inProgressBadgeStyle, children: String(summary.inProgress) }))] }));
}
//# sourceMappingURL=TaskPanelTitle.js.map