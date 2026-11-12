import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { MarkdownContent } from "../markdown.js";
import { cancelBtnStyle, closeBtnStyle, modalContentStyle, modalHeaderStyle, modalOverlayStyle, primaryBtnStyle, } from "./styles.js";
// ---------------- 导出报告弹窗组件 ----------------
export function ExportReportModal({ markdown, onClose, }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(markdown);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch (e) {
            console.error(e);
        }
    };
    return (_jsx("div", { style: modalOverlayStyle, onClick: onClose, children: _jsxs("div", { style: {
                ...modalContentStyle,
                width: "min(680px, 94vw)",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
            }, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { style: modalHeaderStyle, children: [_jsx("span", { style: {
                                fontWeight: "600",
                                fontSize: "15px",
                                color: "var(--dsw-alias-label-primary, #0f172a)",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                            }, children: "\uD83D\uDCCB \u5DE5\u4F5C\u533A\u4EA4\u4ED8\u4E0E\u5DE5\u7A0B\u603B\u7ED3\u62A5\u544A" }), _jsx("button", { onClick: onClose, style: closeBtnStyle, children: "\u00D7" })] }), _jsx("div", { style: {
                        flex: 1,
                        overflowY: "auto",
                        padding: "12px",
                        backgroundColor: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.02))",
                        borderRadius: "8px",
                        border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08))",
                        marginBottom: "16px",
                    }, children: _jsx(MarkdownContent, { content: markdown }) }), _jsxs("div", { style: { display: "flex", justifyContent: "flex-end", gap: "10px" }, children: [_jsx("button", { onClick: handleCopy, style: {
                                ...primaryBtnStyle,
                                backgroundColor: copied ? "#059669" : "#2563eb",
                                color: "#ffffff",
                                border: "none",
                            }, children: copied ? "✓ 已复制 Markdown" : "📄 复制 Markdown 报告" }), _jsx("button", { onClick: onClose, style: cancelBtnStyle, children: "\u5173\u95ED" })] })] }) }));
}
//# sourceMappingURL=ExportReportModal.js.map