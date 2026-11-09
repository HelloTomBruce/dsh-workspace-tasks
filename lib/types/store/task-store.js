import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { getReadyTasks, generateWorkspaceSummaryReport } from "./pipeline.js";
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
const CHECKPOINT_FIELDS = ["title", "description", "status", "priority", "assignee", "tags", "dependsOn"];
function snapshot(value) {
    return JSON.stringify(value ?? null);
}
/** 向任务追加检查点事件（append-only，最新在前） */
function pushCheckpoints(task, events) {
    if (events.length === 0)
        return;
    if (!task.history)
        task.history = [];
    const at = new Date().toISOString();
    task.history.unshift(...events.map((e) => ({ ...e, at })));
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
            const validDeps = Array.isArray(params.dependsOn)
                ? Array.from(new Set(params.dependsOn.map((d) => d.trim()).filter((d) => Boolean(d) && d !== nextId)))
                : [];
            const validTags = Array.isArray(params.tags)
                ? Array.from(new Set(params.tags.map((t) => t.trim()).filter(Boolean)))
                : [];
            const newTask = {
                id: nextId,
                title: params.title.trim(),
                description: params.description?.trim() || "",
                status: "todo",
                priority: params.priority || "P1",
                ...(validTags.length > 0 ? { tags: validTags } : {}),
                assignee: params.assignee || "agent",
                ...(validDeps.length > 0 ? { dependsOn: validDeps } : {}),
                createdAt: now,
                updatedAt: now,
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
        // 记录变更前的快照，落盘前生成检查点事件
        const before = new Map();
        for (const f of CHECKPOINT_FIELDS)
            before.set(f, task[f]);
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
        if (patch.tags !== undefined) {
            const validTags = Array.isArray(patch.tags)
                ? Array.from(new Set(patch.tags.map((t) => t.trim()).filter(Boolean)))
                : [];
            if (validTags.length > 0) {
                task.tags = validTags;
            }
            else {
                delete task.tags;
            }
        }
        if (patch.dependsOn !== undefined) {
            const validDeps = Array.isArray(patch.dependsOn)
                ? Array.from(new Set(patch.dependsOn.map((d) => d.trim()).filter((d) => Boolean(d) && d !== taskId)))
                : [];
            if (validDeps.length > 0) {
                task.dependsOn = validDeps;
            }
            else {
                delete task.dependsOn;
            }
        }
        task.updatedAt = new Date().toISOString();
        pushCheckpoints(task, CHECKPOINT_FIELDS.filter((f) => snapshot(before.get(f)) !== snapshot(task[f])).map((f) => ({
            field: f,
            from: snapshot(before.get(f)),
            to: snapshot(task[f]),
        })));
        await this.save(workspacePath, doc);
        return task;
    }
    /**
     * 查询任务过程检查点（append-only 事件日志，最新在前）。
     */
    static async getTaskHistory(workspacePath, taskId) {
        const doc = await this.load(workspacePath);
        const task = doc.tasks.find((t) => t.id === taskId);
        return task?.history ?? [];
    }
    /**
     * 添加跨工作区痕迹引用（只读）。引用存于本工作区任务上，与被引用方完全解耦；
     * 解析（resolveTraceRefs）失败时引用仍保留，仅标记悬挂。
     */
    static async addTraceRef(workspacePath, taskId, ref) {
        if (!ref.workspacePath?.trim() || !ref.taskId?.trim())
            return null;
        const doc = await this.load(workspacePath);
        const task = doc.tasks.find((t) => t.id === taskId);
        if (!task)
            return null;
        if (!task.traceRefs)
            task.traceRefs = [];
        const normalized = {
            workspacePath: path.resolve(ref.workspacePath.trim()),
            taskId: ref.taskId.trim(),
            ...(ref.note?.trim() ? { note: ref.note.trim() } : {}),
        };
        // 去重：同 workspace+taskId 的引用只保留一条（note 以最后一次为准）
        task.traceRefs = task.traceRefs.filter((r) => !(r.workspacePath === normalized.workspacePath && r.taskId === normalized.taskId));
        task.traceRefs.push(normalized);
        task.updatedAt = new Date().toISOString();
        pushCheckpoints(task, [
            { field: "traceRefs", from: "null", to: snapshot(normalized) },
        ]);
        await this.save(workspacePath, doc);
        return task;
    }
    /**
     * 解析任务上的跨工作区引用：读取来源工作区任务，填充 resolved
     * （title + 最新结论摘要）；来源不可达时标记 dangling，不抛错、不丢引用。
     */
    static async resolveTraceRefs(workspacePath, taskId) {
        const doc = await this.load(workspacePath);
        const task = doc.tasks.find((t) => t.id === taskId);
        if (!task)
            return null;
        const refs = task.traceRefs ?? [];
        return Promise.all(refs.map(async (ref) => {
            try {
                const sourceDoc = await this.load(ref.workspacePath);
                const source = sourceDoc.tasks.find((t) => t.id === ref.taskId);
                if (!source) {
                    return { ...ref, resolved: { title: "", dangling: true } };
                }
                return {
                    ...ref,
                    resolved: {
                        title: source.title,
                        latestSummary: source.conclusions[0]?.summary,
                    },
                };
            }
            catch {
                return { ...ref, resolved: { title: "", dangling: true } };
            }
        }));
    }
    static async addConclusion(workspacePath, taskId, conclusion) {
        const doc = await this.load(workspacePath);
        const task = doc.tasks.find((t) => t.id === taskId);
        if (!task)
            return null;
        const newConclusion = {
            id: `CONC-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
            summary: conclusion.summary.trim(),
            deliverables: conclusion.deliverables ?? [],
            insights: conclusion.insights ?? [],
            completedAt: new Date().toISOString(),
        };
        task.conclusions.unshift(newConclusion);
        const prevStatus = task.status;
        task.status = "done";
        task.updatedAt = new Date().toISOString();
        pushCheckpoints(task, [
            { field: "conclusion", from: "null", to: snapshot({ id: newConclusion.id, summary: newConclusion.summary }) },
            ...(prevStatus !== "done" ? [{ field: "status", from: snapshot(prevStatus), to: snapshot("done") }] : []),
        ]);
        await this.save(workspacePath, doc);
        return task;
    }
    /**
     * 追加决策记录（append-only）。决策正文一旦写入即不可改写；
     * 若对同一问题改主意，请用 supersedeDecision 生成新决策并建立 supersededBy 链。
     * sessionId 仅为装饰性溯源线索，可悬挂，不参与任何读取依赖。
     */
    static async addDecision(workspacePath, taskId, decision) {
        const doc = await this.load(workspacePath);
        const task = doc.tasks.find((t) => t.id === taskId);
        if (!task)
            return null;
        const record = {
            id: `DEC-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
            title: decision.title.trim(),
            rationale: decision.rationale.trim(),
            ...(Array.isArray(decision.alternatives) && decision.alternatives.length > 0
                ? { alternatives: decision.alternatives.map((a) => a.trim()).filter(Boolean) }
                : {}),
            ...(decision.actor?.trim() ? { actor: decision.actor.trim() } : {}),
            ...(decision.sessionId?.trim() ? { sessionId: decision.sessionId.trim() } : {}),
            decidedAt: new Date().toISOString(),
        };
        if (!task.decisionLog)
            task.decisionLog = [];
        task.decisionLog.unshift(record);
        task.updatedAt = new Date().toISOString();
        pushCheckpoints(task, [
            { field: "decision", from: "null", to: snapshot({ id: record.id, title: record.title }) },
        ]);
        await this.save(workspacePath, doc);
        return record;
    }
    /**
     * 取代（supersede）一条既有决策：仅给旧记录打上 supersededBy 标记，不改写其正文；
     * 并以新决策的身份追加一条新记录（newDecision 完整自包含），建立演进链。
     * 返回新决策记录；旧决策不存在或已被取代时返回 null。
     */
    static async supersedeDecision(workspacePath, taskId, supersededDecisionId, newDecision) {
        const doc = await this.load(workspacePath);
        const task = doc.tasks.find((t) => t.id === taskId);
        if (!task)
            return null;
        const log = task.decisionLog ?? [];
        const old = log.find((d) => d.id === supersededDecisionId);
        if (!old || old.supersededBy)
            return null;
        const record = await this.addDecision(workspacePath, taskId, newDecision);
        if (!record)
            return null;
        // addDecision 重新 load/save 过，需要再次定位旧记录补标记
        const doc2 = await this.load(workspacePath);
        const task2 = doc2.tasks.find((t) => t.id === taskId);
        const old2 = task2?.decisionLog?.find((d) => d.id === supersededDecisionId);
        const new2 = task2?.decisionLog?.find((d) => d.id === record.id);
        if (!task2 || !old2 || !new2)
            return record;
        old2.supersededBy = new2.id;
        task2.updatedAt = new Date().toISOString();
        pushCheckpoints(task2, [
            { field: "decision.supersededBy", from: "null", to: snapshot({ decision: old2.id, supersededBy: new2.id }) },
        ]);
        await this.save(workspacePath, doc2);
        return new2;
    }
    /**
     * 查询任务决策日志（含被 supersede 的历史），按 decidedAt 倒序。
     * sessionId 悬挂与否不影响读取——决策内容全部自包含。
     */
    static async listDecisions(workspacePath, taskId) {
        const doc = await this.load(workspacePath);
        const task = doc.tasks.find((t) => t.id === taskId);
        return task?.decisionLog ?? [];
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
    static async getReadyTasks(workspacePath) {
        const doc = await this.load(workspacePath);
        return getReadyTasks(doc.tasks);
    }
    static async exportSummaryReport(workspacePath) {
        const doc = await this.load(workspacePath);
        return generateWorkspaceSummaryReport(doc.tasks, workspacePath);
    }
}
//# sourceMappingURL=task-store.js.map