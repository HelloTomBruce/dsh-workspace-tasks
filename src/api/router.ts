import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import { TaskStore } from "../store/task-store.ts";
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
