import type { ActivityEntry, DispatchLogItem } from "../../store/global.ts";
/**
 * 中台动态流：左栏「最近动态」（跨工作区检查点+决策），右栏「派发记录」。
 * 观察模式的 would-dispatch / 待取件的 queued 条目可直接执行或忽略。
 */
export declare function FeedSection({ activity, dispatches, onExecuteDispatch, onIgnoreDispatch, }: {
    activity: ActivityEntry[];
    dispatches: DispatchLogItem[];
    onExecuteDispatch: (item: DispatchLogItem) => void;
    onIgnoreDispatch: (item: DispatchLogItem) => void;
}): import("react").JSX.Element | null;
//# sourceMappingURL=FeedSection.d.ts.map