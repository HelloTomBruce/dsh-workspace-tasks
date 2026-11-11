/**
 * 插件级配置（经 cordis.patch.yml 的 config 块注入，apply 第二参读取）。
 * 客户端执行器无法直接读 cordis 配置，宿主经 REST /dispatch/config 暴露给浏览器侧。
 *
 * 目前唯一配置：dispatch.crossWorkspace（默认 false）——
 * 开启后客户端执行器轮询【全部工作区】的派发队列，不再只盯当前活跃工作区。
 */
export interface WorkspaceTasksPluginConfig {
    dispatch?: {
        crossWorkspace?: boolean;
    };
}
export declare function setPluginConfig(config: WorkspaceTasksPluginConfig | undefined): void;
export declare function isCrossWorkspaceDispatchEnabled(): boolean;
//# sourceMappingURL=dispatch-config.d.ts.map