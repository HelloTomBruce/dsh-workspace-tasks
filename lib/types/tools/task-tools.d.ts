import type { Context } from "@deepseek-ai/cordis";
import type { TaskPriority, TaskStatus } from "../store/types.ts";
export interface TaskCreateItem {
    title: string;
    description?: string;
    priority?: TaskPriority;
    tags?: string[];
    assignee?: string;
    dependsOn?: string[];
}
export interface WorkspaceTaskToolArgs {
    action: "list" | "create" | "update" | "conclude" | "archive" | "delete" | "get_ready_tasks" | "export_report" | "record_decision" | "get_task_history" | "link_trace" | "claim" | "release" | "request_approval";
    taskId?: string;
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    tags?: string[];
    assignee?: string;
    dependsOn?: string[];
    tasks?: TaskCreateItem[];
    summary?: string;
    deliverables?: string[];
    insights?: string[];
    workspacePath?: string;
    /** record_decision / supersedeDecision 时使用：决策标题 */
    decisionTitle?: string;
    /** record_decision 时使用：决策理由（自包含，不依赖会话内容） */
    rationale?: string;
    /** record_decision 时使用：已考虑并否决的备选方案 */
    alternatives?: string[];
    /** record_decision 时使用：决策者标识（自由文本快照） */
    actor?: string;
    /** record_decision 时使用：产生决策的会话 ID（装饰性可悬挂线索） */
    sessionId?: string;
    /** record_decision 时使用：要取代（supersede）的既有决策 ID */
    supersedeDecisionId?: string;
    /** link_trace 时使用：被引用工作区路径 */
    refWorkspacePath?: string;
    /** link_trace 时使用：被引用任务 ID */
    refTaskId?: string;
    /** link_trace 时使用：引用说明 */
    refNote?: string;
    /** claim / update(in_progress) 时使用：租约分钟数（默认 60，可调 1–240） */
    leaseMinutes?: number;
    /** request_approval 时使用：拍板事项标题（票拟标题） */
    approvalTitle?: string;
    /** request_approval 时使用：背景说明（可选） */
    approvalDetail?: string;
    /** request_approval 时使用：批红候选选项文本（≥2 个） */
    options?: string[];
}
export declare function registerTaskTools(ctx: Context): () => void;
//# sourceMappingURL=task-tools.d.ts.map