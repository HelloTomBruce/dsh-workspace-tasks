/**
 * 任务中台全部样式（沿用 --dsw-alias-* 主题 token）。
 * 纯数据模块：从组件剥离，避免样式表淹没渲染逻辑。
 */
export const rootStyle = {
    width: "100%",
    height: "100%",
    overflowY: "auto",
    padding: "20px 24px",
    boxSizing: "border-box",
    backgroundColor: "var(--dsw-alias-bg-page, transparent)",
    color: "var(--dsw-alias-label-primary, #1f2328)",
    fontFamily: "inherit",
};
export const headerStyle = { marginBottom: 12 };
export const titleStyle = { fontSize: 18, fontWeight: 700 };
export const headerTopRowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
    flexWrap: "wrap",
};
export const searchInputStyle = {
    fontSize: 12,
    padding: "5px 10px",
    borderRadius: 8,
    border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))",
    backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.6))",
    color: "var(--dsw-alias-label-primary, #1f2328)",
    outline: "none",
    width: 240,
    maxWidth: "50vw",
};
export const totalsRowStyle = { display: "flex", flexWrap: "wrap", gap: 8 };
/** 顶部计数 chip（可点击定位）：active 高亮描边，dim 无数据弱化，pulse 待拍板呼吸 */
export const totalChipBtnStyle = (color, opts) => ({
    fontSize: 12,
    padding: "4px 12px",
    borderRadius: 12,
    backgroundColor: `color-mix(in srgb, ${color} ${opts.active ? 22 : 10}%, transparent)`,
    color,
    fontWeight: 600,
    whiteSpace: "nowrap",
    border: opts.active ? `1px solid ${color}` : "1px solid transparent",
    cursor: opts.dim ? "default" : "pointer",
    opacity: opts.dim ? 0.55 : 1,
    ...(opts.pulse ? { animation: "dshTasksChipPulse 1.6s ease-out infinite" } : null),
});
// ===== 待拍板全局横幅 =====
export const approvalBannerStyle = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    padding: "10px 14px",
    marginBottom: 14,
    borderRadius: 10,
    border: "1px solid rgba(245, 158, 11, 0.45)",
    borderLeft: "3px solid #d97706",
    backgroundColor: "rgba(245, 158, 11, 0.08)",
};
export const approvalBannerTitleStyle = {
    fontSize: 13,
    fontWeight: 700,
    color: "#d97706",
    marginRight: 4,
};
export const approvalBannerBtnStyle = {
    fontSize: 11.5,
    padding: "4px 12px",
    borderRadius: 6,
    border: "1px solid rgba(217, 119, 6, 0.5)",
    backgroundColor: "var(--dsw-alias-bg-layer-1, #fff)",
    color: "#d97706",
    cursor: "pointer",
    fontWeight: 500,
    maxWidth: 320,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};
export const approvalBannerMoreStyle = {
    fontSize: 11,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};
// ===== 动态流（最近动态 + 派发记录双栏） =====
export const feedRowStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 14,
    marginBottom: 14,
};
export const feedPanelStyle = {
    border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
    borderRadius: 10,
    padding: "10px 14px",
    backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.02))",
};
export const feedTitleStyle = {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--dsw-alias-label-secondary, #64748b)",
    marginBottom: 6,
};
export const feedItemStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "3px 0",
    fontSize: 11.5,
    borderTop: "1px dashed var(--dsw-alias-border-l2, rgba(0,0,0,0.06))",
    minWidth: 0,
};
export const feedTimeStyle = {
    fontFamily: "monospace",
    fontSize: 10.5,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    flexShrink: 0,
};
export const feedWsStyle = {
    fontSize: 10.5,
    color: "var(--dsw-alias-label-secondary, #64748b)",
    flexShrink: 0,
    maxWidth: 110,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};
