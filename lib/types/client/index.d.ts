import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { openWorkspaceFileViaDsh, resolveWorkspacePath } from "./dsh-open.ts";
export declare const TAB_ID = "dsh-workspace-tasks";
export declare const TAB_KIND = "workspace-tasks";
/** 任务中台（跨工作区全局看板）：左侧菜单入口 id 与 main 插槽 key */
export declare const GLOBAL_PANEL_ID = "dsh-workspace-tasks-global";
export declare const inject: string[];
export { openWorkspaceFileViaDsh, resolveWorkspacePath };
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map