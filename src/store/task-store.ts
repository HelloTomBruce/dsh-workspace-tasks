import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { getReadyTasks, generateWorkspaceSummaryReport, isClaimActive, normalizeLeaseMinutes } from "./pipeline.js";
import type {
  ApprovalOption,
  ApprovalRequest,
  DecisionRecord,
  ProjectTask,
  TaskCheckpoint,
  TaskClaim,
  TraceRef,
  TaskConclusion,
  TaskPriority,
  TaskStatus,
  WorkspaceTasksDocument,
  WorkspaceTasksSummary,
} from "./types.ts";

/**
 * 认领冲突：任务被他人活跃锁定。这是多 Agent 并行的正常分支而非系统错误——
 * 工具层捕获后返回结构化响应（不抛异常），Agent 读到 owner 后应主动让开。
 */
export class ClaimConflictError extends Error {
  taskId: string;
  claim: TaskClaim;
  constructor(taskId: string, claim: TaskClaim) {
    super(`Task ${taskId} is actively claimed by ${claim.owner} (lease until ${claim.leaseUntil})`);
    this.name = "ClaimConflictError";
    this.taskId = taskId;
    this.claim = claim;
  }
}

export type ClaimResult =
  | { ok: true; task: ProjectTask }
  | { ok: false; reason: "not-found" | "conflict"; claim?: TaskClaim };

/**
 * 任务完成事件钩子：addConclusion 与 updateTask(status→done) 后触发。
 * 供自动派发引擎等订阅方使用；监听器同步调用、异常隔离（不影响主流程），
 * 异步工作由监听方自行 fire-and-forget。
 */
export type TaskDoneListener = (workspacePath: string, task: ProjectTask) => void;

const taskDoneListeners = new Set<TaskDoneListener>();

export function onTaskDone(listener: TaskDoneListener): () => void {
  taskDoneListeners.add(listener);
  return () => {
    taskDoneListeners.delete(listener);
  };
}

function emitTaskDone(workspacePath: string, task: ProjectTask): void {
  for (const listener of taskDoneListeners) {
    try {
      listener(workspacePath, task);
    } catch (err) {
      console.error("[dsh-workspace-tasks] onTaskDone listener error:", err);
    }
  }
}

export type ApprovalResult =
  | { ok: true; approval: ApprovalRequest; task: ProjectTask; decision?: DecisionRecord }
  | {
      ok: false;
      reason: "not-found" | "pending-exists" | "invalid" | "not-pending" | "invalid-option";
    };

/**
 * 获取本地持久化根目录：统一存放在用户本地 ~/.dsh/storages/workspace-tasks/，
 * 绝不污染用户代码仓库，也绝不参与 Git 跟踪与提交。
 */
export function getStorageDir(): string {
  return (
    process.env.DSH_TASKS_STORAGE_DIR ||
    path.join(os.homedir(), ".dsh", "storages", "workspace-tasks")
  );
}

/**
 * 根据工作区绝对路径生成唯一的本地存储文件名。
 * 格式形如：<工作区文件夹名>-<sha256前8位>.json
 */
export function getTasksFilePath(workspacePath: string): string {
  const normalized = path.resolve(workspacePath);
  const base = path.basename(normalized) || "root";
  const hash = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 8);
  const safeName = `${base.replace(/[^a-zA-Z0-9_\-\.]/g, "_")}-${hash}.json`;
  return path.join(getStorageDir(), safeName);
}

export function computeSummary(tasks: readonly ProjectTask[]): WorkspaceTasksSummary {
  let todo = 0;
  let inProgress = 0;
  let review = 0;
  let done = 0;
  let blocked = 0;
  let archived = 0;

  for (const t of tasks) {
    switch (t.status) {
      case "todo":
        todo++;
        break;
      case "in_progress":
        inProgress++;
        break;
      case "review":
        review++;
        break;
      case "done":
        done++;
        break;
      case "blocked":
        blocked++;
        break;
      case "archived":
        archived++;
        break;
    }
  }

  return {
    total: tasks.length - archived,
    todo,
    inProgress,
    review,
    done,
    blocked,
    archived,
  };
}

const CHECKPOINT_FIELDS = ["title", "description", "status", "priority", "assignee", "tags", "dependsOn"] as const;

