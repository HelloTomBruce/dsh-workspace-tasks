import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ProjectTask } from "../../store/types.ts";
import {
  emptyStateIconStyle,
  emptyStateStyle,
  emptyStateSubStyle,
  emptyStateTitleStyle,
  groupFlashStyle,
  groupLabelStyle,
  groupStyle,
  rowActionArmedStyle,
  rowActionBtnStyle,
  rowActionsStyle,
  rowExtraStyle,
  rowIdStyle,
  rowStyle,
  rowTitleStyle,
} from "./styles.ts";

/**
 * 中台基础组件：行内动作按钮 / 任务行 / 分组容器 / 空态。
 * 全部 JSX，无业务逻辑——业务动作经 props 回调注入。
 */

/** 行内小动作按钮：嵌在行容器内，stopPropagation 防止触发行点击（开详情弹窗） */
export function RowAction({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      style={rowActionBtnStyle}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

/**
 * 危险操作二次确认按钮：第一次点击进入武装态（红色「再点一次确认」，3s 不点自动复位），
 * 第二次点击才真正执行——替代原生 confirm()，不阻塞渲染、不打断浏览动线。
 */
export function ConfirmRowAction({
  label,
  confirmLabel,
  title,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  title: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      style={armed ? rowActionArmedStyle : rowActionBtnStyle}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

export function TaskRow({
  task,
  extra,
  actions,
  onOpen,
}: {
  task: ProjectTask;
  /** 行尾附加信息（文本或元素，如进行中 spinner + 锁信息） */
  extra?: ReactNode;
  /** 行尾动作按钮（RowAction 列表），点击不触发行跳转 */
  actions?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      style={rowStyle}
      title={`查看 ${task.id} 详情`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span style={rowIdStyle}>{task.id}</span>
      <span style={rowTitleStyle}>{task.title}</span>
      {extra && <span style={rowExtraStyle}>{extra}</span>}
      {actions && <span style={rowActionsStyle}>{actions}</span>}
    </div>
  );
}

export function Group({
  icon,
  label,
  count,
  color,
  action,
  groupKind,
  flash,
  children,
}: {
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
}) {
  if (count === 0) return null;
  return (
    <div
      style={{ ...groupStyle, ...(flash ? groupFlashStyle(color) : null) }}
      data-group={groupKind}
    >
      <div
        style={{
          ...groupLabelStyle,
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>{`${icon} ${label} (${count})`}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

/** 设计化空态/加载态：大图标 + 标题 + 引导文案 */
export function EmptyState({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={emptyStateStyle}>
      <div style={emptyStateIconStyle}>{icon}</div>
      <div style={emptyStateTitleStyle}>{title}</div>
      {sub && <div style={emptyStateSubStyle}>{sub}</div>}
    </div>
  );
}
