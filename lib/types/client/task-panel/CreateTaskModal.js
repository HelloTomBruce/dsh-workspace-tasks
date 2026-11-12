import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { API_BASE } from "./hooks.js";
import { cancelBtnStyle, closeBtnStyle, fieldLabelStyle, inputStyle, modalContentStyle, modalHeaderStyle, modalOverlayStyle, primaryBtnStyle, textAreaStyle, } from "./styles.js";
// ---------------- 新建弹窗组件 ----------------
const PRIORITIES = [
    { id: "P0", label: "P0 紧急", desc: "高危/阻断", color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" },
    { id: "P1", label: "P1 高优", desc: "标准推进", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)" },
    { id: "P2", label: "P2 普通", desc: "常规事务", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)" },
];
export function CreateTaskModal({ workspacePath, existingTasks = [], onClose, onCreated, }) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState("P1");
    const [tagsInput, setTagsInput] = useState("");
    const [selectedDeps, setSelectedDeps] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    // 过滤出可作为依赖的前置任务（非归档）
    const candidateTasks = existingTasks.filter((t) => t.status !== "archived");
    const toggleDep = (taskId) => {
        setSelectedDeps((prev) => prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]);
    };
    const handleSubmit = async () => {
        if (!title.trim() || submitting)
            return;
        setSubmitting(true);
        try {
            const parsedTags = tagsInput
                .split(/[,，\s]+/)
                .map((t) => t.trim())
                .filter(Boolean);
            await fetch(`${API_BASE}/create`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    workspacePath,
                    title,
                    description,
                    priority,
                    tags: parsedTags,
                    dependsOn: selectedDeps,
                }),
            });
            onCreated();
        }
        catch (e) {
            console.error(e);
        }
        finally {
            setSubmitting(false);
        }
    };
    return (_jsx("div", { style: modalOverlayStyle, onClick: onClose, children: _jsxs("div", { style: modalContentStyle, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { style: modalHeaderStyle, children: [_jsx("span", { style: { fontWeight: "600", fontSize: "16px", color: "var(--dsw-alias-label-primary, #0f172a)" }, children: "\u65B0\u5EFA\u5DE5\u4F5C\u533A\u4EFB\u52A1" }), _jsx("button", { onClick: onClose, style: closeBtnStyle, children: "\u00D7" })] }), _jsxs("div", { style: { marginBottom: 14 }, children: [_jsx("label", { style: fieldLabelStyle, children: "\u4EFB\u52A1\u6807\u9898 *" }), _jsx("input", { type: "text", placeholder: "\u4F8B\u5982\uFF1A\u7F16\u5199\u7528\u6237\u767B\u5F55 API \u4E0E\u5355\u5143\u6D4B\u8BD5", value: title, onChange: (e) => setTitle(e.target.value), style: inputStyle, autoFocus: true })] }), _jsxs("div", { style: { marginBottom: 14 }, children: [_jsx("label", { style: fieldLabelStyle, children: "\u4F18\u5148\u7EA7" }), _jsx("div", { style: { display: "flex", gap: "8px" }, children: PRIORITIES.map((p) => {
                                const isSelected = priority === p.id;
                                return (_jsxs("button", { type: "button", onClick: () => setPriority(p.id), style: {
                                        flex: 1,
                                        padding: "8px 6px",
                                        borderRadius: "8px",
                                        border: isSelected
                                            ? `2px solid ${p.color}`
                                            : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
                                        backgroundColor: isSelected
                                            ? p.bg
                                            : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03))",
                                        color: isSelected ? p.color : "var(--dsw-alias-label-secondary, #64748b)",
                                        cursor: "pointer",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: "2px",
                                        fontWeight: isSelected ? "600" : "400",
                                        transition: "all 0.15s ease",
                                    }, children: [_jsx("span", { style: { fontSize: "13px" }, children: p.label }), _jsx("span", { style: { fontSize: "11px", opacity: 0.8 }, children: p.desc })] }, p.id));
                            }) })] }), _jsxs("div", { style: { marginBottom: 14 }, children: [_jsx("label", { style: fieldLabelStyle, children: "\u6807\u7B7E\u5206\u7C7B (\u4EE5\u9017\u53F7\u6216\u7A7A\u683C\u5206\u9694\uFF0C\u9009\u586B)" }), _jsx("input", { type: "text", placeholder: "\u4F8B\u5982\uFF1Afrontend, api, bugfix", value: tagsInput, onChange: (e) => setTagsInput(e.target.value), style: inputStyle })] }), candidateTasks.length > 0 && (_jsxs("div", { style: { marginBottom: 14 }, children: [_jsx("label", { style: fieldLabelStyle, children: "\u524D\u7F6E\u4F9D\u8D56\u4EFB\u52A1 (\u53EF\u9009\u70B9\u51FB\u52FE\u9009)" }), _jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, maxHeight: "88px", overflowY: "auto", padding: "4px 0" }, children: candidateTasks.map((ct) => {
                                const isChecked = selectedDeps.includes(ct.id);
                                return (_jsxs("button", { type: "button", onClick: () => toggleDep(ct.id), style: {
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 4,
                                        padding: "3px 8px",
                                        borderRadius: "6px",
                                        fontSize: "11.5px",
                                        cursor: "pointer",
                                        border: isChecked ? "1px solid #2563eb" : "1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))",
                                        background: isChecked ? "rgba(37, 99, 235, 0.1)" : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02))",
                                        color: isChecked ? "#2563eb" : "var(--dsw-alias-label-secondary, #475569)",
                                        transition: "all 0.15s ease",
                                    }, title: `${ct.id}: ${ct.title} (${ct.status})`, children: [isChecked ? `✓ ${ct.id}` : `+ ${ct.id}`, _jsx("span", { style: { opacity: 0.75, maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: ct.title })] }, ct.id));
                            }) })] })), _jsxs("div", { style: { marginBottom: 18 }, children: [_jsx("label", { style: fieldLabelStyle, children: "\u9700\u6C42\u80CC\u666F\u4E0E\u8BE6\u7EC6\u63CF\u8FF0 (Markdown \u9009\u586B)" }), _jsx("textarea", { placeholder: "\u8BE6\u7EC6\u8BF4\u660E\u4EFB\u52A1\u9A8C\u6536\u6761\u4EF6\u3001\u6D89\u53CA\u6A21\u5757\u6216\u63D0\u793A Agent \u9700\u8981\u6CE8\u610F\u7684\u4E8B\u9879...", value: description, onChange: (e) => setDescription(e.target.value), style: textAreaStyle, rows: 4 })] }), _jsxs("div", { style: { display: "flex", justifyContent: "flex-end", gap: 10 }, children: [_jsx("button", { onClick: onClose, style: cancelBtnStyle, children: "\u53D6\u6D88" }), _jsx("button", { onClick: handleSubmit, disabled: submitting || !title.trim(), style: primaryBtnStyle, children: submitting ? "创建中…" : "创建任务" })] })] }) }));
}
//# sourceMappingURL=CreateTaskModal.js.map