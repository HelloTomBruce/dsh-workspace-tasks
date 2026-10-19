import { registerTaskApis } from "./api/router.js";
import { registerTaskTools } from "./tools/task-tools.js";
export const name = "workspace-tasks";
export const inject = ["tools", "webServer", "systemPrompt"];
export function apply(ctx) {
    const disposers = [];
    try {
        const disposeApi = registerTaskApis(ctx);
        if (disposeApi)
            disposers.push(disposeApi);
        const disposeTools = registerTaskTools(ctx);
        if (disposeTools)
            disposers.push(disposeTools);
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