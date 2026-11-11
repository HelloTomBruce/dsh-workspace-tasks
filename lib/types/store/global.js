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
        const hasPendingApproval = (t) => (t.approvals ?? []).some((a) => a.status === "pending");
        // 就绪预览 = 此刻可派发的活：排除活跃锁（getReadyTasks 无 owner 语义），
        // 且只看 todo / in_progress（未认领续跑）——review 待验收与 blocked 待拍板
        // 都是「等人的」而非「等 Agent 的」，各有专属分组，不重复报告
        const ready = getReadyTasks(tasks).filter((t) => t.status === "todo" || t.status === "in_progress");
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
    const totals = {
        workspaces: workspaces.length,
        pendingApprovals: workspaces.reduce((n, w) => n + w.pendingApprovals.length, 0),
        inProgress: workspaces.reduce((n, w) => n + w.inProgress.length, 0),
        review: workspaces.reduce((n, w) => n + w.review.length, 0),
        done: workspaces.reduce((n, w) => n + w.done.length, 0),
        blocked: workspaces.reduce((n, w) => n + w.blocked.length, 0),
        ready: workspaces.reduce((n, w) => n + w.readyPreview.count, 0),
    };
    return { generatedAt: new Date().toISOString(), workspaces, totals };
}
//# sourceMappingURL=global.js.map