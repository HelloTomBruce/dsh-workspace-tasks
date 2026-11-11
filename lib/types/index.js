import { registerTaskApis } from "./api/router.js";
import { registerTaskTools } from "./tools/task-tools.js";
import { onTaskDone, onTasksCreated } from "./store/task-store.js";
import { DispatchEngine } from "./store/dispatch.js";
import { setPluginConfig } from "./store/dispatch-config.js";
export const name = "workspace-tasks";
export const inject = ["tools", "webServer", "systemPrompt"];
export function apply(ctx, config) {
    const disposers = [];
    try {
        // 插件级配置（cordis.patch.yml 的 config 块，如 dsh-browser 的用法）：
        // dispatch.crossWorkspace 开启后客户端执行器轮询全部工作区派发队列（默认关闭）
        setPluginConfig(config);
        const disposeApi = registerTaskApis(ctx);
        if (disposeApi)
            disposers.push(disposeApi);
        const disposeTools = registerTaskTools(ctx);
        if (disposeTools)
            disposers.push(disposeTools);
        // 自动派发引擎订阅任务事件（Fast Path：纯规则判定，无命中静默零 Token）
        // 触发源一：任务完成（就绪流水线续跑，hop 链续传）
        disposers.push(onTaskDone((workspacePath, task) => {
            void DispatchEngine.evaluate(workspacePath, task.id).catch((err) => {
                console.error("[dsh-workspace-tasks] auto-dispatch evaluate failed:", err);
            });
        }));
        // 触发源二：任务创建（新建就绪任务即派；批量拆解由并发闸门保证最多派一条）
        disposers.push(onTasksCreated((workspacePath) => {
            void DispatchEngine.evaluate(workspacePath).catch((err) => {
                console.error("[dsh-workspace-tasks] auto-dispatch evaluate failed:", err);
            });
        }));
    }
    catch (err) {
        for (const dispose of disposers.reverse()) {
            try {
                dispose();
            }
            catch { }
        }
        throw err;
    }
    return () => {
        for (const dispose of disposers.reverse()) {
            try {
                dispose?.();
            }
            catch { }
        }
    };
}
//# sourceMappingURL=index.js.map