export const feedTextStyle = {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--dsw-alias-label-primary, #1f2328)",
};
export const feedEmptyStyle = {
    fontSize: 11,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    padding: "6px 0",
};
export const dispatchBadgeStyle = (color) => ({
    fontSize: 10,
    padding: "1px 7px",
    borderRadius: 8,
    backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
    color,
    fontWeight: 600,
    whiteSpace: "nowrap",
    flexShrink: 0,
});
/** 分组定位高亮：顶部 chip 点击后短暂描边闪烁 */
export const groupFlashStyle = (color) => ({
    boxShadow: `0 0 0 2px ${color}`,
    borderRadius: 8,
    padding: "4px 6px",
    marginLeft: -6,
    marginRight: -6,
    transition: "box-shadow 0.2s",
});
/** 派发模式色点（替代原右侧 Chip，hover 出文案） */
export const modeDotStyle = (mode) => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
    backgroundColor: mode === "auto" ? "#059669" : mode === "observe" ? "#d97706" : "#94a3b8",
});
// 待归档折叠态单行
export const collapsedDoneRowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
};
export const collapsedDoneBtnStyle = {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 11.5,
    fontWeight: 700,
    color: "#059669",
    cursor: "pointer",
    textAlign: "left",
};
export const generatedAtStyle = {
    marginTop: 8,
    fontSize: 11,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};
export const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
    gap: 14,
};
export const cardStyle = {
    border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
    borderRadius: 10,
    padding: "12px 14px",
    backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.02))",
};
export const cardHeaderStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
};
export const cardTitleBtnStyle = {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "var(--dsw-alias-label-primary, #1f2328)",
    cursor: "pointer",
    textAlign: "left",
};
export const cardTitleStyle = { fontSize: 14, fontWeight: 700 };
export const cardSubStyle = {
    marginTop: 4,
    fontSize: 11,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};
