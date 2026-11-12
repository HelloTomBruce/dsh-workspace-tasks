import type { ProjectTask } from "../../store/types.ts";
import type { WorkspaceOverview } from "../../store/global.ts";
import type { WorkspaceCardHandlers } from "./types.ts";
export declare function WorkspaceCard({ ws, onOpenTask, handlers, flashGroup, }: {
    ws: WorkspaceOverview;
    onOpenTask: (t: ProjectTask) => void;
    handlers: WorkspaceCardHandlers;
    /** 顶部计数 chip 定位命中的分组 kind，命中卡片对应分组短暂高亮 */
    flashGroup?: string | null;
}): import("react").JSX.Element;
//# sourceMappingURL=WorkspaceCard.d.ts.map