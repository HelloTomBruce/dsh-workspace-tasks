import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getReadyTasks } from "./pipeline.js";
import { TaskStore, getTasksFilePath } from "./task-store.js";
export const DEFAULT_DISPATCH_RULES = {
    mode: "observe",
    priorities: ["P0", "P1"],
    maxConcurrent: 1,
    staleHours: 24,
};
/** 派发链 TTL：hop 超过该层数即熔断（借网络包 TTL 思路防 Agent 链失控；人工干预不清零） */
export const MAX_DISPATCH_HOP = 8;
export const DEFAULT_STALE_HOURS = 24;
const DISPATCH_LOG_LIMIT = 200;
const VALID_MODES = ["observe", "auto", "off"];
const VALID_PRIORITIES = ["P0", "P1", "P2"];
/** 派发存储文件与任务文件同目录同命名规则（<工作区名>-<hash>-dispatch.json），不进 git */
export function getDispatchFilePath(workspacePath) {
    return getTasksFilePath(workspacePath).replace(/\.json$/, "-dispatch.json");
}
export class DispatchEngine {
    static async load(workspacePath) {
        const filePath = getDispatchFilePath(workspacePath);
        try {
            const raw = await fs.readFile(filePath, "utf-8");
            const doc = JSON.parse(raw);
            return {
                version: 1,
                rules: { ...DEFAULT_DISPATCH_RULES, ...(doc.rules ?? {}) },
                log: Array.isArray(doc.log) ? doc.log : [],
                updatedAt: doc.updatedAt ?? new Date().toISOString(),
            };
        }
        catch {
            return {
                version: 1,
                rules: { ...DEFAULT_DISPATCH_RULES },
                log: [],
                updatedAt: new Date().toISOString(),
            };
        }
    }
    static async save(workspacePath, doc) {
        const filePath = getDispatchFilePath(workspacePath);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        doc.updatedAt = new Date().toISOString();
        await fs.writeFile(filePath, JSON.stringify(doc, null, 2), "utf-8");
    }
    static async getRules(workspacePath) {
        const doc = await this.load(workspacePath);
        return doc.rules;
    }
    static async updateRules(workspacePath, patch) {
        const doc = await this.load(workspacePath);
        const next = { ...doc.rules };
        if (patch.mode !== undefined && VALID_MODES.includes(patch.mode)) {
            next.mode = patch.mode;
        }
        if (patch.priorities !== undefined && Array.isArray(patch.priorities)) {
            const valid = Array.from(new Set(patch.priorities.filter((p) => VALID_PRIORITIES.includes(p))));
            if (valid.length > 0)
                next.priorities = valid;
        }
        if (patch.tagsExclude !== undefined) {
            const cleaned = Array.isArray(patch.tagsExclude)
                ? Array.from(new Set(patch.tagsExclude.map((t) => t.trim()).filter(Boolean)))
                : [];
            if (cleaned.length > 0)
                next.tagsExclude = cleaned;
            else
                delete next.tagsExclude;
        }
        if (patch.whitelist !== undefined) {
            const cleaned = Array.isArray(patch.whitelist)
                ? Array.from(new Set(patch.whitelist.map((t) => t.trim()).filter(Boolean)))
                : [];
            if (cleaned.length > 0)
                next.whitelist = cleaned;
            else
                delete next.whitelist;
        }
        if (patch.maxConcurrent !== undefined && Number.isFinite(patch.maxConcurrent)) {
            next.maxConcurrent = Math.min(8, Math.max(1, Math.floor(patch.maxConcurrent)));
        }
        if (patch.staleHours !== undefined && Number.isFinite(patch.staleHours)) {
            next.staleHours = Math.min(720, Math.max(1, Math.floor(patch.staleHours)));
        }
        doc.rules = next;
        await this.save(workspacePath, doc);
        return next;
    }
    /** 客户端执行器取件：所有等待唤醒的 queued 条目（最新在前） */
    static async listPending(workspacePath) {
        const doc = await this.load(workspacePath);
        return doc.log.filter((r) => r.status === "queued");
    }
    /**
     * 跨工作区取件（配置 dispatch.crossWorkspace 开启时由执行器调用）：
     * 扫全部工作区文档，聚合各自派发队列里的 queued 条目（附 workspacePath 供路由会话）。
     * 单个派发文件损坏时降级跳过，绝不抛错。
     */
    static async listPendingAllWorkspaces() {
        const { scanWorkspaceDocuments } = await import("./global.js");
        const docs = await scanWorkspaceDocuments();
        const out = [];
        for (const { doc } of docs) {
            if (!doc?.workspacePath)
                continue;
            try {
                const dispatchDoc = await this.load(doc.workspacePath);
                for (const record of dispatchDoc.log) {
                    if (record.status === "queued")
                        out.push({ workspacePath: doc.workspacePath, record });
                }
            }
            catch {
                // 单个工作区派发文件不可读：跳过，不影响其他工作区
            }
        }
        // 最新在前
        out.sort((a, b) => new Date(b.record.createdAt).getTime() - new Date(a.record.createdAt).getTime());
        return out;
    }
    static async listLog(workspacePath, limit = 50) {
        const doc = await this.load(workspacePath);
        return doc.log.slice(0, Math.max(1, Math.min(DISPATCH_LOG_LIMIT, limit)));
    }
    /**
     * 回执/处置：queued / would-dispatch → sent / failed / ignored；tripped（已熔断）→ ignored（人工确认后消除告警）。
     * sent 由客户端成功唤醒后回报；failed 为唤醒失败（不静默重试）；ignored 为人手动忽略。
     */
    static async ack(workspacePath, id, status) {
        const doc = await this.load(workspacePath);
        const record = doc.log.find((r) => r.id === id);
        if (!record)
            return null;
        const settleable = record.status === "queued" || record.status === "would-dispatch" || (status === "ignored" && record.status === "tripped");
        if (!settleable)
            return null;
        record.status = status;
        record.ackedAt = new Date().toISOString();
        await this.save(workspacePath, doc);
        return record;
    }
    /**
     * 任务完成事件驱动的主判定：返回新产生的派发记录；任何不派发的分支都返回 null（静默）。
     */
    static async evaluate(workspacePath, triggerTaskId) {
        const doc = await this.load(workspacePath);
        const rules = doc.rules;
        // 1. 关闭即短路
        if (rules.mode === "off")
            return null;
        // 2. 并发闸门：未 ack 的 queued 达到上限不再派（防任务堆积）
        const inFlight = doc.log.filter((r) => r.status === "queued").length;
        if (inFlight >= rules.maxConcurrent)
            return null;
        // 3. 就绪候选（无 owner：排除所有活跃锁任务——复用认领锁语义防重复派活）
        const { tasks } = await TaskStore.listTasks(workspacePath);
        const taskById = new Map(tasks.map((t) => [t.id, t]));
        const ready = getReadyTasks(tasks);
        // 4. 去重集合：已派发且任务未完成（queued/sent）的；观察模式未处理的（would-dispatch）
        const dispatchedOpen = new Set(doc.log
            .filter((r) => r.status === "queued" || r.status === "sent")
            .filter((r) => {
            const t = taskById.get(r.taskId);
            return t !== undefined && t.status !== "done" && t.status !== "archived";
        })
            .map((r) => r.taskId));
        const observedOpen = new Set(doc.log.filter((r) => r.status === "would-dispatch").map((r) => r.taskId));
        // 5. 规则过滤（纯代码 Fast Path）
        //    只有 todo / in_progress（未认领续跑）是可派发的活：blocked 在等人拍板、
        //    review 在等人验收——都是「等人的」而非「等 Agent 的」，不可派发
        const candidates = ready.filter((t) => {
            if (t.status !== "todo" && t.status !== "in_progress")
                return false;
            if (t.id === triggerTaskId)
                return false;
            if (!rules.priorities.includes(t.priority))
                return false;
            if (rules.tagsExclude?.length && t.tags?.some((tag) => rules.tagsExclude.includes(tag)))
                return false;
            if (rules.whitelist?.length && !rules.whitelist.includes(t.id))
                return false;
            if (dispatchedOpen.has(t.id))
                return false;
            if (observedOpen.has(t.id))
                return false;
            return true;
        });
        const target = candidates[0];
        if (!target)
            return null;
        // 6. hop 链：触发任务最近一条派发 hop + 1；人为起点（无记录）从 1 开始
        const lastHop = triggerTaskId
            ? Math.max(0, ...doc.log.filter((r) => r.taskId === triggerTaskId).map((r) => r.hop))
            : 0;
        const hop = lastHop + 1;
        // 7. TTL 熔断（仅 auto 模式有真实副作用；观察模式无副作用只记录）：
        //    超过 MAX_DISPATCH_HOP 层 → 不派发，记 tripped 并把目标任务转 blocked 斩断失控链，
        //    看板红色告警等人介入（批红/人工处置不清零 hop，与网络包 TTL 同语义）
        if (rules.mode === "auto" && hop > MAX_DISPATCH_HOP) {
            const tripped = {
                id: `DSP-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
                taskId: target.id,
                taskTitle: target.title,
                ...(triggerTaskId ? { triggerTaskId } : {}),
                hop,
                mode: "auto",
                status: "tripped",
                createdAt: new Date().toISOString(),
            };
            doc.log.unshift(tripped);
            doc.log = doc.log.slice(0, DISPATCH_LOG_LIMIT);
            await this.save(workspacePath, doc);
            // 斩断失控链：目标任务转阻塞，等人处置（检查点会记录这次状态变更）
            await TaskStore.updateTask(workspacePath, target.id, { status: "blocked" });
            return tripped;
        }
        const record = {
            id: `DSP-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
            taskId: target.id,
            taskTitle: target.title,
            ...(triggerTaskId ? { triggerTaskId } : {}),
            hop,
            mode: rules.mode === "auto" ? "auto" : "observe",
            status: rules.mode === "auto" ? "queued" : "would-dispatch",
            createdAt: new Date().toISOString(),
        };
        doc.log.unshift(record);
        doc.log = doc.log.slice(0, DISPATCH_LOG_LIMIT);
        await this.save(workspacePath, doc);
        return record;
    }
}
//# sourceMappingURL=dispatch.js.map