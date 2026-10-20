import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { TaskGuideIcon } from "./icons.tsx";
import { TaskPanelBody, TaskPanelTitle } from "./TaskPanel.tsx";
import { openWorkspaceFileViaDsh, resolveWorkspacePath } from "./dsh-open.ts";

export const TAB_ID = "dsh-workspace-tasks";
export const TAB_KIND = "workspace-tasks";

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

interface SidebarRightTabsService {
  register: (definition: unknown) => () => void;
}

export { openWorkspaceFileViaDsh, resolveWorkspacePath };

export function apply(ctx: ClientContext): void {
  if (typeof window !== "undefined") {
    (window as unknown as { __DSH_TASK_CLIENT_CTX__?: unknown }).__DSH_TASK_CLIENT_CTX__ = ctx;
  }
  const sidebarRightTabs = (ctx as unknown as { sidebarRightTabs?: SidebarRightTabsService }).sidebarRightTabs;

  // 1. 在右侧侧边栏引导页注册条目（order: 30，紧随工作区文件(10)、新建终端(20)之后）
  if (sidebarRightTabs) {
    ctx.effect(
      () =>
        sidebarRightTabs.register({
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
        }),
      "dsh-workspace-tasks: right sidebar tab definition"
    );
  }

  // DSH 官方标准文件打开方法实现：调用 openWorkspaceFileViaDsh
  const openFile = (filePath: string, workspacePath?: string): Promise<void> => {
    return openWorkspaceFileViaDsh(ctx, filePath, { workspacePath });
  };

  // 2. 注入右侧栏 Tab 正文渲染插槽（通过 slot inject 规范注入 openFile 与上下文）
  ctx.slots.inject("sidebar.right.pane.tab", () =>
    ctx.slots.register(
      {
        name: "sidebar.right.pane.tab",
        key: TAB_ID,
        inject: (sessionId: unknown, actions: unknown) => ({
          openFile: (filePath: string, workspacePath?: string) =>
            openWorkspaceFileViaDsh(ctx, filePath, {
              sessionId: typeof sessionId === "string" ? sessionId : undefined,
              workspacePath,
              tabActions: actions as { openResource?: (address: string, options?: unknown) => void },
            }),
        }),
      },
      TaskPanelBody
    )
  );

  // 3. 注入右侧栏 Tab 标题栏渲染插槽
  ctx.slots.inject("sidebar.right.pane.tab.title", () =>
    ctx.slots.register(
      {
        name: "sidebar.right.pane.tab.title",
        key: TAB_ID,
      },
      TaskPanelTitle
    )
  );
}