function snapshot(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** 向任务追加检查点事件（append-only，最新在前） */
function pushCheckpoints(task: ProjectTask, events: Omit<TaskCheckpoint, "at">[]): void {
  if (events.length === 0) return;
  if (!task.history) task.history = [];
  const at = new Date().toISOString();
  task.history.unshift(...events.map((e) => ({ ...e, at })));
}

export class TaskStore {
  static async load(workspacePath: string): Promise<WorkspaceTasksDocument> {
    const filePath = getTasksFilePath(workspacePath);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const doc = JSON.parse(raw) as WorkspaceTasksDocument;
      return {
        version: doc.version ?? 1,
        workspacePath,
        tasks: Array.isArray(doc.tasks) ? doc.tasks : [],
        updatedAt: doc.updatedAt ?? new Date().toISOString(),
      };
    } catch {
      return {
        version: 1,
        workspacePath,
        tasks: [],
        updatedAt: new Date().toISOString(),
      };
    }
  }

  static async save(workspacePath: string, doc: WorkspaceTasksDocument): Promise<void> {
    const filePath = getTasksFilePath(workspacePath);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    doc.updatedAt = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(doc, null, 2), "utf-8");
  }

  static async listTasks(workspacePath: string): Promise<{
    tasks: ProjectTask[];
    summary: WorkspaceTasksSummary;
  }> {
    const doc = await this.load(workspacePath);
    return {
      tasks: doc.tasks,
      summary: computeSummary(doc.tasks),
    };
  }

  static async createTasks(
    workspacePath: string,
    items: Array<{
      title: string;
      description?: string;
      priority?: TaskPriority;
      tags?: string[];
      assignee?: string;
      dependsOn?: string[];
    }>
  ): Promise<ProjectTask[]> {
    if (!items || items.length === 0) return [];
    const doc = await this.load(workspacePath);
    let maxNum = doc.tasks.reduce((max, t) => {
      const match = t.id.match(/^TASK-(\d+)$/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 0);

    const created: ProjectTask[] = [];
    const now = new Date().toISOString();

    for (const params of items) {
      if (!params.title || !params.title.trim()) continue;
      maxNum++;
      const nextId = `TASK-${String(maxNum).padStart(3, "0")}`;
      const validDeps = Array.isArray(params.dependsOn)
        ? Array.from(new Set(params.dependsOn.map((d) => d.trim()).filter((d) => Boolean(d) && d !== nextId)))
        : [];
      const validTags = Array.isArray(params.tags)
        ? Array.from(new Set(params.tags.map((t) => t.trim()).filter(Boolean)))
        : [];
      const newTask: ProjectTask = {
        id: nextId,
        title: params.title.trim(),
        description: params.description?.trim() || "",
        status: "todo",
        priority: params.priority || "P1",
        ...(validTags.length > 0 ? { tags: validTags } : {}),
        assignee: params.assignee || "agent",
        ...(validDeps.length > 0 ? { dependsOn: validDeps } : {}),
        createdAt: now,
        updatedAt: now,
        conclusions: [],
      };
      created.push(newTask);
    }

    if (created.length > 0) {
      doc.tasks.unshift(...created);
      await this.save(workspacePath, doc);
    }
    return created;
  }

  static async createTask(
    workspacePath: string,
    params: {
      title: string;
      description?: string;
      priority?: TaskPriority;
      tags?: string[];
      assignee?: string;
      dependsOn?: string[];
    }
  ): Promise<ProjectTask> {
    const list = await this.createTasks(workspacePath, [params]);
    if (!list[0]) {
      throw new Error("Task title cannot be empty");
    }
    return list[0];
  }

  static async updateTask(
    workspacePath: string,
    taskId: string,
    patch: Partial<Pick<ProjectTask, "title" | "description" | "status" | "priority" | "tags" | "assignee" | "dependsOn">>,
    opts?: { claimOwner?: string; sessionHint?: string; leaseMinutes?: number }
  ): Promise<ProjectTask | null> {
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    // 认领冲突检查必须先于任何字段修改：转入 in_progress 且持他人活跃锁时直接拒绝
    const wantsClaim = patch.status === "in_progress" && Boolean(opts?.claimOwner?.trim());
    if (wantsClaim && isClaimActive(task.claim) && task.claim!.owner !== opts!.claimOwner!.trim()) {
      throw new ClaimConflictError(taskId, task.claim!);
    }

    // 记录变更前的快照，落盘前生成检查点事件
    const prevStatus = task.status;
    const before = new Map<string, unknown>();
    for (const f of CHECKPOINT_FIELDS) before.set(f, task[f]);
    const beforeClaim = snapshot(task.claim ?? null);

    if (patch.title !== undefined) task.title = patch.title.trim();
    if (patch.description !== undefined) task.description = patch.description.trim();
    if (patch.status !== undefined) task.status = patch.status;
    if (patch.priority !== undefined) task.priority = patch.priority;
    if (patch.assignee !== undefined) task.assignee = patch.assignee;
    if (patch.tags !== undefined) {
      const validTags = Array.isArray(patch.tags)
        ? Array.from(new Set(patch.tags.map((t) => t.trim()).filter(Boolean)))
        : [];
      if (validTags.length > 0) {
        task.tags = validTags;
      } else {
        delete task.tags;
      }
    }
    if (patch.dependsOn !== undefined) {
      const validDeps = Array.isArray(patch.dependsOn)
        ? Array.from(new Set(patch.dependsOn.map((d) => d.trim()).filter((d) => Boolean(d) && d !== taskId)))
        : [];
      if (validDeps.length > 0) {
        task.dependsOn = validDeps;
      } else {
        delete task.dependsOn;
      }
    }

    // 认领锁联动：转入 in_progress 加锁/续租；转入终态或 todo/review 释放；
    // blocked 保留锁（待批/待恢复期间防止被其他会话捡走，与审批闭环协同）
    if (wantsClaim) {
      const owner = opts!.claimOwner!.trim();
      const leaseMinutes = normalizeLeaseMinutes(opts!.leaseMinutes);
      const now = new Date();
      const sameOwner = task.claim?.owner === owner;
      task.claim = {
        owner,
        ...(opts!.sessionHint?.trim()
          ? { sessionHint: opts!.sessionHint.trim() }
          : sameOwner && task.claim?.sessionHint
            ? { sessionHint: task.claim.sessionHint }
            : {}),
        claimedAt: sameOwner && task.claim ? task.claim.claimedAt : now.toISOString(),
        leaseUntil: new Date(now.getTime() + leaseMinutes * 60_000).toISOString(),
      };
    } else if (patch.status && patch.status !== "in_progress" && patch.status !== "blocked" && task.claim) {
      delete task.claim;
    }

    task.updatedAt = new Date().toISOString();
    pushCheckpoints(task, [
      ...CHECKPOINT_FIELDS.filter((f) => snapshot(before.get(f)) !== snapshot(task[f])).map((f) => ({
        field: f,
        from: snapshot(before.get(f)),
        to: snapshot(task[f]),
      })),
      ...(snapshot(task.claim ?? null) !== beforeClaim
        ? [{ field: "claim", from: beforeClaim, to: snapshot(task.claim ?? null) }]
        : []),
    ]);
    await this.save(workspacePath, doc);
    // 状态首次进入 done 时发出完成事件（自动派发引擎等订阅方消费）
    if (prevStatus !== "done" && task.status === "done") {
      emitTaskDone(workspacePath, task);
    }
    return task;
  }

  /**
   * 显式认领任务（加锁/续租）。被他人活跃锁定时返回 conflict（结构化，不抛异常）。
   * 同一 owner 重复认领即续租：保留 claimedAt，仅延长 leaseUntil。
   */
  static async claimTask(
    workspacePath: string,
    taskId: string,
    opts: { owner: string; sessionHint?: string; leaseMinutes?: number }
  ): Promise<ClaimResult> {
    const owner = opts.owner?.trim();
    if (!owner) throw new Error("claimTask requires a non-empty owner");
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, reason: "not-found" };
    if (isClaimActive(task.claim) && task.claim!.owner !== owner) {
      return { ok: false, reason: "conflict", claim: task.claim };
    }
    const leaseMinutes = normalizeLeaseMinutes(opts.leaseMinutes);
    const now = new Date();
    const sameOwner = task.claim?.owner === owner;
    const beforeClaim = snapshot(task.claim ?? null);
    task.claim = {
      owner,
      ...(opts.sessionHint?.trim()
        ? { sessionHint: opts.sessionHint.trim() }
        : sameOwner && task.claim?.sessionHint
          ? { sessionHint: task.claim.sessionHint }
          : {}),
      claimedAt: sameOwner && task.claim ? task.claim.claimedAt : now.toISOString(),
      leaseUntil: new Date(now.getTime() + leaseMinutes * 60_000).toISOString(),
    };
    task.updatedAt = now.toISOString();
    pushCheckpoints(task, [{ field: "claim", from: beforeClaim, to: snapshot(task.claim) }]);
    await this.save(workspacePath, doc);
    return { ok: true, task };
  }

  /**
   * 释放认领锁。幂等：无锁直接成功；锁已过期视为可释放并顺手清理；
   * 活跃锁仅允许 owner 本人或 force（UI 人力强制释放死锁）解除。
   */
  static async releaseTask(
    workspacePath: string,
    taskId: string,
    opts?: { owner?: string; force?: boolean }
  ): Promise<ClaimResult> {
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, reason: "not-found" };
    if (!task.claim) return { ok: true, task };
    const active = isClaimActive(task.claim);
    const owner = opts?.owner?.trim();
    if (active && !opts?.force && (!owner || task.claim.owner !== owner)) {
      return { ok: false, reason: "conflict", claim: task.claim };
    }
    const beforeClaim = snapshot(task.claim);
    delete task.claim;
    task.updatedAt = new Date().toISOString();
    pushCheckpoints(task, [{ field: "claim", from: beforeClaim, to: "null" }]);
    await this.save(workspacePath, doc);
    return { ok: true, task };
  }

  /**
   * 查询任务过程检查点（append-only 事件日志，最新在前）。
   */
  static async getTaskHistory(workspacePath: string, taskId: string): Promise<TaskCheckpoint[]> {
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    return task?.history ?? [];
  }

  /**
   * 添加跨工作区痕迹引用（只读）。引用存于本工作区任务上，与被引用方完全解耦；
   * 解析（resolveTraceRefs）失败时引用仍保留，仅标记悬挂。
   */
  static async addTraceRef(
    workspacePath: string,
    taskId: string,
    ref: { workspacePath: string; taskId: string; note?: string }
  ): Promise<ProjectTask | null> {
    if (!ref.workspacePath?.trim() || !ref.taskId?.trim()) return null;
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    if (!task.traceRefs) task.traceRefs = [];
    const normalized = {
      workspacePath: path.resolve(ref.workspacePath.trim()),
      taskId: ref.taskId.trim(),
      ...(ref.note?.trim() ? { note: ref.note.trim() } : {}),
    };
    // 去重：同 workspace+taskId 的引用只保留一条（note 以最后一次为准）
    task.traceRefs = task.traceRefs.filter(
      (r) => !(r.workspacePath === normalized.workspacePath && r.taskId === normalized.taskId)
    );
    task.traceRefs.push(normalized);
    task.updatedAt = new Date().toISOString();
    pushCheckpoints(task, [
      { field: "traceRefs", from: "null", to: snapshot(normalized) },
    ]);
    await this.save(workspacePath, doc);
    return task;
  }

  /**
   * 解析任务上的跨工作区引用：读取来源工作区任务，填充 resolved
   * （title + 最新结论摘要）；来源不可达时标记 dangling，不抛错、不丢引用。
   */
  static async resolveTraceRefs(
    workspacePath: string,
    taskId: string
  ): Promise<TraceRef[] | null> {
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    const refs = task.traceRefs ?? [];
    return Promise.all(
      refs.map(async (ref) => {
        try {
          const sourceDoc = await this.load(ref.workspacePath);
          const source = sourceDoc.tasks.find((t) => t.id === ref.taskId);
          if (!source) {
            return { ...ref, resolved: { title: "", dangling: true } };
          }
          return {
            ...ref,
            resolved: {
              title: source.title,
              latestSummary: source.conclusions[0]?.summary,
            },
          };
        } catch {
          return { ...ref, resolved: { title: "", dangling: true } };
        }
      })
    );
  }

  static async addConclusion(
    workspacePath: string,
    taskId: string,
    conclusion: {
      summary: string;
      deliverables?: string[];
      insights?: string[];
    }
  ): Promise<ProjectTask | null> {
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    const newConclusion: TaskConclusion = {
      id: `CONC-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      summary: conclusion.summary.trim(),
      deliverables: conclusion.deliverables ?? [],
      insights: conclusion.insights ?? [],
      completedAt: new Date().toISOString(),
    };

    task.conclusions.unshift(newConclusion);
    const prevStatus = task.status;
    task.status = "done";
    // 结单即释放认领锁（无论 owner 是谁）：工作已结束，锁不应残留
    const beforeClaim = snapshot(task.claim ?? null);
    if (task.claim) delete task.claim;
    task.updatedAt = new Date().toISOString();
    pushCheckpoints(task, [
      { field: "conclusion", from: "null", to: snapshot({ id: newConclusion.id, summary: newConclusion.summary }) },
      ...(prevStatus !== "done" ? [{ field: "status", from: snapshot(prevStatus), to: snapshot("done") }] : []),
      ...(beforeClaim !== "null" ? [{ field: "claim", from: beforeClaim, to: "null" }] : []),
    ]);

    await this.save(workspacePath, doc);
    // 结单即完成事件（自动派发引擎在此触发就绪重算）
    emitTaskDone(workspacePath, task);
    return task;
  }

  /**
   * 追加决策记录（append-only）。决策正文一旦写入即不可改写；
   * 若对同一问题改主意，请用 supersedeDecision 生成新决策并建立 supersededBy 链。
   * sessionId 仅为装饰性溯源线索，可悬挂，不参与任何读取依赖。
   */
  static async addDecision(
    workspacePath: string,
    taskId: string,
    decision: {
      title: string;
      rationale: string;
      alternatives?: string[];
      actor?: string;
      sessionId?: string;
    }
  ): Promise<DecisionRecord | null> {
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    const record: DecisionRecord = {
      id: `DEC-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      title: decision.title.trim(),
      rationale: decision.rationale.trim(),
      ...(Array.isArray(decision.alternatives) && decision.alternatives.length > 0
        ? { alternatives: decision.alternatives.map((a) => a.trim()).filter(Boolean) }
        : {}),
      ...(decision.actor?.trim() ? { actor: decision.actor.trim() } : {}),
      ...(decision.sessionId?.trim() ? { sessionId: decision.sessionId.trim() } : {}),
      decidedAt: new Date().toISOString(),
    };

    if (!task.decisionLog) task.decisionLog = [];
    task.decisionLog.unshift(record);
    task.updatedAt = new Date().toISOString();
    pushCheckpoints(task, [
      { field: "decision", from: "null", to: snapshot({ id: record.id, title: record.title }) },
    ]);

    await this.save(workspacePath, doc);
    return record;
  }

  /**
   * 取代（supersede）一条既有决策：仅给旧记录打上 supersededBy 标记，不改写其正文；
   * 并以新决策的身份追加一条新记录（newDecision 完整自包含），建立演进链。
   * 返回新决策记录；旧决策不存在或已被取代时返回 null。
   */
  static async supersedeDecision(
    workspacePath: string,
    taskId: string,
    supersededDecisionId: string,
    newDecision: {
      title: string;
      rationale: string;
      alternatives?: string[];
      actor?: string;
      sessionId?: string;
    }
  ): Promise<DecisionRecord | null> {
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    const log = task.decisionLog ?? [];
    const old = log.find((d) => d.id === supersededDecisionId);
    if (!old || old.supersededBy) return null;

    const record = await this.addDecision(workspacePath, taskId, newDecision);
    if (!record) return null;

    // addDecision 重新 load/save 过，需要再次定位旧记录补标记
    const doc2 = await this.load(workspacePath);
    const task2 = doc2.tasks.find((t) => t.id === taskId);
    const old2 = task2?.decisionLog?.find((d) => d.id === supersededDecisionId);
    const new2 = task2?.decisionLog?.find((d) => d.id === record.id);
    if (!task2 || !old2 || !new2) return record;

    old2.supersededBy = new2.id;
    task2.updatedAt = new Date().toISOString();
    pushCheckpoints(task2, [
      { field: "decision.supersededBy", from: "null", to: snapshot({ decision: old2.id, supersededBy: new2.id }) },
    ]);
    await this.save(workspacePath, doc2);
    return new2;
  }

  /**
   * 查询任务决策日志（含被 supersede 的历史），按 decidedAt 倒序。
   * sessionId 悬挂与否不影响读取——决策内容全部自包含。
   */
  static async listDecisions(workspacePath: string, taskId: string): Promise<DecisionRecord[]> {
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    return task?.decisionLog ?? [];
  }

  /**
   * 发起决策请求（票拟）：任务随即转入 blocked 挂起（零消耗），resumeStatus 记录原状态。
   * 同一任务同时只允许一条 pending（去重：一件事只问一次）；
   * done/archived 终态任务不允许发起。options 至少 2 个候选。
   * 锁语义：blocked 保留 claim，待批期间其他会话不会把任务捡走。
   */
  static async requestApproval(
    workspacePath: string,
    taskId: string,
    req: { title: string; detail?: string; options: string[] }
  ): Promise<ApprovalResult> {
    const title = req.title?.trim();
    const labels = Array.isArray(req.options) ? req.options.map((o) => o.trim()).filter(Boolean) : [];
    if (!title || labels.length < 2) return { ok: false, reason: "invalid" };

    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, reason: "not-found" };
    if (task.status === "done" || task.status === "archived") return { ok: false, reason: "invalid" };
    if ((task.approvals ?? []).some((a) => a.status === "pending")) {
      return { ok: false, reason: "pending-exists" };
    }

    const now = new Date().toISOString();
    const options: ApprovalOption[] = labels.map((label, i) => ({ id: `opt-${i + 1}`, label }));
    const approval: ApprovalRequest = {
      id: `APR-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      title,
      ...(req.detail?.trim() ? { detail: req.detail.trim() } : {}),
      options,
      status: "pending",
      // 已 blocked 的任务再次发起时，恢复原状的目标视为 in_progress（继续干活）
      resumeStatus: task.status === "blocked" ? "in_progress" : task.status,
      createdAt: now,
    };

    if (!task.approvals) task.approvals = [];
    task.approvals.unshift(approval);
    const prevStatus = task.status;
    task.status = "blocked";
    task.updatedAt = now;
    pushCheckpoints(task, [
      { field: "approval.request", from: "null", to: snapshot({ id: approval.id, title: approval.title }) },
      ...(prevStatus !== "blocked"
        ? [{ field: "status", from: snapshot(prevStatus), to: snapshot("blocked") }]
        : []),
    ]);
    await this.save(workspacePath, doc);
    return { ok: true, approval, task };
  }

  /**
   * 批红（批准）：标记审批通过，自动落一条 DecisionRecord
   * （标题「拍板：…」，rationale 含选中选项原话与背景，actor 默认 human，
   * alternatives 收录未被选中的选项），decisionId 回链到审批记录，
   * 任务状态恢复 resumeStatus。仅接受 pending 状态的请求。
   */
  static async resolveApproval(
    workspacePath: string,
    taskId: string,
    approvalId: string,
    resolution: { optionId: string; note?: string; actor?: string }
  ): Promise<ApprovalResult> {
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, reason: "not-found" };
    const approval = (task.approvals ?? []).find((a) => a.id === approvalId);
    if (!approval) return { ok: false, reason: "not-found" };
    if (approval.status !== "pending") return { ok: false, reason: "not-pending" };
    const option = approval.options.find((o) => o.id === resolution.optionId);
    if (!option) return { ok: false, reason: "invalid-option" };

    const now = new Date().toISOString();
    approval.status = "approved";
    approval.resolvedOptionId = option.id;
    if (resolution.note?.trim()) approval.resolveNote = resolution.note.trim();
    approval.resolvedAt = now;

    // 批准即决策：自包含落盘（选项原话 + 背景 + 批注），未被选中的选项进入 alternatives
    const record: DecisionRecord = {
      id: `DEC-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      title: `拍板：${approval.title}`,
      rationale: [
        `批准选项「${option.label}」。`,
        approval.detail ? `背景：${approval.detail}` : null,
        resolution.note?.trim() ? `批注：${resolution.note.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
      alternatives: approval.options.filter((o) => o.id !== option.id).map((o) => o.label),
      actor: resolution.actor?.trim() || "human",
      decidedAt: now,
    };
    if (!task.decisionLog) task.decisionLog = [];
    task.decisionLog.unshift(record);
    approval.decisionId = record.id;

    // 恢复挂起前状态（通常 in_progress），Agent 被唤醒后凭决策记录无缝续跑。
    // 仅当任务仍停留在 blocked 时才恢复：待批期间若人已通过其他路径改变状态
    // （conclude 完成 / archive 归档 / 手动改状态），尊重最新状态，批红只落决策不复活任务
    const prevStatus = task.status;
    const shouldResume = prevStatus === "blocked";
    if (shouldResume) {
      task.status = approval.resumeStatus;
    }
    task.updatedAt = now;
    pushCheckpoints(task, [
      {
        field: "approval.resolve",
        from: snapshot({ id: approval.id, status: "pending" }),
        to: snapshot({ id: approval.id, status: "approved", option: option.label, decisionId: record.id }),
      },
      { field: "decision", from: "null", to: snapshot({ id: record.id, title: record.title }) },
      ...(shouldResume && prevStatus !== approval.resumeStatus
        ? [{ field: "status", from: snapshot(prevStatus), to: snapshot(approval.resumeStatus) }]
        : []),
    ]);
    await this.save(workspacePath, doc);
    return { ok: true, approval, task, decision: record };
  }

  /**
   * 驳回：不落决策，任务保持 blocked，等待 Agent 重新规划后发起新的请求。
   */
  static async rejectApproval(
    workspacePath: string,
    taskId: string,
    approvalId: string,
    opts?: { note?: string }
  ): Promise<ApprovalResult> {
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, reason: "not-found" };
    const approval = (task.approvals ?? []).find((a) => a.id === approvalId);
    if (!approval) return { ok: false, reason: "not-found" };
    if (approval.status !== "pending") return { ok: false, reason: "not-pending" };

    const now = new Date().toISOString();
    approval.status = "rejected";
    if (opts?.note?.trim()) approval.resolveNote = opts.note.trim();
    approval.resolvedAt = now;
    task.updatedAt = now;
    pushCheckpoints(task, [
      {
        field: "approval.resolve",
        from: snapshot({ id: approval.id, status: "pending" }),
        to: snapshot({ id: approval.id, status: "rejected", note: approval.resolveNote ?? null }),
      },
    ]);
    await this.save(workspacePath, doc);
    return { ok: true, approval, task };
  }

  /**
   * 跨任务收集所有 pending 审批（供看板「待拍板」横幅）。
   */
  static async listPendingApprovals(
    workspacePath: string
  ): Promise<Array<{ taskId: string; taskTitle: string; approval: ApprovalRequest }>> {
    const doc = await this.load(workspacePath);
    const out: Array<{ taskId: string; taskTitle: string; approval: ApprovalRequest }> = [];
    for (const t of doc.tasks) {
      if (t.status === "archived") continue;
      for (const a of t.approvals ?? []) {
        if (a.status === "pending") out.push({ taskId: t.id, taskTitle: t.title, approval: a });
      }
    }
    return out;
  }

  static async archiveTask(workspacePath: string, taskId: string): Promise<ProjectTask | null> {
    return this.updateTask(workspacePath, taskId, { status: "archived" });
  }

  static async deleteTask(workspacePath: string, taskId: string): Promise<boolean> {
    const doc = await this.load(workspacePath);
    const initialLen = doc.tasks.length;
    doc.tasks = doc.tasks.filter((t) => t.id !== taskId);
    if (doc.tasks.length === initialLen) return false;

    await this.save(workspacePath, doc);
    return true;
  }

  static async getReadyTasks(workspacePath: string, opts?: { owner?: string }): Promise<ProjectTask[]> {
    const doc = await this.load(workspacePath);
    return getReadyTasks(doc.tasks, opts);
  }

  static async exportSummaryReport(workspacePath: string): Promise<string> {
    const doc = await this.load(workspacePath);
    return generateWorkspaceSummaryReport(doc.tasks, workspacePath);
  }
}
