import { createElement, useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import { marked } from "marked";

const MARKDOWN_STYLE_ID = "__dsh_workspace_tasks_markdown_styles__";

function ensureMarkdownStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(MARKDOWN_STYLE_ID)) return;
  const styleEl = document.createElement("style");
  styleEl.id = MARKDOWN_STYLE_ID;
  styleEl.textContent = `
    .dsh-task-markdown {
      font-size: 12px;
      line-height: 1.5;
      color: var(--dsw-alias-label-secondary, #475569);
      word-break: break-word;
    }
    .dsh-task-markdown p {
      margin: 0 0 6px 0;
    }
    .dsh-task-markdown p:last-child {
      margin-bottom: 0;
    }
    .dsh-task-markdown h1,
    .dsh-task-markdown h2,
    .dsh-task-markdown h3,
    .dsh-task-markdown h4 {
      color: var(--dsw-alias-label-primary, #0f172a);
      font-weight: 600;
      margin: 6px 0 3px 0;
      line-height: 1.3;
    }
    .dsh-task-markdown h1 { font-size: 13px; }
    .dsh-task-markdown h2 { font-size: 12.5px; }
    .dsh-task-markdown h3 { font-size: 12px; }
    .dsh-task-markdown h4 { font-size: 11.5px; }
    .dsh-task-markdown ul,
    .dsh-task-markdown ol {
      margin: 2px 0 6px 0;
      padding-left: 18px;
    }
    .dsh-task-markdown li {
      margin-bottom: 2px;
    }
    .dsh-task-markdown li:last-child {
      margin-bottom: 0;
    }
    .dsh-task-markdown code {
      font-family: var(--dsw-alias-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
      font-size: 11px;
      padding: 1px 4px;
      border-radius: 4px;
      background: var(--dsw-alias-surface-elevation-2, rgba(0, 0, 0, 0.05));
      color: var(--dsw-alias-label-primary, #0f172a);
      border: 1px solid var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.08));
    }
    .dsh-task-markdown pre {
      margin: 6px 0;
      padding: 6px 8px;
      background: var(--dsw-alias-surface-elevation-2, rgba(0, 0, 0, 0.05));
      border: 1px solid var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.08));
      border-radius: 6px;
      overflow-x: auto;
      font-size: 11px;
      line-height: 1.4;
    }
    .dsh-task-markdown pre code {
      padding: 0;
      background: transparent;
      border: none;
      font-size: inherit;
      color: inherit;
    }
    .dsh-task-markdown blockquote {
      margin: 4px 0 6px 0;
      padding: 2px 8px;
      border-left: 3px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb);
      background: var(--dsw-alias-surface-elevation-1, rgba(0, 0, 0, 0.02));
      color: var(--dsw-alias-label-secondary, #64748b);
      border-radius: 0 4px 4px 0;
    }
    .dsh-task-markdown a {
      color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #2563eb);
      text-decoration: none;
    }
    .dsh-task-markdown a:hover {
      text-decoration: underline;
    }
    .dsh-task-markdown hr {
      margin: 6px 0;
      border: none;
      border-top: 1px solid var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.08));
    }
    .dsh-task-markdown table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
      font-size: 11px;
    }
    .dsh-task-markdown th,
    .dsh-task-markdown td {
      border: 1px solid var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.08));
      padding: 3px 6px;
      text-align: left;
    }
    .dsh-task-markdown th {
      background: var(--dsw-alias-surface-elevation-2, rgba(0, 0, 0, 0.04));
      font-weight: 600;
      color: var(--dsw-alias-label-primary, #0f172a);
    }
  `;
  document.head.appendChild(styleEl);
}

export function MarkdownContent({
  content,
  style,
  className,
}: {
  content?: string;
  style?: CSSProperties;
  className?: string;
}) {
  useEffect(() => {
    ensureMarkdownStyles();
  }, []);

  const html = useMemo(() => {
    if (!content) return "";
    try {
      return marked.parse(content, { gfm: true, breaks: true, async: false }) as string;
    } catch {
      return content;
    }
  }, [content]);

  if (!content) return null;

  return createElement("div", {
    className: ["dsh-task-markdown", className].filter(Boolean).join(" "),
    style,
    dangerouslySetInnerHTML: { __html: html },
  });
}
