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
export declare function setPluginConfig(config: WorkspaceTasksPluginConfig | undefined): void;
/** 合并读取：运行时文件 > cordis config > 默认 false */
export declare function isCrossWorkspaceDispatchEnabled(): boolean;
/** UI 开关写入：持久化文件 + 更新内存（立即生效，无需重启） */
export declare function setCrossWorkspaceDispatch(enabled: boolean): Promise<void>;
/** 启动时加载运行时文件（存在即覆盖 cordis 值）；文件损坏按不存在处理 */
export declare function loadPluginConfigFile(): Promise<void>;
//# sourceMappingURL=dispatch-config.d.ts.map