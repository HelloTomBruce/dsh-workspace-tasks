window.__ModuleLoader__.load({ id: "dsh-workspace-tasks", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
let react = require("react");

//#region lib/types/client/icons.js
function TaskGuideIcon(props) {
	return (0, react.createElement)("svg", {
		width: 28,
		height: 28,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.8,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		...props
	}, (0, react.createElement)("rect", {
		x: 3,
		y: 3,
		width: 18,
		height: 18,
		rx: 3
	}), (0, react.createElement)("path", { d: "M7 8h10M7 12h7M7 16h4" }), (0, react.createElement)("circle", {
		cx: 17,
		cy: 15,
		r: 2,
		fill: "currentColor"
	}));
}
function TaskTabIcon(props) {
	return (0, react.createElement)("svg", {
		width: 14,
		height: 14,
		viewBox: "0 0 16 16",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.5,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		...props
	}, (0, react.createElement)("rect", {
		x: 2,
		y: 2,
		width: 12,
		height: 12,
		rx: 2
	}), (0, react.createElement)("path", { d: "M5 5.5h6M5 8.5h4M5 11.5h3" }));
}
function PlusIcon(props) {
	return (0, react.createElement)("svg", {
		width: 14,
		height: 14,
		viewBox: "0 0 16 16",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.8,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		...props
	}, (0, react.createElement)("path", { d: "M8 3v10M3 8h10" }));
}
function RefreshIcon(props) {
	return (0, react.createElement)("svg", {
		width: 13,
		height: 13,
		viewBox: "0 0 16 16",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.6,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		...props
	}, (0, react.createElement)("path", { d: "M13.5 8a5.5 5.5 0 1 1-1.6-3.9L13.5 6" }), (0, react.createElement)("path", { d: "M13.5 2.5v3.5h-3.5" }));
}

//#endregion
//#region lib/types/client/TaskPanel.js
const API_BASE = "/__dsh-tasks__";
function resolveActiveWorkspace(explicitSessionId, explicitWorkspacePath) {
	try {
		const dshCtx = window.__DSH_TASK_CLIENT_CTX__;
		const workspacesState = dshCtx?.workspaces?.list?.getSnapshot?.();
		const sessionsState = dshCtx?.sessions?.list?.getSnapshot?.();
		const items = workspacesState?.items ?? [];
		if (explicitWorkspacePath) {
			const match = items.find((w) => w.path === explicitWorkspacePath || explicitWorkspacePath.startsWith(w.path));
			if (match) return {
				id: match.workspaceId,
				path: match.path,
				title: match.title || match.path
			};
			return {
				id: void 0,
				path: explicitWorkspacePath,
				title: explicitWorkspacePath.split("/").filter(Boolean).pop() || explicitWorkspacePath
			};
		}
		const candidateSessionIds = [];
		if (explicitSessionId) candidateSessionIds.push(explicitSessionId);
		const mainRefSessionId = dshCtx?.uiWorkspace?.mainReference?.sessionId;
		if (mainRefSessionId && !candidateSessionIds.includes(mainRefSessionId)) candidateSessionIds.push(mainRefSessionId);
		const selectionSessionId = dshCtx?.uiWorkspace?.selection?.getSnapshot?.()?.sessionId;
		if (selectionSessionId && !candidateSessionIds.includes(selectionSessionId)) candidateSessionIds.push(selectionSessionId);
		if (typeof document !== "undefined") {
			const rightbarSessionId = document.querySelector("[data-sidebar-right-session]")?.getAttribute("data-sidebar-right-session");
			if (rightbarSessionId && !candidateSessionIds.includes(rightbarSessionId)) candidateSessionIds.push(rightbarSessionId);
			const domSessionId = document.querySelector("[data-session-id]")?.getAttribute("data-session-id");
			if (domSessionId && !candidateSessionIds.includes(domSessionId)) candidateSessionIds.push(domSessionId);
		}
		if (typeof localStorage !== "undefined") try {
			const raw = localStorage.getItem("dsh.sessions.current");
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed?.sessionId && !candidateSessionIds.includes(parsed.sessionId)) candidateSessionIds.push(parsed.sessionId);
			}
		} catch {}
		for (const sid of candidateSessionIds) {
			if (items.length > 0) {
				const found = items.find((w) => w.sessionIds?.includes(sid));
				if (found) return {
					id: found.workspaceId,
					path: found.path,
					title: found.title || found.path
				};
			}
			const sessionCwd = sessionsState?.byId?.[sid]?.cwd;
			if (sessionCwd) {
				if (items.length > 0) {
					const found = items.find((w) => w.path === sessionCwd || sessionCwd.startsWith(w.path));
					if (found) return {
						id: found.workspaceId,
						path: found.path,
						title: found.title || found.path
					};
				}
				return {
					id: void 0,
					path: sessionCwd,
					title: sessionCwd.split("/").filter(Boolean).pop() || sessionCwd
				};
			}
		}
		if (typeof document !== "undefined" && items.length > 0) {
			const activeWsId = document.querySelector("[data-workspace-id][aria-selected='true'], [data-workspace-id].active, [data-workspace-active='true']")?.getAttribute("data-workspace-id");
			if (activeWsId) {
				const found = items.find((w) => w.workspaceId === activeWsId);
				if (found) return {
					id: found.workspaceId,
					path: found.path,
					title: found.title || found.path
				};
			}
		}
		if (items.length > 0) {
			let selected;
			let selectedTime = Number.NEGATIVE_INFINITY;
			for (const item of items) {
				let latest = Number.NEGATIVE_INFINITY;
				for (const sid of item.sessionIds ?? []) {
					const s = sessionsState?.byId?.[sid];
					if (s?.updatedAt) latest = Math.max(latest, Number(s.updatedAt));
				}
				if (latest === Number.NEGATIVE_INFINITY && item.updatedAt) latest = Date.parse(item.updatedAt);
				if (latest === Number.NEGATIVE_INFINITY && item.createdAt) latest = Date.parse(item.createdAt);
				if (selected === void 0 || latest > selectedTime) {
					selected = item;
					selectedTime = latest;
				}
			}
			if (selected) return {
				id: selected.workspaceId,
				path: selected.path,
				title: selected.title || selected.path
			};
		}
		if (items.length > 0 && items[0]) return {
			id: items[0].workspaceId,
			path: items[0].path,
			title: items[0].title || items[0].path
		};
	} catch (e) {
		console.warn("Failed to resolve active workspace:", e);
	}
	return {
		path: "",
		title: ""
	};
}
function useActiveWorkspace(explicitSessionId, explicitWorkspacePath) {
	const [workspace, setWorkspace] = (0, react.useState)(() => resolveActiveWorkspace(explicitSessionId, explicitWorkspacePath));
	(0, react.useEffect)(() => {
		const dshCtx = window.__DSH_TASK_CLIENT_CTX__;
		const update = () => {
			const current = resolveActiveWorkspace(explicitSessionId, explicitWorkspacePath);
			setWorkspace((prev) => {
				if (prev.path !== current.path || prev.id !== current.id || prev.title !== current.title) return current;
				return prev;
			});
		};
		update();
		const unsubs = [];
		if (dshCtx?.workspaces?.list?.subscribe) unsubs.push(dshCtx.workspaces.list.subscribe(update));
		if (dshCtx?.sessions?.list?.subscribe) unsubs.push(dshCtx.sessions.list.subscribe(update));
		if (dshCtx?.uiWorkspace?.selection?.subscribe) unsubs.push(dshCtx.uiWorkspace.selection.subscribe(update));
		const onStorage = (e) => {
			if (e.key === "dsh.sessions.current") update();
		};
		window.addEventListener("storage", onStorage);
		unsubs.push(() => window.removeEventListener("storage", onStorage));
		const timer = setInterval(update, 800);
		return () => {
			unsubs.forEach((fn) => fn());
			clearInterval(timer);
		};
	}, [explicitSessionId, explicitWorkspacePath]);
	return workspace;
}
function useTasks(workspacePath) {
	const [tasks, setTasks] = (0, react.useState)([]);
	const [summary, setSummary] = (0, react.useState)({
		total: 0,
		todo: 0,
		inProgress: 0,
		review: 0,
		done: 0,
		blocked: 0
	});
	const [loading, setLoading] = (0, react.useState)(false);
	const [tick, setTick] = (0, react.useState)(0);
	(0, react.useEffect)(() => {
		let alive = true;
		setLoading(true);
		const query = workspacePath ? `?workspacePath=${encodeURIComponent(workspacePath)}` : "";
		fetch(`${API_BASE}/list${query}`, { cache: "no-store" }).then((r) => r.json()).then((res) => {
			if (!alive) return;
			if (res.ok && res.data) {
				setTasks(res.data.tasks);
				setSummary(res.data.summary);
			} else {
				setTasks([]);
				setSummary({
					total: 0,
					todo: 0,
					inProgress: 0,
					review: 0,
					done: 0,
					blocked: 0
				});
			}
		}).catch((err) => {
			console.error("Failed to load tasks", err);
		}).finally(() => {
			if (alive) setLoading(false);
		});
		return () => {
			alive = false;
		};
	}, [workspacePath, tick]);
	(0, react.useEffect)(() => {
		const timer = setInterval(() => {
			const query = workspacePath ? `?workspacePath=${encodeURIComponent(workspacePath)}` : "";
			fetch(`${API_BASE}/list${query}`, { cache: "no-store" }).then((r) => r.json()).then((res) => {
				if (res.ok && res.data) {
					setTasks(res.data.tasks);
					setSummary(res.data.summary);
				}
			}).catch(() => {});
		}, 5e3);
		return () => clearInterval(timer);
	}, [workspacePath]);
	return {
		tasks,
		summary,
		loading,
		refresh: () => setTick((t) => t + 1)
	};
}
function TaskPanelTitle(props) {
	const { summary } = useTasks(useActiveWorkspace(props?.sessionId).path);
	return (0, react.createElement)("span", { style: titleWrapperStyle }, (0, react.createElement)(TaskTabIcon, { style: { marginRight: 6 } }), (0, react.createElement)("span", null, "工作区任务"), summary.inProgress > 0 && (0, react.createElement)("span", { style: inProgressBadgeStyle }, String(summary.inProgress)));
}
function TaskPanelBody(props) {
	const [manualWorkspacePath, setManualWorkspacePath] = (0, react.useState)(null);
	const workspace = useActiveWorkspace(props?.sessionId, manualWorkspacePath || void 0);
	const { tasks, summary, loading, refresh } = useTasks(workspace.path);
	const [filter, setFilter] = (0, react.useState)("all");
	const [showCreateModal, setShowCreateModal] = (0, react.useState)(false);
	const [showWorkspaceMenu, setShowWorkspaceMenu] = (0, react.useState)(false);
	const [expandedTasks, setExpandedTasks] = (0, react.useState)({});
	const allWorkspaces = window.__DSH_TASK_CLIENT_CTX__?.workspaces?.list?.getSnapshot?.()?.items ?? [];
	const filteredTasks = tasks.filter((t) => {
		if (filter === "all") return true;
		return t.status === filter;
	});
	const toggleExpand = (id) => {
		setExpandedTasks((prev) => ({
			...prev,
			[id]: !prev[id]
		}));
	};
	const updateStatus = async (taskId, newStatus) => {
		try {
			await fetch(`${API_BASE}/update`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					workspacePath: workspace.path,
					taskId,
					status: newStatus
				})
			});
			refresh();
		} catch (e) {
			console.error(e);
		}
	};
	const deleteTask = async (taskId) => {
		if (!confirm(`确定删除任务 ${taskId} 吗？`)) return;
		try {
			await fetch(`${API_BASE}/delete`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					workspacePath: workspace.path,
					taskId
				})
			});
			refresh();
		} catch (e) {
			console.error(e);
		}
	};
	return (0, react.createElement)("div", {
		style: containerStyle,
		onPointerDown: () => {
			if (showWorkspaceMenu) setShowWorkspaceMenu(false);
		}
	}, (0, react.createElement)("div", { style: headerStyle }, (0, react.createElement)("div", { style: headerLeftStyle }, (0, react.createElement)("div", { style: {
		display: "flex",
		alignItems: "center",
		gap: 8
	} }, (0, react.createElement)("span", { style: headerTitleStyle }, "工作区任务看板"), allWorkspaces.length > 0 && (0, react.createElement)("div", { style: {
		position: "relative",
		display: "inline-block"
	} }, (0, react.createElement)("button", {
		type: "button",
		onClick: (e) => {
			e.stopPropagation();
			setShowWorkspaceMenu(!showWorkspaceMenu);
		},
		style: workspaceChipStyle(!!manualWorkspacePath),
		title: manualWorkspacePath ? `已固定在: ${workspace.title || workspace.path} (点击切换或恢复自动跟随)` : `当前工作区: ${workspace.title || workspace.path} (点击可手动切换)`
	}, `📁 ${workspace.title || "未选工作区"}`, manualWorkspacePath && (0, react.createElement)("span", { style: manualTagStyle }, "固定"), (0, react.createElement)("span", { style: {
		fontSize: "8px",
		opacity: .7,
		marginLeft: 2
	} }, "▼")), showWorkspaceMenu && (0, react.createElement)("div", {
		style: workspaceMenuStyle,
		onClick: (e) => e.stopPropagation()
	}, (0, react.createElement)("div", { style: menuHeaderStyle }, "切换查看工作区任务"), (0, react.createElement)("button", {
		type: "button",
		onClick: () => {
			setManualWorkspacePath(null);
			setShowWorkspaceMenu(false);
		},
		style: menuItemStyle(manualWorkspacePath === null)
	}, "✨ 自动跟随当前工作区", manualWorkspacePath === null ? " ✓" : ""), allWorkspaces.map((ws) => (0, react.createElement)("button", {
		type: "button",
		key: ws.workspaceId || ws.path,
		onClick: () => {
			setManualWorkspacePath(ws.path);
			setShowWorkspaceMenu(false);
		},
		style: menuItemStyle(workspace.path === ws.path && manualWorkspacePath === ws.path)
	}, ws.title || ws.path, workspace.path === ws.path && manualWorkspacePath === ws.path ? " ✓" : ""))))), (0, react.createElement)("span", { style: countSubStyle }, `共 ${summary.total} 项，进行中 ${summary.inProgress}`)), (0, react.createElement)("div", { style: headerActionsStyle }, (0, react.createElement)("button", {
		onClick: refresh,
		style: iconBtnStyle,
		title: "刷新列表"
	}, (0, react.createElement)(RefreshIcon, { className: loading ? "spin" : void 0 })), (0, react.createElement)("button", {
		onClick: () => setShowCreateModal(true),
		style: primaryBtnStyle
	}, (0, react.createElement)(PlusIcon, { style: { marginRight: 4 } }), "新建任务"))), (0, react.createElement)("div", { style: filterBarStyle }, [
		{
			key: "all",
			label: `全部 (${summary.total})`
		},
		{
			key: "todo",
			label: `待办 (${summary.todo})`
		},
		{
			key: "in_progress",
			label: `进行中 (${summary.inProgress})`
		},
		{
			key: "review",
			label: `审查 (${summary.review})`
		},
		{
			key: "done",
			label: `已完成 (${summary.done})`
		},
		{
			key: "blocked",
			label: `阻塞 (${summary.blocked})`
		}
	].map((tab) => (0, react.createElement)("button", {
		key: tab.key,
		style: filterTabStyle(filter === tab.key),
		onClick: () => setFilter(tab.key)
	}, tab.label))), (0, react.createElement)("div", { style: taskListStyle }, filteredTasks.length === 0 ? (0, react.createElement)("div", { style: emptyStyle }, loading ? "加载任务中…" : "暂无相关任务，点击右上角【新建任务】开始") : filteredTasks.map((task) => (0, react.createElement)(TaskCard, {
		key: task.id,
		task,
		workspacePath: workspace.path,
		workspaceId: workspace.id,
		currentSessionId: props?.sessionId,
		isExpanded: !!expandedTasks[task.id],
		onToggleExpand: () => toggleExpand(task.id),
		onStatusChange: (status) => updateStatus(task.id, status),
		onDelete: () => deleteTask(task.id),
		onConclusionAdded: refresh
	}))), showCreateModal && (0, react.createElement)(CreateTaskModal, {
		workspacePath: workspace.path,
		onClose: () => setShowCreateModal(false),
		onCreated: () => {
			setShowCreateModal(false);
			refresh();
		}
	}));
}
const DEFAULT_STATUS_OPTION = {
	id: "todo",
	label: "待办",
	color: "#64748b",
	bg: "rgba(100, 116, 139, 0.14)"
};
const STATUS_OPTIONS = [
	DEFAULT_STATUS_OPTION,
	{
		id: "in_progress",
		label: "进行中",
		color: "#2563eb",
		bg: "rgba(37, 99, 235, 0.14)"
	},
	{
		id: "review",
		label: "审查中",
		color: "#7c3aed",
		bg: "rgba(124, 58, 237, 0.14)"
	},
	{
		id: "done",
		label: "已完成",
		color: "#059669",
		bg: "rgba(5, 150, 105, 0.14)"
	},
	{
		id: "blocked",
		label: "已阻塞",
		color: "#dc2626",
		bg: "rgba(220, 38, 38, 0.14)"
	}
];
function StatusDropdown({ status, onChange }) {
	const [open, setOpen] = (0, react.useState)(false);
	const current = STATUS_OPTIONS.find((o) => o.id === status) ?? DEFAULT_STATUS_OPTION;
	(0, react.useEffect)(() => {
		if (!open) return;
		const handleOutside = () => setOpen(false);
		window.addEventListener("click", handleOutside);
		return () => window.removeEventListener("click", handleOutside);
	}, [open]);
	return (0, react.createElement)("div", { style: {
		position: "relative",
		display: "inline-block"
	} }, (0, react.createElement)("button", {
		type: "button",
		onClick: (e) => {
			e.stopPropagation();
			setOpen(!open);
		},
		style: {
			display: "inline-flex",
			alignItems: "center",
			gap: "5px",
			padding: "3px 8px",
			borderRadius: "12px",
			fontSize: "11px",
			fontWeight: "500",
			color: current.color,
			backgroundColor: current.bg,
			border: `1px solid ${current.color}40`,
			cursor: "pointer",
			outline: "none"
		}
	}, (0, react.createElement)("span", { style: {
		width: "6px",
		height: "6px",
		borderRadius: "50%",
		backgroundColor: current.color
	} }), current.label, (0, react.createElement)("span", { style: {
		fontSize: "8px",
		opacity: .7,
		marginLeft: 1
	} }, "▼")), open && (0, react.createElement)("div", {
		onClick: (e) => e.stopPropagation(),
		style: {
			position: "absolute",
			top: "calc(100% + 4px)",
			right: 0,
			backgroundColor: "var(--dsw-alias-bg-layer-2, #ffffff)",
			border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
			borderRadius: "8px",
			boxShadow: "var(--dsw-shadow-lv3, 0 8px 20px rgba(0, 0, 0, 0.15))",
			padding: "4px",
			zIndex: 100,
			minWidth: "105px",
			display: "flex",
			flexDirection: "column",
			gap: "2px"
		}
	}, STATUS_OPTIONS.map((opt) => (0, react.createElement)("button", {
		type: "button",
		key: opt.id,
		onClick: () => {
			onChange(opt.id);
			setOpen(false);
		},
		style: {
			display: "flex",
			alignItems: "center",
			gap: "6px",
			width: "100%",
			padding: "6px 8px",
			border: "none",
			borderRadius: "5px",
			backgroundColor: opt.id === status ? opt.bg : "transparent",
			color: opt.id === status ? opt.color : "var(--dsw-alias-label-primary, #0f172a)",
			fontSize: "12px",
			cursor: "pointer",
			textAlign: "left"
		}
	}, (0, react.createElement)("span", { style: {
		width: "6px",
		height: "6px",
		borderRadius: "50%",
		backgroundColor: opt.color
	} }), opt.label))));
}
function TaskCard({ task, workspacePath, workspaceId, currentSessionId, isExpanded, onToggleExpand, onStatusChange, onDelete, onConclusionAdded }) {
	const [showAddConc, setShowAddConc] = (0, react.useState)(false);
	const [concSummary, setConcSummary] = (0, react.useState)("");
	const [concDeliverables, setConcDeliverables] = (0, react.useState)("");
	const [concInsights, setConcInsights] = (0, react.useState)("");
	const [savingConc, setSavingConc] = (0, react.useState)(false);
	const [assignedStatus, setAssignedStatus] = (0, react.useState)(null);
	const handleAssignToAgent = async () => {
		const prompt = [
			`请执行工作区任务 [${task.id}]：${task.title}`,
			workspacePath ? `【工作区根目录】：${workspacePath}` : "",
			task.description ? `\n【需求背景与详细要求】\n${task.description}` : "",
			`\n【执行规范与标准流程】`,
			`1. 开始执行时，先调用 workspace_task 工具（action: "update", taskId: "${task.id}", status: "in_progress", assignee: "agent"${workspacePath ? `, workspacePath: "${workspacePath}"` : ""}) 将本任务标记为进行中。`,
			`2. 完成代码实现与验证测试。`,
			`3. 验证通过后，调用 workspace_task 工具的 conclude 操作（action: "conclude", taskId: "${task.id}"${workspacePath ? `, workspacePath: "${workspacePath}"` : ""})，提交总结摘要、产出文件清单和关键经验心得，自动将任务标记为完成。`
		].filter(Boolean).join("\n");
		let dispatched = false;
		try {
			const dshCtx = window.__DSH_TASK_CLIENT_CTX__;
			let targetSessionId = currentSessionId;
			if (!targetSessionId && dshCtx) targetSessionId = dshCtx.uiWorkspace?.mainReference?.sessionId || dshCtx.uiWorkspace?.selection?.getSnapshot?.()?.sessionId;
			if (!targetSessionId && typeof document !== "undefined") targetSessionId = document.querySelector("[data-sidebar-right-session]")?.getAttribute("data-sidebar-right-session") || document.querySelector("[data-session-id]")?.getAttribute("data-session-id") || void 0;
			if (!targetSessionId && typeof localStorage !== "undefined") try {
				const raw = localStorage.getItem("dsh.sessions.current");
				if (raw) targetSessionId = JSON.parse(raw)?.sessionId;
			} catch {}
			if (!targetSessionId && workspaceId && dshCtx?.uiWorkspace?.connectWorkspace) try {
				targetSessionId = await dshCtx.uiWorkspace.connectWorkspace(workspaceId);
				if (targetSessionId && dshCtx.uiWorkspace?.openSession) dshCtx.uiWorkspace.openSession(targetSessionId);
			} catch (e) {
				console.warn("Failed to auto-connect workspace session", e);
			}
			if (targetSessionId && dshCtx) {
				try {
					const binding = dshCtx.sessions?.binding?.(targetSessionId);
					if (binding?.session?.prompt) {
						const res = await binding.session.prompt([{
							type: "text",
							text: prompt
						}], "queue");
						if (!res || res.ok !== false) dispatched = true;
					}
				} catch (e) {
					console.warn("binding.session.prompt error", e);
				}
				if (!dispatched) try {
					const scopedCtx = dshCtx.sessions?.scope?.(targetSessionId);
					if (scopedCtx?.conversation?.send) {
						await scopedCtx.conversation.send(prompt);
						dispatched = true;
					}
				} catch (e) {
					console.warn("scopedCtx.conversation.send error", e);
				}
			}
		} catch (err) {
			console.warn("Direct dispatch to agent failed, falling back to editor/clipboard:", err);
		}
		try {
			const editableEl = document.querySelector("[contenteditable=\"true\"]");
			if (editableEl) {
				editableEl.focus();
				document.execCommand("selectAll", false, void 0);
				document.execCommand("insertText", false, prompt);
			}
			const textarea = document.querySelector("textarea:not([disabled])");
			if (textarea) {
				const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
				if (setter) setter.call(textarea, prompt);
				else textarea.value = prompt;
				textarea.dispatchEvent(new Event("input", { bubbles: true }));
				textarea.focus();
			}
		} catch (e) {
			console.warn("Failed to set composer value:", e);
		}
		try {
			await navigator.clipboard.writeText(prompt);
		} catch {}
		setAssignedStatus(dispatched ? "dispatched" : "filled");
		setTimeout(() => setAssignedStatus(null), 3500);
	};
	const handleAddConclusion = async () => {
		if (!concSummary.trim()) return;
		setSavingConc(true);
		try {
			const deliverables = concDeliverables.split("\n").map((s) => s.trim()).filter(Boolean);
			const insights = concInsights.split("\n").map((s) => s.trim()).filter(Boolean);
			await fetch(`${API_BASE}/conclude`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					workspacePath,
					taskId: task.id,
					summary: concSummary,
					deliverables,
					insights
				})
			});
			setConcSummary("");
			setConcDeliverables("");
			setConcInsights("");
			setShowAddConc(false);
			onConclusionAdded();
		} catch (e) {
			console.error(e);
		} finally {
			setSavingConc(false);
		}
	};
	return (0, react.createElement)("div", { style: taskCardStyle(task.status) }, (0, react.createElement)("div", { style: cardHeaderStyle }, (0, react.createElement)("div", { style: cardMetaStyle }, (0, react.createElement)("span", { style: taskIdStyle }, task.id), (0, react.createElement)(PriorityBadge, { priority: task.priority }), task.assignee && (0, react.createElement)("span", { style: assigneeBadgeStyle }, `@${task.assignee}`)), (0, react.createElement)("div", { style: cardRightActionsStyle }, (0, react.createElement)(StatusDropdown, {
		status: task.status,
		onChange: onStatusChange
	}), (0, react.createElement)("button", {
		onClick: onDelete,
		style: deleteBtnStyle,
		title: "删除任务"
	}, "×"))), (0, react.createElement)("div", { style: cardTitleStyle }, task.title), task.description && (0, react.createElement)("div", { style: cardDescStyle }, task.description), (0, react.createElement)("div", { style: cardFooterStyle }, (0, react.createElement)("div", { style: {
		display: "flex",
		alignItems: "center",
		gap: 8
	} }, (0, react.createElement)("button", {
		onClick: onToggleExpand,
		style: toggleExpandBtnStyle
	}, task.conclusions.length > 0 ? `📝 ${task.conclusions.length} 条结论 ${isExpanded ? "▲" : "▼"}` : `📝 暂无结论 ${isExpanded ? "▲" : "▼"}`), task.status !== "done" && (0, react.createElement)("button", {
		type: "button",
		onClick: handleAssignToAgent,
		style: assignBtnStyle(!!assignedStatus),
		title: "一键将任务派发给 Agent 执行并填入对话框"
	}, assignedStatus === "dispatched" ? "✓ 已直接派发" : assignedStatus === "filled" ? "✓ 已填入对话框" : "🤖 交给 Agent")), (0, react.createElement)("span", { style: timeStyle }, new Date(task.updatedAt).toLocaleDateString())), isExpanded && (0, react.createElement)("div", { style: conclusionDrawerStyle }, task.conclusions.map((conc, idx) => (0, react.createElement)("div", {
		key: conc.id || idx,
		style: conclusionItemStyle
	}, (0, react.createElement)("div", { style: concTimeStyle }, `完成于 ${new Date(conc.completedAt).toLocaleString()}`), (0, react.createElement)("div", { style: concSummaryStyle }, conc.summary), conc.deliverables && conc.deliverables.length > 0 && (0, react.createElement)("div", { style: concBlockStyle }, (0, react.createElement)("span", { style: concLabelStyle }, "产出交付物:"), (0, react.createElement)("ul", { style: concListStyle }, conc.deliverables.map((d, di) => (0, react.createElement)("li", {
		key: di,
		style: codeLiStyle
	}, d)))), conc.insights && conc.insights.length > 0 && (0, react.createElement)("div", { style: concBlockStyle }, (0, react.createElement)("span", { style: concLabelStyle }, "经验心得:"), (0, react.createElement)("ul", { style: concListStyle }, conc.insights.map((ins, ii) => (0, react.createElement)("li", {
		key: ii,
		style: insightLiStyle
	}, ins)))))), showAddConc ? (0, react.createElement)("div", { style: addConcFormStyle }, (0, react.createElement)("textarea", {
		placeholder: "执行结论总结（核心产出与解决要点）...",
		value: concSummary,
		onChange: (e) => setConcSummary(e.target.value),
		style: textAreaStyle,
		rows: 2
	}), (0, react.createElement)("textarea", {
		placeholder: "交付物文件路径（每行一个文件路径，选填）",
		value: concDeliverables,
		onChange: (e) => setConcDeliverables(e.target.value),
		style: textAreaStyle,
		rows: 2
	}), (0, react.createElement)("textarea", {
		placeholder: "关键经验/踩坑心得（每行一条，选填）",
		value: concInsights,
		onChange: (e) => setConcInsights(e.target.value),
		style: textAreaStyle,
		rows: 2
	}), (0, react.createElement)("div", { style: {
		display: "flex",
		gap: 8,
		justifyContent: "flex-end",
		marginTop: 6
	} }, (0, react.createElement)("button", {
		onClick: () => setShowAddConc(false),
		style: cancelBtnStyle
	}, "取消"), (0, react.createElement)("button", {
		onClick: handleAddConclusion,
		disabled: savingConc || !concSummary.trim(),
		style: primaryBtnStyle
	}, savingConc ? "保存中…" : "提交并标记完成"))) : (0, react.createElement)("button", {
		onClick: () => setShowAddConc(true),
		style: appendConcBtnStyle
	}, "+ 追加执行结论")));
}
const PRIORITIES = [
	{
		id: "P0",
		label: "P0 紧急",
		desc: "高危/阻断",
		color: "#ef4444",
		bg: "rgba(239, 68, 68, 0.12)"
	},
	{
		id: "P1",
		label: "P1 高优",
		desc: "标准推进",
		color: "#f59e0b",
		bg: "rgba(245, 158, 11, 0.12)"
	},
	{
		id: "P2",
		label: "P2 普通",
		desc: "常规事务",
		color: "#3b82f6",
		bg: "rgba(59, 130, 246, 0.12)"
	}
];
function CreateTaskModal({ workspacePath, onClose, onCreated }) {
	const [title, setTitle] = (0, react.useState)("");
	const [description, setDescription] = (0, react.useState)("");
	const [priority, setPriority] = (0, react.useState)("P1");
	const [submitting, setSubmitting] = (0, react.useState)(false);
	const handleSubmit = async () => {
		if (!title.trim() || submitting) return;
		setSubmitting(true);
		try {
			await fetch(`${API_BASE}/create`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					workspacePath,
					title,
					description,
					priority
				})
			});
			onCreated();
		} catch (e) {
			console.error(e);
		} finally {
			setSubmitting(false);
		}
	};
	return (0, react.createElement)("div", {
		style: modalOverlayStyle,
		onClick: onClose
	}, (0, react.createElement)("div", {
		style: modalContentStyle,
		onClick: (e) => e.stopPropagation()
	}, (0, react.createElement)("div", { style: modalHeaderStyle }, (0, react.createElement)("span", { style: {
		fontWeight: "600",
		fontSize: "16px",
		color: "var(--dsw-alias-label-primary, #0f172a)"
	} }, "新建工作区任务"), (0, react.createElement)("button", {
		onClick: onClose,
		style: closeBtnStyle
	}, "×")), (0, react.createElement)("div", { style: { marginBottom: 14 } }, (0, react.createElement)("label", { style: fieldLabelStyle }, "任务标题 *"), (0, react.createElement)("input", {
		type: "text",
		placeholder: "例如：编写用户登录 API 与单元测试",
		value: title,
		onChange: (e) => setTitle(e.target.value),
		style: inputStyle,
		autoFocus: true
	})), (0, react.createElement)("div", { style: { marginBottom: 14 } }, (0, react.createElement)("label", { style: fieldLabelStyle }, "优先级"), (0, react.createElement)("div", { style: {
		display: "flex",
		gap: "8px"
	} }, PRIORITIES.map((p) => {
		const isSelected = priority === p.id;
		return (0, react.createElement)("button", {
			type: "button",
			key: p.id,
			onClick: () => setPriority(p.id),
			style: {
				flex: 1,
				padding: "8px 6px",
				borderRadius: "8px",
				border: isSelected ? `2px solid ${p.color}` : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
				backgroundColor: isSelected ? p.bg : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03))",
				color: isSelected ? p.color : "var(--dsw-alias-label-secondary, #64748b)",
				cursor: "pointer",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "2px",
				fontWeight: isSelected ? "600" : "400",
				transition: "all 0.15s ease"
			}
		}, (0, react.createElement)("span", { style: { fontSize: "13px" } }, p.label), (0, react.createElement)("span", { style: {
			fontSize: "11px",
			opacity: .8
		} }, p.desc));
	}))), (0, react.createElement)("div", { style: { marginBottom: 18 } }, (0, react.createElement)("label", { style: fieldLabelStyle }, "需求背景与详细描述 (Markdown 选填)"), (0, react.createElement)("textarea", {
		placeholder: "详细说明任务验收条件、涉及模块或提示 Agent 需要注意的事项...",
		value: description,
		onChange: (e) => setDescription(e.target.value),
		style: textAreaStyle,
		rows: 4
	})), (0, react.createElement)("div", { style: {
		display: "flex",
		justifyContent: "flex-end",
		gap: 10
	} }, (0, react.createElement)("button", {
		onClick: onClose,
		style: cancelBtnStyle
	}, "取消"), (0, react.createElement)("button", {
		onClick: handleSubmit,
		disabled: submitting || !title.trim(),
		style: primaryBtnStyle
	}, submitting ? "创建中…" : "创建任务"))));
}
function PriorityBadge({ priority }) {
	const colorMap = {
		P0: {
			bg: "rgba(239, 68, 68, 0.15)",
			text: "#ef4444"
		},
		P1: {
			bg: "rgba(245, 158, 11, 0.15)",
			text: "#f59e0b"
		},
		P2: {
			bg: "rgba(59, 130, 246, 0.15)",
			text: "#3b82f6"
		}
	};
	const c = colorMap[priority] || colorMap.P1;
	return (0, react.createElement)("span", { style: {
		fontSize: "11px",
		fontWeight: "600",
		padding: "1px 6px",
		borderRadius: "4px",
		backgroundColor: c.bg,
		color: c.text
	} }, priority);
}
const containerStyle = {
	display: "flex",
	flexDirection: "column",
	height: "100%",
	backgroundColor: "var(--dsw-alias-bg-base, #ffffff)",
	color: "var(--dsw-alias-label-primary, #1e293b)",
	boxSizing: "border-box",
	fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
	fontSize: "13px",
	overflow: "hidden"
};
const titleWrapperStyle = {
	display: "inline-flex",
	alignItems: "center",
	fontWeight: "500"
};
const inProgressBadgeStyle = {
	marginLeft: 6,
	backgroundColor: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2f6fed)",
	color: "#ffffff",
	borderRadius: "10px",
	padding: "0 6px",
	fontSize: "10px",
	fontWeight: "bold",
	height: "16px",
	lineHeight: "16px"
};
const headerStyle = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	padding: "12px 16px",
	borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))"
};
const headerLeftStyle = {
	display: "flex",
	flexDirection: "column",
	gap: 2
};
const headerTitleStyle = {
	fontSize: "15px",
	fontWeight: "600",
	color: "var(--dsw-alias-label-primary, #0f172a)"
};
const countSubStyle = {
	fontSize: "12px",
	color: "var(--dsw-alias-label-secondary, #64748b)"
};
const headerActionsStyle = {
	display: "flex",
	alignItems: "center",
	gap: 8
};
const filterBarStyle = {
	display: "flex",
	gap: 4,
	padding: "8px 16px",
	overflowX: "auto",
	borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))"
};
const filterTabStyle = (active) => ({
	border: active ? "1px solid transparent" : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
	background: active ? "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2f6fed)" : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03))",
	color: active ? "#ffffff" : "var(--dsw-alias-label-secondary, #64748b)",
	borderRadius: "6px",
	padding: "4px 10px",
	fontSize: "12px",
	fontWeight: active ? "600" : "400",
	cursor: "pointer",
	whiteSpace: "nowrap"
});
const taskListStyle = {
	flex: 1,
	overflowY: "auto",
	padding: "12px 16px",
	display: "flex",
	flexDirection: "column",
	gap: 10
};
const taskCardStyle = (status) => ({
	border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
	borderRadius: "8px",
	backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
	boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
	padding: "12px",
	display: "flex",
	flexDirection: "column",
	gap: 8,
	opacity: status === "done" ? .8 : 1
});
const cardHeaderStyle = {
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center"
};
const cardMetaStyle = {
	display: "flex",
	alignItems: "center",
	gap: 6
};
const taskIdStyle = {
	fontFamily: "monospace",
	fontSize: "11px",
	color: "var(--dsw-alias-label-tertiary, #94a3b8)"
};
const assigneeBadgeStyle = {
	fontSize: "11px",
	color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb)"
};
const cardRightActionsStyle = {
	display: "flex",
	alignItems: "center",
	gap: 6
};
const deleteBtnStyle = {
	background: "transparent",
	border: "none",
	color: "var(--dsw-alias-label-tertiary, #94a3b8)",
	cursor: "pointer",
	fontSize: "16px",
	lineHeight: "1",
	padding: "2px 6px",
	borderRadius: "4px"
};
const cardTitleStyle = {
	fontSize: "13px",
	fontWeight: "600",
	lineHeight: "1.4",
	color: "var(--dsw-alias-label-primary, #0f172a)"
};
const cardDescStyle = {
	fontSize: "12px",
	color: "var(--dsw-alias-label-secondary, #475569)",
	lineHeight: "1.4",
	whiteSpace: "pre-wrap"
};
const cardFooterStyle = {
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	marginTop: 4
};
const toggleExpandBtnStyle = {
	background: "transparent",
	border: "none",
	color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb)",
	fontSize: "11px",
	cursor: "pointer",
	padding: "0",
	fontWeight: "500"
};
const assignBtnStyle = (active) => ({
	background: active ? "rgba(37, 99, 235, 0.12)" : "transparent",
	border: active ? "1px solid #2563eb" : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
	color: active ? "#2563eb" : "var(--dsw-alias-label-secondary, #475569)",
	borderRadius: "12px",
	padding: "2px 8px",
	fontSize: "11px",
	fontWeight: "500",
	cursor: "pointer",
	display: "inline-flex",
	alignItems: "center",
	gap: "3px",
	transition: "all 0.15s ease"
});
const timeStyle = {
	fontSize: "11px",
	color: "var(--dsw-alias-label-caption, #94a3b8)"
};
const conclusionDrawerStyle = {
	borderTop: "1px dashed var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1))",
	paddingTop: 8,
	marginTop: 4,
	display: "flex",
	flexDirection: "column",
	gap: 8
};
const conclusionItemStyle = {
	backgroundColor: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.03))",
	border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
	borderRadius: "6px",
	padding: "8px 10px",
	fontSize: "12px"
};
const concTimeStyle = {
	fontSize: "10px",
	color: "var(--dsw-alias-label-caption, #94a3b8)",
	marginBottom: 4
};
const concSummaryStyle = {
	fontWeight: "500",
	marginBottom: 6,
	color: "var(--dsw-alias-label-primary, #1e293b)"
};
const concBlockStyle = { marginTop: 4 };
const concLabelStyle = {
	fontSize: "11px",
	color: "var(--dsw-alias-label-secondary, #64748b)",
	display: "block"
};
const concListStyle = {
	margin: "2px 0 0 16px",
	padding: 0
};
const codeLiStyle = {
	fontFamily: "monospace",
	fontSize: "11px",
	color: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, #0284c7)"
};
const insightLiStyle = {
	fontSize: "11px",
	color: "#d97706"
};
const addConcFormStyle = {
	backgroundColor: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.02))",
	border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
	padding: 8,
	borderRadius: "6px",
	display: "flex",
	flexDirection: "column",
	gap: 6
};
const appendConcBtnStyle = {
	background: "transparent",
	border: "1px dashed var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
	color: "var(--dsw-alias-label-secondary, #64748b)",
	borderRadius: "6px",
	padding: "6px",
	fontSize: "11px",
	cursor: "pointer"
};
const primaryBtnStyle = {
	backgroundColor: "var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--dsw-alias-brand-primary, #2f6fed))",
	color: "#ffffff",
	border: "none",
	borderRadius: "6px",
	padding: "6px 14px",
	fontSize: "12px",
	fontWeight: "500",
	cursor: "pointer",
	display: "inline-flex",
	alignItems: "center"
};
const iconBtnStyle = {
	background: "transparent",
	border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
	color: "var(--dsw-alias-label-secondary, #64748b)",
	borderRadius: "6px",
	padding: "5px 7px",
	cursor: "pointer",
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center"
};
const cancelBtnStyle = {
	background: "transparent",
	border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
	color: "var(--dsw-alias-label-secondary, #475569)",
	borderRadius: "6px",
	padding: "6px 14px",
	fontSize: "12px",
	cursor: "pointer"
};
const emptyStyle = {
	padding: "30px 10px",
	textAlign: "center",
	color: "var(--dsw-alias-label-secondary, #64748b)",
	border: "1px dashed var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1))",
	borderRadius: "8px"
};
const modalOverlayStyle = {
	position: "fixed",
	inset: 0,
	backgroundColor: "var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.35))",
	backdropFilter: "var(--dsw-mask-blur, blur(2px))",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	zIndex: 1e3
};
const modalContentStyle = {
	width: "min(480px, 92vw)",
	backgroundColor: "var(--dsw-alias-bg-layer-2, #ffffff)",
	color: "var(--dsw-alias-label-primary, #0f172a)",
	border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
	borderRadius: "16px",
	padding: "20px 24px",
	boxShadow: "var(--dsw-shadow-lv3, 0 16px 36px rgba(0, 0, 0, 0.16))"
};
const modalHeaderStyle = {
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	marginBottom: 16
};
const closeBtnStyle = {
	background: "transparent",
	border: "none",
	fontSize: "20px",
	lineHeight: "1",
	cursor: "pointer",
	color: "var(--dsw-alias-label-tertiary, #94a3b8)",
	padding: "2px 6px",
	borderRadius: "4px"
};
const fieldLabelStyle = {
	display: "block",
	fontSize: "12px",
	fontWeight: "500",
	marginBottom: 6,
	color: "var(--dsw-alias-label-secondary, #475569)"
};
const inputStyle = {
	width: "100%",
	boxSizing: "border-box",
	padding: "8px 10px",
	borderRadius: "8px",
	border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
	backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
	color: "var(--dsw-alias-label-primary, #0f172a)",
	fontSize: "13px",
	outline: "none"
};
const textAreaStyle = {
	width: "100%",
	boxSizing: "border-box",
	padding: "8px 10px",
	borderRadius: "8px",
	border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.15))",
	backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
	color: "var(--dsw-alias-label-primary, #0f172a)",
	fontSize: "12px",
	fontFamily: "inherit",
	resize: "vertical",
	outline: "none"
};
const workspaceChipStyle = (isManual) => ({
	display: "inline-flex",
	alignItems: "center",
	gap: "4px",
	padding: "2px 8px",
	borderRadius: "10px",
	fontSize: "11px",
	fontWeight: "500",
	color: isManual ? "var(--dsw-alias-color-primary, #2563eb)" : "var(--dsw-alias-label-secondary, #475569)",
	backgroundColor: isManual ? "rgba(37, 99, 235, 0.1)" : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.04))",
	border: isManual ? "1px solid rgba(37, 99, 235, 0.3)" : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08))",
	cursor: "pointer",
	outline: "none",
	maxWidth: "160px",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap"
});
const manualTagStyle = {
	fontSize: "9px",
	padding: "1px 4px",
	borderRadius: "4px",
	backgroundColor: "var(--dsw-alias-color-primary, #2563eb)",
	color: "#ffffff",
	marginLeft: "2px"
};
const workspaceMenuStyle = {
	position: "absolute",
	top: "calc(100% + 4px)",
	left: 0,
	backgroundColor: "var(--dsw-alias-bg-layer-2, #ffffff)",
	border: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
	borderRadius: "8px",
	boxShadow: "var(--dsw-shadow-lv3, 0 8px 20px rgba(0, 0, 0, 0.15))",
	padding: "4px",
	zIndex: 100,
	minWidth: "160px",
	display: "flex",
	flexDirection: "column",
	gap: "2px"
};
const menuHeaderStyle = {
	fontSize: "11px",
	fontWeight: "600",
	padding: "4px 8px",
	color: "var(--dsw-alias-label-tertiary, #94a3b8)",
	borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06))",
	marginBottom: "2px"
};
const menuItemStyle = (active) => ({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	width: "100%",
	padding: "6px 8px",
	border: "none",
	borderRadius: "5px",
	backgroundColor: active ? "rgba(37, 99, 235, 0.1)" : "transparent",
	color: active ? "var(--dsw-alias-color-primary, #2563eb)" : "var(--dsw-alias-label-primary, #0f172a)",
	fontSize: "12px",
	cursor: "pointer",
	textAlign: "left",
	outline: "none"
});

