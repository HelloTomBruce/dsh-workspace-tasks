import type { CSSProperties } from "react";
import type { TaskStatus } from "../../store/types.ts";

/**
 * TaskPanel 全部样式定义。纯数据模块：从组件剥离，样式值与原 TaskPanel.tsx 逐字节一致。
 */

// ---------------- 样式定义 (自适应深浅主题规范) ----------------

export const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  backgroundColor: "var(--dsw-alias-bg-base, #ffffff)",
  color: "var(--dsw-alias-label-primary, #1e293b)",
  boxSizing: "border-box",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: "13px",
  overflow: "hidden",
};

export const titleWrapperStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontWeight: "500",
};

export const inProgressBadgeStyle: CSSProperties = {
  marginLeft: 6,
  backgroundColor: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2f6fed)",
  color: "#ffffff",
  borderRadius: "10px",
  padding: "0 6px",
  fontSize: "10px",
  fontWeight: "bold",
  height: "16px",
  lineHeight: "16px",
};

export const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
};

export const headerLeftStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

export const headerTitleStyle: CSSProperties = {
  fontSize: "15px",
  fontWeight: "600",
  color: "var(--dsw-alias-label-primary, #0f172a)",
};

export const countSubStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--dsw-alias-label-secondary, #64748b)",
};

export const headerActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

export const filterBarStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "8px 16px",
  overflowX: "auto",
  borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
};

export const filterTabStyle = (active: boolean): CSSProperties => ({
  border: active ? "1px solid transparent" : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
  background: active
    ? "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2f6fed)"
    : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03))",
  color: active ? "#ffffff" : "var(--dsw-alias-label-secondary, #64748b)",
  borderRadius: "6px",
  padding: "4px 10px",
  fontSize: "12px",
  fontWeight: active ? "600" : "400",
  cursor: "pointer",
  whiteSpace: "nowrap",
});

export const taskListStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

export const taskCardStyle = (status: TaskStatus): CSSProperties => ({
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
  borderRadius: "8px",
  backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  opacity: status === "done" ? 0.8 : 1,
});

export const cardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

export const cardMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

export const taskIdStyle: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "11px",
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};

export const assigneeBadgeStyle: CSSProperties = {
  fontSize: "11px",
  color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb)",
};

export const cardRightActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

export const deleteBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  cursor: "pointer",
  fontSize: "16px",
  lineHeight: "1",
  padding: "2px 6px",
  borderRadius: "4px",
};

export const cardTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: "600",
  lineHeight: "1.4",
  color: "var(--dsw-alias-label-primary, #0f172a)",
};

export const cardDescStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--dsw-alias-label-secondary, #475569)",
  lineHeight: "1.5",
  margin: "4px 0 6px 0",
};

export const cardFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 4,
};

export const toggleExpandBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb)",
  fontSize: "11px",
  cursor: "pointer",
  padding: "0",
  fontWeight: "500",
};

export const assignBtnStyle = (status: "dispatched" | "failed" | null): CSSProperties => ({
  background:
    status === "dispatched"
      ? "rgba(37, 99, 235, 0.12)"
      : status === "failed"
      ? "rgba(239, 68, 68, 0.12)"
      : "transparent",
  border:
    status === "dispatched"
      ? "1px solid #2563eb"
      : status === "failed"
      ? "1px solid #ef4444"
      : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
  color:
    status === "dispatched"
      ? "#2563eb"
      : status === "failed"
      ? "#ef4444"
      : "var(--dsw-alias-label-secondary, #475569)",
  borderRadius: "12px",
  padding: "2px 8px",
  fontSize: "11px",
  fontWeight: "500",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "3px",
  transition: "all 0.15s ease",
});

export const depsRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "4px",
  margin: "4px 0 6px 0",
};

export const depsLabelStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: "500",
  color: "var(--dsw-alias-label-secondary, #64748b)",
  marginRight: "2px",
};

export const depChipStyle = (isDone: boolean): CSSProperties => ({
  background: isDone ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.12)",
  border: isDone ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(245, 158, 11, 0.35)",
  color: isDone ? "#059669" : "#d97706",
  borderRadius: "8px",
  padding: "1px 6px",
  fontSize: "10.5px",
  fontWeight: "500",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "2px",
  transition: "all 0.15s ease",
});

