import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
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
		case "blocked": blocked++;
	}
	return {
		total: tasks.length,
		todo,
		inProgress,
		review,
		done,
		blocked
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
	static async createTask(workspacePath, params) {
		const doc = await this.load(workspacePath);
		const maxNum = doc.tasks.reduce((max, t) => {
			const match = t.id.match(/^TASK-(\d+)$/);
			if (match && match[1]) {
				const num = parseInt(match[1], 10);
				return num > max ? num : max;
			}
			return max;
		}, 0);
		const nextId = `TASK-${String(maxNum + 1).padStart(3, "0")}`;
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const newTask = {
			id: nextId,
			title: params.title.trim(),
			description: params.description?.trim() || "",
			status: "todo",
			priority: params.priority || "P1",
			assignee: params.assignee || "agent",
			createdAt: now,
			updatedAt: now,
			sessionId: params.sessionId,
			conclusions: []
		};
		doc.tasks.unshift(newTask);
		await this.save(workspacePath, doc);
		return newTask;
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
		task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		await this.save(workspacePath, doc);
		return task;
	}
	static async addConclusion(workspacePath, taskId, conclusion) {
		const doc = await this.load(workspacePath);
		const task = doc.tasks.find((t) => t.id === taskId);
		if (!task) return null;
		const newConclusion = {
			id: `CONC-${Date.now()}`,
			summary: conclusion.summary.trim(),
			deliverables: conclusion.deliverables ?? [],
			insights: conclusion.insights ?? [],
			completedAt: (/* @__PURE__ */ new Date()).toISOString(),
			sessionId: conclusion.sessionId ?? task.sessionId
		};
		task.conclusions.unshift(newConclusion);
		task.status = "done";
		task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		await this.save(workspacePath, doc);
		return task;
	}
	static async deleteTask(workspacePath, taskId) {
		const doc = await this.load(workspacePath);
		const initialLen = doc.tasks.length;
		doc.tasks = doc.tasks.filter((t) => t.id !== taskId);
		if (doc.tasks.length === initialLen) return false;
		await this.save(workspacePath, doc);
		return true;
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
				if (pathname === `/__dsh-tasks__/create` && req.method === "POST") {
					const body = parseJsonBody(await readBody(req));
					if (!body || !body.title) {
						sendJson(res, 400, {
							ok: false,
							error: "Missing required 'title'"
						});
						return;
					}
					const workspacePath = body.workspacePath || process.cwd();
					sendJson(res, 200, {
						ok: true,
						data: await TaskStore.createTask(workspacePath, body)
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
- create: Create a new task with title, description, priority (P0/P1/P2).
- update: Update task status (todo/in_progress/review/done/blocked), description, or assignee.
- conclude: Complete a task and record execution conclusion, key deliverables (files created/modified), and insights. Automatically transitions task status to "done".
- delete: Remove a task.

All task data is stored outside git in ~/.dsh/storages/workspace-tasks/.`;
const SYSTEM_PROMPT_INSTRUCTION = `## Workspace Task Management
You have access to the \`workspace_task\` tool to manage project tasks and execution conclusions on the task board.

### Standard Operating Procedure (SOP):
1. **Claiming / Starting a Task**:
   When the user asks you to execute, pick up, or resume a task (e.g. TASK-001):
   - First, call \`workspace_task\` with \`action: "update"\`, setting \`taskId\`, \`status: "in_progress"\`, and \`assignee: "agent"\`.
2. **Executing the Task**:
   - Perform the code modifications, write tests, and run commands as needed.
3. **Finishing & Concluding the Task**:
   - Once all code and verifications are done, ALWAYS call \`workspace_task\` with \`action: "conclude"\`.
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
							"create",
							"update",
							"conclude",
							"delete"
						],
						description: "Action to perform on workspace tasks"
					},
					taskId: {
						type: "string",
						description: "Task ID (e.g. TASK-001), required for update/conclude/delete"
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
							"blocked"
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
					assignee: {
						type: "string",
						description: "Task assignee (e.g. 'agent' or user name)"
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
						description: "Optional workspace root directory (defaults to current working directory)"
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
			async execute(args) {
				const cwd = args.workspacePath || process.cwd();
				switch (args.action) {
					case "list": {
						const result = await TaskStore.listTasks(cwd);
						return {
							ok: true,
							action: "list",
							summary: result.summary,
							tasks: result.tasks
						};
					}
					case "create": {
						if (!args.title) throw new Error("Missing required 'title' for create");
						const task = await TaskStore.createTask(cwd, {
							title: args.title,
							description: args.description,
							priority: args.priority,
							assignee: args.assignee
						});
						return {
							ok: true,
							action: "create",
							message: `Created task ${task.id}: "${task.title}"`,
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
							assignee: args.assignee
						});
						if (!task) throw new Error(`Task ${args.taskId} not found`);
						return {
							ok: true,
							action: "update",
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
							insights: args.insights
						});
						if (!task) throw new Error(`Task ${args.taskId} not found`);
						return {
							ok: true,
							action: "conclude",
							message: `Concluded task ${task.id} successfully with conclusion record`,
							task
						};
					}
					case "delete": {
						if (!args.taskId) throw new Error("Missing required 'taskId' for delete");
						const success = await TaskStore.deleteTask(cwd, args.taskId);
						return {
							ok: success,
							action: "delete",
							message: success ? `Deleted task ${args.taskId}` : `Task ${args.taskId} not found`
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
