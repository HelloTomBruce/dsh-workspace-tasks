import { useState } from "react";
import { MarkdownContent } from "../markdown.tsx";
import {
  cancelBtnStyle,
  closeBtnStyle,
  modalContentStyle,
  modalHeaderStyle,
  modalOverlayStyle,
  primaryBtnStyle,
} from "./styles.ts";

// ---------------- 导出报告弹窗组件 ----------------

export function ExportReportModal({
  markdown,
  onClose,
}: {
  markdown: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div
        style={{
          ...modalContentStyle,
          width: "min(680px, 94vw)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e: any) => e.stopPropagation()}
      >
        <div style={modalHeaderStyle}>
          <span
            style={{
              fontWeight: "600",
              fontSize: "15px",
              color: "var(--dsw-alias-label-primary, #0f172a)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            📋 工作区交付与工程总结报告
          </span>
          <button onClick={onClose} style={closeBtnStyle}>×</button>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px",
            backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.02))",
            borderRadius: "8px",
            border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
            marginBottom: "16px",
          }}
        >
          <MarkdownContent content={markdown} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button
            onClick={handleCopy}
            style={{
              ...primaryBtnStyle,
              backgroundColor: copied ? "#059669" : "#2563eb",
              color: "#ffffff",
              border: "none",
            }}
          >
            {copied ? "✓ 已复制 Markdown" : "📄 复制 Markdown 报告"}
          </button>
          <button onClick={onClose} style={cancelBtnStyle}>关闭</button>
        </div>
      </div>
    </div>
  );
}
