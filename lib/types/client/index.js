import { TaskGuideIcon } from "./icons.js";
import { TaskPanelBody, TaskPanelTitle } from "./TaskPanel.js";
export const TAB_ID = "dsh-workspace-tasks";
export const TAB_KIND = "workspace-tasks";
export const inject = [
    "slots",
    "sidebarRight",
    "sidebarRightTabs",
    "conversation",
    "sessions",
    "workspaces",
    "uiWorkspace",
];
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
    // 2. 注入右侧栏 Tab 正文渲染插槽
    ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
        name: "sidebar.right.pane.tab",
        key: TAB_ID,
    }, TaskPanelBody));
    // 3. 注入右侧栏 Tab 标题栏渲染插槽
    ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
        name: "sidebar.right.pane.tab.title",
        key: TAB_ID,
    }, TaskPanelTitle));
}
//# sourceMappingURL=index.js.map