import fs from "node:fs/promises";
import path from "node:path";
import { getReadyTasks } from "./pipeline.js";
import { computeSummary, getStorageDir } from "./task-store.ts";
import { DispatchEngine } from "./dispatch.ts";
import type { DispatchRecord } from "./dispatch.ts";
import type { ApprovalRequest, ProjectTask, WorkspaceTasksDocument, WorkspaceTasksSummary } from "./types.ts";

/**
 * 跨工作区全局聚合（个人中台视图的数据层）：扫描存储目录里所有工作区任务文档，
 * 聚合出「人的注意力该去哪里」的一屏数据——待拍板 / 进行中 / 待验收 / 阻塞 / 就绪。
 *
 * 降级哲学（与 TraceRef 一致）：单个文件损坏/不可读只产生 dangling 条目，绝不抛错。
 * 只读：本模块没有任何写操作。
 */

/** 一个工作区的中台聚合视图 */
export interface WorkspaceOverview {
  workspacePath: string;
  /** 工作区文件夹名（展示用） */
  title: string;
  /** 损坏文件的降级标记：true 时其余字段为空壳 */
  dangling?: true;
  /** 损坏来源文件名（dangling 时展示） */
  fileName?: string;
  updatedAt: string;
  summary: WorkspaceTasksSummary;
  /** 待拍板：pending 审批（带票拟标题与完整任务对象，中台弹窗可直接批红） */
  pendingApprovals: Array<{ taskId: string; taskTitle: string; approval: ApprovalRequest; task: ProjectTask }>;
  /** 进行中（带认领锁信息） */
  inProgress: ProjectTask[];
  /** 待验收（review 状态） */
  review: ProjectTask[];
  /** 已完成未归档（「忘了验收」痛点：done 一直占着列表等归档） */
  done: ProjectTask[];
  /** 阻塞（无 pending 审批的纯阻塞） */
  blocked: ProjectTask[];
  /** 就绪预览：计数 + 前 3 条（已排除活跃锁任务） */
  readyPreview: { count: number; tasks: ProjectTask[] };
  /** 该工作区的自动派发模式徽标 */
  dispatchMode: "observe" | "auto" | "off";
}

/** 跨工作区最近动态条目（检查点/决策，stigmergy「读痕迹」的中台落地） */
export interface ActivityEntry {
  workspacePath: string;
  /** 工作区文件夹名（展示用） */
  wsTitle: string;
  taskId: string;
  taskTitle: string;
  kind: "checkpoint" | "decision";
  at: string;
  /** checkpoint：变更字段名 */
  field?: string;
  /** checkpoint：变更前后值快照（JSON 序列化原文，客户端负责可读化） */
  from?: string;
  to?: string;
  /** decision：决策标题与操作者 */
  decisionTitle?: string;
  actor?: string;
}

/** 跨工作区派发记录条目（观察模式的 would-dispatch 可供中台直接执行/忽略） */
export interface DispatchLogItem {
  workspacePath: string;
  wsTitle: string;
  record: DispatchRecord;
}

export interface GlobalOverview {
  generatedAt: string;
  workspaces: WorkspaceOverview[];
  /** 跨工作区汇总计数 */
  totals: {
    workspaces: number;
    pendingApprovals: number;
    inProgress: number;
    review: number;
    done: number;
    blocked: number;
    ready: number;
  };
  /** 跨工作区最近动态：检查点 + 决策，时间倒序，前 8 条 */
  recentActivity: ActivityEntry[];
  /** 跨工作区派发记录：时间倒序，前 10 条 */
  recentDispatches: DispatchLogItem[];
}

/** 扫描存储目录，返回所有工作区任务文档（排除 dispatch 文件；坏文件 parse 为 null）。供跨工作区派发取件复用。 */
export async function scanWorkspaceDocuments(): Promise<
  Array<{ fileName: string; doc: WorkspaceTasksDocument | null; mtime: string }>
> {
  const dir = getStorageDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const taskFiles = entries.filter((f) => f.endsWith(".json") && !f.endsWith("-dispatch.json"));
  const docs: Array<{ fileName: string; doc: WorkspaceTasksDocument | null; mtime: string }> = [];
  for (const fileName of taskFiles) {
    const filePath = path.join(dir, fileName);
    let mtime = "";
    try {
      const stat = await fs.stat(filePath);
      mtime = stat.mtime.toISOString();
    } catch {
      // stat 失败不阻塞
    }
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as WorkspaceTasksDocument;
      if (!parsed || !Array.isArray(parsed.tasks) || typeof parsed.workspacePath !== "string") {
        docs.push({ fileName, doc: null, mtime });
        continue;
      }
      docs.push({ fileName, doc: parsed, mtime });
    } catch {
      // 坏文件：dangling 降级，不抛错
      docs.push({ fileName, doc: null, mtime });
    }
  }
  return docs;
}

