import type { Context } from "@deepseek-ai/cordis";
import { registerTaskApis } from "./api/router.ts";
import { registerTaskTools } from "./tools/task-tools.ts";
import { onTaskDone } from "./store/task-store.ts";
import { DispatchEngine } from "./store/dispatch.ts";

export const name = "workspace-tasks";
export const inject = ["tools", "webServer", "systemPrompt"];

export function apply(ctx: Context): void | (() => void) {
  const disposers: Array<() => void> = [];
  try {
    const disposeApi = registerTaskApis(ctx);
    if (disposeApi) disposers.push(disposeApi);
    const disposeTools = registerTaskTools(ctx);
    if (disposeTools) disposers.push(disposeTools);
    // 自动派发引擎订阅任务完成事件（Fast Path：纯规则判定，无命中静默零 Token）
    disposers.push(
      onTaskDone((workspacePath, task) => {
        void DispatchEngine.evaluate(workspacePath, task.id).catch((err) => {
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
