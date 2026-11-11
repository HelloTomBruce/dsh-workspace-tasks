import { TaskGuideIcon, GlobalBoardIcon } from "./icons.js";
import { TaskPanelBody, TaskPanelTitle, resolveActiveWorkspace } from "./TaskPanel.js";
import { GlobalBoardPanel } from "./GlobalBoard.js";
import { openWorkspaceFileViaDsh, resolveWorkspacePath } from "./dsh-open.js";
import { dispatchPromptToAgent } from "./dispatch-agent.js";
export const TAB_ID = "dsh-workspace-tasks";
export const TAB_KIND = "workspace-tasks";
/** 任务中台（跨工作区全局看板）：左侧菜单入口 id 与 main 插槽 key */
export const GLOBAL_PANEL_ID = "dsh-workspace-tasks-global";
const API_BASE = "/__dsh-tasks__";
/** 自动派发执行器轮询间隔：30s（queued 等待 GUI 取件；无件时空转零成本） */
const DISPATCH_POLL_MS = 30_000;
/**
 * 自动派发执行器（宿主算、客户端发）：
 * 后台轮询宿主引擎产生的 queued 条目，经统一派发通道（dispatch-agent.ts）
 * 注入提示词唤醒 Agent，随后置任务 in_progress（触发认领锁）并向宿主 ack 回执。
 * 失败标 failed 不静默重试。
 */
function startDispatchExecutor(ctx) {
    let ticking = false;
    const ack = (workspacePath, id, status) => fetch(`${API_BASE}/dispatch/ack`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspacePath, id, status }),
    }).catch(() => { });
    const tick = async () => {
        if (ticking)
            return;
        ticking = true;
        try {
            const ws = resolveActiveWorkspace(undefined, undefined);
            const workspacePath = ws.path;
            if (!workspacePath)
                return;
            const query = `?workspacePath=${encodeURIComponent(workspacePath)}`;
            const pendingRes = await fetch(`${API_BASE}/dispatch/pending${query}`, { cache: "no-store" });
            const pendingJson = (await pendingRes.json());
            const entry = pendingJson?.data?.[0];
            if (!entry)
                return;
            // 取任务详情构造派发提示词
            const listRes = await fetch(`${API_BASE}/list${query}`, { cache: "no-store" });
            const listJson = (await listRes.json());
            const task = listJson?.data?.tasks?.find((t) => t.id === entry.taskId);
            if (!task) {
                await ack(workspacePath, entry.id, "failed");
                return;
            }
            const prompt = `[自动派发] 请执行工作区就绪任务 [${task.id}]: "${task.title}"。\n${task.description ? `任务详情：\n${task.description}\n\n` : ""}请先用 workspace_task 的 update 把状态置为 in_progress（会自动获取认领锁），完成后用 conclude 登记执行结论与交付物。`;
            // 统一派发通道：会话解析 + binding.prompt / scoped conversation.send
            const sent = await dispatchPromptToAgent(prompt, { workspaceId: ws.id });
            if (!sent) {
                await ack(workspacePath, entry.id, "failed");
                return;
            }
            // 唤醒成功：置 in_progress（宿主自动认领锁），再回执
            await fetch(`${API_BASE}/update`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ workspacePath, taskId: entry.taskId, status: "in_progress" }),
            }).catch(() => { });
            await ack(workspacePath, entry.id, "sent");
        }
        catch {
            // 网络抖动等静默跳过，下一轮再试
        }
        finally {
            ticking = false;
        }
    };
    const timer = setInterval(() => {
        void tick();
    }, DISPATCH_POLL_MS);
    // 首个周期延迟执行：避免与 GUI 初始化争抢
    const firstRun = setTimeout(() => {
        void tick();
    }, 10_000);
    return () => {
        clearInterval(timer);
        clearTimeout(firstRun);
    };
}
export const inject = [
    "slots",
    "connection",
    "sidebarRight",
    "sidebarRightTabs",
    "conversation",
    "sessions",
    "workspaces",
    "uiWorkspace",
    "remote",
    "remote.session",
];
export { openWorkspaceFileViaDsh, resolveWorkspacePath };
export function apply(ctx) {
    if (typeof window !== "undefined") {
        window.__DSH_TASK_CLIENT_CTX__ = ctx;
    }
    const sidebarRightTabs = ctx.sidebarRightTabs;
    // 1. 在右侧侧边栏引导页注册条目（order: 30，紧随工作区文件(10)、新建终端(20)之后）
    if (sidebarRightTabs) {
        ctx.effect(() => sidebarRightTabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            multiple: false,
            priority: "plugin",
            title: () => "工作区任务",
            guide: [
                {
                    id: "tasks",
                    order: 30,
                    title: () => "工作区任务",
                    description: () => "查看与管理当前工作区的任务状态、执行过程与产出结论",
                    icon: TaskGuideIcon,
                },
            ],
        }), "dsh-workspace-tasks: right sidebar tab definition");
    }
    // DSH 官方标准文件打开方法实现：调用 openWorkspaceFileViaDsh
    const openFile = (filePath, workspacePath) => {
        return openWorkspaceFileViaDsh(ctx, filePath, { workspacePath });
    };
    // 2. 注入右侧栏 Tab 正文渲染插槽（通过 slot inject 规范注入 openFile 与上下文）
    ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
        name: "sidebar.right.pane.tab",
        key: TAB_ID,
        inject: (sessionId, actions) => ({
            openFile: (filePath, workspacePath) => openWorkspaceFileViaDsh(ctx, filePath, {
                sessionId: typeof sessionId === "string" ? sessionId : undefined,
                workspacePath,
                tabActions: actions,
            }),
        }),
    }, TaskPanelBody));
    // 3. 注入右侧栏 Tab 标题栏渲染插槽
    ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
        name: "sidebar.right.pane.tab.title",
        key: TAB_ID,
    }, TaskPanelTitle));
    // 4. 自动派发执行器：GUI 启动即活，不依赖看板打开
    ctx.effect(() => startDispatchExecutor(ctx), "dsh-workspace-tasks: auto-dispatch executor");
    // 5. 任务中台：左侧菜单「插件」区入口（sidebar.panellist）+ 主区域全宽面板（main 插槽）
    //    模式照搬 dsh-guizang-design；直接 React 渲染（不套 iframe），主题 token 天然生效
    ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: GLOBAL_PANEL_ID, order: 7, label: () => "任务中台" }, GlobalBoardIcon));
    ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: GLOBAL_PANEL_ID }, GlobalBoardPanel));
}
//# sourceMappingURL=index.js.map