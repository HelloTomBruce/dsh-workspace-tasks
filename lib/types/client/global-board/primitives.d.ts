import type { ReactNode } from "react";
import type { ProjectTask } from "../../store/types.ts";
/**
 * 中台基础组件：行内动作按钮 / 任务行 / 分组容器 / 空态。
 * 全部 JSX，无业务逻辑——业务动作经 props 回调注入。
 */
/** 行内小动作按钮：嵌在行容器内，stopPropagation 防止触发行点击（开详情弹窗） */
export declare function RowAction({ label, title, onClick, }: {
    label: string;
    title: string;
    onClick: () => void;
}): import("react").JSX.Element;
/**
 * 危险操作二次确认按钮：第一次点击进入武装态（红色「再点一次确认」，3s 不点自动复位），
 * 第二次点击才真正执行——替代原生 confirm()，不阻塞渲染、不打断浏览动线。
 */
export declare function ConfirmRowAction({ label, confirmLabel, title, onConfirm, }: {
    label: string;
    confirmLabel: string;
    title: string;
    onConfirm: () => void;
}): import("react").JSX.Element;
export declare function TaskRow({ task, extra, actions, onOpen, }: {
    task: ProjectTask;
    /** 行尾附加信息（文本或元素，如进行中 spinner + 锁信息） */
    extra?: ReactNode;
    /** 行尾动作按钮（RowAction 列表），点击不触发行跳转 */
    actions?: ReactNode;
    onOpen: () => void;
}): import("react").JSX.Element;
export declare function Group({ icon, label, count, color, action, groupKind, flash, children, }: {
    icon: string;
    label: string;
    count: number;
    color: string;
    /** 分组标题行右侧的批量动作（如「全部归档」） */
    action?: ReactNode;
    /** 定位锚点标识：顶部计数 chip 点击时据此滚动定位 */
    groupKind?: string;
    /** 顶部 chip 定位后的短暂高亮 */
    flash?: boolean;
    children?: ReactNode;
}): import("react").JSX.Element | null;
/** 设计化空态/加载态：大图标 + 标题 + 引导文案 */
export declare function EmptyState({ icon, title, sub }: {
    icon: string;
    title: string;
    sub?: string;
}): import("react").JSX.Element;
//# sourceMappingURL=primitives.d.ts.map