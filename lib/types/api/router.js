import { TaskStore } from "../store/task-store.js";
export const API_BASE = "/__dsh-tasks__";
function sendJson(res, status, body) {
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type",
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
    }
    catch {
        return null;
    }
}
export function registerTaskApis(ctx) {
    const webServer = ctx.webServer;
    if (!webServer)
        return () => { };
    // Clean up any stale or orphaned route before registering
    if (webServer.prefixes && typeof webServer.prefixes.delete === "function") {
        webServer.prefixes.delete(API_BASE);
    }
    const dispose = webServer.register({
        kind: "prefix",
        path: API_BASE,
        handler: async (req, res) => {
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
                if (pathname === `${API_BASE}/create` && req.method === "POST") {
                    const raw = await readBody(req);
                    const body = parseJsonBody(raw);
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
                        assignee: body.assignee,
                        sessionId: body.sessionId,
                    });
                    sendJson(res, 200, { ok: true, data: task });
                    return;
                }
                if (pathname === `${API_BASE}/update` && req.method === "POST") {
                    const raw = await readBody(req);
                    const body = parseJsonBody(raw);
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
                    const body = parseJsonBody(raw);
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
                    const body = parseJsonBody(raw);
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
                    const body = parseJsonBody(raw);
                    if (!body || !body.taskId) {
                        sendJson(res, 400, { ok: false, error: "Missing 'taskId'" });
                        return;
                    }
                    const workspacePath = body.workspacePath || process.cwd();
                    const ok = await TaskStore.deleteTask(workspacePath, body.taskId);
                    sendJson(res, 200, { ok });
                    return;
                }
                sendJson(res, 404, { ok: false, error: "Not found" });
            }
            catch (err) {
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
        }
        catch { }
        if (webServer.prefixes && typeof webServer.prefixes.delete === "function") {
            webServer.prefixes.delete(API_BASE);
        }
    };
}
//# sourceMappingURL=router.js.map