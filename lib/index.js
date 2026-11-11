import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
/**
* 判断认领锁是否处于活跃状态（惰性判定：租约未过期即活跃）。
* now 可注入便于测试。
*/
function isClaimActive(claim, now = /* @__PURE__ */ new Date()) {
	if (!claim) return false;
	const leaseEnd = new Date(claim.leaseUntil).getTime();
	if (Number.isNaN(leaseEnd)) return false;
	return leaseEnd > now.getTime();
}
/** 规范化租约分钟数：缺省用默认值，越界收敛到 [MIN, MAX] */
function normalizeLeaseMinutes(input) {
	if (typeof input !== "number" || !Number.isFinite(input)) return 60;
	return Math.min(240, Math.max(1, Math.floor(input)));
}
/**
* 检查单个任务的前置依赖是否全部满足（全部为 done 状态）
*/
function getTaskDependencyStatus(task, allTasks) {
	if (!task.dependsOn || task.dependsOn.length === 0) return {
		isReady: true,
		unfulfilledDeps: []
	};
	const taskMap = /* @__PURE__ */ new Map();
	for (const t of allTasks) taskMap.set(t.id, t);
	const unfulfilledDeps = [];
	for (const depId of task.dependsOn) {
		const depTask = taskMap.get(depId);
		if (!depTask || depTask.status !== "done") unfulfilledDeps.push(depId);
	}
	return {
		isReady: unfulfilledDeps.length === 0,
		unfulfilledDeps
	};
}
/**
* 检查任务是否已就绪（未完成且依赖全部就绪）
*/
function isTaskReady(task, allTasks) {
	if (task.status === "done" || task.status === "archived") return false;
	return getTaskDependencyStatus(task, allTasks).isReady;
}
/**
* 优先级权重对照
*/
const PRIORITY_WEIGHT = {
	P0: 3,
	P1: 2,
	P2: 1
};
/**
* 获取当前工作区中所有“已就绪”的任务列表
* 规则：
* 1. 状态不是 done 或 archived
* 2. 没有前置依赖，或前置依赖全部已处于 done 状态
* 3. 排序规则：优先级 P0 > P1 > P2，再按创建时间升序排列
* 4. 认领锁：被【他人】活跃锁定的任务不就绪（防止重复派活）；
*    本人持有的锁不影响（可续跑）；未传 owner 时任何活跃锁都排除
*/
function getReadyTasks(tasks, opts) {
	const now = opts?.now ?? /* @__PURE__ */ new Date();
	return tasks.filter((task) => {
		if (!isTaskReady(task, tasks)) return false;
		if (isClaimActive(task.claim, now) && task.claim.owner !== opts?.owner) return false;
		return true;
	}).sort((a, b) => {
		const weightA = PRIORITY_WEIGHT[a.priority] ?? 0;
		const weightB = PRIORITY_WEIGHT[b.priority] ?? 0;
		if (weightA !== weightB) return weightB - weightA;
		return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
	});
}
/**
* 全景工程交付总结报告生成器 (Markdown)
*/
function generateWorkspaceSummaryReport(tasks, workspacePath) {
	const activeTasks = tasks.filter((t) => t.status !== "archived");
	const now = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").substring(0, 19);
	const total = activeTasks.length;
	const doneTasks = activeTasks.filter((t) => t.status === "done");
	const inProgressTasks = activeTasks.filter((t) => t.status === "in_progress");
	const reviewTasks = activeTasks.filter((t) => t.status === "review");
	const todoTasks = activeTasks.filter((t) => t.status === "todo");
	const blockedTasks = activeTasks.filter((t) => t.status === "blocked");
	const deliverableMap = /* @__PURE__ */ new Map();
	const allInsights = [];
	for (const t of activeTasks) for (const c of t.conclusions || []) {
		for (const d of c.deliverables || []) {
			const trimmed = d.trim();
			if (!trimmed) continue;
			const list = deliverableMap.get(trimmed) || [];
			if (!list.includes(t.id)) list.push(t.id);
			deliverableMap.set(trimmed, list);
		}
		for (const i of c.insights || []) {
			const trimmed = i.trim();
			if (trimmed) allInsights.push({
				insight: trimmed,
				taskId: t.id
			});
		}
	}
	const lines = [];
	lines.push(`# 🚀 工作区交付与工程总结报告`);
	lines.push(`> **生成时间**: ${now}  `);
	if (workspacePath) lines.push(`> **工作区路径**: \`${workspacePath}\`  `);
	lines.push(`> **统计概览**: 共 **${total}** 个任务 | ✅ 已完成 **${doneTasks.length}** | ⚡ 进行中 **${inProgressTasks.length}** | 🔍 审查 **${reviewTasks.length}** | 📋 待办 **${todoTasks.length}** | 🔒 阻塞 **${blockedTasks.length}**\n`);
	lines.push(`## 📦 核心产出交付物 (Deliverables)`);
	if (deliverableMap.size === 0) lines.push(`*暂无已登记的交付物文件。*\n`);
	else {
		for (const [filePath, taskIds] of deliverableMap.entries()) lines.push(`- \`${filePath}\` *(关联任务: ${taskIds.join(", ")})*`);
		lines.push("");
	}
	lines.push(`## 💡 经验沉淀与避坑心得 (Consolidated Insights)`);
	if (allInsights.length === 0) lines.push(`*暂无已沉淀的避坑经验。*\n`);
	else {
		allInsights.forEach((item, idx) => {
			lines.push(`${idx + 1}. **[${item.taskId}]** ${item.insight}`);
		});
		lines.push("");
	}
	lines.push(`## ✅ 已完成任务清单 (Completed Tasks)`);
	if (doneTasks.length === 0) lines.push(`*暂无已完成任务。*\n`);
	else for (const t of doneTasks) {
		const tagStr = t.tags && t.tags.length > 0 ? ` \`[${t.tags.join(" | ")}]\`` : "";
		lines.push(`### [${t.priority}] ${t.id}: ${t.title}${tagStr}`);
		if (t.description) lines.push(`${t.description}\n`);
		if (t.conclusions && t.conclusions.length > 0) {
			lines.push(`- **执行结论**:`);
			for (const c of t.conclusions) {
				lines.push(`  - **摘要**: ${c.summary}`);
				if (c.deliverables && c.deliverables.length > 0) lines.push(`  - **交付文件**: ${c.deliverables.map((d) => `\`${d}\``).join(", ")}`);
			}
		}
		lines.push("");
	}
	const pendingTasks = [
		...inProgressTasks,
		...reviewTasks,
		...todoTasks,
		...blockedTasks
	];
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
//#endregion
//#region lib/types/store/task-store.js
/**
* 认领冲突：任务被他人活跃锁定。这是多 Agent 并行的正常分支而非系统错误——
* 工具层捕获后返回结构化响应（不抛异常），Agent 读到 owner 后应主动让开。
*/
var ClaimConflictError = class extends Error {
	taskId;
	claim;
	constructor(taskId, claim) {
		super(`Task ${taskId} is actively claimed by ${claim.owner} (lease until ${claim.leaseUntil})`);
		this.name = "ClaimConflictError";
		this.taskId = taskId;
		this.claim = claim;
	}
};
const taskDoneListeners = /* @__PURE__ */ new Set();
function onTaskDone(listener) {
	taskDoneListeners.add(listener);
	return () => {
		taskDoneListeners.delete(listener);
	};
}
function emitTaskDone(workspacePath, task) {
	for (const listener of taskDoneListeners) try {
		listener(workspacePath, task);
	} catch (err) {
		console.error("[dsh-workspace-tasks] onTaskDone listener error:", err);
	}
}
const tasksCreatedListeners = /* @__PURE__ */ new Set();
function onTasksCreated(listener) {
	tasksCreatedListeners.add(listener);
	return () => {
		tasksCreatedListeners.delete(listener);
	};
}
function emitTasksCreated(workspacePath, tasks) {
	for (const listener of tasksCreatedListeners) try {
		listener(workspacePath, tasks);
	} catch (err) {
		console.error("[dsh-workspace-tasks] onTasksCreated listener error:", err);
	}
}
/**
* 获取本地持久化根目录：统一存放在用户本地 ~/.dsh/storages/workspace-tasks/，
* 绝不污染用户代码仓库，也绝不参与 Git 跟踪与提交。
*/
function getStorageDir() {
	return process.env.DSH_TASKS_STORAGE_DIR || path.join(os.homedir(), ".dsh", "storages", "workspace-tasks");
}
/**
* 根据工作区绝对路径生成唯一的本地存储文件名。
* 格式形如：<工作区文件夹名>-<sha256前8位>.json
*/
function getTasksFilePath(workspacePath) {
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
	for (const t of tasks) switch (t.status) {
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
		case "archived": archived++;
	}
	return {
		total: tasks.length - archived,
		todo,
		inProgress,
		review,
		done,
		blocked,
		archived
	};
}
const CHECKPOINT_FIELDS = [
	"title",
	"description",
	"status",
	"priority",
	"assignee",
	"tags",
	"dependsOn"
];
function snapshot(value) {
	return JSON.stringify(value ?? null);
}
/** 向任务追加检查点事件（append-only，最新在前） */
function pushCheckpoints(task, events) {
	if (events.length === 0) return;
	if (!task.history) task.history = [];
	const at = (/* @__PURE__ */ new Date()).toISOString();
	task.history.unshift(...events.map((e) => ({
		...e,
		at
	})));
}
var TaskStore = class {
	static async load(workspacePath) {
		const filePath = getTasksFilePath(workspacePath);
		try {
			const raw = await fs.readFile(filePath, "utf-8");
			const doc = JSON.parse(raw);
			return {
				version: doc.version ?? 1,
				workspacePath,
				tasks: Array.isArray(doc.tasks) ? doc.tasks : [],
				updatedAt: doc.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString()
			};
		} catch {
			return {
				version: 1,
				workspacePath,
				tasks: [],
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			};
		}
	}
	static async save(workspacePath, doc) {
		const filePath = getTasksFilePath(workspacePath);
		const dir = path.dirname(filePath);
		await fs.mkdir(dir, { recursive: true });
		doc.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		await fs.writeFile(filePath, JSON.stringify(doc, null, 2), "utf-8");
	}
	static async listTasks(workspacePath) {
		const doc = await this.load(workspacePath);
		return {
			tasks: doc.tasks,
			summary: computeSummary(doc.tasks)
		};
	}
	static async createTasks(workspacePath, items) {
		if (!items || items.length === 0) return [];
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
		const now = (/* @__PURE__ */ new Date()).toISOString();
		for (const params of items) {
			if (!params.title || !params.title.trim()) continue;
			maxNum++;
			const nextId = `TASK-${String(maxNum).padStart(3, "0")}`;
			const validDeps = Array.isArray(params.dependsOn) ? Array.from(new Set(params.dependsOn.map((d) => d.trim()).filter((d) => Boolean(d) && d !== nextId))) : [];
			const validTags = Array.isArray(params.tags) ? Array.from(new Set(params.tags.map((t) => t.trim()).filter(Boolean))) : [];
			const newTask = {
				id: nextId,
				title: params.title.trim(),
				description: params.description?.trim() || "",
				status: "todo",
				priority: params.priority || "P1",
				...validTags.length > 0 ? { tags: validTags } : {},
				assignee: params.assignee || "agent",
				...validDeps.length > 0 ? { dependsOn: validDeps } : {},
				createdAt: now,
				updatedAt: now,
				conclusions: []
			};
			created.push(newTask);
		}
		if (created.length > 0) {
			doc.tasks.unshift(...created);
			await this.save(workspacePath, doc);
			emitTasksCreated(workspacePath, created);
		}
		return created;
	}
	static async createTask(workspacePath, params) {
		const list = await this.createTasks(workspacePath, [params]);
		if (!list[0]) throw new Error("Task title cannot be empty");
		return list[0];
	}
	static async updateTask(workspacePath, taskId, patch, opts) {
		const doc = await this.load(workspacePath);
		const task = doc.tasks.find((t) => t.id === taskId);
		if (!task) return null;
		const wantsClaim = patch.status === "in_progress" && Boolean(opts?.claimOwner?.trim());
		if (wantsClaim && isClaimActive(task.claim) && task.claim.owner !== opts.claimOwner.trim()) throw new ClaimConflictError(taskId, task.claim);
		const prevStatus = task.status;
		const before = /* @__PURE__ */ new Map();
		for (const f of CHECKPOINT_FIELDS) before.set(f, task[f]);
		const beforeClaim = snapshot(task.claim ?? null);
		if (patch.title !== void 0) task.title = patch.title.trim();
		if (patch.description !== void 0) task.description = patch.description.trim();
		if (patch.status !== void 0) task.status = patch.status;
		if (patch.priority !== void 0) task.priority = patch.priority;
		if (patch.assignee !== void 0) task.assignee = patch.assignee;
		if (patch.tags !== void 0) {
			const validTags = Array.isArray(patch.tags) ? Array.from(new Set(patch.tags.map((t) => t.trim()).filter(Boolean))) : [];
			if (validTags.length > 0) task.tags = validTags;
			else delete task.tags;
		}
		if (patch.dependsOn !== void 0) {
			const validDeps = Array.isArray(patch.dependsOn) ? Array.from(new Set(patch.dependsOn.map((d) => d.trim()).filter((d) => Boolean(d) && d !== taskId))) : [];
			if (validDeps.length > 0) task.dependsOn = validDeps;
			else delete task.dependsOn;
		}
		if (wantsClaim) {
			const owner = opts.claimOwner.trim();
			const leaseMinutes = normalizeLeaseMinutes(opts.leaseMinutes);
			const now = /* @__PURE__ */ new Date();
			const sameOwner = task.claim?.owner === owner;
			task.claim = {
				owner,
				...opts.sessionHint?.trim() ? { sessionHint: opts.sessionHint.trim() } : sameOwner && task.claim?.sessionHint ? { sessionHint: task.claim.sessionHint } : {},
				claimedAt: sameOwner && task.claim ? task.claim.claimedAt : now.toISOString(),
				leaseUntil: new Date(now.getTime() + leaseMinutes * 6e4).toISOString()
			};
		} else if (patch.status && patch.status !== "in_progress" && patch.status !== "blocked" && task.claim) delete task.claim;
		task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		pushCheckpoints(task, [...CHECKPOINT_FIELDS.filter((f) => snapshot(before.get(f)) !== snapshot(task[f])).map((f) => ({
			field: f,
			from: snapshot(before.get(f)),
			to: snapshot(task[f])
		})), ...snapshot(task.claim ?? null) !== beforeClaim ? [{
			field: "claim",
			from: beforeClaim,
			to: snapshot(task.claim ?? null)
		}] : []]);
		await this.save(workspacePath, doc);
		if (prevStatus !== "done" && task.status === "done") emitTaskDone(workspacePath, task);
		return task;
	}
	/**
	* 显式认领任务（加锁/续租）。被他人活跃锁定时返回 conflict（结构化，不抛异常）。
	* 同一 owner 重复认领即续租：保留 claimedAt，仅延长 leaseUntil。
	*/
	static async claimTask(workspacePath, taskId, opts) {
		const owner = opts.owner?.trim();
		if (!owner) throw new Error("claimTask requires a non-empty owner");
		const doc = await this.load(workspacePath);
		const task = doc.tasks.find((t) => t.id === taskId);
		if (!task) return {
			ok: false,
			reason: "not-found"
		};
		if (isClaimActive(task.claim) && task.claim.owner !== owner) return {
			ok: false,
			reason: "conflict",
			claim: task.claim
		};
		const leaseMinutes = normalizeLeaseMinutes(opts.leaseMinutes);
		const now = /* @__PURE__ */ new Date();
		const sameOwner = task.claim?.owner === owner;
		const beforeClaim = snapshot(task.claim ?? null);
		task.claim = {
			owner,
			...opts.sessionHint?.trim() ? { sessionHint: opts.sessionHint.trim() } : sameOwner && task.claim?.sessionHint ? { sessionHint: task.claim.sessionHint } : {},
			claimedAt: sameOwner && task.claim ? task.claim.claimedAt : now.toISOString(),
			leaseUntil: new Date(now.getTime() + leaseMinutes * 6e4).toISOString()
		};
		task.updatedAt = now.toISOString();
		pushCheckpoints(task, [{
			field: "claim",
			from: beforeClaim,
			to: snapshot(task.claim)
		}]);
		await this.save(workspacePath, doc);
		return {
			ok: true,
			task
		};
	}
	/**
	* 释放认领锁。幂等：无锁直接成功；锁已过期视为可释放并顺手清理；
	* 活跃锁仅允许 owner 本人或 force（UI 人力强制释放死锁）解除。
	*/
	static async releaseTask(workspacePath, taskId, opts) {
		const doc = await this.load(workspacePath);
		const task = doc.tasks.find((t) => t.id === taskId);
		if (!task) return {
			ok: false,
			reason: "not-found"
		};
		if (!task.claim) return {
			ok: true,
			task
		};
		const active = isClaimActive(task.claim);
		const owner = opts?.owner?.trim();
		if (active && !opts?.force && (!owner || task.claim.owner !== owner)) return {
			ok: false,
			reason: "conflict",
			claim: task.claim
		};
		const beforeClaim = snapshot(task.claim);
		delete task.claim;
		task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		pushCheckpoints(task, [{
			field: "claim",
			from: beforeClaim,
			to: "null"
		}]);
		await this.save(workspacePath, doc);
		return {
			ok: true,
			task
		};
	}
	/**
	* 查询任务过程检查点（append-only 事件日志，最新在前）。
	*/
	static async getTaskHistory(workspacePath, taskId) {
		return (await this.load(workspacePath)).tasks.find((t) => t.id === taskId)?.history ?? [];
	}
	/**
	* 添加跨工作区痕迹引用（只读）。引用存于本工作区任务上，与被引用方完全解耦；
	* 解析（resolveTraceRefs）失败时引用仍保留，仅标记悬挂。
	*/
	static async addTraceRef(workspacePath, taskId, ref) {
		if (!ref.workspacePath?.trim() || !ref.taskId?.trim()) return null;
		const doc = await this.load(workspacePath);
		const task = doc.tasks.find((t) => t.id === taskId);
		if (!task) return null;
		if (!task.traceRefs) task.traceRefs = [];
		const normalized = {
			workspacePath: path.resolve(ref.workspacePath.trim()),
			taskId: ref.taskId.trim(),
			...ref.note?.trim() ? { note: ref.note.trim() } : {}
		};
		task.traceRefs = task.traceRefs.filter((r) => !(r.workspacePath === normalized.workspacePath && r.taskId === normalized.taskId));
		task.traceRefs.push(normalized);
		task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		pushCheckpoints(task, [{
			field: "traceRefs",
			from: "null",
			to: snapshot(normalized)
		}]);
		await this.save(workspacePath, doc);
		return task;
	}
	/**
	* 解析任务上的跨工作区引用：读取来源工作区任务，填充 resolved
	* （title + 最新结论摘要）；来源不可达时标记 dangling，不抛错、不丢引用。
	*/
	static async resolveTraceRefs(workspacePath, taskId) {
		const task = (await this.load(workspacePath)).tasks.find((t) => t.id === taskId);
		if (!task) return null;
		const refs = task.traceRefs ?? [];
		return Promise.all(refs.map(async (ref) => {
			try {
				const source = (await this.load(ref.workspacePath)).tasks.find((t) => t.id === ref.taskId);
				if (!source) return {
					...ref,
					resolved: {
						title: "",
						dangling: true
					}
				};
				return {
					...ref,
					resolved: {
						title: source.title,
						latestSummary: source.conclusions[0]?.summary
					}
				};
			} catch {
				return {
					...ref,
					resolved: {
						title: "",
						dangling: true
					}
				};
			}
		}));
	}
	static async addConclusion(workspacePath, taskId, conclusion) {
		const doc = await this.load(workspacePath);
		const task = doc.tasks.find((t) => t.id === taskId);
		if (!task) return null;
		const newConclusion = {
			id: `CONC-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
			summary: conclusion.summary.trim(),
			deliverables: conclusion.deliverables ?? [],
			insights: conclusion.insights ?? [],
			completedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		task.conclusions.unshift(newConclusion);
		const prevStatus = task.status;
		task.status = "done";
		const beforeClaim = snapshot(task.claim ?? null);
		if (task.claim) delete task.claim;
		task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		pushCheckpoints(task, [
			{
				field: "conclusion",
				from: "null",
				to: snapshot({
					id: newConclusion.id,
					summary: newConclusion.summary
				})
			},
			...prevStatus !== "done" ? [{
				field: "status",
				from: snapshot(prevStatus),
				to: snapshot("done")
			}] : [],
			...beforeClaim !== "null" ? [{
				field: "claim",
				from: beforeClaim,
				to: "null"
			}] : []
		]);
		await this.save(workspacePath, doc);
		emitTaskDone(workspacePath, task);
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
		if (!task) return null;
		const record = {
			id: `DEC-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
			title: decision.title.trim(),
			rationale: decision.rationale.trim(),
			...Array.isArray(decision.alternatives) && decision.alternatives.length > 0 ? { alternatives: decision.alternatives.map((a) => a.trim()).filter(Boolean) } : {},
			...decision.actor?.trim() ? { actor: decision.actor.trim() } : {},
			...decision.sessionId?.trim() ? { sessionId: decision.sessionId.trim() } : {},
			decidedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		if (!task.decisionLog) task.decisionLog = [];
		task.decisionLog.unshift(record);
		task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		pushCheckpoints(task, [{
			field: "decision",
			from: "null",
			to: snapshot({
				id: record.id,
				title: record.title
			})
		}]);
		await this.save(workspacePath, doc);
		return record;
	}
	/**
	* 取代（supersede）一条既有决策：仅给旧记录打上 supersededBy 标记，不改写其正文；
	* 并以新决策的身份追加一条新记录（newDecision 完整自包含），建立演进链。
	* 返回新决策记录；旧决策不存在或已被取代时返回 null。
	*/
	static async supersedeDecision(workspacePath, taskId, supersededDecisionId, newDecision) {
		const task = (await this.load(workspacePath)).tasks.find((t) => t.id === taskId);
		if (!task) return null;
		const old = (task.decisionLog ?? []).find((d) => d.id === supersededDecisionId);
		if (!old || old.supersededBy) return null;
		const record = await this.addDecision(workspacePath, taskId, newDecision);
		if (!record) return null;
		const doc2 = await this.load(workspacePath);
		const task2 = doc2.tasks.find((t) => t.id === taskId);
		const old2 = task2?.decisionLog?.find((d) => d.id === supersededDecisionId);
		const new2 = task2?.decisionLog?.find((d) => d.id === record.id);
		if (!task2 || !old2 || !new2) return record;
		old2.supersededBy = new2.id;
		task2.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		pushCheckpoints(task2, [{
			field: "decision.supersededBy",
			from: "null",
			to: snapshot({
				decision: old2.id,
				supersededBy: new2.id
			})
		}]);
		await this.save(workspacePath, doc2);
		return new2;
	}
	/**
	* 查询任务决策日志（含被 supersede 的历史），按 decidedAt 倒序。
	* sessionId 悬挂与否不影响读取——决策内容全部自包含。
	*/
	static async listDecisions(workspacePath, taskId) {
		return (await this.load(workspacePath)).tasks.find((t) => t.id === taskId)?.decisionLog ?? [];
	}
	/**
	* 发起决策请求（票拟）：任务随即转入 blocked 挂起（零消耗），resumeStatus 记录原状态。
	* 同一任务同时只允许一条 pending（去重：一件事只问一次）；
	* done/archived 终态任务不允许发起。options 至少 2 个候选。
	* 锁语义：blocked 保留 claim，待批期间其他会话不会把任务捡走。
	*/
	static async requestApproval(workspacePath, taskId, req) {
		const title = req.title?.trim();
		const labels = Array.isArray(req.options) ? req.options.map((o) => o.trim()).filter(Boolean) : [];
		if (!title || labels.length < 2) return {
			ok: false,
			reason: "invalid"
		};
		const doc = await this.load(workspacePath);
		const task = doc.tasks.find((t) => t.id === taskId);
		if (!task) return {
			ok: false,
			reason: "not-found"
		};
		if (task.status === "done" || task.status === "archived") return {
			ok: false,
			reason: "invalid"
		};
		if ((task.approvals ?? []).some((a) => a.status === "pending")) return {
			ok: false,
			reason: "pending-exists"
		};
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const options = labels.map((label, i) => ({
			id: `opt-${i + 1}`,
			label
		}));
		const approval = {
			id: `APR-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
			title,
			...req.detail?.trim() ? { detail: req.detail.trim() } : {},
			options,
			status: "pending",
			resumeStatus: task.status === "blocked" ? "in_progress" : task.status,
			createdAt: now
		};
		if (!task.approvals) task.approvals = [];
		task.approvals.unshift(approval);
		const prevStatus = task.status;
		task.status = "blocked";
		task.updatedAt = now;
		pushCheckpoints(task, [{
			field: "approval.request",
			from: "null",
			to: snapshot({
				id: approval.id,
				title: approval.title
			})
		}, ...prevStatus !== "blocked" ? [{
			field: "status",
			from: snapshot(prevStatus),
			to: snapshot("blocked")
		}] : []]);
		await this.save(workspacePath, doc);
		return {
			ok: true,
			approval,
			task
		};
	}
	/**
	* 批红（批准）：标记审批通过，自动落一条 DecisionRecord
	* （标题「拍板：…」，rationale 含选中选项原话与背景，actor 默认 human，
	* alternatives 收录未被选中的选项），decisionId 回链到审批记录，
	* 任务状态恢复 resumeStatus。仅接受 pending 状态的请求。
	*/
	static async resolveApproval(workspacePath, taskId, approvalId, resolution) {
		const doc = await this.load(workspacePath);
		const task = doc.tasks.find((t) => t.id === taskId);
		if (!task) return {
			ok: false,
			reason: "not-found"
		};
		const approval = (task.approvals ?? []).find((a) => a.id === approvalId);
		if (!approval) return {
			ok: false,
			reason: "not-found"
		};
		if (approval.status !== "pending") return {
			ok: false,
			reason: "not-pending"
		};
		const option = approval.options.find((o) => o.id === resolution.optionId);
		if (!option) return {
			ok: false,
			reason: "invalid-option"
		};
		const now = (/* @__PURE__ */ new Date()).toISOString();
		approval.status = "approved";
		approval.resolvedOptionId = option.id;
		if (resolution.note?.trim()) approval.resolveNote = resolution.note.trim();
		approval.resolvedAt = now;
		const record = {
			id: `DEC-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
			title: `拍板：${approval.title}`,
			rationale: [
				`批准选项「${option.label}」。`,
				approval.detail ? `背景：${approval.detail}` : null,
				resolution.note?.trim() ? `批注：${resolution.note.trim()}` : null
			].filter(Boolean).join("\n\n"),
			alternatives: approval.options.filter((o) => o.id !== option.id).map((o) => o.label),
			actor: resolution.actor?.trim() || "human",
			decidedAt: now
		};
		if (!task.decisionLog) task.decisionLog = [];
		task.decisionLog.unshift(record);
		approval.decisionId = record.id;
		const prevStatus = task.status;
		const shouldResume = prevStatus === "blocked";
		if (shouldResume) task.status = approval.resumeStatus;
		task.updatedAt = now;
		pushCheckpoints(task, [
			{
				field: "approval.resolve",
				from: snapshot({
					id: approval.id,
					status: "pending"
				}),
				to: snapshot({
					id: approval.id,
					status: "approved",
					option: option.label,
					decisionId: record.id
				})
			},
			{
				field: "decision",
				from: "null",
				to: snapshot({
					id: record.id,
					title: record.title
				})
			},
			...shouldResume && prevStatus !== approval.resumeStatus ? [{
				field: "status",
				from: snapshot(prevStatus),
				to: snapshot(approval.resumeStatus)
			}] : []
		]);
		await this.save(workspacePath, doc);
		return {
			ok: true,
			approval,
			task,
			decision: record
		};
	}
	/**
	* 驳回：不落决策，任务保持 blocked，等待 Agent 重新规划后发起新的请求。
	*/
	static async rejectApproval(workspacePath, taskId, approvalId, opts) {
		const doc = await this.load(workspacePath);
		const task = doc.tasks.find((t) => t.id === taskId);
		if (!task) return {
			ok: false,
			reason: "not-found"
		};
		const approval = (task.approvals ?? []).find((a) => a.id === approvalId);
		if (!approval) return {
			ok: false,
			reason: "not-found"
		};
		if (approval.status !== "pending") return {
			ok: false,
			reason: "not-pending"
		};
		const now = (/* @__PURE__ */ new Date()).toISOString();
		approval.status = "rejected";
		if (opts?.note?.trim()) approval.resolveNote = opts.note.trim();
		approval.resolvedAt = now;
		task.updatedAt = now;
		pushCheckpoints(task, [{
			field: "approval.resolve",
			from: snapshot({
				id: approval.id,
				status: "pending"
			}),
			to: snapshot({
				id: approval.id,
				status: "rejected",
				note: approval.resolveNote ?? null
			})
		}]);
		await this.save(workspacePath, doc);
		return {
			ok: true,
			approval,
			task
		};
	}
	/**
	* 跨任务收集所有 pending 审批（供看板「待拍板」横幅）。
	*/
	static async listPendingApprovals(workspacePath) {
		const doc = await this.load(workspacePath);
		const out = [];
		for (const t of doc.tasks) {
			if (t.status === "archived") continue;
			for (const a of t.approvals ?? []) if (a.status === "pending") out.push({
				taskId: t.id,
				taskTitle: t.title,
				approval: a
			});
		}
		return out;
	}
	static async archiveTask(workspacePath, taskId) {
		return this.updateTask(workspacePath, taskId, { status: "archived" });
	}
	static async deleteTask(workspacePath, taskId) {
		const doc = await this.load(workspacePath);
		const initialLen = doc.tasks.length;
		doc.tasks = doc.tasks.filter((t) => t.id !== taskId);
		if (doc.tasks.length === initialLen) return false;
		await this.save(workspacePath, doc);
		return true;
	}
	static async getReadyTasks(workspacePath, opts) {
		return getReadyTasks((await this.load(workspacePath)).tasks, opts);
	}
	static async exportSummaryReport(workspacePath) {
		return generateWorkspaceSummaryReport((await this.load(workspacePath)).tasks, workspacePath);
	}
};
//#endregion
//#region lib/types/store/dispatch.js
const DEFAULT_DISPATCH_RULES = {
	mode: "observe",
	priorities: ["P0", "P1"],
	maxConcurrent: 1,
	staleHours: 24
};
const DISPATCH_LOG_LIMIT = 200;
const VALID_MODES = [
	"observe",
	"auto",
	"off"
];
const VALID_PRIORITIES = [
	"P0",
	"P1",
	"P2"
];
/** 派发存储文件与任务文件同目录同命名规则（<工作区名>-<hash>-dispatch.json），不进 git */
function getDispatchFilePath(workspacePath) {
	return getTasksFilePath(workspacePath).replace(/\.json$/, "-dispatch.json");
}
var DispatchEngine = class {
	static async load(workspacePath) {
		const filePath = getDispatchFilePath(workspacePath);
		try {
			const raw = await fs.readFile(filePath, "utf-8");
			const doc = JSON.parse(raw);
			return {
				version: 1,
				rules: {
					...DEFAULT_DISPATCH_RULES,
					...doc.rules ?? {}
				},
				log: Array.isArray(doc.log) ? doc.log : [],
				updatedAt: doc.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString()
			};
		} catch {
			return {
				version: 1,
				rules: { ...DEFAULT_DISPATCH_RULES },
				log: [],
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			};
		}
	}
	static async save(workspacePath, doc) {
		const filePath = getDispatchFilePath(workspacePath);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		doc.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		await fs.writeFile(filePath, JSON.stringify(doc, null, 2), "utf-8");
	}
	static async getRules(workspacePath) {
		return (await this.load(workspacePath)).rules;
	}
	static async updateRules(workspacePath, patch) {
		const doc = await this.load(workspacePath);
		const next = { ...doc.rules };
		if (patch.mode !== void 0 && VALID_MODES.includes(patch.mode)) next.mode = patch.mode;
		if (patch.priorities !== void 0 && Array.isArray(patch.priorities)) {
			const valid = Array.from(new Set(patch.priorities.filter((p) => VALID_PRIORITIES.includes(p))));
			if (valid.length > 0) next.priorities = valid;
		}
		if (patch.tagsExclude !== void 0) {
			const cleaned = Array.isArray(patch.tagsExclude) ? Array.from(new Set(patch.tagsExclude.map((t) => t.trim()).filter(Boolean))) : [];
			if (cleaned.length > 0) next.tagsExclude = cleaned;
			else delete next.tagsExclude;
		}
		if (patch.whitelist !== void 0) {
			const cleaned = Array.isArray(patch.whitelist) ? Array.from(new Set(patch.whitelist.map((t) => t.trim()).filter(Boolean))) : [];
			if (cleaned.length > 0) next.whitelist = cleaned;
			else delete next.whitelist;
		}
		if (patch.maxConcurrent !== void 0 && Number.isFinite(patch.maxConcurrent)) next.maxConcurrent = Math.min(8, Math.max(1, Math.floor(patch.maxConcurrent)));
		if (patch.staleHours !== void 0 && Number.isFinite(patch.staleHours)) next.staleHours = Math.min(720, Math.max(1, Math.floor(patch.staleHours)));
		doc.rules = next;
		await this.save(workspacePath, doc);
		return next;
	}
	/** 客户端执行器取件：所有等待唤醒的 queued 条目（最新在前） */
	static async listPending(workspacePath) {
		return (await this.load(workspacePath)).log.filter((r) => r.status === "queued");
	}
	static async listLog(workspacePath, limit = 50) {
		return (await this.load(workspacePath)).log.slice(0, Math.max(1, Math.min(DISPATCH_LOG_LIMIT, limit)));
	}
	/**
	* 回执/处置：queued / would-dispatch → sent / failed / ignored；tripped（已熔断）→ ignored（人工确认后消除告警）。
	* sent 由客户端成功唤醒后回报；failed 为唤醒失败（不静默重试）；ignored 为人手动忽略。
	*/
	static async ack(workspacePath, id, status) {
		const doc = await this.load(workspacePath);
		const record = doc.log.find((r) => r.id === id);
		if (!record) return null;
		if (!(record.status === "queued" || record.status === "would-dispatch" || status === "ignored" && record.status === "tripped")) return null;
		record.status = status;
		record.ackedAt = (/* @__PURE__ */ new Date()).toISOString();
		await this.save(workspacePath, doc);
		return record;
	}
	/**
	* 任务完成事件驱动的主判定：返回新产生的派发记录；任何不派发的分支都返回 null（静默）。
	*/
	static async evaluate(workspacePath, triggerTaskId) {
		const doc = await this.load(workspacePath);
		const rules = doc.rules;
		if (rules.mode === "off") return null;
		if (doc.log.filter((r) => r.status === "queued").length >= rules.maxConcurrent) return null;
		const { tasks } = await TaskStore.listTasks(workspacePath);
		const taskById = new Map(tasks.map((t) => [t.id, t]));
		const ready = getReadyTasks(tasks);
		const dispatchedOpen = new Set(doc.log.filter((r) => r.status === "queued" || r.status === "sent").filter((r) => {
			const t = taskById.get(r.taskId);
			return t !== void 0 && t.status !== "done" && t.status !== "archived";
		}).map((r) => r.taskId));
		const observedOpen = new Set(doc.log.filter((r) => r.status === "would-dispatch").map((r) => r.taskId));
		const target = ready.filter((t) => {
			if (t.status !== "todo" && t.status !== "in_progress") return false;
			if (t.id === triggerTaskId) return false;
			if (!rules.priorities.includes(t.priority)) return false;
			if (rules.tagsExclude?.length && t.tags?.some((tag) => rules.tagsExclude.includes(tag))) return false;
			if (rules.whitelist?.length && !rules.whitelist.includes(t.id)) return false;
			if (dispatchedOpen.has(t.id)) return false;
			if (observedOpen.has(t.id)) return false;
			return true;
		})[0];
		if (!target) return null;
		const hop = (triggerTaskId ? Math.max(0, ...doc.log.filter((r) => r.taskId === triggerTaskId).map((r) => r.hop)) : 0) + 1;
		if (rules.mode === "auto" && hop > 8) {
			const tripped = {
				id: `DSP-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
				taskId: target.id,
				taskTitle: target.title,
				...triggerTaskId ? { triggerTaskId } : {},
				hop,
				mode: "auto",
				status: "tripped",
				createdAt: (/* @__PURE__ */ new Date()).toISOString()
			};
			doc.log.unshift(tripped);
			doc.log = doc.log.slice(0, DISPATCH_LOG_LIMIT);
			await this.save(workspacePath, doc);
			await TaskStore.updateTask(workspacePath, target.id, { status: "blocked" });
			return tripped;
		}
		const record = {
			id: `DSP-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
			taskId: target.id,
			taskTitle: target.title,
			...triggerTaskId ? { triggerTaskId } : {},
			hop,
			mode: rules.mode === "auto" ? "auto" : "observe",
			status: rules.mode === "auto" ? "queued" : "would-dispatch",
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		doc.log.unshift(record);
		doc.log = doc.log.slice(0, DISPATCH_LOG_LIMIT);
		await this.save(workspacePath, doc);
		return record;
	}
};
//#endregion
//#region lib/types/store/global.js
/** 扫描存储目录，返回所有工作区任务文档（排除 dispatch 文件；坏文件 parse 为 null） */
async function scanWorkspaceDocuments() {
	const dir = getStorageDir();
	let entries;
	try {
		entries = await fs.readdir(dir);
	} catch {
		return [];
	}
	const taskFiles = entries.filter((f) => f.endsWith(".json") && !f.endsWith("-dispatch.json"));
	const docs = [];
	for (const fileName of taskFiles) {
		const filePath = path.join(dir, fileName);
		let mtime = "";
		try {
			mtime = (await fs.stat(filePath)).mtime.toISOString();
		} catch {}
		try {
			const raw = await fs.readFile(filePath, "utf-8");
			const parsed = JSON.parse(raw);
			if (!parsed || !Array.isArray(parsed.tasks) || typeof parsed.workspacePath !== "string") {
				docs.push({
					fileName,
					doc: null,
					mtime
				});
				continue;
			}
			docs.push({
				fileName,
				doc: parsed,
				mtime
			});
		} catch {
			docs.push({
				fileName,
				doc: null,
				mtime
			});
		}
	}
	return docs;
}
/** 聚合所有工作区的中台视图数据 */
async function listGlobalOverview() {
	const scanned = await scanWorkspaceDocuments();
	const workspaces = await Promise.all(scanned.map(async ({ fileName, doc, mtime }) => {
		if (!doc) return {
			workspacePath: "",
			title: fileName.replace(/\.json$/, ""),
			dangling: true,
			fileName,
			updatedAt: mtime,
			summary: {
				total: 0,
				todo: 0,
				inProgress: 0,
				review: 0,
				done: 0,
				blocked: 0,
				archived: 0
			},
			pendingApprovals: [],
			inProgress: [],
			review: [],
			done: [],
			blocked: [],
			readyPreview: {
				count: 0,
				tasks: []
			},
			dispatchMode: "off"
		};
		const tasks = doc.tasks;
		const hasPendingApproval = (t) => (t.approvals ?? []).some((a) => a.status === "pending");
		const ready = getReadyTasks(tasks).filter((t) => t.status === "todo" || t.status === "in_progress");
		let dispatchMode = "off";
		try {
			dispatchMode = (await DispatchEngine.getRules(doc.workspacePath)).mode;
		} catch {}
		return {
			workspacePath: doc.workspacePath,
			title: path.basename(doc.workspacePath) || doc.workspacePath,
			updatedAt: doc.updatedAt || mtime,
			summary: computeSummary(tasks),
			pendingApprovals: tasks.filter((t) => t.status !== "archived" && hasPendingApproval(t)).map((t) => ({
				taskId: t.id,
				taskTitle: t.title,
				approval: (t.approvals ?? []).find((a) => a.status === "pending"),
				task: t
			})),
			inProgress: tasks.filter((t) => t.status === "in_progress"),
			review: tasks.filter((t) => t.status === "review"),
			done: tasks.filter((t) => t.status === "done"),
			blocked: tasks.filter((t) => t.status === "blocked" && !hasPendingApproval(t)),
			readyPreview: {
				count: ready.length,
				tasks: ready.slice(0, 3)
			},
			dispatchMode
		};
	}));
	workspaces.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
	const totals = {
		workspaces: workspaces.length,
		pendingApprovals: workspaces.reduce((n, w) => n + w.pendingApprovals.length, 0),
		inProgress: workspaces.reduce((n, w) => n + w.inProgress.length, 0),
		review: workspaces.reduce((n, w) => n + w.review.length, 0),
		done: workspaces.reduce((n, w) => n + w.done.length, 0),
		blocked: workspaces.reduce((n, w) => n + w.blocked.length, 0),
		ready: workspaces.reduce((n, w) => n + w.readyPreview.count, 0)
	};
	return {
		generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		workspaces,
		totals
	};
}
//#endregion
//#region lib/types/api/router.js
const API_BASE = "/__dsh-tasks__";
function sendJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"access-control-allow-origin": "*",
		"access-control-allow-methods": "GET, POST, OPTIONS",
		"access-control-allow-headers": "content-type"
	});
	res.end(JSON.stringify(body));
}
function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}
function parseJsonBody(bodyStr) {
	try {
		return JSON.parse(bodyStr);
	} catch {
		return null;
	}
}
function registerTaskApis(ctx) {
	const webServer = ctx.webServer;
	if (!webServer) return () => {};
	if (webServer.prefixes && typeof webServer.prefixes.delete === "function") webServer.prefixes.delete(API_BASE);
	const dispose = webServer.register({
		kind: "prefix",
		path: API_BASE,
		handler: async (req, res) => {
			if (req.method === "OPTIONS") {
				res.writeHead(204, {
					"access-control-allow-origin": "*",
					"access-control-allow-methods": "GET, POST, OPTIONS",
					"access-control-allow-headers": "content-type"
				});
				res.end();
				return;
			}
			const urlObj = new URL(req.url ?? "", "http://localhost");
			const pathname = urlObj.pathname;
			try {
				if (pathname === `/__dsh-tasks__/list` && req.method === "GET") {
					const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
					sendJson(res, 200, {
						ok: true,
						data: await TaskStore.listTasks(workspacePath)
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/ready` && req.method === "GET") {
					const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
					sendJson(res, 200, {
						ok: true,
						data: await TaskStore.getReadyTasks(workspacePath)
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/report` && req.method === "GET") {
					const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
					sendJson(res, 200, {
						ok: true,
						data: { report: await TaskStore.exportSummaryReport(workspacePath) }
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/create` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					const workspacePath = body?.workspacePath || process.cwd();
					if (Array.isArray(body?.tasks) && body.tasks.length > 0) {
						sendJson(res, 200, {
							ok: true,
							data: await TaskStore.createTasks(workspacePath, body.tasks)
						});
						return;
					}
					if (!body || !body.title) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing required 'title' or 'tasks'"
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: await TaskStore.createTask(workspacePath, {
							title: body.title,
							description: body.description,
							priority: body.priority,
							tags: body.tags,
							assignee: body.assignee,
							dependsOn: body.dependsOn
						})
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/update` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.taskId) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'taskId'"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					const task = await TaskStore.updateTask(workspacePath, body.taskId, body);
					if (!task) {
						sendJson(res, 404, {
							ok: false,
							error: "Task not found"
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: task
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/conclude` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.taskId || !body.summary) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'taskId' or 'summary'"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					const task = await TaskStore.addConclusion(workspacePath, body.taskId, body);
					if (!task) {
						sendJson(res, 404, {
							ok: false,
							error: "Task not found"
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: task
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/archive` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.taskId) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'taskId'"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					const task = await TaskStore.archiveTask(workspacePath, body.taskId);
					if (!task) {
						sendJson(res, 404, {
							ok: false,
							error: "Task not found"
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: task
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/delete` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.taskId) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'taskId'"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					sendJson(res, 200, { ok: await TaskStore.deleteTask(workspacePath, body.taskId) });
					return;
				}
				if (pathname === `/__dsh-tasks__/decision` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.taskId || !body.title?.trim() || !body.rationale?.trim()) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'taskId', 'title' or 'rationale'"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					const payload = {
						title: body.title,
						rationale: body.rationale,
						alternatives: body.alternatives,
						actor: body.actor,
						sessionId: body.sessionId
					};
					const record = body.supersedeDecisionId?.trim() ? await TaskStore.supersedeDecision(workspacePath, body.taskId, body.supersedeDecisionId.trim(), payload) : await TaskStore.addDecision(workspacePath, body.taskId, payload);
					if (!record) {
						sendJson(res, body.supersedeDecisionId ? 409 : 404, {
							ok: false,
							error: body.supersedeDecisionId ? `Decision ${body.supersedeDecisionId} not found or already superseded` : "Task not found"
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: record
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/history` && req.method === "GET") {
					const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
					const taskId = urlObj.searchParams.get("taskId");
					if (!taskId) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'taskId'"
						});
						return;
					}
					const [checkpoints, decisions] = await Promise.all([TaskStore.getTaskHistory(workspacePath, taskId), TaskStore.listDecisions(workspacePath, taskId)]);
					sendJson(res, 200, {
						ok: true,
						data: {
							checkpoints,
							decisions
						}
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/trace` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.taskId || !body.refWorkspacePath?.trim() || !body.refTaskId?.trim()) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'taskId', 'refWorkspacePath' or 'refTaskId'"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					const task = await TaskStore.addTraceRef(workspacePath, body.taskId, {
						workspacePath: body.refWorkspacePath,
						taskId: body.refTaskId,
						note: body.refNote
					});
					if (!task) {
						sendJson(res, 404, {
							ok: false,
							error: "Task not found"
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: task
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/trace` && req.method === "GET") {
					const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
					const taskId = urlObj.searchParams.get("taskId");
					if (!taskId) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'taskId'"
						});
						return;
					}
					const refs = await TaskStore.resolveTraceRefs(workspacePath, taskId);
					if (!refs) {
						sendJson(res, 404, {
							ok: false,
							error: "Task not found"
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: refs
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/claim` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.taskId) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'taskId'"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					const result = await TaskStore.claimTask(workspacePath, body.taskId, {
						owner: body.owner?.trim() || "human",
						sessionHint: body.sessionHint,
						leaseMinutes: body.leaseMinutes
					});
					if (!result.ok) {
						sendJson(res, result.reason === "not-found" ? 404 : 409, {
							ok: false,
							error: result.reason === "not-found" ? "Task not found" : "Task actively claimed by another owner",
							claim: result.claim ?? null
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: result.task
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/release` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.taskId) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'taskId'"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					const result = await TaskStore.releaseTask(workspacePath, body.taskId, {
						owner: body.owner?.trim() || "human",
						force: body.force === true
					});
					if (!result.ok) {
						sendJson(res, result.reason === "not-found" ? 404 : 409, {
							ok: false,
							error: result.reason === "not-found" ? "Task not found" : "Task actively claimed by another owner",
							claim: result.claim ?? null
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: result.task
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/approval` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.taskId || !body.title?.trim() || !Array.isArray(body.options)) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'taskId', 'title' or 'options'"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					const result = await TaskStore.requestApproval(workspacePath, body.taskId, {
						title: body.title,
						detail: body.detail,
						options: body.options
					});
					if (!result.ok) {
						sendJson(res, {
							"not-found": 404,
							"pending-exists": 409,
							invalid: 400
						}[result.reason] ?? 400, {
							ok: false,
							error: result.reason
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: {
							approval: result.approval,
							task: result.task
						}
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/approval/resolve` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.taskId || !body.approvalId || !body.optionId) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'taskId', 'approvalId' or 'optionId'"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					const result = await TaskStore.resolveApproval(workspacePath, body.taskId, body.approvalId, {
						optionId: body.optionId,
						note: body.note,
						actor: body.actor?.trim() || "human"
					});
					if (!result.ok) {
						sendJson(res, {
							"not-found": 404,
							"not-pending": 409,
							"invalid-option": 400
						}[result.reason] ?? 400, {
							ok: false,
							error: result.reason
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: {
							approval: result.approval,
							decision: result.decision ?? null,
							task: result.task
						}
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/approval/reject` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.taskId || !body.approvalId) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'taskId' or 'approvalId'"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					const result = await TaskStore.rejectApproval(workspacePath, body.taskId, body.approvalId, { note: body.note });
					if (!result.ok) {
						sendJson(res, result.reason === "not-found" ? 404 : 409, {
							ok: false,
							error: result.reason
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: {
							approval: result.approval,
							task: result.task
						}
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/approval/pending` && req.method === "GET") {
					const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
					sendJson(res, 200, {
						ok: true,
						data: await TaskStore.listPendingApprovals(workspacePath)
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/global` && req.method === "GET") {
					sendJson(res, 200, {
						ok: true,
						data: await listGlobalOverview()
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/dispatch/rules` && req.method === "GET") {
					const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
					sendJson(res, 200, {
						ok: true,
						data: await DispatchEngine.getRules(workspacePath)
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/dispatch/rules` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					const workspacePath = body?.workspacePath || process.cwd();
					sendJson(res, 200, {
						ok: true,
						data: await DispatchEngine.updateRules(workspacePath, body ?? {})
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/dispatch/pending` && req.method === "GET") {
					const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
					sendJson(res, 200, {
						ok: true,
						data: await DispatchEngine.listPending(workspacePath)
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/dispatch/log` && req.method === "GET") {
					const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
					const limit = Number(urlObj.searchParams.get("limit") ?? "50");
					sendJson(res, 200, {
						ok: true,
						data: await DispatchEngine.listLog(workspacePath, Number.isFinite(limit) ? limit : 50)
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/dispatch/ack` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.id || body.status !== "sent" && body.status !== "failed") {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'id' or invalid 'status' (sent|failed)"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					const record = await DispatchEngine.ack(workspacePath, body.id, body.status);
					if (!record) {
						sendJson(res, 409, {
							ok: false,
							error: "Dispatch record not found or already settled"
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: record
					});
					return;
				}
				if (pathname === `/__dsh-tasks__/dispatch/ignore` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.id) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing 'id'"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					const record = await DispatchEngine.ack(workspacePath, body.id, "ignored");
					if (!record) {
						sendJson(res, 409, {
							ok: false,
							error: "Dispatch record not found or already settled"
						});
						return;
					}
					sendJson(res, 200, {
						ok: true,
						data: record
					});
					return;
				}
				sendJson(res, 404, {
					ok: false,
					error: "Not found"
				});
			} catch (err) {
				sendJson(res, 500, {
					ok: false,
					error: err instanceof Error ? err.message : String(err)
				});
			}
		}
	});
	return () => {
		try {
			dispose?.();
		} catch {}
		if (webServer.prefixes && typeof webServer.prefixes.delete === "function") webServer.prefixes.delete(API_BASE);
	};
}
//#endregion
//#region lib/types/tools/task-tools.js
/**
* 派生认领者标识：能拿到会话 ID 时拼 `base@<短码>` 区分并行会话，
* 拿不到时退化为 base（如 'agent'）。sessionHint 为装饰性可悬挂线索。
*/
function deriveOwner(args, exec) {
	const sessionId = exec?.agent?.session?.header?.id ?? exec?.agent?.session?.id ?? void 0;
	const short = sessionId ? String(sessionId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) : "";
	const base = args.assignee?.trim() || "agent";
	return {
		owner: short ? `${base}@${short}` : base,
		...sessionId ? { sessionHint: String(sessionId) } : {}
	};
}
/** 认领冲突的统一结构化响应：这是正常分支而非错误，Agent 应主动让开另认领就绪任务 */
function conflictResponse(action, cwd, taskId, err) {
	return {
		ok: false,
		action,
		workspacePath: cwd,
		conflict: true,
		taskId,
		claim: err.claim,
		message: `Task ${taskId} is actively claimed by "${err.claim.owner}" (lease until ${err.claim.leaseUntil}). Back off — do NOT work on it; call get_ready_tasks and pick another one.`
	};
}
const TOOL_DESCRIPTION = `Manage project tasks and record execution conclusions in the current workspace.

Actions:
- list: Fetch all tasks and summary metrics for the current workspace.
- get_ready_tasks: Fetch only tasks whose prerequisite dependencies are satisfied and ready for execution. Tasks actively claimed by OTHER sessions are excluded — never work on someone else's locked task.
- create: Create a single task (via title, description, priority, tags) or batch create multiple tasks (via tasks array).
- update: Update task status (todo/in_progress/review/done/blocked/archived), description, priority, tags, or assignee. Setting status to "in_progress" automatically claims the task with a lease lock (default 60 min, adjustable 1-240 via leaseMinutes); if another session holds an active lock you get a structured conflict response — back off and pick another ready task.
- conclude: Complete a task and record execution conclusion, key deliverables (files created/modified), and insights. Automatically transitions task status to "done" and releases the claim lock.
- claim: Explicitly claim a task with a lease lock so other agent sessions back off. Re-claiming as the same owner renews the lease (keeps claimedAt, extends leaseUntil).
- release: Release your own claim. Claims also auto-release on conclude and on status changes to todo/review/done/archived, and lazily expire after the lease — no timers involved. Status "blocked" keeps the claim so no one snatches a task awaiting human decision.
- record_decision: Append an immutable decision record (title + rationale + alternatives). Pass supersedeDecisionId to replace an old decision — old decisions are never rewritten, only superseded via a chain. sessionId is a decorative dangling-safe hint, never required for reading.
- request_approval: Escalate a decision to the human (approvalTitle + approvalDetail + options, ≥2 options). The task turns "blocked" and suspends at zero cost — STOP working on it, do NOT poll or wait. The human resolves it on the task board (批红); resolving is intentionally NOT available to agents — approvals can never be self-granted. An approval resolution is recorded automatically as a decision with the chosen option's verbatim text.
- get_task_history: Fetch the append-only checkpoint event log of a task (field changes, conclusions, decisions, claim events), newest first.
- link_trace: Add a read-only cross-workspace trace reference {refWorkspacePath, refTaskId, refNote} to a task. Resolution degrades gracefully (dangling) when the source is deleted or unreachable.
- export_report: Generate a comprehensive Markdown sprint/delivery summary report for the current workspace.
- archive: Archive a completed task, removing it from active board.
- delete: Remove a task.

All task data is stored outside git in ~/.dsh/storages/workspace-tasks/.`;
const SYSTEM_PROMPT_INSTRUCTION = `## Workspace Task Management (工作区任务协同)
You have access to the \`workspace_task\` tool to manage project tasks and execution conclusions on the task board.

### Standard Operating Procedure (SOP):

1. **Requirement Planning & Task Decomposition (需求规划与自动拆解)**:
   When the user presents a multi-step feature requirement, architectural change, or asks to plan/decompose tasks:
   - Deeply inspect the codebase to understand existing structure, components, and patterns.
   - Proactively decompose the requirement into 3 to 5 clear, modular, verifiable subtasks.
   - Assign appropriate priorities (P0: core functionality/blocking, P1: normal features/extensions, P2: tests/documentation).
   - If subtasks have sequential or causal dependencies, specify prerequisite task IDs in \`dependsOn\` (e.g. \`dependsOn: ["TASK-001"]\`).
   - Add descriptive tags (e.g. \`tags: ["frontend", "api"]\`).
   - IMMEDIATELY call \`workspace_task\` with \`action: "create"\` and \`tasks: [...]\` to batch write the planned subtasks into the workspace board.
   - In your chat response, clearly summarize the decomposition, list the created task IDs (e.g. TASK-001, TASK-002), and ask the user if they'd like you to start executing the first task.

2. **Discovering Ready Tasks (主动识别就绪任务)**:
   - Call \`workspace_task\` with \`action: "get_ready_tasks"\` to find tasks whose prerequisite dependencies are fully met and ready to be executed.
   - Tasks actively claimed by OTHER sessions are excluded automatically — one task, one owner. Never work on a task locked by someone else.

3. **Claiming / Starting a Task (认领并开始执行)**:
   When the user asks you to execute, pick up, or resume a task (e.g. TASK-001):
   - First, call \`workspace_task\` with \`action: "update"\`, setting \`taskId\`, \`status: "in_progress"\`, and \`assignee: "agent"\`. This automatically acquires a lease lock (default 60 min).
   - If you receive a structured conflict response (\`conflict: true\`), another session owns the task — do NOT retry or force it; call \`get_ready_tasks\` and pick a different task instead.
   - While working on a long task, re-claim (or re-update) periodically to renew the lease before it expires.

4. **Executing the Task (执行任务)**:
   - Perform the code modifications, write tests, and run commands as needed.

5. **Finishing & Concluding the Task (结单归档与沉淀)**:
   - Once all code changes and verifications are done, ALWAYS call \`workspace_task\` with \`action: "conclude"\`.
   - Provide:
     - \`summary\`: Concise summary of what was implemented or resolved.
     - \`deliverables\`: Array of relative paths of created or modified files.
     - \`insights\`: Array of key findings, architectural decisions, or caveats.
   - The conclude action will automatically transition the task status to \`done\` and persist your conclusions.
    - When a **key architectural/technical decision** was made during execution, ALSO call \`record_decision\` with a self-contained \`rationale\` (survives session deletion; \`sessionId\` is only a decorative hint). If revising a previous decision, pass \`supersedeDecisionId\` instead of rewriting it.

6. **Escalating Decisions to the Human (请求拍板，票拟→批红)**:
   When you hit a decision that a human must make — deleting data, stopping services, spending money, messaging external parties, changing product direction, creating/rotating keys, modifying permissions:
   - Call \`workspace_task\` with \`action: "request_approval"\`: \`approvalTitle\` (the question), \`approvalDetail\` (context), and \`options\` (≥2 concrete choices you could execute).
   - Then STOP immediately. The task suspends at zero cost (blocked, no process, no polling) — do NOT poll for the answer, do NOT proceed with any of the options on your own.
   - The human resolves it on the task board; the resolution is recorded as an immutable decision. When you are invoked again, read the task's decisions and resume accordingly.
   - Only ask for decisions that genuinely need a human. Everything else is yours to finish.`;
function registerTaskTools(ctx) {
	const tools = ctx.tools;
	const systemPrompt = ctx.systemPrompt;
	const disposers = [];
	if (systemPrompt) disposers.push(systemPrompt.section({
		name: "tool:workspace_task",
		order: 140,
		text: SYSTEM_PROMPT_INSTRUCTION
	}));
	if (tools) {
		const toolDef = {
			name: "workspace_task",
			description: TOOL_DESCRIPTION,
			parameters: {
				type: "object",
				properties: {
					action: {
						type: "string",
						enum: [
							"list",
							"get_ready_tasks",
							"create",
							"update",
							"conclude",
							"record_decision",
							"get_task_history",
							"link_trace",
							"claim",
							"release",
							"request_approval",
							"export_report",
							"archive",
							"delete"
						],
						description: "Action to perform on workspace tasks"
					},
					taskId: {
						type: "string",
						description: "Task ID (e.g. TASK-001), required for update/conclude/archive/delete"
					},
					title: {
						type: "string",
						description: "Task title, required for create"
					},
					description: {
						type: "string",
						description: "Detailed task description or requirement context (Markdown)"
					},
					status: {
						type: "string",
						enum: [
							"todo",
							"in_progress",
							"review",
							"done",
							"blocked",
							"archived"
						],
						description: "Task status"
					},
					priority: {
						type: "string",
						enum: [
							"P0",
							"P1",
							"P2"
						],
						description: "Task priority"
					},
					tags: {
						type: "array",
						items: { type: "string" },
						description: "List of categorical tags (e.g. ['frontend', 'api', 'bugfix'])"
					},
					assignee: {
						type: "string",
						description: "Task assignee (e.g. 'agent' or user name)"
					},
					dependsOn: {
						type: "array",
						items: { type: "string" },
						description: "List of prerequisite task IDs that must be completed before this task (e.g. ['TASK-001'])"
					},
					tasks: {
						type: "array",
						items: {
							type: "object",
							properties: {
								title: {
									type: "string",
									description: "Task title"
								},
								description: {
									type: "string",
									description: "Task description or acceptance criteria (Markdown)"
								},
								priority: {
									type: "string",
									enum: [
										"P0",
										"P1",
										"P2"
									],
									description: "Task priority (P0=highest, P1=normal, P2=low)"
								},
								tags: {
									type: "array",
									items: { type: "string" },
									description: "Tags for category classification"
								},
								assignee: {
									type: "string",
									description: "Task assignee (default: 'agent')"
								},
								dependsOn: {
									type: "array",
									items: { type: "string" },
									description: "List of prerequisite task IDs"
								}
							},
							required: ["title"]
						},
						description: "Optional list of tasks for batch creation during requirement planning & decomposition"
					},
					summary: {
						type: "string",
						description: "Execution conclusion summary, required for conclude action"
					},
					deliverables: {
						type: "array",
						items: { type: "string" },
						description: "List of produced file paths or artifact deliverables"
					},
					insights: {
						type: "array",
						items: { type: "string" },
						description: "Key findings, architectural decisions, or caveats discovered during task execution"
					},
					workspacePath: {
						type: "string",
						description: "Optional workspace root directory. Defaults to the current session's workspace directory."
					},
					decisionTitle: {
						type: "string",
						description: "Decision title, required for record_decision (with or without supersedeDecisionId)"
					},
					rationale: {
						type: "string",
						description: "Decision rationale — must be self-contained (survives session deletion), required for record_decision"
					},
					alternatives: {
						type: "array",
						items: { type: "string" },
						description: "Alternatives considered and rejected (optional, for record_decision)"
					},
					actor: {
						type: "string",
						description: "Decision maker identifier (free-text snapshot, e.g. 'agent' or user name)"
					},
					sessionId: {
						type: "string",
						description: "Optional session ID hint (decorative, dangling-safe; never required to read the decision)"
					},
					supersedeDecisionId: {
						type: "string",
						description: "Existing decision ID (DEC-xxx) to supersede — old decision body is never rewritten, only marked superseded"
					},
					refWorkspacePath: {
						type: "string",
						description: "Source workspace absolute path, required for link_trace"
					},
					refTaskId: {
						type: "string",
						description: "Source task ID (e.g. TASK-001), required for link_trace"
					},
					refNote: {
						type: "string",
						description: "Why this trace is referenced (optional, for link_trace)"
					},
					leaseMinutes: {
						type: "number",
						description: "Lease duration in minutes for claim / update(in_progress) (default 60, min 1, max 240)"
					},
					approvalTitle: {
						type: "string",
						description: "The decision question to escalate, required for request_approval"
					},
					approvalDetail: {
						type: "string",
						description: "Context/background for the approval request (optional, for request_approval)"
					},
					options: {
						type: "array",
						items: { type: "string" },
						description: "Concrete choices the human can pick (≥2), required for request_approval"
					}
				},
				required: ["action"]
			},
			output: {
				schema: { type: "object" },
				render: (_args, value) => [{
					type: "text",
					text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
				}]
			},
			isConcurrencySafe: () => false,
			async execute(args, exec) {
				const sessionCwd = exec?.agent?.session?.header?.cwd;
				const rawPath = args.workspacePath || sessionCwd || process.cwd();
				const cwd = path.resolve(rawPath);
				switch (args.action) {
					case "list": {
						const result = await TaskStore.listTasks(cwd);
						return {
							ok: true,
							action: "list",
							workspacePath: cwd,
							summary: result.summary,
							tasks: result.tasks
						};
					}
					case "get_ready_tasks": {
						const { owner } = deriveOwner(args, exec);
						const readyTasks = await TaskStore.getReadyTasks(cwd, { owner });
						return {
							ok: true,
							action: "get_ready_tasks",
							workspacePath: cwd,
							count: readyTasks.length,
							tasks: readyTasks,
							message: readyTasks.length > 0 ? `Found ${readyTasks.length} task(s) whose dependencies are satisfied and ready for execution: ${readyTasks.map((t) => `${t.id} ("${t.title}")`).join(", ")}` : `No tasks are currently ready for execution (tasks actively claimed by other sessions are excluded).`
						};
					}
					case "export_report": return {
						ok: true,
						action: "export_report",
						workspacePath: cwd,
						report: await TaskStore.exportSummaryReport(cwd)
					};
					case "create": {
						if (Array.isArray(args.tasks) && args.tasks.length > 0) {
							const createdList = await TaskStore.createTasks(cwd, args.tasks);
							return {
								ok: true,
								action: "create",
								workspacePath: cwd,
								message: `Batch created ${createdList.length} task(s) in ${cwd}: ${createdList.map((t) => `${t.id} ("${t.title}")`).join(", ")}`,
								tasks: createdList
							};
						}
						if (!args.title) throw new Error("Missing required 'title' or 'tasks' for create");
						const task = await TaskStore.createTask(cwd, {
							title: args.title,
							description: args.description,
							priority: args.priority,
							tags: args.tags,
							assignee: args.assignee,
							dependsOn: args.dependsOn
						});
						if (!task) throw new Error(`Task ${args.taskId} not found in ${cwd}`);
						return {
							ok: true,
							action: "create",
							workspacePath: cwd,
							message: `Created task ${task.id} in ${cwd}: "${task.title}"`,
							task
						};
					}
					case "update":
						if (!args.taskId) throw new Error("Missing required 'taskId' for update");
						try {
							const claimOpts = args.status === "in_progress" ? (() => {
								const { owner, sessionHint } = deriveOwner(args, exec);
								return {
									claimOwner: owner,
									sessionHint,
									leaseMinutes: args.leaseMinutes
								};
							})() : void 0;
							const task = await TaskStore.updateTask(cwd, args.taskId, {
								title: args.title,
								description: args.description,
								status: args.status,
								priority: args.priority,
								tags: args.tags,
								assignee: args.assignee,
								dependsOn: args.dependsOn
							}, claimOpts);
							if (!task) throw new Error(`Task ${args.taskId} not found in ${cwd}`);
							return {
								ok: true,
								action: "update",
								workspacePath: cwd,
								message: `Updated task ${task.id} status to ${task.status}${task.claim ? ` (claimed by ${task.claim.owner}, lease until ${task.claim.leaseUntil})` : ""}`,
								task
							};
						} catch (err) {
							if (err instanceof ClaimConflictError) return conflictResponse("update", cwd, args.taskId, err);
							throw err;
						}
					case "claim": {
						if (!args.taskId) throw new Error("Missing required 'taskId' for claim");
						const { owner, sessionHint } = deriveOwner(args, exec);
						const result = await TaskStore.claimTask(cwd, args.taskId, {
							owner,
							sessionHint,
							leaseMinutes: args.leaseMinutes
						});
						if (!result.ok) {
							if (result.reason === "not-found") throw new Error(`Task ${args.taskId} not found in ${cwd}`);
							return {
								ok: false,
								action: "claim",
								workspacePath: cwd,
								conflict: true,
								taskId: args.taskId,
								claim: result.claim,
								message: `Task ${args.taskId} is actively claimed by "${result.claim?.owner}" (lease until ${result.claim?.leaseUntil}). Back off — do NOT work on it; call get_ready_tasks and pick another one.`
							};
						}
						return {
							ok: true,
							action: "claim",
							workspacePath: cwd,
							message: `Claimed task ${args.taskId} as "${owner}" (lease until ${result.task.claim?.leaseUntil}). Re-claim before expiry to renew.`,
							task: result.task
						};
					}
					case "release": {
						if (!args.taskId) throw new Error("Missing required 'taskId' for release");
						const { owner } = deriveOwner(args, exec);
						const result = await TaskStore.releaseTask(cwd, args.taskId, { owner });
						if (!result.ok) {
							if (result.reason === "not-found") throw new Error(`Task ${args.taskId} not found in ${cwd}`);
							return {
								ok: false,
								action: "release",
								workspacePath: cwd,
								conflict: true,
								taskId: args.taskId,
								claim: result.claim,
								message: `Task ${args.taskId} is actively claimed by "${result.claim?.owner}" — you cannot release someone else's lock. It expires at ${result.claim?.leaseUntil}.`
							};
						}
						return {
							ok: true,
							action: "release",
							workspacePath: cwd,
							message: `Released claim on task ${args.taskId}.`,
							task: result.task
						};
					}
					case "conclude": {
						if (!args.taskId) throw new Error("Missing required 'taskId' for conclude");
						if (!args.summary) throw new Error("Missing required 'summary' for conclude");
						const task = await TaskStore.addConclusion(cwd, args.taskId, {
							summary: args.summary,
							deliverables: args.deliverables,
							insights: args.insights
						});
						if (!task) throw new Error(`Task ${args.taskId} not found in ${cwd}`);
						return {
							ok: true,
							action: "conclude",
							workspacePath: cwd,
							message: `Concluded task ${task.id} successfully with conclusion record`,
							task
						};
					}
					case "record_decision": {
						if (!args.taskId) throw new Error("Missing required 'taskId' for record_decision");
						if (!args.decisionTitle?.trim()) throw new Error("Missing required 'decisionTitle' for record_decision");
						if (!args.rationale?.trim()) throw new Error("Missing required 'rationale' for record_decision");
						const decisionPayload = {
							title: args.decisionTitle,
							rationale: args.rationale,
							alternatives: args.alternatives,
							actor: args.actor ?? "agent",
							sessionId: args.sessionId
						};
						let record;
						if (args.supersedeDecisionId?.trim()) {
							record = await TaskStore.supersedeDecision(cwd, args.taskId, args.supersedeDecisionId.trim(), decisionPayload);
							if (!record) throw new Error(`Decision ${args.supersedeDecisionId} not found (or already superseded) on task ${args.taskId}`);
						} else {
							record = await TaskStore.addDecision(cwd, args.taskId, decisionPayload);
							if (!record) throw new Error(`Task ${args.taskId} not found in ${cwd}`);
						}
						return {
							ok: true,
							action: "record_decision",
							workspacePath: cwd,
							decisionId: record.id,
							message: `Recorded decision ${record.id} on ${args.taskId}: "${record.title}"${args.supersedeDecisionId ? ` (supersedes ${args.supersedeDecisionId})` : ""}`,
							decision: record
						};
					}
					case "get_task_history": {
						if (!args.taskId) throw new Error("Missing required 'taskId' for get_task_history");
						const [history, decisions] = await Promise.all([TaskStore.getTaskHistory(cwd, args.taskId), TaskStore.listDecisions(cwd, args.taskId)]);
						return {
							ok: true,
							action: "get_task_history",
							workspacePath: cwd,
							taskId: args.taskId,
							checkpoints: history,
							decisions,
							message: `Task ${args.taskId}: ${history.length} checkpoint(s), ${decisions.length} decision(s)`
						};
					}
					case "link_trace": {
						if (!args.taskId) throw new Error("Missing required 'taskId' for link_trace");
						if (!args.refWorkspacePath?.trim()) throw new Error("Missing required 'refWorkspacePath' for link_trace");
						if (!args.refTaskId?.trim()) throw new Error("Missing required 'refTaskId' for link_trace");
						const task = await TaskStore.addTraceRef(cwd, args.taskId, {
							workspacePath: args.refWorkspacePath,
							taskId: args.refTaskId,
							note: args.refNote
						});
						if (!task) throw new Error(`Task ${args.taskId} not found in ${cwd}`);
						return {
							ok: true,
							action: "link_trace",
							workspacePath: cwd,
							message: `Linked trace ${args.refTaskId} of ${args.refWorkspacePath} to ${task.id}`,
							task
						};
					}
					case "request_approval": {
						if (!args.taskId) throw new Error("Missing required 'taskId' for request_approval");
						if (!args.approvalTitle?.trim()) throw new Error("Missing required 'approvalTitle' for request_approval");
						if (!Array.isArray(args.options) || args.options.filter((o) => o?.trim()).length < 2) throw new Error("request_approval requires 'options' with at least 2 non-empty choices");
						const result = await TaskStore.requestApproval(cwd, args.taskId, {
							title: args.approvalTitle,
							detail: args.approvalDetail,
							options: args.options
						});
						if (!result.ok) {
							if (result.reason === "not-found") throw new Error(`Task ${args.taskId} not found in ${cwd}`);
							return {
								ok: false,
								action: "request_approval",
								workspacePath: cwd,
								taskId: args.taskId,
								reason: result.reason,
								message: result.reason === "pending-exists" ? `Task ${args.taskId} already has a pending approval — one question at a time. Wait for the human to resolve it (do NOT poll).` : `Task ${args.taskId} cannot accept approval requests in its current state (done/archived).`
							};
						}
						return {
							ok: true,
							action: "request_approval",
							workspacePath: cwd,
							approval: structuredClone(result.approval),
							task: result.task,
							message: `Approval requested on ${args.taskId} (${result.approval.id}): "${result.approval.title}". The task is now blocked and suspended at zero cost. STOP working on it — do NOT poll, do NOT proceed with any option yourself. The human will resolve it on the task board.`
						};
					}
					case "archive": {
						if (!args.taskId) throw new Error("Missing required 'taskId' for archive");
						const task = await TaskStore.archiveTask(cwd, args.taskId);
						if (!task) throw new Error(`Task ${args.taskId} not found in ${cwd}`);
						return {
							ok: true,
							action: "archive",
							workspacePath: cwd,
							message: `Archived task ${task.id} in ${cwd}`,
							task
						};
					}
					case "delete": {
						if (!args.taskId) throw new Error("Missing required 'taskId' for delete");
						const success = await TaskStore.deleteTask(cwd, args.taskId);
						return {
							ok: success,
							action: "delete",
							workspacePath: cwd,
							message: success ? `Deleted task ${args.taskId} from ${cwd}` : `Task ${args.taskId} not found in ${cwd}`
						};
					}
					default: throw new Error(`Unknown action ${args.action}`);
				}
			}
		};
		disposers.push(tools.register(toolDef));
	}
	return () => {
		for (const dispose of disposers) dispose?.();
	};
}
//#endregion
//#region lib/types/index.js
const name = "workspace-tasks";
const inject = [
	"tools",
	"webServer",
	"systemPrompt"
];
function apply(ctx) {
	const disposers = [];
	try {
		const disposeApi = registerTaskApis(ctx);
		if (disposeApi) disposers.push(disposeApi);
		const disposeTools = registerTaskTools(ctx);
		if (disposeTools) disposers.push(disposeTools);
		disposers.push(onTaskDone((workspacePath, task) => {
			DispatchEngine.evaluate(workspacePath, task.id).catch((err) => {
				console.error("[dsh-workspace-tasks] auto-dispatch evaluate failed:", err);
			});
		}));
		disposers.push(onTasksCreated((workspacePath) => {
			DispatchEngine.evaluate(workspacePath).catch((err) => {
				console.error("[dsh-workspace-tasks] auto-dispatch evaluate failed:", err);
			});
		}));
	} catch (err) {
		for (const dispose of disposers.reverse()) try {
			dispose();
		} catch {}
		throw err;
	}
	return () => {
		for (const dispose of disposers.reverse()) try {
			dispose?.();
		} catch {}
	};
}
//#endregion
export { apply, inject, name };
