import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import { TaskStore } from "../store/task-store.ts";
import { DispatchEngine } from "../store/dispatch.ts";
import { listGlobalOverview } from "../store/global.ts";
import type { DispatchMode } from "../store/dispatch.ts";
import type { TaskPriority, TaskStatus } from "../store/types.ts";

export const API_BASE = "/__dsh-tasks__";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseJsonBody<T>(bodyStr: string): T | null {
  try {
    return JSON.parse(bodyStr) as T;
  } catch {
    return null;
  }
}

export function registerTaskApis(ctx: Context): () => void {
  const webServer = (ctx as unknown as {
    webServer?: {
      register: (spec: unknown) => () => void;
      prefixes?: Map<string, unknown>;
    };
  }).webServer;
  if (!webServer) return () => {};

  // Clean up any stale or orphaned route before registering
  if (webServer.prefixes && typeof webServer.prefixes.delete === "function") {
    webServer.prefixes.delete(API_BASE);
  }

  const dispose = webServer.register({
    kind: "prefix",
    path: API_BASE,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        res.end();
        return;
      }

      const urlObj = new URL(req.url ?? "", "http://localhost");
      const pathname = urlObj.pathname;

      try {
        if (pathname === `${API_BASE}/list` && req.method === "GET") {
          const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
          const result = await TaskStore.listTasks(workspacePath);
          sendJson(res, 200, { ok: true, data: result });
          return;
        }

        if (pathname === `${API_BASE}/ready` && req.method === "GET") {
          const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
          const readyTasks = await TaskStore.getReadyTasks(workspacePath);
          sendJson(res, 200, { ok: true, data: readyTasks });
          return;
        }

        if (pathname === `${API_BASE}/report` && req.method === "GET") {
          const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
          const report = await TaskStore.exportSummaryReport(workspacePath);
          sendJson(res, 200, { ok: true, data: { report } });
          return;
        }

        if (pathname === `${API_BASE}/create` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{
            workspacePath?: string;
            title?: string;
            description?: string;
            priority?: TaskPriority;
            tags?: string[];
            assignee?: string;
            dependsOn?: string[];
            tasks?: Array<{
              title: string;
              description?: string;
              priority?: TaskPriority;
              tags?: string[];
              assignee?: string;
              dependsOn?: string[];
            }>;
          }>(raw);

          const workspacePath = body?.workspacePath || process.cwd();

          if (Array.isArray(body?.tasks) && body.tasks.length > 0) {
            const created = await TaskStore.createTasks(workspacePath, body.tasks);
            sendJson(res, 200, { ok: true, data: created });
            return;
          }

          if (!body || !body.title) {
            sendJson(res, 400, { ok: false, error: "Missing required 'title' or 'tasks'" });
            return;
          }

          const task = await TaskStore.createTask(workspacePath, {
            title: body.title,
            description: body.description,
            priority: body.priority,
            tags: body.tags,
            assignee: body.assignee,
            dependsOn: body.dependsOn,
          });
          sendJson(res, 200, { ok: true, data: task });
          return;
        }

        if (pathname === `${API_BASE}/update` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{
            workspacePath?: string;
            taskId: string;
            title?: string;
            description?: string;
            status?: TaskStatus;
            priority?: TaskPriority;
            tags?: string[];
            assignee?: string;
            dependsOn?: string[];
          }>(raw);

          if (!body || !body.taskId) {
            sendJson(res, 400, { ok: false, error: "Missing 'taskId'" });
            return;
          }

          const workspacePath = body.workspacePath || process.cwd();
          const task = await TaskStore.updateTask(workspacePath, body.taskId, body);
          if (!task) {
            sendJson(res, 404, { ok: false, error: "Task not found" });
            return;
          }
          sendJson(res, 200, { ok: true, data: task });
          return;
        }

        if (pathname === `${API_BASE}/conclude` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{
            workspacePath?: string;
            taskId: string;
            summary: string;
            deliverables?: string[];
            insights?: string[];
          }>(raw);

          if (!body || !body.taskId || !body.summary) {
            sendJson(res, 400, { ok: false, error: "Missing 'taskId' or 'summary'" });
            return;
          }

          const workspacePath = body.workspacePath || process.cwd();
          const task = await TaskStore.addConclusion(workspacePath, body.taskId, body);
          if (!task) {
            sendJson(res, 404, { ok: false, error: "Task not found" });
            return;
          }
          sendJson(res, 200, { ok: true, data: task });
          return;
        }

        if (pathname === `${API_BASE}/archive` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{ workspacePath?: string; taskId: string }>(raw);
          if (!body || !body.taskId) {
            sendJson(res, 400, { ok: false, error: "Missing 'taskId'" });
            return;
          }
          const workspacePath = body.workspacePath || process.cwd();
          const task = await TaskStore.archiveTask(workspacePath, body.taskId);
          if (!task) {
            sendJson(res, 404, { ok: false, error: "Task not found" });
            return;
          }
          sendJson(res, 200, { ok: true, data: task });
          return;
        }

        if (pathname === `${API_BASE}/delete` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{ workspacePath?: string; taskId: string }>(raw);
          if (!body || !body.taskId) {
            sendJson(res, 400, { ok: false, error: "Missing 'taskId'" });
            return;
          }
          const workspacePath = body.workspacePath || process.cwd();
          const ok = await TaskStore.deleteTask(workspacePath, body.taskId);
          sendJson(res, 200, { ok });
          return;
        }

        if (pathname === `${API_BASE}/decision` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{
            workspacePath?: string;
            taskId: string;
            title: string;
            rationale: string;
            alternatives?: string[];
            actor?: string;
            sessionId?: string;
            supersedeDecisionId?: string;
          }>(raw);

          if (!body || !body.taskId || !body.title?.trim() || !body.rationale?.trim()) {
            sendJson(res, 400, { ok: false, error: "Missing 'taskId', 'title' or 'rationale'" });
            return;
          }
          const workspacePath = body.workspacePath || process.cwd();
          const payload = {
            title: body.title,
            rationale: body.rationale,
            alternatives: body.alternatives,
            actor: body.actor,
            sessionId: body.sessionId,
          };
          const record = body.supersedeDecisionId?.trim()
            ? await TaskStore.supersedeDecision(workspacePath, body.taskId, body.supersedeDecisionId.trim(), payload)
            : await TaskStore.addDecision(workspacePath, body.taskId, payload);
          if (!record) {
            sendJson(res, body.supersedeDecisionId ? 409 : 404, {
              ok: false,
              error: body.supersedeDecisionId
                ? `Decision ${body.supersedeDecisionId} not found or already superseded`
                : "Task not found",
            });
            return;
          }
          sendJson(res, 200, { ok: true, data: record });
          return;
        }

        if (pathname === `${API_BASE}/history` && req.method === "GET") {
          const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
          const taskId = urlObj.searchParams.get("taskId");
          if (!taskId) {
            sendJson(res, 400, { ok: false, error: "Missing 'taskId'" });
            return;
          }
          const [checkpoints, decisions] = await Promise.all([
            TaskStore.getTaskHistory(workspacePath, taskId),
            TaskStore.listDecisions(workspacePath, taskId),
          ]);
          sendJson(res, 200, { ok: true, data: { checkpoints, decisions } });
          return;
        }

        if (pathname === `${API_BASE}/trace` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{
            workspacePath?: string;
            taskId: string;
            refWorkspacePath: string;
            refTaskId: string;
            refNote?: string;
          }>(raw);

          if (!body || !body.taskId || !body.refWorkspacePath?.trim() || !body.refTaskId?.trim()) {
            sendJson(res, 400, { ok: false, error: "Missing 'taskId', 'refWorkspacePath' or 'refTaskId'" });
            return;
          }
          const workspacePath = body.workspacePath || process.cwd();
          const task = await TaskStore.addTraceRef(workspacePath, body.taskId, {
            workspacePath: body.refWorkspacePath,
            taskId: body.refTaskId,
            note: body.refNote,
          });
          if (!task) {
            sendJson(res, 404, { ok: false, error: "Task not found" });
            return;
          }
          sendJson(res, 200, { ok: true, data: task });
          return;
        }

        if (pathname === `${API_BASE}/trace` && req.method === "GET") {
          const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
          const taskId = urlObj.searchParams.get("taskId");
          if (!taskId) {
            sendJson(res, 400, { ok: false, error: "Missing 'taskId'" });
            return;
          }
          const refs = await TaskStore.resolveTraceRefs(workspacePath, taskId);
          if (!refs) {
            sendJson(res, 404, { ok: false, error: "Task not found" });
            return;
          }
          sendJson(res, 200, { ok: true, data: refs });
          return;
        }

        if (pathname === `${API_BASE}/claim` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{
            workspacePath?: string;
            taskId: string;
            owner?: string;
            sessionHint?: string;
            leaseMinutes?: number;
          }>(raw);
          if (!body || !body.taskId) {
            sendJson(res, 400, { ok: false, error: "Missing 'taskId'" });
            return;
          }
          const workspacePath = body.workspacePath || process.cwd();
          const result = await TaskStore.claimTask(workspacePath, body.taskId, {
            owner: body.owner?.trim() || "human",
            sessionHint: body.sessionHint,
            leaseMinutes: body.leaseMinutes,
          });
          if (!result.ok) {
            sendJson(res, result.reason === "not-found" ? 404 : 409, {
              ok: false,
              error: result.reason === "not-found" ? "Task not found" : "Task actively claimed by another owner",
              claim: result.claim ?? null,
            });
            return;
          }
          sendJson(res, 200, { ok: true, data: result.task });
          return;
        }

        if (pathname === `${API_BASE}/release` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{
            workspacePath?: string;
            taskId: string;
            owner?: string;
            force?: boolean;
          }>(raw);
          if (!body || !body.taskId) {
            sendJson(res, 400, { ok: false, error: "Missing 'taskId'" });
            return;
          }
          const workspacePath = body.workspacePath || process.cwd();
          const result = await TaskStore.releaseTask(workspacePath, body.taskId, {
            owner: body.owner?.trim() || "human",
            force: body.force === true,
          });
          if (!result.ok) {
            sendJson(res, result.reason === "not-found" ? 404 : 409, {
              ok: false,
              error: result.reason === "not-found" ? "Task not found" : "Task actively claimed by another owner",
              claim: result.claim ?? null,
            });
            return;
          }
          sendJson(res, 200, { ok: true, data: result.task });
          return;
        }

        if (pathname === `${API_BASE}/approval` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{
            workspacePath?: string;
            taskId: string;
            title: string;
            detail?: string;
            options: string[];
          }>(raw);
          if (!body || !body.taskId || !body.title?.trim() || !Array.isArray(body.options)) {
            sendJson(res, 400, { ok: false, error: "Missing 'taskId', 'title' or 'options'" });
            return;
          }
          const workspacePath = body.workspacePath || process.cwd();
          const result = await TaskStore.requestApproval(workspacePath, body.taskId, {
            title: body.title,
            detail: body.detail,
            options: body.options,
          });
          if (!result.ok) {
            const statusMap: Record<string, number> = { "not-found": 404, "pending-exists": 409, invalid: 400 };
            sendJson(res, statusMap[result.reason] ?? 400, { ok: false, error: result.reason });
            return;
          }
          sendJson(res, 200, { ok: true, data: { approval: result.approval, task: result.task } });
          return;
        }

        if (pathname === `${API_BASE}/approval/resolve` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{
            workspacePath?: string;
            taskId: string;
            approvalId: string;
            optionId: string;
            note?: string;
            actor?: string;
          }>(raw);
          if (!body || !body.taskId || !body.approvalId || !body.optionId) {
            sendJson(res, 400, { ok: false, error: "Missing 'taskId', 'approvalId' or 'optionId'" });
            return;
          }
          const workspacePath = body.workspacePath || process.cwd();
          const result = await TaskStore.resolveApproval(workspacePath, body.taskId, body.approvalId, {
            optionId: body.optionId,
            note: body.note,
            actor: body.actor?.trim() || "human",
          });
          if (!result.ok) {
            const statusMap: Record<string, number> = { "not-found": 404, "not-pending": 409, "invalid-option": 400 };
            sendJson(res, statusMap[result.reason] ?? 400, { ok: false, error: result.reason });
            return;
          }
          sendJson(res, 200, {
            ok: true,
            data: { approval: result.approval, decision: result.decision ?? null, task: result.task },
          });
          return;
        }

        if (pathname === `${API_BASE}/approval/reject` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{
            workspacePath?: string;
            taskId: string;
            approvalId: string;
            note?: string;
          }>(raw);
          if (!body || !body.taskId || !body.approvalId) {
            sendJson(res, 400, { ok: false, error: "Missing 'taskId' or 'approvalId'" });
            return;
          }
          const workspacePath = body.workspacePath || process.cwd();
          const result = await TaskStore.rejectApproval(workspacePath, body.taskId, body.approvalId, {
            note: body.note,
          });
          if (!result.ok) {
            sendJson(res, result.reason === "not-found" ? 404 : 409, { ok: false, error: result.reason });
            return;
          }
          sendJson(res, 200, { ok: true, data: { approval: result.approval, task: result.task } });
          return;
        }

        if (pathname === `${API_BASE}/approval/pending` && req.method === "GET") {
          const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
          const pending = await TaskStore.listPendingApprovals(workspacePath);
          sendJson(res, 200, { ok: true, data: pending });
          return;
        }

        // ===== 自动派发（Fast Path 事件驱动） =====

        if (pathname === `${API_BASE}/global` && req.method === "GET") {
          // 跨工作区聚合（中台视图）：只读，扫全部工作区存储文档
          const overview = await listGlobalOverview();
          sendJson(res, 200, { ok: true, data: overview });
          return;
        }

        if (pathname === `${API_BASE}/dispatch/rules` && req.method === "GET") {
          const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
          const rules = await DispatchEngine.getRules(workspacePath);
          sendJson(res, 200, { ok: true, data: rules });
          return;
        }

        if (pathname === `${API_BASE}/dispatch/rules` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{
            workspacePath?: string;
            mode?: DispatchMode;
            priorities?: TaskPriority[];
            tagsExclude?: string[];
            whitelist?: string[];
            maxConcurrent?: number;
          }>(raw);
          const workspacePath = body?.workspacePath || process.cwd();
          const rules = await DispatchEngine.updateRules(workspacePath, body ?? {});
          sendJson(res, 200, { ok: true, data: rules });
          return;
        }

        if (pathname === `${API_BASE}/dispatch/pending` && req.method === "GET") {
          const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
          const pending = await DispatchEngine.listPending(workspacePath);
          sendJson(res, 200, { ok: true, data: pending });
          return;
        }

        if (pathname === `${API_BASE}/dispatch/log` && req.method === "GET") {
          const workspacePath = urlObj.searchParams.get("workspacePath") || process.cwd();
          const limit = Number(urlObj.searchParams.get("limit") ?? "50");
          const log = await DispatchEngine.listLog(workspacePath, Number.isFinite(limit) ? limit : 50);
          sendJson(res, 200, { ok: true, data: log });
          return;
        }

        if (pathname === `${API_BASE}/dispatch/ack` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{
            workspacePath?: string;
            id: string;
            status: "sent" | "failed";
          }>(raw);
          if (!body || !body.id || (body.status !== "sent" && body.status !== "failed")) {
            sendJson(res, 400, { ok: false, error: "Missing 'id' or invalid 'status' (sent|failed)" });
            return;
          }
          const workspacePath = body.workspacePath || process.cwd();
          const record = await DispatchEngine.ack(workspacePath, body.id, body.status);
          if (!record) {
            sendJson(res, 409, { ok: false, error: "Dispatch record not found or already settled" });
            return;
          }
          sendJson(res, 200, { ok: true, data: record });
          return;
        }

        if (pathname === `${API_BASE}/dispatch/ignore` && req.method === "POST") {
          const raw = await readBody(req);
          const body = parseJsonBody<{ workspacePath?: string; id: string }>(raw);
          if (!body || !body.id) {
            sendJson(res, 400, { ok: false, error: "Missing 'id'" });
            return;
          }
          const workspacePath = body.workspacePath || process.cwd();
          const record = await DispatchEngine.ack(workspacePath, body.id, "ignored");
          if (!record) {
            sendJson(res, 409, { ok: false, error: "Dispatch record not found or already settled" });
            return;
          }
          sendJson(res, 200, { ok: true, data: record });
          return;
        }

        sendJson(res, 404, { ok: false, error: "Not found" });
      } catch (err) {
        sendJson(res, 500, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });

  return () => {
    try {
      dispose?.();
    } catch {}
    if (webServer.prefixes && typeof webServer.prefixes.delete === "function") {
      webServer.prefixes.delete(API_BASE);
    }
  };
}
