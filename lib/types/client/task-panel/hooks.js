import { useEffect, useState } from "react";
/**
 * TaskPanel 数据 hooks：任务列表 / 自动派发规则与记录轮询（从 TaskPanel.tsx 原样迁移）。
 */
export const API_BASE = "/__dsh-tasks__";
export function useTasks(workspacePath) {
    const [tasks, setTasks] = useState([]);
    const [summary, setSummary] = useState({
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
            .then((r) => r.json())
            .then((res) => {
            if (!alive)
                return;
            if (res.ok && res.data) {
                setTasks(res.data.tasks);
                setSummary(res.data.summary);
            }
            else {
                setTasks([]);
                setSummary({ total: 0, todo: 0, inProgress: 0, review: 0, done: 0, blocked: 0, archived: 0 });
            }
        })
            .catch((err) => {
            console.error("Failed to load tasks", err);
        })
            .finally(() => {
            if (alive)
                setLoading(false);
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
                .then((r) => r.json())
                .then((res) => {
                if (res.ok && res.data) {
                    setTasks(res.data.tasks);
                    setSummary(res.data.summary);
                }
            })
                .catch(() => { });
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
export function useDispatch(workspacePath) {
    const [rules, setRules] = useState(null);
    const [log, setLog] = useState([]);
    const [tick, setTick] = useState(0);
    useEffect(() => {
        let alive = true;
        const query = workspacePath ? `?workspacePath=${encodeURIComponent(workspacePath)}` : "";
        const load = () => {
            Promise.all([
                fetch(`${API_BASE}/dispatch/rules${query}`, { cache: "no-store" })
                    .then((r) => r.json())
                    .catch(() => null),
                fetch(`${API_BASE}/dispatch/log${query}&limit=20`, { cache: "no-store" })
                    .then((r) => r.json())
                    .catch(() => null),
            ]).then(([rulesRes, logRes]) => {
                if (!alive)
                    return;
                if (rulesRes?.ok && rulesRes.data)
                    setRules(rulesRes.data);
                if (logRes?.ok && Array.isArray(logRes.data))
                    setLog(logRes.data);
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
//# sourceMappingURL=hooks.js.map