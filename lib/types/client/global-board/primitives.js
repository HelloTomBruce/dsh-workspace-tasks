import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { emptyStateIconStyle, emptyStateStyle, emptyStateSubStyle, emptyStateTitleStyle, groupFlashStyle, groupLabelStyle, groupStyle, rowActionArmedStyle, rowActionBtnStyle, rowActionsStyle, rowExtraStyle, rowIdStyle, rowStyle, rowTitleStyle, } from "./styles.js";
/**
 * 中台基础组件：行内动作按钮 / 任务行 / 分组容器 / 空态。
 * 全部 JSX，无业务逻辑——业务动作经 props 回调注入。
 */
/** 行内小动作按钮：嵌在行容器内，stopPropagation 防止触发行点击（开详情弹窗） */
export function RowAction({ label, title, onClick, }) {
    return (_jsx("button", { type: "button", style: rowActionBtnStyle, title: title, onClick: (e) => {
            e.stopPropagation();
            onClick();
        }, children: label }));
}
/**
 * 危险操作二次确认按钮：第一次点击进入武装态（红色「再点一次确认」，3s 不点自动复位），
 * 第二次点击才真正执行——替代原生 confirm()，不阻塞渲染、不打断浏览动线。
 */
export function ConfirmRowAction({ label, confirmLabel, title, onConfirm, }) {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed)
            return;
        const timer = setTimeout(() => setArmed(false), 3000);
        return () => clearTimeout(timer);
    }, [armed]);
    return (_jsx("button", { type: "button", style: armed ? rowActionArmedStyle : rowActionBtnStyle, title: title, onClick: (e) => {
            e.stopPropagation();
            if (!armed) {
                setArmed(true);
                return;
            }
            setArmed(false);
            onConfirm();
        }, children: armed ? confirmLabel : label }));
}
export function TaskRow({ task, extra, actions, onOpen, }) {
    return (_jsxs("div", { role: "button", tabIndex: 0, style: rowStyle, title: `查看 ${task.id} 详情`, onClick: onOpen, onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
            }
        }, children: [_jsx("span", { style: rowIdStyle, children: task.id }), _jsx("span", { style: rowTitleStyle, children: task.title }), extra && _jsx("span", { style: rowExtraStyle, children: extra }), actions && _jsx("span", { style: rowActionsStyle, children: actions })] }));
}
export function Group({ icon, label, count, color, action, groupKind, flash, children, }) {
    if (count === 0)
        return null;
    return (_jsxs("div", { style: { ...groupStyle, ...(flash ? groupFlashStyle(color) : null) }, "data-group": groupKind, children: [_jsxs("div", { style: {
                    ...groupLabelStyle,
                    color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                }, children: [_jsx("span", { children: `${icon} ${label} (${count})` }), action] }), children] }));
}
/** 设计化空态/加载态：大图标 + 标题 + 引导文案 */
export function EmptyState({ icon, title, sub }) {
    return (_jsxs("div", { style: emptyStateStyle, children: [_jsx("div", { style: emptyStateIconStyle, children: icon }), _jsx("div", { style: emptyStateTitleStyle, children: title }), sub && _jsx("div", { style: emptyStateSubStyle, children: sub })] }));
}
//# sourceMappingURL=primitives.js.map