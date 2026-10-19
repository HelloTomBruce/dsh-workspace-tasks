import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
/**
 * 获取本地持久化根目录：统一存放在用户本地 ~/.dsh/storages/workspace-tasks/，
 * 绝不污染用户代码仓库，也绝不参与 Git 跟踪与提交。
 */
export function getStorageDir() {
    return (process.env.DSH_TASKS_STORAGE_DIR ||
        path.join(os.homedir(), ".dsh", "storages", "workspace-tasks"));
}
/**
 * 根据工作区绝对路径生成唯一的本地存储文件名。
 * 格式形如：<工作区文件夹名>-<sha256前8位>.json
 */
export function getTasksFilePath(workspacePath) {
    const normalized = path.resolve(workspacePath);
    const base = path.basename(normalized) || "root";
    const hash = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 8);
    const safeName = `${base.replace(/[^a-zA-Z0-9_\-\.]/g, "_")}-${hash}.json`;
    return path.join(getStorageDir(), safeName);
}
function computeSummary(tasks) {
    let todo = 0;
    let inProgress = 0;
    let review = 0;
    let done = 0;
    let blocked = 0;
    let archived = 0;
    for (const t of tasks) {
        switch (t.status) {
            case "todo":
                todo++;
                break;
            case "in_progress":
                inProgress++;
                break;
            case "review":
                review++;
                break;
            case "done":
                done++;
                break;
            case "blocked":
                blocked++;
                break;
            case "archived":
                archived++;
                break;
        }
    }
    return {
        total: tasks.length - archived,
        todo,
        inProgress,
        review,
        done,
        blocked,
        archived,
    };
}
export class TaskStore {
    static async load(workspacePath) {
        const filePath = getTasksFilePath(workspacePath);
        try {
            const raw = await fs.readFile(filePath, "utf-8");
            const doc = JSON.parse(raw);
            return {
                version: doc.version ?? 1,
                workspacePath,
                tasks: Array.isArray(doc.tasks) ? doc.tasks : [],
                updatedAt: doc.updatedAt ?? new Date().toISOString(),
            };
        }
        catch {
            return {
                version: 1,
                workspacePath,
                tasks: [],
                updatedAt: new Date().toISOString(),
            };
        }
    }
    static async save(workspacePath, doc) {
        const filePath = getTasksFilePath(workspacePath);
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        doc.updatedAt = new Date().toISOString();
        await fs.writeFile(filePath, JSON.stringify(doc, null, 2), "utf-8");
    }
    static async listTasks(workspacePath) {
        const doc = await this.load(workspacePath);
        return {
            tasks: doc.tasks,
            summary: computeSummary(doc.tasks),
        };
    }
    static async createTasks(workspacePath, items) {
        if (!items || items.length === 0)
            return [];
        const doc = await this.load(workspacePath);
        let maxNum = doc.tasks.reduce((max, t) => {
            const match = t.id.match(/^TASK-(\d+)$/);
            if (match && match[1]) {
                const num = parseInt(match[1], 10);
                return num > max ? num : max;
            }
            return max;
        }, 0);
        const created = [];
        const now = new Date().toISOString();
        for (const params of items) {
            if (!params.title || !params.title.trim())
                continue;
            maxNum++;
            const nextId = `TASK-${String(maxNum).padStart(3, "0")}`;
            const newTask = {
                id: nextId,
                title: params.title.trim(),
                description: params.description?.trim() || "",
                status: "todo",
                priority: params.priority || "P1",
                assignee: params.assignee || "agent",
                createdAt: now,
                updatedAt: now,
                // 仅在确有值时写入：undefined 自有属性无法通过 harness 的 lossless-JSON 快照校验
                ...(params.sessionId !== undefined ? { sessionId: params.sessionId } : {}),
                conclusions: [],
            };
            created.push(newTask);
        }
        if (created.length > 0) {
            doc.tasks.unshift(...created);
            await this.save(workspacePath, doc);
        }
        return created;
    }
    static async createTask(workspacePath, params) {
        const list = await this.createTasks(workspacePath, [params]);
        if (!list[0]) {
            throw new Error("Task title cannot be empty");
        }
        return list[0];
    }
    static async updateTask(workspacePath, taskId, patch) {
        const doc = await this.load(workspacePath);
        const task = doc.tasks.find((t) => t.id === taskId);
        if (!task)
            return null;
        if (patch.title !== undefined)
            task.title = patch.title.trim();
        if (patch.description !== undefined)
            task.description = patch.description.trim();
        if (patch.status !== undefined)
            task.status = patch.status;
        if (patch.priority !== undefined)
            task.priority = patch.priority;
        if (patch.assignee !== undefined)
            task.assignee = patch.assignee;
        task.updatedAt = new Date().toISOString();
        await this.save(workspacePath, doc);
        return task;
    }
    static async addConclusion(workspacePath, taskId, conclusion) {
        const doc = await this.load(workspacePath);
        const task = doc.tasks.find((t) => t.id === taskId);
        if (!task)
            return null;
        const conclusionSessionId = conclusion.sessionId ?? task.sessionId;
        const newConclusion = {
            id: `CONC-${Date.now()}`,
            summary: conclusion.summary.trim(),
            deliverables: conclusion.deliverables ?? [],
            insights: conclusion.insights ?? [],
            completedAt: new Date().toISOString(),
            // 仅在确有值时写入：undefined 自有属性无法通过 harness 的 lossless-JSON 快照校验
            ...(conclusionSessionId !== undefined ? { sessionId: conclusionSessionId } : {}),
        };
        task.conclusions.unshift(newConclusion);
        task.status = "done";
        task.updatedAt = new Date().toISOString();
        await this.save(workspacePath, doc);
        return task;
    }
    static async archiveTask(workspacePath, taskId) {
        return this.updateTask(workspacePath, taskId, { status: "archived" });
    }
    static async deleteTask(workspacePath, taskId) {
        const doc = await this.load(workspacePath);
        const initialLen = doc.tasks.length;
        doc.tasks = doc.tasks.filter((t) => t.id !== taskId);
        if (doc.tasks.length === initialLen)
            return false;
        await this.save(workspacePath, doc);
        return true;
    }
}
//# sourceMappingURL=task-store.js.map