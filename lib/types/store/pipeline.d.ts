import { ProjectTask, TaskClaim } from "./types.js";
/** 默认租约时长（分钟），已被用户确认；leaseMinutes 参数可在 1–240 内调整 */
export declare const DEFAULT_LEASE_MINUTES = 60;
export declare const MIN_LEASE_MINUTES = 1;
export declare const MAX_LEASE_MINUTES = 240;
/**
 * 判断认领锁是否处于活跃状态（惰性判定：租约未过期即活跃）。
 * now 可注入便于测试。
 */
export declare function isClaimActive(claim: TaskClaim | undefined, now?: Date): boolean;
/** 规范化租约分钟数：缺省用默认值，越界收敛到 [MIN, MAX] */
export declare function normalizeLeaseMinutes(input?: number): number;
/**
 * 停滞检测（纯规则 Watchdog）：in_progress 任务超过 staleHours 小时无任何新检查点
 * （无新事件时退化为 updatedAt）即视为停滞。now 可注入便于测试。
 * 与 claim/lease 互补：租约管「锁多久算死」，停滞管「活多久没动算停」。
 */
export declare function isTaskStale(task: ProjectTask, staleHours: number, now?: Date): boolean;
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
 * 4. 认领锁：被【他人】活跃锁定的任务不就绪（防止重复派活）；
 *    本人持有的锁不影响（可续跑）；未传 owner 时任何活跃锁都排除
 */
export declare function getReadyTasks(tasks: ProjectTask[], opts?: {
    owner?: string;
    now?: Date;
}): ProjectTask[];
/**
 * 全景工程交付总结报告生成器 (Markdown)
 */
export declare function generateWorkspaceSummaryReport(tasks: ProjectTask[], workspacePath?: string): string;
//# sourceMappingURL=pipeline.d.ts.map