export const groupStyle = { marginTop: 10 };
export const groupLabelStyle = { fontSize: 11.5, fontWeight: 700, marginBottom: 4 };
export const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    // 关键：content-box 下 width:100% + padding 会溢出卡片右边界
    boxSizing: "border-box",
    padding: "5px 8px",
    marginTop: 3,
    borderRadius: 6,
    border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.06))",
    backgroundColor: "var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.5))",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 12,
    color: "var(--dsw-alias-label-primary, #1f2328)",
    overflow: "hidden",
};
export const rowIdStyle = {
    fontFamily: "monospace",
    fontSize: 10.5,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    flexShrink: 0,
};
export const rowTitleStyle = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
    // 关键：flex 子项默认 minWidth:auto，标题不收缩会把行尾动作按钮挤出卡片
    minWidth: 0,
};
/** 进行中行内 spinner（动画 keyframes 见面板注入的 <style>） */
export const spinnerStyle = {
    display: "inline-block",
    width: 10,
    height: 10,
    border: "2px solid rgba(37, 99, 235, 0.25)",
    borderTopColor: "#2563eb",
    borderRadius: "50%",
    animation: "dshTasksSpin 0.9s linear infinite",
    flexShrink: 0,
};
export const rowExtraStyle = {
    fontSize: 10.5,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    flexShrink: 0,
};
/** 行尾动作按钮容器：阻止冒泡由 RowAction 自身处理 */
export const rowActionsStyle = {
    display: "inline-flex",
    gap: 4,
    flexShrink: 0,
};
export const rowActionBtnStyle = {
    fontSize: 10.5,
    padding: "1px 7px",
    borderRadius: 5,
    border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))",
    backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.7))",
    color: "var(--dsw-alias-label-secondary, #475569)",
    cursor: "pointer",
    whiteSpace: "nowrap",
};
/** 危险操作武装态（二次确认中）：红底白字，3s 不点自动复位 */
export const rowActionArmedStyle = {
    ...rowActionBtnStyle,
    border: "1px solid #ef4444",
    backgroundColor: "#ef4444",
    color: "#fff",
    fontWeight: 600,
};
// ===== toast 通知（右上角浮现，自动消失） =====
export const toastWrapStyle = {
    position: "fixed",
    top: 16,
    right: 16,
    zIndex: 2000,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "flex-end",
    pointerEvents: "none",
};
export const toastItemStyle = (kind) => ({
    fontSize: 12,
    padding: "6px 12px",
    borderRadius: 8,
    backgroundColor: kind === "ok" ? "rgba(5, 150, 105, 0.92)" : "rgba(220, 38, 38, 0.92)",
    color: "#fff",
    boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
    pointerEvents: "auto",
    maxWidth: 360,
});
export const moreStyle = {
    marginTop: 4,
    fontSize: 10.5,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    paddingLeft: 8,
};
// ===== 设计化空态/加载态 =====
export const emptyStateStyle = {
    padding: "56px 40px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
};
export const emptyStateIconStyle = { fontSize: 34, lineHeight: 1.2 };
export const emptyStateTitleStyle = {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--dsw-alias-label-secondary, #64748b)",
};
export const emptyStateSubStyle = {
    fontSize: 12,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    maxWidth: 420,
    lineHeight: 1.6,
};
// ===== 任务详情弹窗 =====
export const modalOverlayStyle = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 24,
};
export const modalContentStyle = {
    width: "min(680px, 94vw)",
    maxHeight: "86vh",
    overflowY: "auto",
    backgroundColor: "var(--dsw-alias-bg-layer-2, #fff)",
    borderRadius: 12,
    border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))",
    boxShadow: "var(--dsw-shadow-lv4, 0 16px 48px rgba(0,0,0,0.25))",
    padding: "18px 20px",
};
export const modalHeaderStyle = { marginBottom: 12 };
// ===== 弹窗 Tab 栏 =====
export const modalTabsRowStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: 2,
    borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.1))",
    marginBottom: 4,
};
export const modalTabBtnStyle = (active, isApproval) => ({
    fontSize: 12,
    padding: "6px 12px",
    border: "none",
    borderBottom: active ? `2px solid ${isApproval ? "#d97706" : "#2563eb"}` : "2px solid transparent",
    backgroundColor: "transparent",
    color: active
        ? isApproval
            ? "#d97706"
            : "var(--dsw-alias-label-primary, #1f2328)"
        : "var(--dsw-alias-label-tertiary, #94a3b8)",
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
});
/** 动态 tab 的完整历史行：不截断、可换行（tab 化后空间充裕） */
export const modalHistoryLineStyle = {
    fontSize: 11,
    color: "var(--dsw-alias-label-secondary, #64748b)",
    padding: "4px 0",
    borderBottom: "1px dashed var(--dsw-alias-border-l2, rgba(0,0,0,0.06))",
    lineHeight: 1.6,
    wordBreak: "break-all",
};
export const modalIdStyle = {
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: 700,
    color: "#2563eb",
};
export const statusChipStyle = {
    fontSize: 10.5,
    padding: "2px 8px",
    borderRadius: 9,
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    color: "#2563eb",
};
export const priorityChipStyle = {
    fontSize: 10.5,
    padding: "2px 8px",
    borderRadius: 9,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    color: "#d97706",
};
export const claimChipStyle = {
    fontSize: 10.5,
    padding: "2px 8px",
    borderRadius: 9,
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    color: "#d97706",
};
export const modalTitleStyle = {
    margin: "8px 0 0",
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.4,
    color: "var(--dsw-alias-label-primary, #1f2328)",
};
export const modalWsStyle = {
    marginTop: 4,
    fontSize: 11,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
    fontFamily: "monospace",
    wordBreak: "break-all",
};
export const modalSectionStyle = { marginTop: 14 };
export const modalItemStyle = {
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.06))",
    marginTop: 4,
    fontSize: 12,
};
export const modalMetaLineStyle = {
    fontSize: 11,
    color: "var(--dsw-alias-label-secondary, #64748b)",
    marginTop: 3,
    lineHeight: 1.5,
    wordBreak: "break-all",
};
// ===== 结论 tab：交付物 chips + 心得列表 =====
export const modalFieldBlockStyle = { marginTop: 6 };
export const modalFieldLabelStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--dsw-alias-label-secondary, #64748b)",
};
export const modalDeliverableWrapStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
};
export const modalDeliverableChipStyle = {
    fontSize: 11,
    fontFamily: "monospace",
    padding: "2px 9px",
    borderRadius: 6,
    border: "1px solid rgba(5, 150, 105, 0.35)",
    backgroundColor: "rgba(5, 150, 105, 0.06)",
    color: "#059669",
    cursor: "pointer",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};
