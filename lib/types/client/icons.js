import { createElement } from "react";
export function TaskGuideIcon(props) {
    return createElement("svg", {
        width: 28,
        height: 28,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        ...props,
    }, createElement("rect", { x: 3, y: 3, width: 18, height: 18, rx: 3 }), createElement("path", { d: "M7 8h10M7 12h7M7 16h4" }), createElement("circle", { cx: 17, cy: 15, r: 2, fill: "currentColor" }));
}
export function TaskTabIcon(props) {
    return createElement("svg", {
        width: 14,
        height: 14,
        viewBox: "0 0 16 16",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.5,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        ...props,
    }, createElement("rect", { x: 2, y: 2, width: 12, height: 12, rx: 2 }), createElement("path", { d: "M5 5.5h6M5 8.5h4M5 11.5h3" }));
}
export function PlusIcon(props) {
    return createElement("svg", {
        width: 14,
        height: 14,
        viewBox: "0 0 16 16",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        ...props,
    }, createElement("path", { d: "M8 3v10M3 8h10" }));
}
export function RefreshIcon(props) {
    return createElement("svg", {
        width: 13,
        height: 13,
        viewBox: "0 0 16 16",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.6,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        ...props,
    }, createElement("path", { d: "M13.5 8a5.5 5.5 0 1 1-1.6-3.9L13.5 6" }), createElement("path", { d: "M13.5 2.5v3.5h-3.5" }));
}
//# sourceMappingURL=icons.js.map