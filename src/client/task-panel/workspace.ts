import { useEffect, useState } from "react";
import { findCurrentSession } from "../dsh-open.ts";

/**
 * 活跃工作区解析：纯逻辑 + useActiveWorkspace hook（从 TaskPanel.tsx 原样迁移）。
 */

export interface ActiveWorkspaceInfo {
  id?: string;
  path: string;
  title: string;
}

export function findBestMatchingWorkspace(
  items: Array<{
    workspaceId: string;
    path: string;
    title: string;
    sessionIds?: string[];
  }>,
  targetPath?: string
): ActiveWorkspaceInfo | null {
  if (!targetPath || !items || items.length === 0) return null;
  const normalizedTarget = targetPath.replace(/[/\\]+$/, "");

  // 1. 精确路径匹配优先（防止子目录被父级目录误匹配）
  const exact = items.find((w) => w.path.replace(/[/\\]+$/, "") === normalizedTarget);
  if (exact) {
    return { id: exact.workspaceId, path: exact.path, title: exact.title || exact.path };
  }

  // 2. 最长前缀匹配（必须带路径分隔符边界，按路径长度降序优先匹配最深层子工作区）
  const prefixMatches = items.filter((w) => {
    const wPath = w.path.replace(/[/\\]+$/, "");
    return normalizedTarget.startsWith(wPath + "/") || normalizedTarget.startsWith(wPath + "\\");
  });

  if (prefixMatches.length > 0) {
    prefixMatches.sort((a, b) => b.path.length - a.path.length);
    const best = prefixMatches[0];
    if (best) {
      return { id: best.workspaceId, path: best.path, title: best.title || best.path };
    }
  }

  return null;
}

export function resolveActiveWorkspace(
  explicitSessionId?: string,
  explicitWorkspacePath?: string
): ActiveWorkspaceInfo {
  try {
    const dshCtx = (window as unknown as { __DSH_TASK_CLIENT_CTX__?: any }).__DSH_TASK_CLIENT_CTX__;
    const workspacesState = dshCtx?.workspaces?.list?.getSnapshot?.();
    const sessionsState = dshCtx?.sessions?.list?.getSnapshot?.();

    const items: Array<{
      workspaceId: string;
      path: string;
      title: string;
      sessionIds?: string[];
      createdAt?: string;
      updatedAt?: string;
    }> = workspacesState?.items ?? [];

    // 0. 如果显式指定了有效的工作区路径，优先按精准/最长前缀路径解析
    if (explicitWorkspacePath) {
      const match = findBestMatchingWorkspace(items, explicitWorkspacePath);
      if (match) return match;
      const title = explicitWorkspacePath.split("/").filter(Boolean).pop() || explicitWorkspacePath;
      return { id: undefined, path: explicitWorkspacePath, title };
    }

    // 1. 搜集当前候选 Session ID（按优先级排序）
    const candidateSessionIds: string[] = [];

    // 1.1 从 findCurrentSession 获取主视图活跃 Session
    const activeSession = findCurrentSession(dshCtx);
    if (activeSession?.sessionId && !candidateSessionIds.includes(activeSession.sessionId)) {
      candidateSessionIds.push(activeSession.sessionId);
    }

    // 1.2 显式传入（例如 TaskPanel 组件接收到的 props.sessionId）
    if (explicitSessionId && !candidateSessionIds.includes(explicitSessionId)) {
      candidateSessionIds.push(explicitSessionId);
    }

    // 1.3 从 DOM 获取右侧栏当前会话标记: [data-sidebar-right-session]
    if (typeof document !== "undefined") {
      const rightbarEl = document.querySelector("[data-sidebar-right-session]");
      const rightbarSessionId = rightbarEl?.getAttribute("data-sidebar-right-session");
      if (rightbarSessionId && !candidateSessionIds.includes(rightbarSessionId)) {
        candidateSessionIds.push(rightbarSessionId);
      }

      const anySessionEl = document.querySelector("[data-session-id]");
      const domSessionId = anySessionEl?.getAttribute("data-session-id");
      if (domSessionId && !candidateSessionIds.includes(domSessionId)) {
        candidateSessionIds.push(domSessionId);
      }
    }

    // 1.4 从 localStorage 读取 "dsh.sessions.current"
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem("dsh.sessions.current");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.sessionId && !candidateSessionIds.includes(parsed.sessionId)) {
            candidateSessionIds.push(parsed.sessionId);
          }
        }
      } catch {}
    }

    // 2. 根据搜集到的 candidateSessionIds 查找匹配的 workspace
    for (const sid of candidateSessionIds) {
      // 2.1 检查 items[].sessionIds 是否包含该 sid
      if (items.length > 0) {
        const found = items.find((w) => w.sessionIds?.includes(sid));
        if (found) {
          return { id: found.workspaceId, path: found.path, title: found.title || found.path };
        }
      }

      // 2.2 检查 sessionsState.byId[sid]?.cwd 是否匹配某个 workspace
      const sessionCwd = sessionsState?.byId?.[sid]?.cwd;
      if (sessionCwd) {
        const matched = findBestMatchingWorkspace(items, sessionCwd);
        if (matched) return matched;
        const title = sessionCwd.split("/").filter(Boolean).pop() || sessionCwd;
        return { id: undefined, path: sessionCwd, title };
      }
    }

    // 3. 尝试从 DOM 激活项查找工作区
    if (typeof document !== "undefined" && items.length > 0) {
      const activeEl = document.querySelector(
        "[data-workspace-id][aria-selected='true'], [data-workspace-id].active, [data-workspace-active='true']"
      );
      const activeWsId = activeEl?.getAttribute("data-workspace-id");
      if (activeWsId) {
        const found = items.find((w) => w.workspaceId === activeWsId);
        if (found) {
          return { id: found.workspaceId, path: found.path, title: found.title || found.path };
        }
      }
    }

    // 4. 模拟 DSH 官方 recentWorkspace 策略：根据 session.updatedAt 选出最新活跃的工作区
    if (items.length > 0) {
      let selected: (typeof items)[0] | undefined;
      let selectedTime = Number.NEGATIVE_INFINITY;
      for (const item of items) {
        let latest = Number.NEGATIVE_INFINITY;
        for (const sid of item.sessionIds ?? []) {
          const s = sessionsState?.byId?.[sid];
          if (s?.updatedAt) {
            latest = Math.max(latest, Number(s.updatedAt));
          }
        }
        if (latest === Number.NEGATIVE_INFINITY && item.updatedAt) {
          latest = Date.parse(item.updatedAt);
        }
        if (latest === Number.NEGATIVE_INFINITY && item.createdAt) {
          latest = Date.parse(item.createdAt);
        }
        if (selected === undefined || latest > selectedTime) {
          selected = item;
          selectedTime = latest;
        }
      }
      if (selected) {
        return { id: selected.workspaceId, path: selected.path, title: selected.title || selected.path };
      }
    }

    // 5. 兜底取第一个工作区
    if (items.length > 0 && items[0]) {
      return { id: items[0].workspaceId, path: items[0].path, title: items[0].title || items[0].path };
    }
  } catch (e) {
    console.warn("Failed to resolve active workspace:", e);
  }

  return { path: "", title: "" };
}