export const deliverableLiStyle = (status?: "opened" | "copied" | "missing" | "failed"): CSSProperties => ({
  fontFamily: "var(--dsw-alias-font-mono, monospace)",
  fontSize: "11px",
  color:
    status === "opened"
      ? "#059669"
      : status === "failed" || status === "missing"
      ? "#d97706"
      : status === "copied"
      ? "#2563eb"
      : "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #0284c7)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 8px",
  borderRadius: "5px",
  backgroundColor:
    status === "opened"
      ? "rgba(16, 185, 129, 0.12)"
      : status === "failed" || status === "missing"
      ? "rgba(245, 158, 11, 0.12)"
      : status === "copied"
      ? "rgba(37, 99, 235, 0.12)"
      : "var(--dsw-alias-surface-elevation-1, rgba(0, 0, 0, 0.04))",
  border:
    status === "opened"
      ? "1px solid rgba(16, 185, 129, 0.4)"
      : status === "failed" || status === "missing"
      ? "1px solid rgba(245, 158, 11, 0.4)"
      : status === "copied"
      ? "1px solid rgba(37, 99, 235, 0.4)"
      : "1px solid var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.08))",
  marginBottom: "4px",
  marginRight: "4px",
  transition: "all 0.18s ease",
});

export const deliverablePathStyle: CSSProperties = {
  wordBreak: "break-all",
};

export const deliverableActionStyle = (status?: "opened" | "copied" | "missing" | "failed"): CSSProperties => ({
  fontSize: "10px",
  marginLeft: "6px",
  opacity: 0.85,
  fontWeight: status ? "600" : "400",
  color:
    status === "opened"
      ? "#059669"
      : status === "failed" || status === "missing"
      ? "#d97706"
      : status === "copied"
      ? "#2563eb"
      : "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb)",
});

export const archiveBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
  color: "var(--dsw-alias-label-secondary, #475569)",
  borderRadius: "12px",
  padding: "2px 8px",
  fontSize: "11px",
  fontWeight: "500",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "3px",
  transition: "all 0.15s ease",
};

export const timeStyle: CSSProperties = {
  fontSize: "11px",
  color: "var(--dsw-alias-label-caption, #94a3b8)",
};

export const conclusionDrawerStyle: CSSProperties = {
  borderTop: "1px dashed var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1))",
  paddingTop: 8,
  marginTop: 4,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};


export const conclusionItemStyle: CSSProperties = {
  backgroundColor: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.03))",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
  borderRadius: "6px",
  padding: "8px 10px",
  fontSize: "12px",
};

export const concTimeStyle: CSSProperties = {
  fontSize: "10px",
  color: "var(--dsw-alias-label-caption, #94a3b8)",
  marginBottom: 4,
};

export const concSummaryStyle: CSSProperties = {
  fontWeight: "500",
  marginBottom: 6,
  color: "var(--dsw-alias-label-primary, #1e293b)",
};

export const concBlockStyle: CSSProperties = {
  marginTop: 4,
};

export const concLabelStyle: CSSProperties = {
  fontSize: "11px",
  color: "var(--dsw-alias-label-secondary, #64748b)",
  display: "block",
};

export const concListStyle: CSSProperties = {
  margin: "2px 0 0 16px",
  padding: 0,
};

export const codeLiStyle: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "11px",
  color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #0284c7)",
};

export const insightLiStyle: CSSProperties = {
  fontSize: "11px",
  color: "#d97706",
};

export const addConcFormStyle: CSSProperties = {
  backgroundColor: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.02))",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
  padding: 8,
  borderRadius: "6px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

export const appendConcBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px dashed var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
  color: "var(--dsw-alias-label-secondary, #64748b)",
  borderRadius: "6px",
  padding: "6px",
  fontSize: "11px",
  cursor: "pointer",
};

export const primaryBtnStyle: CSSProperties = {
  backgroundColor: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--dsw-alias-brand-primary, #2f6fed))",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  padding: "6px 14px",
  fontSize: "12px",
  fontWeight: "500",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

export const iconBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
  color: "var(--dsw-alias-label-secondary, #64748b)",
  borderRadius: "6px",
  padding: "5px 7px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export const cancelBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
  color: "var(--dsw-alias-label-secondary, #475569)",
  borderRadius: "6px",
  padding: "6px 14px",
  fontSize: "12px",
  cursor: "pointer",
};

