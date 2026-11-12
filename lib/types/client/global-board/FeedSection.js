import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { DISPATCH_STATUS_META, activityText } from "./utils.js";
import { RowAction } from "./primitives.js";
import { dispatchBadgeStyle, feedEmptyStyle, feedItemStyle, feedPanelStyle, feedRowStyle, feedTextStyle, feedTimeStyle, feedTitleStyle, feedWsStyle, rowActionsStyle, rowIdStyle, } from "./styles.js";
/**
 * 中台动态流：左栏「最近动态」（跨工作区检查点+决策），右栏「派发记录」。
 * 观察模式的 would-dispatch / 待取件的 queued 条目可直接执行或忽略。
 */
export function FeedSection({ activity, dispatches, onExecuteDispatch, onIgnoreDispatch, }) {
    if (activity.length === 0 && dispatches.length === 0)
        return null;
    return (_jsxs("div", { style: feedRowStyle, children: [_jsxs("div", { style: feedPanelStyle, children: [_jsx("div", { style: feedTitleStyle, children: "\uD83D\uDD58 \u6700\u8FD1\u52A8\u6001" }), activity.length === 0 ? (_jsx("div", { style: feedEmptyStyle, children: "\u6682\u65E0\u52A8\u6001" })) : (activity.map((a, i) => (_jsxs("div", { style: feedItemStyle, title: `${a.wsTitle} · ${a.taskTitle}`, children: [_jsx("span", { style: feedTimeStyle, children: new Date(a.at).toLocaleTimeString() }), _jsx("span", { style: feedWsStyle, children: a.wsTitle }), _jsx("span", { style: rowIdStyle, children: a.taskId }), _jsx("span", { style: feedTextStyle, children: activityText(a) })] }, `${a.taskId}-${a.at}-${i}`))))] }), _jsxs("div", { style: feedPanelStyle, children: [_jsx("div", { style: feedTitleStyle, children: "\uD83D\uDCDC \u6D3E\u53D1\u8BB0\u5F55" }), dispatches.length === 0 ? (_jsx("div", { style: feedEmptyStyle, children: "\u6682\u65E0\u6D3E\u53D1\u8BB0\u5F55" })) : (dispatches.map((item) => {
                        const meta = DISPATCH_STATUS_META[item.record.status] ?? {
                            icon: "?",
                            label: item.record.status,
                            color: "#94a3b8",
                        };
                        const actionable = item.record.status === "would-dispatch" || item.record.status === "queued";
                        return (_jsxs("div", { style: feedItemStyle, title: `${item.wsTitle} · ${item.record.taskTitle ?? item.record.taskId}`, children: [_jsx("span", { style: dispatchBadgeStyle(meta.color), children: `${meta.icon} ${meta.label}` }), _jsx("span", { style: feedWsStyle, children: item.wsTitle }), _jsx("span", { style: rowIdStyle, children: item.record.taskId }), _jsx("span", { style: feedTextStyle, children: `hop${item.record.hop}` }), actionable && (_jsxs("span", { style: rowActionsStyle, children: [_jsx(RowAction, { label: "\u6267\u884C", title: "\u7ACB\u5373\u6D3E\u53D1\u8BE5\u4EFB\u52A1\u7ED9 Agent", onClick: () => onExecuteDispatch(item) }), _jsx(RowAction, { label: "\u5FFD\u7565", title: "\u5FFD\u7565\u8BE5\u6761\u6D3E\u53D1\uFF08\u4E0D\u6267\u884C\u4EFB\u52A1\uFF09", onClick: () => onIgnoreDispatch(item) })] }))] }, `${item.workspacePath}-${item.record.id}`));
                    }))] })] }));
}
//# sourceMappingURL=FeedSection.js.map