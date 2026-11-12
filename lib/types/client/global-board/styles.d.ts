import type { CSSProperties } from "react";
/**
 * 任务中台全部样式（沿用 --dsw-alias-* 主题 token）。
 * 纯数据模块：从组件剥离，避免样式表淹没渲染逻辑。
 */
export declare const rootStyle: CSSProperties;
export declare const headerStyle: CSSProperties;
export declare const titleStyle: CSSProperties;
export declare const headerTopRowStyle: CSSProperties;
export declare const searchInputStyle: CSSProperties;
export declare const totalsRowStyle: CSSProperties;
/** 顶部计数 chip（可点击定位）：active 高亮描边，dim 无数据弱化，pulse 待拍板呼吸 */
export declare const totalChipBtnStyle: (color: string, opts: {
    active: boolean;
    dim: boolean;
    pulse: boolean;
}) => CSSProperties;
export declare const approvalBannerStyle: CSSProperties;
export declare const approvalBannerTitleStyle: CSSProperties;
export declare const approvalBannerBtnStyle: CSSProperties;
export declare const approvalBannerMoreStyle: CSSProperties;
export declare const feedRowStyle: CSSProperties;
export declare const feedPanelStyle: CSSProperties;
export declare const feedTitleStyle: CSSProperties;
export declare const feedItemStyle: CSSProperties;
export declare const feedTimeStyle: CSSProperties;
export declare const feedWsStyle: CSSProperties;
export declare const feedTextStyle: CSSProperties;
export declare const feedEmptyStyle: CSSProperties;
export declare const dispatchBadgeStyle: (color: string) => CSSProperties;
/** 分组定位高亮：顶部 chip 点击后短暂描边闪烁 */
export declare const groupFlashStyle: (color: string) => CSSProperties;
/** 派发模式色点（替代原右侧 Chip，hover 出文案） */
export declare const modeDotStyle: (mode: "observe" | "auto" | "off") => CSSProperties;
export declare const collapsedDoneRowStyle: CSSProperties;
export declare const collapsedDoneBtnStyle: CSSProperties;
export declare const generatedAtStyle: CSSProperties;
export declare const gridStyle: CSSProperties;
export declare const cardStyle: CSSProperties;
export declare const cardHeaderStyle: CSSProperties;
export declare const cardTitleBtnStyle: CSSProperties;
export declare const cardTitleStyle: CSSProperties;
export declare const cardSubStyle: CSSProperties;
export declare const groupStyle: CSSProperties;
export declare const groupLabelStyle: CSSProperties;
export declare const rowStyle: CSSProperties;
export declare const rowIdStyle: CSSProperties;
export declare const rowTitleStyle: CSSProperties;
/** 进行中行内 spinner（动画 keyframes 见面板注入的 <style>） */
export declare const spinnerStyle: CSSProperties;
export declare const rowExtraStyle: CSSProperties;
/** 行尾动作按钮容器：阻止冒泡由 RowAction 自身处理 */
export declare const rowActionsStyle: CSSProperties;
export declare const rowActionBtnStyle: CSSProperties;
/** 危险操作武装态（二次确认中）：红底白字，3s 不点自动复位 */
export declare const rowActionArmedStyle: CSSProperties;
export declare const toastWrapStyle: CSSProperties;
export declare const toastItemStyle: (kind: "ok" | "err") => CSSProperties;
export declare const moreStyle: CSSProperties;
export declare const emptyStateStyle: CSSProperties;
export declare const emptyStateIconStyle: CSSProperties;
export declare const emptyStateTitleStyle: CSSProperties;
export declare const emptyStateSubStyle: CSSProperties;
export declare const modalOverlayStyle: CSSProperties;
export declare const modalContentStyle: CSSProperties;
export declare const modalHeaderStyle: CSSProperties;
export declare const modalTabsRowStyle: CSSProperties;
export declare const modalTabBtnStyle: (active: boolean, isApproval: boolean) => CSSProperties;
/** 动态 tab 的完整历史行：不截断、可换行（tab 化后空间充裕） */
export declare const modalHistoryLineStyle: CSSProperties;
export declare const modalIdStyle: CSSProperties;
export declare const statusChipStyle: CSSProperties;
export declare const priorityChipStyle: CSSProperties;
export declare const claimChipStyle: CSSProperties;
export declare const modalTitleStyle: CSSProperties;
export declare const modalWsStyle: CSSProperties;
export declare const modalSectionStyle: CSSProperties;
export declare const modalItemStyle: CSSProperties;
export declare const modalMetaLineStyle: CSSProperties;
export declare const modalFieldBlockStyle: CSSProperties;
export declare const modalFieldLabelStyle: CSSProperties;
export declare const modalDeliverableWrapStyle: CSSProperties;
export declare const modalDeliverableChipStyle: CSSProperties;
export declare const modalInsightLineStyle: CSSProperties;
export declare const modalDecisionStyle: (superseded: boolean) => CSSProperties;
export declare const modalSupersededBadgeStyle: CSSProperties;
export declare const modalDecisionIdStyle: CSSProperties;
export declare const modalChainConnectorStyle: CSSProperties;
export declare const modalResolvedApprovalStyle: (approved: boolean) => CSSProperties;
export declare const modalDecisionChipStyle: CSSProperties;
export declare const modalApprovalStyle: CSSProperties;
export declare const modalApprovalTitleStyle: CSSProperties;
export declare const modalApprovalDetailStyle: CSSProperties;
export declare const modalApprovalOptionsStyle: CSSProperties;
export declare const modalOptionBtnStyle: CSSProperties;
export declare const modalRejectBtnStyle: CSSProperties;
export declare const modalApprovalMetaStyle: CSSProperties;
export declare const modalRejectEditorStyle: CSSProperties;
export declare const modalRejectInputStyle: CSSProperties;
export declare const modalRejectConfirmBtnStyle: CSSProperties;
export declare const modalFooterStyle: CSSProperties;
export declare const modalCloseBtnStyle: CSSProperties;
//# sourceMappingURL=styles.d.ts.map