//#endregion
//#region lib/types/client/index.js
const TAB_ID = "dsh-workspace-tasks";
const TAB_KIND = "workspace-tasks";
const inject = [
	"slots",
	"sidebarRight",
	"sidebarRightTabs",
	"conversation",
	"sessions",
	"workspaces",
	"uiWorkspace"
];
function apply(ctx) {
	if (typeof window !== "undefined") window.__DSH_TASK_CLIENT_CTX__ = ctx;
	const sidebarRightTabs = ctx.sidebarRightTabs;
	if (sidebarRightTabs) ctx.effect(() => sidebarRightTabs.register({
		id: TAB_ID,
		kind: TAB_KIND,
		multiple: false,
		priority: "plugin",
		title: () => "工作区任务",
		guide: [{
			id: "tasks",
			order: 30,
			title: () => "工作区任务",
			description: () => "查看与管理当前工作区的任务状态、执行过程与产出结论",
			icon: TaskGuideIcon
		}]
	}), "dsh-workspace-tasks: right sidebar tab definition");
	ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
		name: "sidebar.right.pane.tab",
		key: TAB_ID
	}, TaskPanelBody));
	ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
		name: "sidebar.right.pane.tab.title",
		key: TAB_ID
	}, TaskPanelTitle));
}

//#endregion
exports.TAB_ID = TAB_ID;
exports.TAB_KIND = TAB_KIND;
exports.apply = apply;
exports.inject = inject;
return module.exports; } });
//# sourceMappingURL=client.js.map