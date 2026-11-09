import type { CSSProperties } from "react";
import type { DecisionRecord, TaskCheckpoint, TraceRef } from "../store/types.ts";
export declare const decisionChipStyle: CSSProperties;
export declare const traceChipStyle: CSSProperties;
export declare function TraceSections({ decisions, checkpoints, traceRefs, resolvedTraces, }: {
    decisions?: DecisionRecord[];
    checkpoints?: TaskCheckpoint[];
    traceRefs?: TraceRef[];
    /** resolveTraceRefs 的解析结果；未解析时降级展示裸引用 */
    resolvedTraces?: TraceRef[] | null;
}): (false | import("react").DetailedReactHTMLElement<{
    style: {
        marginTop: number;
    };
}, HTMLElement>)[];
//# sourceMappingURL=TraceSections.d.ts.map