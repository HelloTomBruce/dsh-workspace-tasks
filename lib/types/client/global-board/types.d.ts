import type { ProjectTask } from "../../store/types.ts";
import type { WorkspaceOverview } from "../../store/global.ts";
/** 中台内部共享类型（组件间 props 契约） */
export interface SelectedTask {
    ws: WorkspaceOverview;
    task: ProjectTask;
}
export type ToastKind = "ok" | "err";
export type ToastFn = (text: string, kind: ToastKind) => void;
/** 中台动作回调：全部在 GlobalBoardPanel 实现（持有 toast 与 refresh），卡片只负责触发 */
export interface WorkspaceCardHandlers {
    onDispatch: (ws: WorkspaceOverview, t: ProjectTask) => void;
    onReview: (ws: WorkspaceOverview, t: ProjectTask, pass: boolean) => void;
    onArchive: (ws: WorkspaceOverview, t: ProjectTask) => void;
    onArchiveAll: (ws: WorkspaceOverview) => void;
    onRelease: (ws: WorkspaceOverview, t: ProjectTask) => void;
}
//# sourceMappingURL=types.d.ts.map