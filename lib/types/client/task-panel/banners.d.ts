import type { ApprovalRequest, ProjectTask } from "../../store/types.ts";
import type { DispatchLogEntry } from "./hooks.ts";
export declare function TrippedBanner({ entries, onNavigateToTask, onIgnore, }: {
    entries: DispatchLogEntry[];
    onNavigateToTask: (taskId: string) => void;
    onIgnore: (id: string) => void;
}): import("react").JSX.Element;
export declare function StaleBanner({ tasks, staleHours, onNavigateToTask, onDemoteToTodo, }: {
    tasks: ProjectTask[];
    staleHours: number;
    onNavigateToTask: (taskId: string) => void;
    onDemoteToTodo: (taskId: string) => void;
}): import("react").JSX.Element;
export declare function ApprovalBanner({ pendingApprovals, onNavigateToTask, }: {
    pendingApprovals: Array<{
        task: ProjectTask;
        approval: ApprovalRequest;
    }>;
    onNavigateToTask: (taskId: string) => void;
}): import("react").JSX.Element;
export declare function ObserveBanner({ log, onExecute, onIgnore, }: {
    log: DispatchLogEntry[];
    onExecute: (entry: DispatchLogEntry) => void;
    onIgnore: (id: string) => void;
}): import("react").JSX.Element;
export declare function ReadyBanner({ readyTasks, onDispatch, }: {
    readyTasks: ProjectTask[];
    onDispatch: () => void;
}): import("react").JSX.Element;
//# sourceMappingURL=banners.d.ts.map