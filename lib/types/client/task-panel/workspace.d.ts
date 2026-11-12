/**
 * 活跃工作区解析：纯逻辑 + useActiveWorkspace hook（从 TaskPanel.tsx 原样迁移）。
 */
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
//# sourceMappingURL=workspace.d.ts.map