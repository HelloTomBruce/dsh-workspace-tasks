import type { CSSProperties } from "react";
import type { ApprovalRequest, DecisionRecord, TaskCheckpoint, TraceRef } from "../store/types.ts";
export declare const decisionChipStyle: CSSProperties;
export declare const traceChipStyle: CSSProperties;
export declare function TraceSections({ decisions, checkpoints, traceRefs, resolvedTraces, approvals, }: {
    decisions?: DecisionRecord[];
    checkpoints?: TaskCheckpoint[];
    traceRefs?: TraceRef[];
    /** resolveTraceRefs 的解析结果；未解析时降级展示裸引用 */
    resolvedTraces?: TraceRef[] | null;
    /** 审批记录（票拟）：仅展示已批红/已驳回的，pending 由卡片批红区承载 */
    approvals?: ApprovalRequest[];
}): (false | import("react").DetailedReactHTMLElement<{
    style: {
        marginTop: number;
    };
}, HTMLElement>)[];
//# sourceMappingURL=TraceSections.d.ts.map