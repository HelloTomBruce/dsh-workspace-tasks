import type { SelectedTask, ToastFn } from "./types.ts";
/** 任务详情弹窗：中台自足——看详情、读决策、待拍板直接批红，不用离开中台 */
export declare function TaskDetailModal({ sel, onClose, onResolved, toast, }: {
    sel: SelectedTask;
    onClose: () => void;
    onResolved: () => void;
    /** 操作失败反馈（成功由 onResolved 后的刷新体现） */
    toast?: ToastFn;
}): import("react").JSX.Element;
//# sourceMappingURL=TaskDetailModal.d.ts.map