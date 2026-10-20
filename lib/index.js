import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
//#region lib/types/store/pipeline.js
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
*/
function getReadyTasks(tasks) {
	return tasks.filter((task) => isTaskReady(task, tasks)).sort((a, b) => {
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
		if (t.sessionId) lines.push(`- **关联会话**: \`#${t.sessionId.slice(0, 8)}\``);
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
				...params.sessionId !== void 0 ? { sessionId: params.sessionId } : {},
				conclusions: []
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
		if (!list[0]) throw new Error("Task title cannot be empty");
		return list[0];
	}
	static async updateTask(workspacePath, taskId, patch) {
		const doc = await this.load(workspacePath);
		const task = doc.tasks.find((t) => t.id === taskId);
		if (!task) return null;
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
		if (patch.sessionId !== void 0) {
			if (patch.sessionId) task.sessionId = patch.sessionId;
			else delete task.sessionId;
		}
		if (patch.dependsOn !== void 0) {
			const validDeps = Array.isArray(patch.dependsOn) ? Array.from(new Set(patch.dependsOn.map((d) => d.trim()).filter((d) => Boolean(d) && d !== taskId))) : [];
			if (validDeps.length > 0) task.dependsOn = validDeps;
			else delete task.dependsOn;
		}
		task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		await this.save(workspacePath, doc);
		return task;
	}
	static async addConclusion(workspacePath, taskId, conclusion) {
		const doc = await this.load(workspacePath);
		const task = doc.tasks.find((t) => t.id === taskId);
		if (!task) return null;
		const conclusionSessionId = conclusion.sessionId ?? task.sessionId;
		const newConclusion = {
			id: `CONC-${Date.now()}`,
			summary: conclusion.summary.trim(),
			deliverables: conclusion.deliverables ?? [],
			insights: conclusion.insights ?? [],
			completedAt: (/* @__PURE__ */ new Date()).toISOString(),
			...conclusionSessionId !== void 0 ? { sessionId: conclusionSessionId } : {}
		};
		task.conclusions.unshift(newConclusion);
		task.status = "done";
		task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
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
		if (doc.tasks.length === initialLen) return false;
		await this.save(workspacePath, doc);
		return true;
	}
	static async getReadyTasks(workspacePath) {
		return getReadyTasks((await this.load(workspacePath)).tasks);
	}
	static async exportSummaryReport(workspacePath) {
		return generateWorkspaceSummaryReport((await this.load(workspacePath)).tasks, workspacePath);
	}
};
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
							sessionId: body.sessionId,
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
const TOOL_DESCRIPTION = `Manage project tasks and record execution conclusions in the current workspace.

Actions:
- list: Fetch all tasks and summary metrics for the current workspace.
- get_ready_tasks: Fetch only tasks whose prerequisite dependencies are satisfied and ready for execution.
- create: Create a single task (via title, description, priority, tags) or batch create multiple tasks (via tasks array).
- update: Update task status (todo/in_progress/review/done/blocked/archived), description, priority, tags, or assignee.
- conclude: Complete a task and record execution conclusion, key deliverables (files created/modified), and insights. Automatically transitions task status to "done".
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

3. **Claiming / Starting a Task (认领并开始执行)**:
   When the user asks you to execute, pick up, or resume a task (e.g. TASK-001):
   - First, call \`workspace_task\` with \`action: "update"\`, setting \`taskId\`, \`status: "in_progress"\`, and \`assignee: "agent"\`.

4. **Executing the Task (执行任务)**:
   - Perform the code modifications, write tests, and run commands as needed.

5. **Finishing & Concluding the Task (结单归档与沉淀)**:
   - Once all code changes and verifications are done, ALWAYS call \`workspace_task\` with \`action: "conclude"\`.
   - Provide:
     - \`summary\`: Concise summary of what was implemented or resolved.
     - \`deliverables\`: Array of relative paths of created or modified files.
     - \`insights\`: Array of key findings, architectural decisions, or caveats.
   - The conclude action will automatically transition the task status to \`done\` and persist your conclusions.`;
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
				const agentSessionId = exec?.agent?.session?.header?.id;
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
						const readyTasks = await TaskStore.getReadyTasks(cwd);
						return {
							ok: true,
							action: "get_ready_tasks",
							workspacePath: cwd,
							count: readyTasks.length,
							tasks: readyTasks,
							message: readyTasks.length > 0 ? `Found ${readyTasks.length} task(s) whose dependencies are satisfied and ready for execution: ${readyTasks.map((t) => `${t.id} ("${t.title}")`).join(", ")}` : `No tasks are currently ready for execution.`
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
							const tasksToCreate = args.tasks.map((t) => ({
								...t,
								...agentSessionId ? { sessionId: agentSessionId } : {}
							}));
							const createdList = await TaskStore.createTasks(cwd, tasksToCreate);
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
							dependsOn: args.dependsOn,
							...agentSessionId ? { sessionId: agentSessionId } : {}
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
					case "update": {
						if (!args.taskId) throw new Error("Missing required 'taskId' for update");
						const task = await TaskStore.updateTask(cwd, args.taskId, {
							title: args.title,
							description: args.description,
							status: args.status,
							priority: args.priority,
							tags: args.tags,
							assignee: args.assignee,
							dependsOn: args.dependsOn,
							...agentSessionId ? { sessionId: agentSessionId } : {}
						});
						if (!task) throw new Error(`Task ${args.taskId} not found in ${cwd}`);
						return {
							ok: true,
							action: "update",
							workspacePath: cwd,
							message: `Updated task ${task.id} status to ${task.status}`,
							task
						};
					}
					case "conclude": {
						if (!args.taskId) throw new Error("Missing required 'taskId' for conclude");
						if (!args.summary) throw new Error("Missing required 'summary' for conclude");
						const task = await TaskStore.addConclusion(cwd, args.taskId, {
							summary: args.summary,
							deliverables: args.deliverables,
							insights: args.insights,
							...agentSessionId ? { sessionId: agentSessionId } : {}
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
