/**
 * DSH（DeepSeek Harness）官方文件打开与路径解析能力
 * 严格遵循 DSH 客户端规范：
 * 优先在 DSH 右侧栏打开文件预览/代码编辑（通过 dsh-resource://file/ 协议与 sidebarRight.openResource）
 * 绝不唤起宿主操作系统的原生外部应用程序
 */

/** URI 前缀 */
const FILE_ADDRESS_PREFIX = "dsh-resource://file/";

/** 组件编码一个路径分段，保留 Windows 盘符冒号 */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/gi, ":");
}

/** 对路径按 / 进行逐段编码 */
function encodePath(path: string): string {
  return path.split("/").map(encodeSegment).join("/");
}

/** 是否为 Windows 风格路径（盘符或 UNC） */
export function isWindowsStylePath(value: string): boolean {
  return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
}

/** 是否为绝对路径（POSIX 根路径 / 或 Windows 盘符 / UNC） */
export function isAbsoluteWorkspacePath(path: string): boolean {
  return path.startsWith("/") || isWindowsStylePath(path);
}

/**
 * 构建 Session 作用域的文件资源地址
 * 格式: dsh-resource://file/session/<sessionId>/<path>
 */
export function sessionFileAddress(sessionId: string, path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`;
}

/**
 * 构建 Absolute 作用域的文件资源地址
 * 格式: dsh-resource://file/absolute/<path>
 */
export function absoluteFileAddress(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const unc = normalized.startsWith("//");
  const absolute = normalized.replace(/^\/+/, "");
  return `${FILE_ADDRESS_PREFIX}absolute/${unc ? "/" : ""}${encodePath(absolute)}`;
}

/**
 * 遵循 DSH 官方规范解析工作区文件路径
 */
export function resolveWorkspacePath(cwd: string | undefined, path: string): string {
  if (isAbsoluteWorkspacePath(path)) return path;
  if (cwd === undefined || cwd === "") return path;
  const separator = isWindowsStylePath(cwd) && cwd.includes("\\") ? "\\" : "/";
  const base = cwd.replace(/[/\\]+$/, "");
  const relative = path.replace(/^[/\\]+/, "");
  return `${base}${separator}${relative}`;
}

/**
 * 将相对路径或工作区内的绝对路径解析为 DSH 资源 URI
 */
export function fileAddressFor(sessionId: string, cwd: string | undefined, path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (!isAbsoluteWorkspacePath(normalized)) {
    return sessionFileAddress(sessionId, normalized);
  }
  const root = cwd === undefined ? "" : cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  if (root !== "" && normalized === root) {
    return sessionFileAddress(sessionId, "");
  }
  if (root !== "" && normalized.startsWith(`${root}/`)) {
    return sessionFileAddress(sessionId, normalized.slice(root.length + 1));
  }
  return sessionFileAddress(sessionId, normalized);
}

/**
 * 从 DSH ClientContext 中查找当前活跃或最近更新的 Session
 */
export function findCurrentSession(ctx?: unknown): { sessionId: string; cwd?: string } | undefined {
  const context = (ctx as any) || (typeof window !== "undefined" ? (window as any).__DSH_TASK_CLIENT_CTX__ : undefined);
  const sessionsService = context?.sessions ?? context?.get?.("sessions");
  const listSnapshot = sessionsService?.list?.getSnapshot?.();
  if (!listSnapshot?.byId) return undefined;

  const rows = Object.values(listSnapshot.byId) as Array<{
    sessionId: string;
    cwd?: string;
    retainedBy?: { mainView?: number };
    updatedAt?: number;
  }>;

  if (rows.length === 0) return undefined;

  // 1. 优先获取主界面正在展示的 session (retainedBy.mainView > 0)
  const activeSession = rows.find((r) => (r.retainedBy?.mainView ?? 0) > 0);
  if (activeSession) {
    return { sessionId: activeSession.sessionId, cwd: activeSession.cwd };
  }

  // 2. 其次按最近更新时间排序
  const sorted = [...rows].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const latest = sorted[0];
  if (!latest) return undefined;
  return { sessionId: latest.sessionId, cwd: latest.cwd };
}

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
export async function openWorkspaceFileViaDsh(
  ctx: unknown,
  filePath: string,
  optionsOrWorkspacePath?: string | OpenWorkspaceFileOptions
): Promise<void> {
  const clean = filePath.trim();
  if (!clean) return;

  const options: OpenWorkspaceFileOptions =
    typeof optionsOrWorkspacePath === "string"
      ? { workspacePath: optionsOrWorkspacePath }
      : optionsOrWorkspacePath ?? {};

  const context = ctx as any;

  // 1. 获取 Session 和 工作区根目录
  const detectedSession = findCurrentSession(context);
  const sessionId = options.sessionId || detectedSession?.sessionId;
  const cwd = options.workspacePath || detectedSession?.cwd;

  const resourceParams = options.line !== undefined ? { params: { line: options.line } } : undefined;

  // 2. 首选方案：通过 DSH 官方 Session 文件资源协议并在右侧栏打开
  if (sessionId) {
    const resourceUrl = fileAddressFor(sessionId, cwd, clean);

    // 2.1 优先使用当前 Tab 注入的 tabActions.openResource
    if (options.tabActions && typeof options.tabActions.openResource === "function") {
      try {
        options.tabActions.openResource(resourceUrl, resourceParams);
        return;
      } catch (err) {
        console.warn("[dsh-workspace-tasks] tabActions.openResource failed, trying sidebarRight:", err);
      }
    }

    // 2.2 使用全局 ctx.sidebarRight.openResource 打开文件预览
    const sidebarRight = context?.sidebarRight ?? context?.get?.("sidebarRight");
    if (sidebarRight && typeof sidebarRight.openResource === "function") {
      try {
        sidebarRight.openResource(resourceUrl, resourceParams);
        return;
      } catch (err) {
        console.warn("[dsh-workspace-tasks] sidebarRight.openResource failed:", err);
      }
    }
  }

  // 3. 次选方案：若无法获取 session，尝试 Absolute 作用域资源
  const fullPath = resolveWorkspacePath(cwd, clean);
  const absResourceUrl = absoluteFileAddress(fullPath);
  const sidebarRight = context?.sidebarRight ?? context?.get?.("sidebarRight");
  if (sidebarRight && typeof sidebarRight.openResource === "function") {
    try {
      sidebarRight.openResource(absResourceUrl, resourceParams);
      return;
    } catch (err) {
      console.warn("[dsh-workspace-tasks] sidebarRight.openResource(absolute) failed:", err);
    }
  }

  // 4. 三选方案：通过 DSH 客户端 remote.session 服务调用 openWorkspacePath (如在不可视或 headless 环境)
  const remoteSession =
    context?.remote?.session ??
    context?.get?.("remote.session") ??
    context?.get?.("remote")?.session;
  if (remoteSession && typeof remoteSession.openWorkspacePath === "function") {
    try {
      const res = await remoteSession.openWorkspacePath({ path: fullPath });
      if (res && res.ok === false) {
        throw new Error(res.error?.message || "DSH 打开文件被拒绝");
      }
      return;
    } catch (err) {
      console.warn("[dsh-workspace-tasks] remote.session.openWorkspacePath failed:", err);
    }
  }

  // 5. 四选方案：ctx.workspaces.openPath (若存在)
  const workspaces = context?.workspaces ?? context?.get?.("workspaces");
  if (workspaces && typeof workspaces.openPath === "function") {
    try {
      await workspaces.openPath(fullPath);
      return;
    } catch (err) {
      console.warn("[dsh-workspace-tasks] workspaces.openPath failed:", err);
    }
  }

  throw new Error(`DSH 未能找到适用的打开方式打开文件: ${clean}`);
}
