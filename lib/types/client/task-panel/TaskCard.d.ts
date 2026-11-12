import type { ProjectTask, TaskPriority, TaskStatus } from "../../store/types.ts";
export declare function TaskCard({ task, allTasks, workspacePath, workspaceId, isExpanded, isReady, onToggleExpand, onStatusChange, onDelete, onConclusionAdded, onNavigateToTask, onSelectTag, openFile, }: {
    task: ProjectTask;
    allTasks?: ProjectTask[];
    workspacePath: string;
    workspaceId?: string;
    isExpanded: boolean;
    isReady?: boolean;
    onToggleExpand: () => void;
    onStatusChange: (status: TaskStatus) => void;
    onDelete: () => void;
    onConclusionAdded: () => void;
    onNavigateToTask?: (taskId: string) => void;
    onSelectTag?: (tag: string) => void;
    openFile?: (path: string, workspacePath?: string) => Promise<void>;
}): import("react").JSX.Element;
export declare function PriorityBadge({ priority }: {
    priority: TaskPriority;
}): import("react").JSX.Element;
//# sourceMappingURL=TaskCard.d.ts.map