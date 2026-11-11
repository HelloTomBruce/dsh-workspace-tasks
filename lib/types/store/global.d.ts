import type { ApprovalRequest, ProjectTask, WorkspaceTasksSummary } from "./types.ts";
/**
 * 跨工作区全局聚合（个人中台视图的数据层）：扫描存储目录里所有工作区任务文档，
 * 聚合出「人的注意力该去哪里」的一屏数据——待拍板 / 进行中 / 待验收 / 阻塞 / 就绪。
 *
 * 降级哲学（与 TraceRef 一致）：单个文件损坏/不可读只产生 dangling 条目，绝不抛错。
 * 只读：本模块没有任何写操作。
 */
/** 一个工作区的中台聚合视图 */
export interface WorkspaceOverview {
    workspacePath: string;
    /** 工作区文件夹名（展示用） */
    title: string;
    /** 损坏文件的降级标记：true 时其余字段为空壳 */
    dangling?: true;
    /** 损坏来源文件名（dangling 时展示） */
    fileName?: string;
    updatedAt: string;
    summary: WorkspaceTasksSummary;
    /** 待拍板：pending 审批（带票拟标题，人不用进工作区就知道要批什么） */
    pendingApprovals: Array<{
        taskId: string;
        taskTitle: string;
        approval: ApprovalRequest;
    }>;
    /** 进行中（带认领锁信息） */
    inProgress: ProjectTask[];
    /** 待验收（review 状态） */
    review: ProjectTask[];
    /** 已完成未归档（「忘了验收」痛点：done 一直占着列表等归档） */
    done: ProjectTask[];
    /** 阻塞（无 pending 审批的纯阻塞） */
    blocked: ProjectTask[];
    /** 就绪预览：计数 + 前 3 条（已排除活跃锁任务） */
    readyPreview: {
        count: number;
        tasks: ProjectTask[];
    };
    /** 该工作区的自动派发模式徽标 */
    dispatchMode: "observe" | "auto" | "off";
}
export interface GlobalOverview {
    generatedAt: string;
    workspaces: WorkspaceOverview[];
    /** 跨工作区汇总计数 */
    totals: {
        workspaces: number;
        pendingApprovals: number;
        inProgress: number;
        review: number;
        done: number;
        blocked: number;
        ready: number;
    };
}
/** 聚合所有工作区的中台视图数据 */
export declare function listGlobalOverview(): Promise<GlobalOverview>;
//# sourceMappingURL=global.d.ts.map