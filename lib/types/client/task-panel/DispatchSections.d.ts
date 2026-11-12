import type { DispatchLogEntry, DispatchRuleInfo } from "./hooks.ts";
export declare function DispatchModeMenuItems({ rules, onSetMode, }: {
    rules: DispatchRuleInfo;
    onSetMode: (mode: "observe" | "auto" | "off") => void;
}): import("react").JSX.Element;
export declare function CrossWorkspaceMenuItem({ on, onToggle, }: {
    on: boolean;
    onToggle: () => void;
}): import("react").JSX.Element;
export declare function DispatchLogSection({ log }: {
    log: DispatchLogEntry[];
}): import("react").JSX.Element;
//# sourceMappingURL=DispatchSections.d.ts.map