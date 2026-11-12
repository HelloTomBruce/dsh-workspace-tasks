import { useEffect, useState } from "react";
import type { ProjectTask, WorkspaceTasksSummary } from "../../store/types.ts";

/**
 * TaskPanel 数据 hooks：任务列表 / 自动派发规则与记录轮询（从 TaskPanel.tsx 原样迁移）。
 */

export const API_BASE = "/__dsh-tasks__";

interface ListResponse {
  ok: boolean;
  data: {
    tasks: ProjectTask[];
    summary: WorkspaceTasksSummary;
  };
  error?: string;
}

export function useTasks(workspacePath: string): {
  tasks: ProjectTask[];
  summary: WorkspaceTasksSummary;
  loading: boolean;
  refresh: () => void;
} {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [summary, setSummary] = useState<WorkspaceTasksSummary>({
    total: 0,
    todo: 0,
    inProgress: 0,
    review: 0,
    done: 0,
    blocked: 0,
    archived: 0,
  });
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    const query = workspacePath ? `?workspacePath=${encodeURIComponent(workspacePath)}` : "";
    fetch(`${API_BASE}/list${query}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<ListResponse>)
      .then((res) => {
        if (!alive) return;
        if (res.ok && res.data) {
          setTasks(res.data.tasks);
          setSummary(res.data.summary);
        } else {
          setTasks([]);
          setSummary({ total: 0, todo: 0, inProgress: 0, review: 0, done: 0, blocked: 0, archived: 0 });
        }
      })
      .catch((err) => {
        console.error("Failed to load tasks", err);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [workspacePath, tick]);

  // 静默轮询（每 3 秒刷新，并监听 window focus 及自定义刷新事件）
  useEffect(() => {
    const fetchLatest = () => {
      const query = workspacePath ? `?workspacePath=${encodeURIComponent(workspacePath)}` : "";
      fetch(`${API_BASE}/list${query}`, { cache: "no-store" })
        .then((r) => r.json() as Promise<ListResponse>)
        .then((res) => {
          if (res.ok && res.data) {
            setTasks(res.data.tasks);
            setSummary(res.data.summary);
          }
        })
        .catch(() => {});
    };

    const timer = setInterval(fetchLatest, 3000);
    const onRefreshEvent = () => fetchLatest();
    window.addEventListener("focus", onRefreshEvent);
    window.addEventListener("dsh-tasks:refresh", onRefreshEvent);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onRefreshEvent);
      window.removeEventListener("dsh-tasks:refresh", onRefreshEvent);
    };
  }, [workspacePath]);

  return {
    tasks,
    summary,
    loading,
    refresh: () => setTick((t) => t + 1),
  };
}

// ===== 自动派发（Fast Path 事件驱动）数据 =====

export interface DispatchRuleInfo {
  mode: "observe" | "auto" | "off";
  priorities: string[];
  tagsExclude?: string[];
  whitelist?: string[];
  maxConcurrent: number;
  /** 停滞检测阈值（小时，默认 24） */
  staleHours?: number;
}

export interface DispatchLogEntry {
  id: string;
  taskId: string;
  taskTitle?: string;
  triggerTaskId?: string;
  hop: number;
  mode: "observe" | "auto";
  status: "queued" | "sent" | "failed" | "ignored" | "would-dispatch" | "tripped";
  createdAt: string;
  ackedAt?: string;
}

export function useDispatch(workspacePath: string): {
  rules: DispatchRuleInfo | null;
  log: DispatchLogEntry[];
  refresh: () => void;
} {
  const [rules, setRules] = useState<DispatchRuleInfo | null>(null);
  const [log, setLog] = useState<DispatchLogEntry[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const query = workspacePath ? `?workspacePath=${encodeURIComponent(workspacePath)}` : "";
    const load = () => {
      Promise.all([
        fetch(`${API_BASE}/dispatch/rules${query}`, { cache: "no-store" })
          .then((r) => r.json() as Promise<{ ok: boolean; data?: DispatchRuleInfo }>)
          .catch(() => null),
        fetch(`${API_BASE}/dispatch/log${query}&limit=20`, { cache: "no-store" })
          .then((r) => r.json() as Promise<{ ok: boolean; data?: DispatchLogEntry[] }>)
          .catch(() => null),
      ]).then(([rulesRes, logRes]) => {
        if (!alive) return;
        if (rulesRes?.ok && rulesRes.data) setRules(rulesRes.data);
        if (logRes?.ok && Array.isArray(logRes.data)) setLog(logRes.data);
      });
    };
    load();
    const timer = setInterval(load, 3000);
    const onRefreshEvent = () => load();
    window.addEventListener("dsh-tasks:refresh", onRefreshEvent);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("dsh-tasks:refresh", onRefreshEvent);
    };
  }, [workspacePath, tick]);

  return { rules, log, refresh: () => setTick((t) => t + 1) };
}
