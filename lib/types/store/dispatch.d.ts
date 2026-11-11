import type { TaskPriority } from "./types.ts";
/**
 * 自动派发引擎（Fast Path 事件驱动）：宿主侧纯规则判定，零 Token。
 *
 * 触发链：TaskStore.onTaskDone → evaluate() → 规则过滤 → 追加 DispatchRecord。
 * 无命中时静默退出——「没新东西不叫醒模型」。
 *
 * 两种模式（mode）：
 * - observe（默认）：只记录「本会派发什么」（would-dispatch），人验证规则靠谱后再切 auto；
 * - auto：标记 queued，等客户端执行器轮询取走、唤醒 Agent 后 ack 回执。
 * off 时完全短路。并发闸门：未 ack 的 queued 达到 maxConcurrent 不再派新（防堆积）。
 */
export type DispatchMode = "observe" | "auto" | "off";
export interface DispatchRules {
    mode: DispatchMode;
    /** 只自动派发这些优先级的任务（默认 P0/P1） */
    priorities: TaskPriority[];
    /** 带这些标签的任务永不自动派发 */
    tagsExclude?: string[];
    /** 非空时只派发白名单内的任务 ID */
    whitelist?: string[];
    /** 同时在飞的派发上限（默认 1：注意力优先于吞吐） */
    maxConcurrent: number;
    /** 停滞检测阈值（小时，默认 24）：in_progress 任务超过此时长无新检查点即视为停滞 */
    staleHours?: number;
}
export type DispatchStatus = "queued" | "sent" | "failed" | "ignored" | "would-dispatch" | "tripped";
export interface DispatchRecord {
    id: string;
    taskId: string;
    taskTitle?: string;
    /** 触发源任务（哪张工单的完成引发了这次派发）；人为起点无此字段 */
    triggerTaskId?: string;
    /** 派发链深度：触发任务最近一条派发 hop + 1（TASK-011 TTL 熔断的数据基础） */
    hop: number;
    mode: "observe" | "auto";
    status: DispatchStatus;
    createdAt: string;
    ackedAt?: string;
}
interface DispatchDocument {
    version: number;
    rules: DispatchRules;
    log: DispatchRecord[];
    updatedAt: string;
}
export declare const DEFAULT_DISPATCH_RULES: DispatchRules;
/** 派发链 TTL：hop 超过该层数即熔断（借网络包 TTL 思路防 Agent 链失控；人工干预不清零） */
export declare const MAX_DISPATCH_HOP = 8;
export declare const DEFAULT_STALE_HOURS = 24;
/** 派发存储文件与任务文件同目录同命名规则（<工作区名>-<hash>-dispatch.json），不进 git */
export declare function getDispatchFilePath(workspacePath: string): string;
export declare class DispatchEngine {
    static load(workspacePath: string): Promise<DispatchDocument>;
    static save(workspacePath: string, doc: DispatchDocument): Promise<void>;
    static getRules(workspacePath: string): Promise<DispatchRules>;
    static updateRules(workspacePath: string, patch: Partial<DispatchRules>): Promise<DispatchRules>;
    /** 客户端执行器取件：所有等待唤醒的 queued 条目（最新在前） */
    static listPending(workspacePath: string): Promise<DispatchRecord[]>;
    static listLog(workspacePath: string, limit?: number): Promise<DispatchRecord[]>;
    /**
     * 回执/处置：queued / would-dispatch → sent / failed / ignored；tripped（已熔断）→ ignored（人工确认后消除告警）。
     * sent 由客户端成功唤醒后回报；failed 为唤醒失败（不静默重试）；ignored 为人手动忽略。
     */
    static ack(workspacePath: string, id: string, status: "sent" | "failed" | "ignored"): Promise<DispatchRecord | null>;
    /**
     * 任务完成事件驱动的主判定：返回新产生的派发记录；任何不派发的分支都返回 null（静默）。
     */
    static evaluate(workspacePath: string, triggerTaskId?: string): Promise<DispatchRecord | null>;
}
export {};
//# sourceMappingURL=dispatch.d.ts.map