export const emptyStyle: CSSProperties = {
  padding: "30px 10px",
  textAlign: "center",
  color: "var(--dsw-alias-label-secondary, #64748b)",
  border: "1px dashed var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1))",
  borderRadius: "8px",
};

export const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.35))",
  backdropFilter: "var(--dsw-mask-blur, blur(2px))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

export const modalContentStyle: CSSProperties = {
  width: "min(480px, 92vw)",
  backgroundColor: "var(--dsw-alias-bg-layer-2, #ffffff)",
  color: "var(--dsw-alias-label-primary, #0f172a)",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
  borderRadius: "16px",
  padding: "20px 24px",
  boxShadow: "var(--dsw-shadow-lv3, 0 16px 36px rgba(0, 0, 0, 0.16))",
};

export const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

export const closeBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: "20px",
  lineHeight: "1",
  cursor: "pointer",
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  padding: "2px 6px",
  borderRadius: "4px",
};

export const fieldLabelStyle: CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: "500",
  marginBottom: 6,
  color: "var(--dsw-alias-label-secondary, #475569)",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
  backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
  color: "var(--dsw-alias-label-primary, #0f172a)",
  fontSize: "13px",
  outline: "none",
};

export const textAreaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
  backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
  color: "var(--dsw-alias-label-primary, #0f172a)",
  fontSize: "12px",
  fontFamily: "inherit",
  resize: "vertical",
  outline: "none",
};

export const workspaceChipStyle = (isManual: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "2px 8px",
  borderRadius: "10px",
  fontSize: "11px",
  fontWeight: "500",
  color: isManual ? "var(--dsw-alias-color-primary, #2563eb)" : "var(--dsw-alias-label-secondary, #475569)",
  backgroundColor: isManual ? "rgba(37, 99, 235, 0.1)" : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.04))",
  border: isManual ? "1px solid rgba(37, 99, 235, 0.3)" : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
  cursor: "pointer",
  outline: "none",
  maxWidth: "160px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const manualTagStyle: CSSProperties = {
  fontSize: "9px",
  padding: "1px 4px",
  borderRadius: "4px",
  backgroundColor: "var(--dsw-alias-color-primary, #2563eb)",
  color: "#ffffff",
  marginLeft: "2px",
};

export const workspaceMenuStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  backgroundColor: "var(--dsw-alias-bg-layer-2, #ffffff)",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
  borderRadius: "8px",
  boxShadow: "var(--dsw-shadow-lv3, 0 8px 20px rgba(0, 0, 0, 0.15))",
  padding: "4px",
  zIndex: 100,
  minWidth: "160px",
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

export const menuHeaderStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: "600",
  padding: "4px 8px",
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
  marginBottom: "2px",
};

export const menuItemStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "6px 8px",
  border: "none",
  borderRadius: "5px",
  backgroundColor: active ? "rgba(37, 99, 235, 0.1)" : "transparent",
  color: active ? "var(--dsw-alias-color-primary, #2563eb)" : "var(--dsw-alias-label-primary, #0f172a)",
  fontSize: "12px",
  cursor: "pointer",
  textAlign: "left",
  outline: "none",
});

export const readyBadgeStyle: CSSProperties = {
  background: "rgba(16, 185, 129, 0.12)",
  color: "#059669",
  border: "1px solid rgba(16, 185, 129, 0.3)",
  borderRadius: "10px",
  padding: "1px 6px",
  fontSize: "10px",
  fontWeight: "600",
};

export const tagsRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "4px",
  margin: "2px 0 4px 0",
};

export const tagChipStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: "500",
  padding: "1px 6px",
  borderRadius: "6px",
  backgroundColor: "rgba(37, 99, 235, 0.08)",
  color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb)",
  border: "1px solid rgba(37, 99, 235, 0.2)",
  display: "inline-flex",
  alignItems: "center",
  cursor: "pointer",
};

export const searchContainerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "10px 16px 8px 16px",
  position: "relative",
};

export const searchInputStyle: CSSProperties = {
  flex: 1,
  padding: "5px 10px",
  borderRadius: "6px",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
  backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
  fontSize: "11.5px",
  color: "var(--dsw-alias-label-primary, #0f172a)",
  outline: "none",
};

export const clearSearchBtnStyle: CSSProperties = {
  position: "absolute",
  right: "24px",
  top: "calc(50% + 1px)",
  transform: "translateY(-50%)",
  background: "transparent",
  border: "none",
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  cursor: "pointer",
  fontSize: "14px",
  lineHeight: "1",
  padding: 0,
};