export function useActiveWorkspace(
  explicitSessionId?: string,
  explicitWorkspacePath?: string
): ActiveWorkspaceInfo {
  const [workspace, setWorkspace] = useState<ActiveWorkspaceInfo>(() =>
    resolveActiveWorkspace(explicitSessionId, explicitWorkspacePath)
  );

  useEffect(() => {
    const dshCtx = (window as unknown as { __DSH_TASK_CLIENT_CTX__?: any }).__DSH_TASK_CLIENT_CTX__;

    const update = () => {
      const current = resolveActiveWorkspace(explicitSessionId, explicitWorkspacePath);
      setWorkspace((prev) => {
        if (
          prev.path !== current.path ||
          prev.id !== current.id ||
          prev.title !== current.title
        ) {
          return current;
        }
        return prev;
      });
    };

    update();

    const unsubs: Array<() => void> = [];
    if (dshCtx?.workspaces?.list?.subscribe) {
      unsubs.push(dshCtx.workspaces.list.subscribe(update));
    }
    if (dshCtx?.sessions?.list?.subscribe) {
      unsubs.push(dshCtx.sessions.list.subscribe(update));
    }
    if (dshCtx?.uiWorkspace?.selection?.subscribe) {
      unsubs.push(dshCtx.uiWorkspace.selection.subscribe(update));
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "dsh.sessions.current") {
        update();
      }
    };
    window.addEventListener("storage", onStorage);
    unsubs.push(() => window.removeEventListener("storage", onStorage));

    // 快速轮询作为兜底（800ms），无论用户以何种方式切换工作区或会话，都能在 1 秒内自动响应刷新
    const timer = setInterval(update, 800);

    return () => {
      unsubs.forEach((fn) => fn());
      clearInterval(timer);
    };
  }, [explicitSessionId, explicitWorkspacePath]);

  return workspace;
}
