/**
 * 中台（主区域）→ 右栏看板的跨界跳转挂单信道。
 *
 * 为什么需要它：点击中台卡片时右栏看板可能尚未挂载（openTab 后 React 异步渲染），
 * 同步派发的 CustomEvent 会丢进虚空。改为「先写挂单槽 + 看板挂载时主动消费」，
 * 事件路径只负责看板已打开时的即时响应。挂单带新鲜期，过期自动作废。
 */
export interface PendingNav {
    workspacePath: string;
    taskId?: string;
    at: number;
}
export declare function setPendingNav(nav: {
    workspacePath: string;
    taskId?: string;
}): void;
/** 消费挂单：取出即清除；过期返回 null 并顺手清理 */
export declare function consumePendingNav(): PendingNav | null;
//# sourceMappingURL=pending-nav.d.ts.map