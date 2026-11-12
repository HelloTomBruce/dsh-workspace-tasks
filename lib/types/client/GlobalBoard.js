/**
 * 任务中台（跨工作区全局看板）——re-export 壳。
 * 实现已拆分为 global-board/ 模块目录（JSX 化）：
 *   styles.ts（样式）/ utils.ts（纯逻辑）/ types.ts（props 契约）/
 *   primitives.tsx（行/分组/空态）/ TaskDetailModal.tsx / WorkspaceCard.tsx /
 *   FeedSection.tsx / GlobalBoardPanel.tsx（主面板）
 * 本文件保持 `client/index.ts` 的导入路径稳定。
 */
export { GlobalBoardPanel } from "./global-board/GlobalBoardPanel.js";
//# sourceMappingURL=GlobalBoard.js.map