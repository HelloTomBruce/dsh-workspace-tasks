import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
let cordisConfig = {};
let runtimeCrossWorkspace = null; // null = 文件不存在/未读
function getPluginConfigFilePath() {
    return path.join(process.env.DSH_TASKS_STORAGE_DIR || path.join(os.homedir(), ".dsh", "storages", "workspace-tasks"), "plugin-config.json");
}
export function setPluginConfig(config) {
    cordisConfig = config ?? {};
}
/** 合并读取：运行时文件 > cordis config > 默认 false */
export function isCrossWorkspaceDispatchEnabled() {
    if (runtimeCrossWorkspace !== null)
        return runtimeCrossWorkspace;
    return cordisConfig.dispatch?.crossWorkspace === true;
}
/** UI 开关写入：持久化文件 + 更新内存（立即生效，无需重启） */
export async function setCrossWorkspaceDispatch(enabled) {
    runtimeCrossWorkspace = enabled;
    const filePath = getPluginConfigFilePath();
    const doc = {
        version: 1,
        dispatch: { crossWorkspace: enabled },
        updatedAt: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(doc, null, 2), "utf-8");
}
/** 启动时加载运行时文件（存在即覆盖 cordis 值）；文件损坏按不存在处理 */
export async function loadPluginConfigFile() {
    try {
        const raw = await fs.readFile(getPluginConfigFilePath(), "utf-8");
        const doc = JSON.parse(raw);
        if (doc?.dispatch && typeof doc.dispatch.crossWorkspace === "boolean") {
            runtimeCrossWorkspace = doc.dispatch.crossWorkspace;
        }
    }
    catch {
        // 文件不存在或损坏：保持 null，回落 cordis/默认值
    }
}
//# sourceMappingURL=dispatch-config.js.map