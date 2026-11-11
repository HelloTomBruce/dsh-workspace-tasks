import type { Context } from "@deepseek-ai/cordis";
import { registerTaskApis } from "./api/router.ts";
import { registerTaskTools } from "./tools/task-tools.ts";
import { onTaskDone, onTasksCreated } from "./store/task-store.ts";
import { DispatchEngine } from "./store/dispatch.ts";
import { setPluginConfig, loadPluginConfigFile } from "./store/dispatch-config.ts";
import type { WorkspaceTasksPluginConfig } from "./store/dispatch-config.ts";

export const name = "workspace-tasks";
export const inject = ["tools", "webServer", "systemPrompt"];

export function apply(ctx: Context, config?: WorkspaceTasksPluginConfig): void | (() => void) {
  const disposers: Array<() => void> = [];
  try {
    // 插件级配置：cordis.patch.yml 的 config 块作为声明式初始值；
    // UI 开关（写 plugin-config.json）优先于 cordis 值——读文件合并
    setPluginConfig(config);
    void loadPluginConfigFile().catch((err) => {
      console.error("[dsh-workspace-tasks] load plugin config failed:", err);
    });
    const disposeApi = registerTaskApis(ctx);
    if (disposeApi) disposers.push(disposeApi);
    const disposeTools = registerTaskTools(ctx);
    if (disposeTools) disposers.push(disposeTools);
    // 自动派发引擎订阅任务事件（Fast Path：纯规则判定，无命中静默零 Token）
    // 触发源一：任务完成（就绪流水线续跑，hop 链续传）
    disposers.push(
      onTaskDone((workspacePath, task) => {
        void DispatchEngine.evaluate(workspacePath, task.id).catch((err) => {
          console.error("[dsh-workspace-tasks] auto-dispatch evaluate failed:", err);
        });
      })
    );
    // 触发源二：任务创建（新建就绪任务即派；批量拆解由并发闸门保证最多派一条）
    disposers.push(
      onTasksCreated((workspacePath) => {
        void DispatchEngine.evaluate(workspacePath).catch((err) => {
          console.error("[dsh-workspace-tasks] auto-dispatch evaluate failed:", err);
        });
      })
    );
  } catch (err) {
    for (const dispose of disposers.reverse()) {
      try { dispose(); } catch {}
    }
    throw err;
  }

  return () => {
    for (const dispose of disposers.reverse()) {
      try { dispose?.(); } catch {}
    }
  };
}