/** 聚合所有工作区的中台视图数据 */
export async function listGlobalOverview(): Promise<GlobalOverview> {
  const scanned = await scanWorkspaceDocuments();

  // 动态池与派发池：与工作区聚合同一趟扫描完成，dangling 工作区跳过
  const activityPool: ActivityEntry[] = [];
  const dispatchPool: DispatchLogItem[] = [];

  const workspaces: WorkspaceOverview[] = await Promise.all(
    scanned.map(async ({ fileName, doc, mtime }) => {
      if (!doc) {
        return {
          workspacePath: "",
          title: fileName.replace(/\.json$/, ""),
          dangling: true as const,
          fileName,
          updatedAt: mtime,
          summary: { total: 0, todo: 0, inProgress: 0, review: 0, done: 0, blocked: 0, archived: 0 },
          pendingApprovals: [],
          inProgress: [],
          review: [],
          done: [],
          blocked: [],
          readyPreview: { count: 0, tasks: [] },
          dispatchMode: "off" as const,
        };
      }

      const tasks = doc.tasks;
      const wsTitle = path.basename(doc.workspacePath) || doc.workspacePath;

      // 最近动态池：检查点（每任务最近 4 条，history 本就最新在前）+ 决策记录
      for (const task of tasks) {
        for (const c of (task.history ?? []).slice(0, 4)) {
          activityPool.push({
            workspacePath: doc.workspacePath,
            wsTitle,
            taskId: task.id,
            taskTitle: task.title,
            kind: "checkpoint",
            at: c.at,
            field: c.field,
            from: c.from,
            to: c.to,
          });
        }
        for (const d of task.decisionLog ?? []) {
          activityPool.push({
            workspacePath: doc.workspacePath,
            wsTitle,
            taskId: task.id,
            taskTitle: task.title,
            kind: "decision",
            at: d.decidedAt,
            decisionTitle: d.title,
            actor: d.actor,
          });
        }
      }

      // 派发记录池：读失败静默降级（不影响该工作区其余聚合）
      try {
        const logs = await DispatchEngine.listLog(doc.workspacePath, 10);
        for (const record of logs) {
          dispatchPool.push({ workspacePath: doc.workspacePath, wsTitle, record });
        }
      } catch {
        // 派发文件不可读：跳过
      }

      const hasPendingApproval = (t: ProjectTask) => (t.approvals ?? []).some((a) => a.status === "pending");
      // 就绪预览 = 此刻可派发的新活：只看 todo。
      // in_progress 已有归属在跑（卡片有专属「进行中」分组，重复出现是噪音），
      // review 待验收与 blocked 待拍板都是「等人的」而非「等 Agent 的」，各有专属分组
      const ready = getReadyTasks(tasks).filter((t) => t.status === "todo");

      let dispatchMode: "observe" | "auto" | "off" = "off";
      try {
        dispatchMode = (await DispatchEngine.getRules(doc.workspacePath)).mode;
      } catch {
        // 派发配置不可读时降级为 off 徽标
      }

      return {
        workspacePath: doc.workspacePath,
        title: path.basename(doc.workspacePath) || doc.workspacePath,
        updatedAt: doc.updatedAt || mtime,
        summary: computeSummary(tasks),
        pendingApprovals: tasks
          .filter((t) => t.status !== "archived" && hasPendingApproval(t))
          .map((t) => ({
            taskId: t.id,
            taskTitle: t.title,
            approval: (t.approvals ?? []).find((a) => a.status === "pending")!,
            task: t,
          })),
        inProgress: tasks.filter((t) => t.status === "in_progress"),
        review: tasks.filter((t) => t.status === "review"),
        done: tasks.filter((t) => t.status === "done"),
        blocked: tasks.filter((t) => t.status === "blocked" && !hasPendingApproval(t)),
        readyPreview: { count: ready.length, tasks: ready.slice(0, 3) },
        dispatchMode,
      };
    })
  );

  // 最近活跃的工作区排最前——最可能需要看
  workspaces.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // 动态/派发：跨工作区时间倒序后截断
  activityPool.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  dispatchPool.sort((a, b) => new Date(b.record.createdAt).getTime() - new Date(a.record.createdAt).getTime());

  const totals = {
    workspaces: workspaces.length,
    pendingApprovals: workspaces.reduce((n, w) => n + w.pendingApprovals.length, 0),
    inProgress: workspaces.reduce((n, w) => n + w.inProgress.length, 0),
    review: workspaces.reduce((n, w) => n + w.review.length, 0),
    done: workspaces.reduce((n, w) => n + w.done.length, 0),
    blocked: workspaces.reduce((n, w) => n + w.blocked.length, 0),
    ready: workspaces.reduce((n, w) => n + w.readyPreview.count, 0),
  };

  return {
    generatedAt: new Date().toISOString(),
    workspaces,
    totals,
    recentActivity: activityPool.slice(0, 8),
    recentDispatches: dispatchPool.slice(0, 10),
  };
}
