/**
 * 工作区任务看板（右侧栏面板）——re-export 壳。
 * 实现已拆分为 task-panel/ 模块目录（JSX 化）：
 *   styles.ts（样式）/ workspace.ts（活跃工作区解析）/ hooks.ts（数据轮询 hooks）/
 *   banners.tsx（顶部横幅）/ DispatchSections.tsx（派发区）/ TaskCard.tsx /
 *   ExportReportModal.tsx / CreateTaskModal.tsx /
 *   TaskPanelBody.tsx（主面板）/ TaskPanelTitle.tsx（标题）
 * 本文件保持 `client/index.ts` 的导入路径稳定。
 */
export { TaskPanelBody } from "./task-panel/TaskPanelBody.js";
export { TaskPanelTitle } from "./task-panel/TaskPanelTitle.js";
export { findBestMatchingWorkspace, resolveActiveWorkspace, useActiveWorkspace, } from "./task-panel/workspace.js";
//# sourceMappingURL=TaskPanel.js.map