export const tagFilterBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "4px",
  padding: "0 16px 8px 16px",
};

export const tagFilterChipStyle = (active: boolean): CSSProperties => ({
  border: active ? "1px solid #2563eb" : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
  backgroundColor: active ? "rgba(37, 99, 235, 0.12)" : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
  color: active ? "#2563eb" : "var(--dsw-alias-label-secondary, #64748b)",
  borderRadius: "10px",
  padding: "2px 8px",
  fontSize: "10.5px",
  fontWeight: active ? "600" : "400",
  cursor: "pointer",
  transition: "all 0.15s ease",
});

export const tagExpandToggleStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  fontSize: "10.5px",
  fontWeight: "500",
  padding: "2px 6px",
  borderRadius: "10px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
  transition: "all 0.15s ease",
};

export const readyBannerStyle: CSSProperties = {
  margin: "0 16px 8px 16px",
  padding: "8px 12px",
  borderRadius: "8px",
  backgroundColor: "rgba(16, 185, 129, 0.08)",
  border: "1px solid rgba(16, 185, 129, 0.25)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
};

// 认领锁 Chip：活跃=琥珀警示色，过期=灰色降级
export const claimChipStyle = (active: boolean): CSSProperties => ({
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 10,
  backgroundColor: active ? "rgba(245, 158, 11, 0.14)" : "rgba(148, 163, 184, 0.12)",
  color: active ? "#d97706" : "var(--dsw-alias-label-secondary, #64748b)",
  whiteSpace: "nowrap",
  cursor: "default",
});

export const claimReleaseBtnStyle: CSSProperties = {
  fontSize: 10,
  lineHeight: "16px",
  width: 18,
  height: 18,
  padding: 0,
  borderRadius: "50%",
  border: "1px solid rgba(245, 158, 11, 0.35)",
  backgroundColor: "transparent",
  color: "#d97706",
  cursor: "pointer",
  flexShrink: 0,
};

// ===== 待拍板（票拟→批红） =====
export const approvalBannerStyle: CSSProperties = {
  margin: "0 16px 8px 16px",
  padding: "8px 12px",
  borderRadius: "8px",
  backgroundColor: "rgba(245, 158, 11, 0.08)",
  border: "1px solid rgba(245, 158, 11, 0.3)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
};

export const approvalActionBtnStyle: CSSProperties = {
  fontSize: "11.5px",
  padding: "4px 12px",
  borderRadius: "6px",
  border: "none",
  backgroundColor: "#d97706",
  color: "#fff",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

export const approvalCardStyle: CSSProperties = {
  marginTop: 8,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid rgba(245, 158, 11, 0.4)",
  borderLeft: "3px solid #d97706",
  backgroundColor: "rgba(245, 158, 11, 0.06)",
};

export const approvalCardTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: "12.5px",
  fontWeight: 600,
  color: "var(--dsw-alias-label-primary, #1f2328)",
};

export const approvalCardDetailStyle: CSSProperties = {
  marginTop: 6,
  fontSize: "11.5px",
  lineHeight: 1.6,
  color: "var(--dsw-alias-label-secondary, #64748b)",
  whiteSpace: "pre-wrap",
};

export const approvalOptionsRowStyle: CSSProperties = {
  marginTop: 8,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

export const approvalOptionBtnStyle: CSSProperties = {
  fontSize: "11.5px",
  padding: "5px 12px",
  borderRadius: 6,
  border: "1px solid rgba(217, 119, 6, 0.5)",
  backgroundColor: "var(--dsw-alias-bg-layer-1, #fff)",
  color: "#d97706",
  cursor: "pointer",
  fontWeight: 500,
};

export const approvalRejectBtnStyle: CSSProperties = {
  fontSize: "11.5px",
  padding: "5px 12px",
  borderRadius: 6,
  border: "1px solid rgba(148, 163, 184, 0.4)",
  backgroundColor: "transparent",
  color: "var(--dsw-alias-label-secondary, #64748b)",
  cursor: "pointer",
};

export const approvalCardMetaStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 10.5,
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};

// ===== 自动派发（Fast Path） =====
export const trippedBannerStyle: CSSProperties = {
  margin: "0 16px 8px 16px",
  padding: "8px 12px",
  borderRadius: "8px",
  backgroundColor: "rgba(239, 68, 68, 0.08)",
  border: "1px solid rgba(239, 68, 68, 0.35)",
};

