import { ProjectTask } from "./types.js";
/**
 * 检查单个任务的前置依赖是否全部满足（全部为 done 状态）
 */
export declare function getTaskDependencyStatus(task: ProjectTask, allTasks: ProjectTask[]): {
    isReady: boolean;
    unfulfilledDeps: string[];
};
/**
 * 检查任务是否已就绪（未完成且依赖全部就绪）
 */
export declare function isTaskReady(task: ProjectTask, allTasks: ProjectTask[]): boolean;
/**
 * 获取当前工作区中所有“已就绪”的任务列表
 * 规则：
 * 1. 状态不是 done 或 archived
 * 2. 没有前置依赖，或前置依赖全部已处于 done 状态
 * 3. 排序规则：优先级 P0 > P1 > P2，再按创建时间升序排列
 */
export declare function getReadyTasks(tasks: ProjectTask[]): ProjectTask[];
/**
 * 全景工程交付总结报告生成器 (Markdown)
 */
export declare function generateWorkspaceSummaryReport(tasks: ProjectTask[], workspacePath?: string): string;
//# sourceMappingURL=pipeline.d.ts.map