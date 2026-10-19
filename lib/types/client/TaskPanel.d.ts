import type { CSSProperties } from "react";
export interface ActiveWorkspaceInfo {
    id?: string;
    path: string;
    title: string;
}
export declare function resolveActiveWorkspace(explicitSessionId?: string, explicitWorkspacePath?: string): ActiveWorkspaceInfo;
export declare function useActiveWorkspace(explicitSessionId?: string, explicitWorkspacePath?: string): ActiveWorkspaceInfo;
export declare function TaskPanelTitle(props?: {
    sessionId?: string;
    useTabInfo?: () => any;
}): import("react").DetailedReactHTMLElement<{
    style: CSSProperties;
}, HTMLElement>;
export declare function TaskPanelBody(props?: {
    sessionId?: string;
    useTabInfo?: () => any;
}): import("react").DetailedReactHTMLElement<{
    style: CSSProperties;
    onPointerDown: () => void;
}, HTMLElement>;
//# sourceMappingURL=TaskPanel.d.ts.map