export const staleBannerStyle: CSSProperties = {
  margin: "0 16px 8px 16px",
  padding: "8px 12px",
  borderRadius: "8px",
  backgroundColor: "rgba(245, 158, 11, 0.06)",
  border: "1px solid rgba(245, 158, 11, 0.3)",
};

// 「更多」下拉菜单（右对齐，复用工作区菜单的视觉语言）
export const moreMenuStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  right: 0,
  backgroundColor: "var(--dsw-alias-bg-layer-2, #ffffff)",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
  borderRadius: "8px",
  boxShadow: "var(--dsw-shadow-lv3, 0 8px 20px rgba(0, 0, 0, 0.15))",
  padding: "4px",
  zIndex: 100,
  minWidth: "200px",
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

export const menuDividerStyle: CSSProperties = {
  height: 1,
  backgroundColor: "var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
  margin: "3px 4px",
};

export const observeBannerStyle: CSSProperties = {
  margin: "0 16px 8px 16px",
  padding: "8px 12px",
  borderRadius: "8px",
  backgroundColor: "rgba(124, 58, 237, 0.06)",
  border: "1px solid rgba(124, 58, 237, 0.25)",
};

export const observeEntryRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "4px 8px",
  borderRadius: 6,
  backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.5))",
  border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.06))",
};

export const observeRunBtnStyle: CSSProperties = {
  fontSize: 11,
  padding: "2px 10px",
  borderRadius: 5,
  border: "none",
  backgroundColor: "#7c3aed",
  color: "#fff",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const observeIgnoreBtnStyle: CSSProperties = {
  fontSize: 11,
  padding: "2px 10px",
  borderRadius: 5,
  border: "1px solid rgba(148, 163, 184, 0.4)",
  backgroundColor: "transparent",
  color: "var(--dsw-alias-label-secondary, #64748b)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const dispatchLogPanelStyle: CSSProperties = {
  margin: "0 16px 8px 16px",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
  backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.02))",
};

export const dispatchLogTitleStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--dsw-alias-label-secondary, #64748b)",
  marginBottom: 6,
};

export const dispatchLogEmptyStyle: CSSProperties = {
  fontSize: 11.5,
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};

export const dispatchLogRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "3px 0",
  fontSize: 11,
  flexWrap: "wrap",
};

export const dispatchLogTimeStyle: CSSProperties = {
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  fontSize: 10.5,
  flexShrink: 0,
};

export const dispatchLogTaskStyle: CSSProperties = {
  color: "var(--dsw-alias-label-primary, #1f2328)",
  fontWeight: 500,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "40%",
};

export const dispatchLogTriggerStyle: CSSProperties = {
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  fontSize: 10.5,
  fontFamily: "monospace",
};

export const dispatchLogHopStyle: CSSProperties = {
  color: "var(--dsw-alias-label-tertiary, #94a3b8)",
  fontSize: 10.5,
  fontFamily: "monospace",
};

export const dispatchStatusBadgeStyle = (status: string): CSSProperties => ({
  fontSize: 10,
  padding: "1px 8px",
  borderRadius: 9,
  marginLeft: "auto",
  flexShrink: 0,
  backgroundColor:
    status === "sent"
      ? "rgba(5, 150, 105, 0.12)"
      : status === "failed"
      ? "rgba(239, 68, 68, 0.12)"
      : status === "tripped"
      ? "rgba(220, 38, 38, 0.16)"
      : status === "queued"
      ? "rgba(245, 158, 11, 0.14)"
      : status === "would-dispatch"
      ? "rgba(124, 58, 237, 0.12)"
      : "rgba(148, 163, 184, 0.12)",
  color:
    status === "sent"
      ? "#059669"
      : status === "failed"
      ? "#ef4444"
      : status === "tripped"
      ? "#dc2626"
      : status === "queued"
      ? "#d97706"
      : status === "would-dispatch"
      ? "#7c3aed"
      : "#64748b",
});

export const readyActionBtnStyle: CSSProperties = {
  backgroundColor: "#059669",
  color: "#ffffff",
  border: "none",
  borderRadius: "6px",
  padding: "4px 10px",
  fontSize: "11px",
  fontWeight: "600",
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "0 1px 2px rgba(5, 150, 105, 0.3)",
};
