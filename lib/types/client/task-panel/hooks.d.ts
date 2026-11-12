import type { ProjectTask, WorkspaceTasksSummary } from "../../store/types.ts";
/**
 * TaskPanel 数据 hooks：任务列表 / 自动派发规则与记录轮询（从 TaskPanel.tsx 原样迁移）。
 */
export declare const API_BASE = "/__dsh-tasks__";
export declare function useTasks(workspacePath: string): {
    tasks: ProjectTask[];
    summary: WorkspaceTasksSummary;
    loading: boolean;
    refresh: () => void;
};
export interface DispatchRuleInfo {
    mode: "observe" | "auto" | "off";
    priorities: string[];
    tagsExclude?: string[];
    whitelist?: string[];
    maxConcurrent: number;
    /** 停滞检测阈值（小时，默认 24） */
    staleHours?: number;
}
export interface DispatchLogEntry {
    id: string;
    taskId: string;
    taskTitle?: string;
    triggerTaskId?: string;
    hop: number;
    mode: "observe" | "auto";
    status: "queued" | "sent" | "failed" | "ignored" | "would-dispatch" | "tripped";
    createdAt: string;
    ackedAt?: string;
}
export declare function useDispatch(workspacePath: string): {
    rules: DispatchRuleInfo | null;
    log: DispatchLogEntry[];
    refresh: () => void;
};
//# sourceMappingURL=hooks.d.ts.map