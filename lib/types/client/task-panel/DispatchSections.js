import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { dispatchLogEmptyStyle, dispatchLogHopStyle, dispatchLogPanelStyle, dispatchLogRowStyle, dispatchLogTaskStyle, dispatchLogTimeStyle, dispatchLogTitleStyle, dispatchLogTriggerStyle, dispatchStatusBadgeStyle, menuDividerStyle, menuHeaderStyle, menuItemStyle, } from "./styles.js";
// ---------------- 自动派发区（三态开关 / 跨工作区开关 / 派发记录） ----------------
// 自动派发：模式切换（三态：👁️观察 / ⚡自动 / ⏸️关闭）——「⋯ 更多」菜单内的区块
export function DispatchModeMenuItems({ rules, onSetMode, }) {
    return (_jsxs(_Fragment, { children: [_jsx("div", { style: menuHeaderStyle, children: `自动派发 · 优先级 ${(rules.priorities ?? []).join("/") || "全部"} · 并发 ${rules.maxConcurrent}${rules.tagsExclude?.length ? ` · 排除 ${rules.tagsExclude.join(",")}` : ""}` }), ["observe", "auto", "off"].map((m) => (_jsxs("button", { type: "button", style: menuItemStyle(rules.mode === m), title: m === "observe"
                    ? "观察模式：任务完成后只记录「本会派发什么」，不自动发送（验证规则靠谱后再切自动）"
                    : m === "auto"
                        ? "自动模式：任务完成后自动派发下一个就绪任务（并发上限内）"
                        : "关闭自动派发", onClick: () => onSetMode(m), children: [m === "observe" ? "👁️ 观察模式" : m === "auto" ? "⚡ 自动派发" : "⏸️ 关闭派发", rules.mode === m ? " ✓" : ""] }, m))), _jsx("div", { style: menuDividerStyle })] }));
}
// 跨工作区派发开关菜单项（插件配置，宿主持久化；点击即 POST 立即生效）
export function CrossWorkspaceMenuItem({ on, onToggle, }) {
    return (_jsxs("button", { type: "button", style: menuItemStyle(on), title: "\u8DE8\u5DE5\u4F5C\u533A\u6D3E\u53D1\uFF1A\u5F00\u542F\u540E\u6267\u884C\u5668\u8F6E\u8BE2\u5168\u90E8\u5DE5\u4F5C\u533A\u7684\u6D3E\u53D1\u961F\u5217\uFF08\u9ED8\u8BA4\u53EA\u76EF\u5F53\u524D\u5DE5\u4F5C\u533A\uFF09\u3002\u7ACB\u5373\u751F\u6548\uFF0C\u65E0\u9700\u91CD\u542F", onClick: onToggle, children: ["\uD83C\uDF10 \u8DE8\u5DE5\u4F5C\u533A\u6D3E\u53D1", on ? " ✓" : ""] }));
}
// 自动派发记录（最近 20 条，可折叠）
export function DispatchLogSection({ log }) {
    return (_jsxs("div", { style: dispatchLogPanelStyle, children: [_jsx("div", { style: dispatchLogTitleStyle, children: `📜 自动派发记录（最近 ${Math.min(log.length, 20)} 条）` }), log.length === 0
                ? _jsx("div", { style: dispatchLogEmptyStyle, children: "\u6682\u65E0\u6D3E\u53D1\u8BB0\u5F55\u2014\u2014\u4EFB\u52A1\u5B8C\u6210\u540E\u5F15\u64CE\u4F1A\u6309\u89C4\u5219\u8BB0\u5F55\u5728\u8FD9\u91CC" })
                : log.slice(0, 20).map((entry) => (_jsxs("div", { style: dispatchLogRowStyle, children: [_jsx("span", { style: dispatchLogTimeStyle, children: new Date(entry.createdAt).toLocaleString() }), _jsx("span", { style: dispatchLogTaskStyle, title: entry.taskTitle ?? entry.taskId, children: `${entry.taskId}${entry.taskTitle ? `「${entry.taskTitle}」` : ""}` }), entry.triggerTaskId &&
                            _jsx("span", { style: dispatchLogTriggerStyle, children: `← ${entry.triggerTaskId}` }), _jsx("span", { style: dispatchLogHopStyle, children: `hop ${entry.hop}` }), _jsx("span", { style: dispatchStatusBadgeStyle(entry.status), children: entry.status === "queued"
                                ? "⏳ 排队中"
                                : entry.status === "sent"
                                    ? "✓ 已发送"
                                    : entry.status === "failed"
                                        ? "✕ 失败"
                                        : entry.status === "ignored"
                                            ? "— 已忽略"
                                            : entry.status === "tripped"
                                                ? "🛑 已熔断"
                                                : "👁️ 会派发" })] }, entry.id)))] }));
}
//# sourceMappingURL=DispatchSections.js.map