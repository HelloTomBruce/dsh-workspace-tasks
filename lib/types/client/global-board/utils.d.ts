import type { DecisionRecord, ProjectTask } from "../../store/types.ts";
import type { ActivityEntry } from "../../store/global.ts";
/**
 * 任务中台纯逻辑：标签格式化 / 决策链重建 / 跳转导航。
 * 无 JSX、无 React 依赖——可单测、可被任意组件复用。
 */
export declare const API_BASE = "/__dsh-tasks__";
export declare function claimLabel(task: ProjectTask): string | null;
export declare const dispatchModeBadge: (mode: "observe" | "auto" | "off") => {
    icon: string;
    label: string;
};
/** 派发记录状态徽标（中台派发记录面板用） */
export declare const DISPATCH_STATUS_META: Record<string, {
    icon: string;
    label: string;
    color: string;
}>;
export declare const STATUS_LABEL: Record<string, string>;
/** 检查点 from/to 是 JSON 字符串（如 "\"todo\""），解析为可读值；状态码翻译为中文，超长截断（maxLen=0 不截断） */
export declare function fmtCheckpointValue(raw: string, maxLen?: number): string;
/** 动态条目展示文本：决策=标题+操作者；检查点=字段 from→to（可读化） */
export declare function activityText(a: ActivityEntry): string;
/**
 * 决策演进链重建：决策只有 supersededBy（旧→新）单向指针，
 * 从未被取代的「现行」链头向前回溯 predecessor，输出 oldest→newest 的链数组。
 * supersededBy 指向不存在/成环的悬挂节点兜底单节点链，不丢任何决策。
 */
export declare function buildDecisionChains(decisions: DecisionRecord[]): DecisionRecord[][];
/**
 * 跳回右栏工作区看板（工作区卡片标题用）。中台占据主区域时没有会话面板，
 * sidebarRight.openTab 会抛「no session surface is mounted」——先查会话再跳，避免噪音。
 */
export declare function navigateToWorkspaceBoard(workspacePath: string): void;
//# sourceMappingURL=utils.d.ts.map