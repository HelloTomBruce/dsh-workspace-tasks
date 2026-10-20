/**
 * 检查单个任务的前置依赖是否全部满足（全部为 done 状态）
 */
export function getTaskDependencyStatus(task, allTasks) {
    if (!task.dependsOn || task.dependsOn.length === 0) {
        return { isReady: true, unfulfilledDeps: [] };
    }
    const taskMap = new Map();
    for (const t of allTasks) {
        taskMap.set(t.id, t);
    }
    const unfulfilledDeps = [];
    for (const depId of task.dependsOn) {
        const depTask = taskMap.get(depId);
        if (!depTask || depTask.status !== "done") {
            unfulfilledDeps.push(depId);
        }
    }
    return {
        isReady: unfulfilledDeps.length === 0,
        unfulfilledDeps,
    };
}
/**
 * 检查任务是否已就绪（未完成且依赖全部就绪）
 */
export function isTaskReady(task, allTasks) {
    if (task.status === "done" || task.status === "archived") {
        return false;
    }
    return getTaskDependencyStatus(task, allTasks).isReady;
}
/**
 * 优先级权重对照
 */
const PRIORITY_WEIGHT = {
    P0: 3,
    P1: 2,
    P2: 1,
};
/**
 * 获取当前工作区中所有“已就绪”的任务列表
 * 规则：
 * 1. 状态不是 done 或 archived
 * 2. 没有前置依赖，或前置依赖全部已处于 done 状态
 * 3. 排序规则：优先级 P0 > P1 > P2，再按创建时间升序排列
 */
export function getReadyTasks(tasks) {
    const readyList = tasks.filter((task) => isTaskReady(task, tasks));
    return readyList.sort((a, b) => {
        const weightA = PRIORITY_WEIGHT[a.priority] ?? 0;
        const weightB = PRIORITY_WEIGHT[b.priority] ?? 0;
        if (weightA !== weightB) {
            return weightB - weightA; // 降序
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}
/**
 * 全景工程交付总结报告生成器 (Markdown)
 */
export function generateWorkspaceSummaryReport(tasks, workspacePath) {
    // 过滤掉已归档任务，报告仅包含活跃任务
    const activeTasks = tasks.filter((t) => t.status !== "archived");
    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    const total = activeTasks.length;
    const doneTasks = activeTasks.filter((t) => t.status === "done");
    const inProgressTasks = activeTasks.filter((t) => t.status === "in_progress");
    const reviewTasks = activeTasks.filter((t) => t.status === "review");
    const todoTasks = activeTasks.filter((t) => t.status === "todo");
    const blockedTasks = activeTasks.filter((t) => t.status === "blocked");
    // 聚合所有交付物与心得
    const deliverableMap = new Map(); // path -> taskIds
    const allInsights = [];
    for (const t of activeTasks) {
        for (const c of t.conclusions || []) {
            for (const d of c.deliverables || []) {
                const trimmed = d.trim();
                if (!trimmed)
                    continue;
                const list = deliverableMap.get(trimmed) || [];
                if (!list.includes(t.id))
                    list.push(t.id);
                deliverableMap.set(trimmed, list);
            }
            for (const i of c.insights || []) {
                const trimmed = i.trim();
                if (trimmed) {
                    allInsights.push({ insight: trimmed, taskId: t.id });
                }
            }
        }
    }
    const lines = [];
    lines.push(`# 🚀 工作区交付与工程总结报告`);
    lines.push(`> **生成时间**: ${now}  `);
    if (workspacePath) {
        lines.push(`> **工作区路径**: \`${workspacePath}\`  `);
    }
    lines.push(`> **统计概览**: 共 **${total}** 个任务 | ✅ 已完成 **${doneTasks.length}** | ⚡ 进行中 **${inProgressTasks.length}** | 🔍 审查 **${reviewTasks.length}** | 📋 待办 **${todoTasks.length}** | 🔒 阻塞 **${blockedTasks.length}**\n`);
    // 1. 产出交付物汇总
    lines.push(`## 📦 核心产出交付物 (Deliverables)`);
    if (deliverableMap.size === 0) {
        lines.push(`*暂无已登记的交付物文件。*\n`);
    }
    else {
        for (const [filePath, taskIds] of deliverableMap.entries()) {
            lines.push(`- \`${filePath}\` *(关联任务: ${taskIds.join(", ")})*`);
        }
        lines.push("");
    }
    // 2. 沉淀经验与避坑要点
    lines.push(`## 💡 经验沉淀与避坑心得 (Consolidated Insights)`);
    if (allInsights.length === 0) {
        lines.push(`*暂无已沉淀的避坑经验。*\n`);
    }
    else {
        allInsights.forEach((item, idx) => {
            lines.push(`${idx + 1}. **[${item.taskId}]** ${item.insight}`);
        });
        lines.push("");
    }
    // 3. 已完成任务明细
    lines.push(`## ✅ 已完成任务清单 (Completed Tasks)`);
    if (doneTasks.length === 0) {
        lines.push(`*暂无已完成任务。*\n`);
    }
    else {
        for (const t of doneTasks) {
            const tagStr = t.tags && t.tags.length > 0 ? ` \`[${t.tags.join(" | ")}]\`` : "";
            lines.push(`### [${t.priority}] ${t.id}: ${t.title}${tagStr}`);
            if (t.description) {
                lines.push(`${t.description}\n`);
            }
            if (t.sessionId) {
                lines.push(`- **关联会话**: \`#${t.sessionId.slice(0, 8)}\``);
            }
            if (t.conclusions && t.conclusions.length > 0) {
                lines.push(`- **执行结论**:`);
                for (const c of t.conclusions) {
                    lines.push(`  - **摘要**: ${c.summary}`);
                    if (c.deliverables && c.deliverables.length > 0) {
                        lines.push(`  - **交付文件**: ${c.deliverables.map((d) => `\`${d}\``).join(", ")}`);
                    }
                }
            }
            lines.push("");
        }
    }
    // 4. 剩余及待办任务
    const pendingTasks = [...inProgressTasks, ...reviewTasks, ...todoTasks, ...blockedTasks];
    if (pendingTasks.length > 0) {
        lines.push(`## ⏳ 待处理任务 (Pending Tasks)`);
        for (const t of pendingTasks) {
            const tagStr = t.tags && t.tags.length > 0 ? ` \`[${t.tags.join(" | ")}]\`` : "";
            const depStr = t.dependsOn && t.dependsOn.length > 0 ? ` *(依赖: ${t.dependsOn.join(", ")})*` : "";
            lines.push(`- **[${t.status.toUpperCase()}]** [${t.priority}] **${t.id}**: ${t.title}${tagStr}${depStr}`);
        }
        lines.push("");
    }
    return lines.join("\n");
}
//# sourceMappingURL=pipeline.js.map