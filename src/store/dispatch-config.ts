import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

/**
 * 插件级配置。三个来源，优先级从高到低：
 * 1. 运行时持久化文件（UI 开关写入）：~/.dsh/storages/workspace-tasks/plugin-config.json
 * 2. cordis.patch.yml 的 config 块（apply 第二参注入，声明式初始值）
 * 3. 默认值（crossWorkspace = false）
 * UI 一旦改过（写文件），文件值即权威；cordis 配置只在无文件时生效。
 * 客户端执行器无法直接读 cordis 配置，宿主经 REST /dispatch/config 暴露给浏览器侧。
 */
export interface WorkspaceTasksPluginConfig {
  dispatch?: {
    crossWorkspace?: boolean;
  };
}

interface PluginConfigFile {
  version: number;
  dispatch?: { crossWorkspace?: boolean };
  updatedAt: string;
}

let cordisConfig: WorkspaceTasksPluginConfig = {};
let runtimeCrossWorkspace: boolean | null = null; // null = 文件不存在/未读

function getPluginConfigFilePath(): string {
  return path.join(
    process.env.DSH_TASKS_STORAGE_DIR || path.join(os.homedir(), ".dsh", "storages", "workspace-tasks"),
    "plugin-config.json"
  );
}

export function setPluginConfig(config: WorkspaceTasksPluginConfig | undefined): void {
  cordisConfig = config ?? {};
}

/** 合并读取：运行时文件 > cordis config > 默认 false */
export function isCrossWorkspaceDispatchEnabled(): boolean {
  if (runtimeCrossWorkspace !== null) return runtimeCrossWorkspace;
  return cordisConfig.dispatch?.crossWorkspace === true;
}

/** UI 开关写入：持久化文件 + 更新内存（立即生效，无需重启） */
export async function setCrossWorkspaceDispatch(enabled: boolean): Promise<void> {
  runtimeCrossWorkspace = enabled;
  const filePath = getPluginConfigFilePath();
  const doc: PluginConfigFile = {
    version: 1,
    dispatch: { crossWorkspace: enabled },
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(doc, null, 2), "utf-8");
}

/** 启动时加载运行时文件（存在即覆盖 cordis 值）；文件损坏按不存在处理 */
export async function loadPluginConfigFile(): Promise<void> {
  try {
    const raw = await fs.readFile(getPluginConfigFilePath(), "utf-8");
    const doc = JSON.parse(raw) as PluginConfigFile;
    if (doc?.dispatch && typeof doc.dispatch.crossWorkspace === "boolean") {
      runtimeCrossWorkspace = doc.dispatch.crossWorkspace;
    }
  } catch {
    // 文件不存在或损坏：保持 null，回落 cordis/默认值
  }
}
