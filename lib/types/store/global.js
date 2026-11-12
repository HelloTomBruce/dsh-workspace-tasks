import fs from "node:fs/promises";
import path from "node:path";
import { getReadyTasks } from "./pipeline.js";
import { computeSummary, getStorageDir } from "./task-store.js";
import { DispatchEngine } from "./dispatch.js";
/** 扫描存储目录，返回所有工作区任务文档（排除 dispatch 文件；坏文件 parse 为 null）。供跨工作区派发取件复用。 */
export async function scanWorkspaceDocuments() {
    const dir = getStorageDir();
    let entries;
    try {
        entries = await fs.readdir(dir);
    }
    catch {
        return [];
    }
    const taskFiles = entries.filter((f) => f.endsWith(".json") && !f.endsWith("-dispatch.json"));
    const docs = [];
    for (const fileName of taskFiles) {
        const filePath = path.join(dir, fileName);
        let mtime = "";
        try {
            const stat = await fs.stat(filePath);
            mtime = stat.mtime.toISOString();
        }
        catch {
            // stat 失败不阻塞
        }
        try {
            const raw = await fs.readFile(filePath, "utf-8");
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.tasks) || typeof parsed.workspacePath !== "string") {
                docs.push({ fileName, doc: null, mtime });
                continue;
            }
            docs.push({ fileName, doc: parsed, mtime });
        }
        catch {
            // 坏文件：dangling 降级，不抛错
            docs.push({ fileName, doc: null, mtime });
        }
    }
    return docs;
}
/** 聚合所有工作区的中台视图数据 */
export async function listGlobalOverview() {
    const scanned = await scanWorkspaceDocuments();
    // 动态池与派发池：与工作区聚合同一趟扫描完成，dangling 工作区跳过
    const activityPool = [];
    const dispatchPool = [];
    const workspaces = await Promise.all(scanned.map(async ({ fileName, doc, mtime }) => {
        if (!doc) {
            return {
                workspacePath: "",
                title: fileName.replace(/\.json$/, ""),
                dangling: true,
                fileName,
                updatedAt: mtime,
                summary: { total: 0, todo: 0, inProgress: 0, review: 0, done: 0, blocked: 0, archived: 0 },
                pendingApprovals: [],
                inProgress: [],
                review: [],
                done: [],
                blocked: [],
                readyPreview: { count: 0, tasks: [] },
                dispatchMode: "off",
            };
        }
        const tasks = doc.tasks;
        const wsTitle = path.basename(doc.workspacePath) || doc.workspacePath;
        // 最近动态池：检查点（每任务最近 4 条，history 本就最新在前）+ 决策记录
        for (const task of tasks) {
            for (const c of (task.history ?? []).slice(0, 4)) {
                activityPool.push({
                    workspacePath: doc.workspacePath,
                    wsTitle,
                    taskId: task.id,
                    taskTitle: task.title,
                    kind: "checkpoint",
                    at: c.at,
                    field: c.field,
                    from: c.from,
                    to: c.to,
                });
            }
            for (const d of task.decisionLog ?? []) {
                activityPool.push({
                    workspacePath: doc.workspacePath,
                    wsTitle,
                    taskId: task.id,
                    taskTitle: task.title,
                    kind: "decision",
                    at: d.decidedAt,
                    decisionTitle: d.title,
                    actor: d.actor,
                });
            }
        }
        // 派发记录池：读失败静默降级（不影响该工作区其余聚合）
        try {
            const logs = await DispatchEngine.listLog(doc.workspacePath, 10);
            for (const record of logs) {
                dispatchPool.push({ workspacePath: doc.workspacePath, wsTitle, record });
            }
        }
        catch {
            // 派发文件不可读：跳过
        }
        const hasPendingApproval = (t) => (t.approvals ?? []).some((a) => a.status === "pending");
        // 就绪预览 = 此刻可派发的新活：只看 todo。
        // in_progress 已有归属在跑（卡片有专属「进行中」分组，重复出现是噪音），
        // review 待验收与 blocked 待拍板都是「等人的」而非「等 Agent 的」，各有专属分组
        const ready = getReadyTasks(tasks).filter((t) => t.status === "todo");
        let dispatchMode = "off";
        try {
            dispatchMode = (await DispatchEngine.getRules(doc.workspacePath)).mode;
        }
        catch {
            // 派发配置不可读时降级为 off 徽标
        }
        return {
            workspacePath: doc.workspacePath,
            title: path.basename(doc.workspacePath) || doc.workspacePath,
            updatedAt: doc.updatedAt || mtime,
            summary: computeSummary(tasks),
            pendingApprovals: tasks
                .filter((t) => t.status !== "archived" && hasPendingApproval(t))
                .map((t) => ({
                taskId: t.id,
                taskTitle: t.title,
                approval: (t.approvals ?? []).find((a) => a.status === "pending"),
                task: t,
            })),
            inProgress: tasks.filter((t) => t.status === "in_progress"),
            review: tasks.filter((t) => t.status === "review"),
            done: tasks.filter((t) => t.status === "done"),
            blocked: tasks.filter((t) => t.status === "blocked" && !hasPendingApproval(t)),
            readyPreview: { count: ready.length, tasks: ready.slice(0, 3) },
            dispatchMode,
        };
    }));
    // 最近活跃的工作区排最前——最可能需要看
    workspaces.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    // 动态/派发：跨工作区时间倒序后截断
    activityPool.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    dispatchPool.sort((a, b) => new Date(b.record.createdAt).getTime() - new Date(a.record.createdAt).getTime());
    const totals = {
        workspaces: workspaces.length,
        pendingApprovals: workspaces.reduce((n, w) => n + w.pendingApprovals.length, 0),
        inProgress: workspaces.reduce((n, w) => n + w.inProgress.length, 0),
        review: workspaces.reduce((n, w) => n + w.review.length, 0),
        done: workspaces.reduce((n, w) => n + w.done.length, 0),
        blocked: workspaces.reduce((n, w) => n + w.blocked.length, 0),
        ready: workspaces.reduce((n, w) => n + w.readyPreview.count, 0),
    };
    return {
        generatedAt: new Date().toISOString(),
        workspaces,
        totals,
        recentActivity: activityPool.slice(0, 8),
        recentDispatches: dispatchPool.slice(0, 10),
    };
}
//# sourceMappingURL=global.js.map