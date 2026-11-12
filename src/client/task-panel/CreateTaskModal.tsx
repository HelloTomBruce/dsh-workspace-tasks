import { useState } from "react";
import type { ChangeEvent } from "react";
import type { ProjectTask, TaskPriority } from "../../store/types.ts";
import { API_BASE } from "./hooks.ts";
import {
  cancelBtnStyle,
  closeBtnStyle,
  fieldLabelStyle,
  inputStyle,
  modalContentStyle,
  modalHeaderStyle,
  modalOverlayStyle,
  primaryBtnStyle,
  textAreaStyle,
} from "./styles.ts";

// ---------------- 新建弹窗组件 ----------------

const PRIORITIES: { id: TaskPriority; label: string; desc: string; color: string; bg: string }[] = [
  { id: "P0", label: "P0 紧急", desc: "高危/阻断", color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" },
  { id: "P1", label: "P1 高优", desc: "标准推进", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)" },
  { id: "P2", label: "P2 普通", desc: "常规事务", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)" },
];

export function CreateTaskModal({
  workspacePath,
  existingTasks = [],
  onClose,
  onCreated,
}: {
  workspacePath: string;
  existingTasks?: ProjectTask[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("P1");
  const [tagsInput, setTagsInput] = useState("");
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 过滤出可作为依赖的前置任务（非归档）
  const candidateTasks = existingTasks.filter((t) => t.status !== "archived");

  const toggleDep = (taskId: string) => {
    setSelectedDeps((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return;
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
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e: any) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <span style={{ fontWeight: "600", fontSize: "16px", color: "var(--dsw-alias-label-primary, #0f172a)" }}>新建工作区任务</span>
          <button onClick={onClose} style={closeBtnStyle}>×</button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabelStyle}>任务标题 *</label>
          <input
            type="text"
            placeholder="例如：编写用户登录 API 与单元测试"
            value={title}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
            style={inputStyle}
            autoFocus={true}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabelStyle}>优先级</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {PRIORITIES.map((p) => {
              const isSelected = priority === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPriority(p.id)}
                  style={{
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
                  }}
                >
                  <span style={{ fontSize: "13px" }}>{p.label}</span>
                  <span style={{ fontSize: "11px", opacity: 0.8 }}>{p.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabelStyle}>标签分类 (以逗号或空格分隔，选填)</label>
          <input
            type="text"
            placeholder="例如：frontend, api, bugfix"
            value={tagsInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTagsInput(e.target.value)}
            style={inputStyle}
          />
        </div>
        {candidateTasks.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabelStyle}>前置依赖任务 (可选点击勾选)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: "88px", overflowY: "auto", padding: "4px 0" }}>
              {candidateTasks.map((ct) => {
                const isChecked = selectedDeps.includes(ct.id);
                return (
                  <button
                    type="button"
                    key={ct.id}
                    onClick={() => toggleDep(ct.id)}
                    style={{
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
                    }}
                    title={`${ct.id}: ${ct.title} (${ct.status})`}
                  >
                    {isChecked ? `✓ ${ct.id}` : `+ ${ct.id}`}
                    <span style={{ opacity: 0.75, maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ct.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ marginBottom: 18 }}>
          <label style={fieldLabelStyle}>需求背景与详细描述 (Markdown 选填)</label>
          <textarea
            placeholder="详细说明任务验收条件、涉及模块或提示 Agent 需要注意的事项..."
            value={description}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
            style={textAreaStyle}
            rows={4}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={cancelBtnStyle}>取消</button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            style={primaryBtnStyle}
          >
            {submitting ? "创建中…" : "创建任务"}
          </button>
        </div>
      </div>
    </div>
  );
}
