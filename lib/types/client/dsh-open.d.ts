/**
 * DSH（DeepSeek Harness）官方文件打开与路径解析能力
 * 严格遵循 DSH 客户端规范：
 * 优先在 DSH 右侧栏打开文件预览/代码编辑（通过 dsh-resource://file/ 协议与 sidebarRight.openResource）
 * 绝不唤起宿主操作系统的原生外部应用程序
 */
/** 是否为 Windows 风格路径（盘符或 UNC） */
export declare function isWindowsStylePath(value: string): boolean;
/** 是否为绝对路径（POSIX 根路径 / 或 Windows 盘符 / UNC） */
export declare function isAbsoluteWorkspacePath(path: string): boolean;
/**
 * 构建 Session 作用域的文件资源地址
 * 格式: dsh-resource://file/session/<sessionId>/<path>
 */
export declare function sessionFileAddress(sessionId: string, path: string): string;
/**
 * 构建 Absolute 作用域的文件资源地址
 * 格式: dsh-resource://file/absolute/<path>
 */
export declare function absoluteFileAddress(path: string): string;
/**
 * 遵循 DSH 官方规范解析工作区文件路径
 */
export declare function resolveWorkspacePath(cwd: string | undefined, path: string): string;
/**
 * 将相对路径或工作区内的绝对路径解析为 DSH 资源 URI
 */
export declare function fileAddressFor(sessionId: string, cwd: string | undefined, path: string): string;
/**
 * 从 DSH ClientContext 中查找当前活跃或最近更新的 Session
 */
export declare function findCurrentSession(ctx?: unknown): {
    sessionId: string;
    cwd?: string;
} | undefined;
export interface OpenWorkspaceFileOptions {
    sessionId?: string;
    workspacePath?: string;
    tabActions?: {
        openResource?: (address: string, options?: unknown) => void;
    };
    line?: number;
}
/**
 * 完整按照 DSH 官方体系在宿主中打开文件
 *
 * 核心机制：
 * 遵循 DSH 官方资源规范，将文件路径映射为 `dsh-resource://file/session/<sessionId>/<path>`，
 * 并通过 DSH 右侧栏导航控制器（`sidebarRight.openResource` 或 `tabActions.openResource`）
 * 在 DSH 内部直接拉起文件预览/代码编辑 Tab（由 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview` 处理），
 * 绝不唤起系统外部应用。
 */
export declare function openWorkspaceFileViaDsh(ctx: unknown, filePath: string, optionsOrWorkspacePath?: string | OpenWorkspaceFileOptions): Promise<void>;
//# sourceMappingURL=dsh-open.d.ts.map