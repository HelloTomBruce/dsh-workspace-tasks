import type { Context } from "@deepseek-ai/cordis";
import { registerTaskApis } from "./api/router.ts";
import { registerTaskTools } from "./tools/task-tools.ts";

export const name = "workspace-tasks";
export const inject = ["tools", "webServer", "systemPrompt"];

export function apply(ctx: Context): void | (() => void) {
  const disposers: Array<() => void> = [];
  try {
    const disposeApi = registerTaskApis(ctx);
    if (disposeApi) disposers.push(disposeApi);
    const disposeTools = registerTaskTools(ctx);
    if (disposeTools) disposers.push(disposeTools);
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
