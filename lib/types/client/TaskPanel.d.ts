import type { CSSProperties } from "react";
export declare function MarkdownContent({ content, style, className, }: {
    content?: string;
    style?: CSSProperties;
    className?: string;
}): import("react").DetailedReactHTMLElement<{
    className: string;
    style: CSSProperties | undefined;
    dangerouslySetInnerHTML: {
        __html: string;
    };
}, HTMLElement> | null;
export interface ActiveWorkspaceInfo {
    id?: string;
    path: string;
    title: string;
}
export declare function findBestMatchingWorkspace(items: Array<{
    workspaceId: string;
    path: string;
    title: string;
    sessionIds?: string[];
}>, targetPath?: string): ActiveWorkspaceInfo | null;
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
    openFile?: (path: string, workspacePath?: string) => Promise<void>;
}): import("react").DetailedReactHTMLElement<{
    style: CSSProperties;
    onPointerDown: () => void;
}, HTMLElement>;
//# sourceMappingURL=TaskPanel.d.ts.map