export const modalInsightLineStyle = {
    fontSize: 11.5,
    lineHeight: 1.6,
    color: "var(--dsw-alias-label-primary, #1f2328)",
    padding: "3px 0 3px 8px",
    borderLeft: "2px solid rgba(245, 158, 11, 0.5)",
    marginTop: 4,
};
// ===== 决策演进链（与右栏看板 TraceSections 同视觉语义：紫=现行，灰=已被取代） =====
export const modalDecisionStyle = (superseded) => ({
    border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
    borderLeft: superseded ? "3px solid rgba(148, 163, 184, 0.5)" : "3px solid #7c3aed",
    borderRadius: 6,
    padding: "8px 10px",
    marginTop: 4,
    opacity: superseded ? 0.72 : 1,
    backgroundColor: superseded
        ? "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))"
        : "rgba(124, 58, 237, 0.04)",
    fontSize: 12,
});
export const modalSupersededBadgeStyle = {
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 8,
    backgroundColor: "rgba(148, 163, 184, 0.18)",
    color: "var(--dsw-alias-label-secondary, #64748b)",
    whiteSpace: "nowrap",
    flexShrink: 0,
};
export const modalDecisionIdStyle = {
    fontSize: 10,
    fontFamily: "monospace",
    color: "#7c3aed",
    whiteSpace: "nowrap",
    flexShrink: 0,
};
export const modalChainConnectorStyle = {
    fontSize: 10.5,
    color: "#7c3aed",
    padding: "2px 0 2px 12px",
    opacity: 0.75,
};
// ===== 已决审批条目：批准=绿边，驳回=灰边降级 =====
export const modalResolvedApprovalStyle = (approved) => ({
    border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
    borderLeft: approved ? "3px solid #059669" : "3px solid rgba(148, 163, 184, 0.5)",
    borderRadius: 6,
    padding: "6px 8px",
    marginTop: 4,
    opacity: approved ? 1 : 0.72,
    backgroundColor: approved
        ? "rgba(5, 150, 105, 0.05)"
        : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
    fontSize: 12,
});
export const modalDecisionChipStyle = {
    fontSize: 10,
    fontFamily: "monospace",
    padding: "1px 6px",
    borderRadius: 8,
    backgroundColor: "rgba(124, 58, 237, 0.12)",
    color: "#7c3aed",
    whiteSpace: "nowrap",
};
// 弹窗内批红区（琥珀色，与右栏看板批红卡片同视觉语义）
export const modalApprovalStyle = {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid rgba(245, 158, 11, 0.4)",
    borderLeft: "3px solid #d97706",
    backgroundColor: "rgba(245, 158, 11, 0.06)",
};
export const modalApprovalTitleStyle = { fontSize: 13, fontWeight: 700 };
export const modalApprovalDetailStyle = {
    marginTop: 6,
    fontSize: 11.5,
    lineHeight: 1.6,
    color: "var(--dsw-alias-label-secondary, #64748b)",
    whiteSpace: "pre-wrap",
};
export const modalApprovalOptionsStyle = {
    marginTop: 8,
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
};
export const modalOptionBtnStyle = {
    fontSize: 11.5,
    padding: "5px 12px",
    borderRadius: 6,
    border: "1px solid rgba(217, 119, 6, 0.5)",
    backgroundColor: "var(--dsw-alias-bg-layer-1, #fff)",
    color: "#d97706",
    cursor: "pointer",
    fontWeight: 500,
};
export const modalRejectBtnStyle = {
    fontSize: 11.5,
    padding: "5px 12px",
    borderRadius: 6,
    border: "1px solid rgba(148, 163, 184, 0.4)",
    backgroundColor: "transparent",
    color: "var(--dsw-alias-label-secondary, #64748b)",
    cursor: "pointer",
};
export const modalApprovalMetaStyle = {
    marginTop: 8,
    fontSize: 10.5,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};
// 驳回备注内联编辑器（替代原生 prompt）
export const modalRejectEditorStyle = {
    marginTop: 8,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
};
export const modalRejectInputStyle = {
    flex: 1,
    minWidth: 200,
    fontSize: 11.5,
    padding: "5px 10px",
    borderRadius: 6,
    border: "1px solid rgba(217, 119, 6, 0.5)",
    backgroundColor: "var(--dsw-alias-bg-layer-1, #fff)",
    color: "var(--dsw-alias-label-primary, #1f2328)",
    outline: "none",
};
export const modalRejectConfirmBtnStyle = {
    fontSize: 11.5,
    padding: "5px 12px",
    borderRadius: 6,
    border: "1px solid #dc2626",
    backgroundColor: "#dc2626",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 500,
};
export const modalFooterStyle = {
    marginTop: 16,
    paddingTop: 10,
    borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.06))",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 10.5,
    color: "var(--dsw-alias-label-tertiary, #94a3b8)",
};
export const modalCloseBtnStyle = {
    fontSize: 11.5,
    padding: "5px 14px",
    borderRadius: 6,
    border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))",
    backgroundColor: "transparent",
    color: "var(--dsw-alias-label-secondary, #475569)",
    cursor: "pointer",
};
//# sourceMappingURL=styles.js.map