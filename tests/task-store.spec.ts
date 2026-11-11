import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { TaskStore, getTasksFilePath } from "../src/store/task-store.ts";

describe("TaskStore", () => {
  let tmpDir: string;
  const mockWorkspace = "/Users/zhangbei/code/my-project";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-tasks-test-"));
    process.env.DSH_TASKS_STORAGE_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.DSH_TASKS_STORAGE_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should initialize empty tasks list when file does not exist", async () => {
    const { tasks, summary } = await TaskStore.listTasks(mockWorkspace);
    expect(tasks).toEqual([]);
    expect(summary.total).toBe(0);
    expect(summary.inProgress).toBe(0);
  });

  it("should create tasks with auto-incremented ID without touching workspace repo", async () => {
    const task1 = await TaskStore.createTask(mockWorkspace, {
      title: "First task",
      description: "Do something",
      priority: "P0",
    });

    expect(task1.id).toBe("TASK-001");
    expect(task1.title).toBe("First task");
    expect(task1.status).toBe("todo");
    expect(task1.priority).toBe("P0");

    const task2 = await TaskStore.createTask(mockWorkspace, {
      title: "Second task",
    });
    expect(task2.id).toBe("TASK-002");

    const { tasks, summary } = await TaskStore.listTasks(mockWorkspace);
    expect(tasks.length).toBe(2);
    expect(summary.total).toBe(2);
    expect(summary.todo).toBe(2);

    // 确认文件完全写入独立存储目录 tmpDir，未写入 workspace
    const storedFiles = await fs.readdir(tmpDir);
    expect(storedFiles.length).toBe(1);
    expect(storedFiles[0]).toMatch(/my-project-.*\.json/);
  });

  it("should update task status and attributes", async () => {
    const task = await TaskStore.createTask(mockWorkspace, { title: "Coding task" });
    const updated = await TaskStore.updateTask(mockWorkspace, task.id, {
      status: "in_progress",
      priority: "P0",
    });

    expect(updated).not.toBeNull();
    expect(updated?.status).toBe("in_progress");
    expect(updated?.priority).toBe("P0");

    const { summary } = await TaskStore.listTasks(mockWorkspace);
    expect(summary.inProgress).toBe(1);
    expect(summary.todo).toBe(0);
  });

  it("should append execution conclusions and mark task as done", async () => {
    const task = await TaskStore.createTask(mockWorkspace, { title: "Feature implementation" });
    const concluded = await TaskStore.addConclusion(mockWorkspace, task.id, {
      summary: "Implemented auth route and passed tests",
      deliverables: ["src/auth.ts", "tests/auth.spec.ts"],
      insights: ["JWT token expiry handled properly"],
    });

    expect(concluded).not.toBeNull();
    expect(concluded?.status).toBe("done");
    expect(concluded?.conclusions.length).toBe(1);
    expect(concluded?.conclusions[0]?.summary).toBe("Implemented auth route and passed tests");
    expect(concluded?.conclusions[0]?.deliverables).toContain("src/auth.ts");

    const { summary } = await TaskStore.listTasks(mockWorkspace);
    expect(summary.done).toBe(1);
  });

  it("should support batch creating tasks via createTasks", async () => {
    const created = await TaskStore.createTasks(mockWorkspace, [
      { title: "Design DB schema", priority: "P0" },
      { title: "Implement API", priority: "P1" },
      { title: "Write tests", priority: "P2" },
    ]);

    expect(created.length).toBe(3);
    expect(created[0]?.id).toBe("TASK-001");
    expect(created[1]?.id).toBe("TASK-002");
    expect(created[2]?.id).toBe("TASK-003");

    const { tasks, summary } = await TaskStore.listTasks(mockWorkspace);
    expect(summary.total).toBe(3);
    expect(tasks[0]?.id).toBe("TASK-001");
    expect(tasks[1]?.id).toBe("TASK-002");
    expect(tasks[2]?.id).toBe("TASK-003");
  });

  it("should archive task and exclude from active total summary", async () => {
    const task = await TaskStore.createTask(mockWorkspace, { title: "Completed task" });
    await TaskStore.updateTask(mockWorkspace, task.id, { status: "done" });
    const archived = await TaskStore.archiveTask(mockWorkspace, task.id);

    expect(archived).not.toBeNull();
    expect(archived?.status).toBe("archived");

    const { summary } = await TaskStore.listTasks(mockWorkspace);
    expect(summary.total).toBe(0); // Active total excludes archived
    expect(summary.archived).toBe(1);
    expect(summary.done).toBe(0);
  });

  it("should delete task", async () => {
    const task = await TaskStore.createTask(mockWorkspace, { title: "Temporary task" });
    const deleted = await TaskStore.deleteTask(mockWorkspace, task.id);
    expect(deleted).toBe(true);

    const { tasks } = await TaskStore.listTasks(mockWorkspace);
    expect(tasks.length).toBe(0);
  });

  it("should create and update tasks with dependsOn dependencies", async () => {
    const task1 = await TaskStore.createTask(mockWorkspace, { title: "Base module" });
    const task2 = await TaskStore.createTask(mockWorkspace, {
      title: "Dependent module",
      dependsOn: [task1.id, "   ", task1.id], // 包含空格和重复项
    });

    expect(task2.dependsOn).toEqual([task1.id]);

    const updated = await TaskStore.updateTask(mockWorkspace, task2.id, {
      dependsOn: [task1.id, "TASK-999"],
    });
    expect(updated?.dependsOn).toEqual([task1.id, "TASK-999"]);

    // 清空依赖
    const cleared = await TaskStore.updateTask(mockWorkspace, task2.id, {
      dependsOn: [],
    });
    expect(cleared?.dependsOn).toBeUndefined();
  });

  it("should create and update tasks with tags", async () => {
    const task = await TaskStore.createTask(mockWorkspace, {
      title: "Tagged task",
      tags: ["frontend", " ui ", "frontend"], // duplicate & untrimmed
    });
    expect(task.tags).toEqual(["frontend", "ui"]);

    const updated = await TaskStore.updateTask(mockWorkspace, task.id, {
      tags: ["backend", "api"],
    });
    expect(updated?.tags).toEqual(["backend", "api"]);

    // Clear tags
    const cleared = await TaskStore.updateTask(mockWorkspace, task.id, {
      tags: [],
    });
    expect(cleared?.tags).toBeUndefined();
  });

  it("should return ready tasks and export summary report", async () => {
    const task1 = await TaskStore.createTask(mockWorkspace, { title: "Step 1" });
    const task2 = await TaskStore.createTask(mockWorkspace, {
      title: "Step 2",
      dependsOn: [task1.id],
    });

    // Initially task1 is ready, task2 is not
    let ready = await TaskStore.getReadyTasks(mockWorkspace);
    expect(ready.map((t) => t.id)).toEqual([task1.id]);

    // Complete task1
    await TaskStore.addConclusion(mockWorkspace, task1.id, {
      summary: "Completed step 1",
      deliverables: ["dist/index.js"],
      insights: ["Step 1 is smooth"],
    });

    // Now task2 is ready
    ready = await TaskStore.getReadyTasks(mockWorkspace);
    expect(ready.map((t) => t.id)).toEqual([task2.id]);

    // Export report
    const report = await TaskStore.exportSummaryReport(mockWorkspace);
    expect(report).toContain("工作区交付与工程总结报告");
    expect(report).toContain("dist/index.js");
    expect(report).toContain("Step 1 is smooth");
  });

  it("should append decisions immutably and supersede without rewriting", async () => {
    const task = await TaskStore.createTask(mockWorkspace, { title: "Design storage format" });

    const d1 = await TaskStore.addDecision(mockWorkspace, task.id, {
      title: "Use JSON file storage",
      rationale: "Simple and human-readable; no DB dependency for MVP",
      alternatives: ["SQLite", "LevelDB"],
      actor: "agent",
      sessionId: "session-abc",
    });
    expect(d1?.id).toMatch(/^DEC-/);

    // append-only: decisionLog 头部是新记录，旧记录原样保留
    const log1 = await TaskStore.listDecisions(mockWorkspace, task.id);
    expect(log1.length).toBe(1);

    const d2 = await TaskStore.supersedeDecision(mockWorkspace, task.id, d1!.id, {
      title: "Use JSON file storage with atomic write",
      rationale: "Write to temp file then rename to avoid partial writes",
      actor: "agent",
    });
    expect(d2).not.toBeNull();

    const log2 = await TaskStore.listDecisions(mockWorkspace, task.id);
    expect(log2.length).toBe(2);
    expect(log2[0]?.id).toBe(d2?.id);
    // 旧决策正文未被改写，仅打 supersededBy 标记
    expect(log2[1]?.title).toBe("Use JSON file storage");
    expect(log2[1]?.rationale).toContain("human-readable");
    expect(log2[1]?.supersededBy).toBe(d2?.id);

    // 已被取代的决策不能再次 supersede
    const d3 = await TaskStore.supersedeDecision(mockWorkspace, task.id, d1!.id, {
      title: "Yet another",
      rationale: "should fail",
    });
    expect(d3).toBeNull();
  });

  it("should keep decisions readable when sessionId dangles", async () => {
    const task = await TaskStore.createTask(mockWorkspace, { title: "Record with session ref" });
    await TaskStore.addDecision(mockWorkspace, task.id, {
      title: "Append-only decision log",
      rationale: "Decisions must survive session deletion",
      sessionId: "session-will-be-deleted",
    });

    // 模拟会话删除：直接从磁盘文档中把 sessionId 改成悬挂值（模拟不可反查）
    const filePath = getTasksFilePath(mockWorkspace);
    const raw = JSON.parse(await fs.readFile(filePath, "utf-8"));
    raw.tasks[0].decisionLog[0].sessionId = "session-deleted-xyz";
    await fs.writeFile(filePath, JSON.stringify(raw), "utf-8");

    const log = await TaskStore.listDecisions(mockWorkspace, task.id);
    expect(log.length).toBe(1);
    // 决策内容完整自包含，不受 sessionId 悬挂影响
    expect(log[0]?.title).toBe("Append-only decision log");
    expect(log[0]?.rationale).toBe("Decisions must survive session deletion");
    expect(log[0]?.sessionId).toBe("session-deleted-xyz");
  });

  it("should return null when decision targets missing task", async () => {
    const rec = await TaskStore.addDecision(mockWorkspace, "TASK-999", {
      title: "Orphan",
      rationale: "no task",
    });
    expect(rec).toBeNull();
  });

  it("should record append-only checkpoints for updates, conclusions and decisions", async () => {
    const task = await TaskStore.createTask(mockWorkspace, { title: "Traced task" });
    await TaskStore.updateTask(mockWorkspace, task.id, { status: "in_progress", priority: "P0" });
    await TaskStore.updateTask(mockWorkspace, task.id, { status: "in_progress", priority: "P0" }); // 无变化不产生事件
    await TaskStore.addConclusion(mockWorkspace, task.id, { summary: "done work" });
    await TaskStore.addDecision(mockWorkspace, task.id, { title: "Pick approach A", rationale: "cheaper" });

    const history = await TaskStore.getTaskHistory(mockWorkspace, task.id);
    const fields = history.map((h) => h.field);

    // 最新在前
    expect(history[0]?.field).toBe("decision");
    expect(fields).toContain("conclusion");
    expect(fields).toContain("status");
    expect(fields).toContain("priority");

    // status 事件记录了 from → to 快照
    const statusEvents = history.filter((h) => h.field === "status");
    expect(statusEvents.length).toBe(2); // todo→in_progress 与 in_progress→done
    expect(statusEvents.at(-1)?.from).toBe('"todo"');
    expect(statusEvents.at(-1)?.to).toBe('"in_progress"');
    expect(statusEvents[0]?.from).toBe('"in_progress"');
    expect(statusEvents[0]?.to).toBe('"done"');

    // append-only：重复调用不覆盖历史
    const history2 = await TaskStore.getTaskHistory(mockWorkspace, task.id);
    expect(history2.length).toBe(history.length);
  });

  it("should return empty history for unknown task", async () => {
    expect(await TaskStore.getTaskHistory(mockWorkspace, "TASK-999")).toEqual([]);
  });

  it("should add and resolve cross-workspace trace refs with dangling fallback", async () => {
    // 源工作区：建一个已完成任务
    const sourceWorkspace = "/Users/zhangbei/code/source-project";
    const sourceTask = await TaskStore.createTask(sourceWorkspace, { title: "Source design task" });
    await TaskStore.addConclusion(sourceWorkspace, sourceTask.id, {
      summary: "Source design concluded",
      deliverables: ["design.md"],
    });

    // 本工作区引用它
    const task = await TaskStore.createTask(mockWorkspace, { title: "Consumer task" });
    const updated = await TaskStore.addTraceRef(mockWorkspace, task.id, {
      workspacePath: sourceWorkspace,
      taskId: sourceTask.id,
      note: "Reuse this design decision",
    });
    expect(updated?.traceRefs?.length).toBe(1);

    // 重复添加同引用去重
    const deduped = await TaskStore.addTraceRef(mockWorkspace, task.id, {
      workspacePath: sourceWorkspace,
      taskId: sourceTask.id,
      note: "updated note",
    });
    expect(deduped?.traceRefs?.length).toBe(1);
    expect(deduped?.traceRefs?.[0]?.note).toBe("updated note");

    // 正常解析：拿到来源标题与结论摘要
    const refs = await TaskStore.resolveTraceRefs(mockWorkspace, task.id);
    expect(refs?.[0]?.resolved?.title).toBe("Source design task");
    expect(refs?.[0]?.resolved?.latestSummary).toBe("Source design concluded");
    expect(refs?.[0]?.resolved?.dangling).toBeUndefined();

    // 悬挂：来源任务被删除后引用仍保留，仅标记 dangling
    await TaskStore.deleteTask(sourceWorkspace, sourceTask.id);
    const danglingRefs = await TaskStore.resolveTraceRefs(mockWorkspace, task.id);
    expect(danglingRefs?.length).toBe(1);
    expect(danglingRefs?.[0]?.resolved?.dangling).toBe(true);

    // 悬挂：来源工作区路径不存在同样降级，不抛错
    await TaskStore.addTraceRef(mockWorkspace, task.id, {
      workspacePath: "/nonexistent/workspace/path",
      taskId: "TASK-001",
    });
    const mixed = await TaskStore.resolveTraceRefs(mockWorkspace, task.id);
    expect(mixed?.length).toBe(2);
    expect(mixed?.every((r) => r.resolved?.dangling)).toBe(true);
  });

  it("should reject invalid trace refs", async () => {
    const task = await TaskStore.createTask(mockWorkspace, { title: "Guard task" });
    expect(await TaskStore.addTraceRef(mockWorkspace, task.id, { workspacePath: "  ", taskId: "TASK-001" })).toBeNull();
    expect(await TaskStore.addTraceRef(mockWorkspace, task.id, { workspacePath: "/tmp/x", taskId: " " })).toBeNull();
    expect(await TaskStore.addTraceRef(mockWorkspace, "TASK-999", { workspacePath: "/tmp/x", taskId: "TASK-001" })).toBeNull();
  });

  describe("claim/lease 认领锁", () => {
    it("update 转入 in_progress 时自动加锁并落 checkpoint", async () => {
      const task = await TaskStore.createTask(mockWorkspace, { title: "Claimable task" });
      const updated = await TaskStore.updateTask(
        mockWorkspace,
        task.id,
        { status: "in_progress" },
        { claimOwner: "agent@sess-a", sessionHint: "sess-a-full" }
      );

      expect(updated?.claim?.owner).toBe("agent@sess-a");
      expect(updated?.claim?.sessionHint).toBe("sess-a-full");
      expect(new Date(updated!.claim!.leaseUntil).getTime()).toBeGreaterThan(Date.now());

      const history = await TaskStore.getTaskHistory(mockWorkspace, task.id);
      const claimEvent = history.find((h) => h.field === "claim");
      expect(claimEvent).toBeDefined();
      expect(claimEvent?.from).toBe("null");
      expect(JSON.parse(claimEvent!.to).owner).toBe("agent@sess-a");
    });

    it("他人活跃锁冲突：updateTask 抛 ClaimConflictError，claimTask 返回结构化 conflict", async () => {
      const task = await TaskStore.createTask(mockWorkspace, { title: "Contended task" });
      await TaskStore.claimTask(mockWorkspace, task.id, { owner: "agent@sess-a" });

      await expect(
        TaskStore.updateTask(mockWorkspace, task.id, { status: "in_progress" }, { claimOwner: "agent@sess-b" })
      ).rejects.toMatchObject({ name: "ClaimConflictError", taskId: task.id });

      const result = await TaskStore.claimTask(mockWorkspace, task.id, { owner: "agent@sess-b" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("conflict");
        expect(result.claim?.owner).toBe("agent@sess-a");
      }

      // 冲突不会污染任务状态
      const { tasks } = await TaskStore.listTasks(mockWorkspace);
      expect(tasks[0]?.status).toBe("todo");
      expect(tasks[0]?.claim?.owner).toBe("agent@sess-a");
    });

    it("同一 owner 重复认领即续租：claimedAt 保留，leaseUntil 延长", async () => {
      const task = await TaskStore.createTask(mockWorkspace, { title: "Renew task" });
      const first = await TaskStore.claimTask(mockWorkspace, task.id, { owner: "agent@sess-a", leaseMinutes: 1 });
      expect(first.ok).toBe(true);
      const firstClaim = first.ok ? first.task.claim! : undefined;

      // 人为把租约拨快到即将过期，再续租
      const doc = await TaskStore.load(mockWorkspace);
      const t = doc.tasks.find((x) => x.id === task.id)!;
      t.claim!.leaseUntil = new Date(Date.now() + 5_000).toISOString();
      await TaskStore.save(mockWorkspace, doc);

      const renewed = await TaskStore.claimTask(mockWorkspace, task.id, { owner: "agent@sess-a", leaseMinutes: 60 });
      expect(renewed.ok).toBe(true);
      if (renewed.ok) {
        expect(renewed.task.claim?.claimedAt).toBe(firstClaim?.claimedAt);
        expect(new Date(renewed.task.claim!.leaseUntil).getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
      }
    });

    it("租约过期后惰性释放：他人可直接认领，无需任何定时器", async () => {
      const task = await TaskStore.createTask(mockWorkspace, { title: "Expired lease task" });
      await TaskStore.claimTask(mockWorkspace, task.id, { owner: "agent@sess-a" });

      // 构造已过期租约
      const doc = await TaskStore.load(mockWorkspace);
      const t = doc.tasks.find((x) => x.id === task.id)!;
      t.claim!.leaseUntil = new Date(Date.now() - 1_000).toISOString();
      await TaskStore.save(mockWorkspace, doc);

      const result = await TaskStore.claimTask(mockWorkspace, task.id, { owner: "agent@sess-b" });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.task.claim?.owner).toBe("agent@sess-b");
    });

    it("conclude 自动释放认领锁并落 checkpoint", async () => {
      const task = await TaskStore.createTask(mockWorkspace, { title: "Conclude release task" });
      await TaskStore.claimTask(mockWorkspace, task.id, { owner: "agent@sess-a" });

      const concluded = await TaskStore.addConclusion(mockWorkspace, task.id, { summary: "done" });
      expect(concluded?.status).toBe("done");
      expect(concluded?.claim).toBeUndefined();

      const history = await TaskStore.getTaskHistory(mockWorkspace, task.id);
      const releaseEvent = history.find((h) => h.field === "claim" && h.to === "null");
      expect(releaseEvent).toBeDefined();
    });

    it("releaseTask：owner 匹配释放 / 他人未 force 冲突 / force 强制释放 / 无锁幂等", async () => {
      const task = await TaskStore.createTask(mockWorkspace, { title: "Release task" });

      // 无锁幂等
      const noop = await TaskStore.releaseTask(mockWorkspace, task.id, { owner: "agent@sess-a" });
      expect(noop.ok).toBe(true);

      await TaskStore.claimTask(mockWorkspace, task.id, { owner: "agent@sess-a" });

      // 他人未 force → 冲突
      const conflict = await TaskStore.releaseTask(mockWorkspace, task.id, { owner: "agent@sess-b" });
      expect(conflict.ok).toBe(false);
      if (!conflict.ok) expect(conflict.reason).toBe("conflict");

      // force → 强制释放（UI 人力解锁死锁场景）
      const forced = await TaskStore.releaseTask(mockWorkspace, task.id, { owner: "human", force: true });
      expect(forced.ok).toBe(true);
      if (forced.ok) expect(forced.task.claim).toBeUndefined();

      // owner 本人释放
      await TaskStore.claimTask(mockWorkspace, task.id, { owner: "agent@sess-a" });
      const own = await TaskStore.releaseTask(mockWorkspace, task.id, { owner: "agent@sess-a" });
      expect(own.ok).toBe(true);
      if (own.ok) expect(own.task.claim).toBeUndefined();
    });

    it("getReadyTasks 排除被他人活跃锁定的任务，本人锁与过期锁不影响", async () => {
      const t1 = await TaskStore.createTask(mockWorkspace, { title: "Locked by other" });
      const t2 = await TaskStore.createTask(mockWorkspace, { title: "Locked by me" });
      const t3 = await TaskStore.createTask(mockWorkspace, { title: "Expired lock" });
      const t4 = await TaskStore.createTask(mockWorkspace, { title: "Free task" });

      await TaskStore.claimTask(mockWorkspace, t1.id, { owner: "agent@sess-a" });
      await TaskStore.claimTask(mockWorkspace, t2.id, { owner: "agent@sess-b" });
      await TaskStore.claimTask(mockWorkspace, t3.id, { owner: "agent@sess-a" });

      // t3 租约过期
      const doc = await TaskStore.load(mockWorkspace);
      doc.tasks.find((x) => x.id === t3.id)!.claim!.leaseUntil = new Date(Date.now() - 1_000).toISOString();
      await TaskStore.save(mockWorkspace, doc);

      // 以 sess-b 视角：t1 被他人锁定排除，t2 本人锁保留，t3 过期锁保留，t4 自由保留
      const ready = await TaskStore.getReadyTasks(mockWorkspace, { owner: "agent@sess-b" });
      const ids = ready.map((t) => t.id);
      expect(ids).not.toContain(t1.id);
      expect(ids).toContain(t2.id);
      expect(ids).toContain(t3.id);
      expect(ids).toContain(t4.id);

      // 无 owner 视角（如 UI 就绪横幅）：所有活跃锁任务都排除
      const readyNoOwner = await TaskStore.getReadyTasks(mockWorkspace);
      const idsNoOwner = readyNoOwner.map((t) => t.id);
      expect(idsNoOwner).not.toContain(t1.id);
      expect(idsNoOwner).not.toContain(t2.id);
      expect(idsNoOwner).toContain(t3.id);
      expect(idsNoOwner).toContain(t4.id);
    });

    it("状态转入 blocked 保留锁，转入 todo/review/archived 释放锁", async () => {
      const task = await TaskStore.createTask(mockWorkspace, { title: "Status lock task" });
      await TaskStore.updateTask(mockWorkspace, task.id, { status: "in_progress" }, { claimOwner: "agent@sess-a" });

      // blocked 保留（等待人工拍板期间防止被捡走）
      const blocked = await TaskStore.updateTask(mockWorkspace, task.id, { status: "blocked" });
      expect(blocked?.claim?.owner).toBe("agent@sess-a");

      // 恢复 in_progress（同 owner 续租）
      const resumed = await TaskStore.updateTask(
        mockWorkspace,
        task.id,
        { status: "in_progress" },
        { claimOwner: "agent@sess-a" }
      );
      expect(resumed?.claim?.owner).toBe("agent@sess-a");

      // todo 释放
      const backToTodo = await TaskStore.updateTask(mockWorkspace, task.id, { status: "todo" });
      expect(backToTodo?.claim).toBeUndefined();
    });
  });

  describe("审批闭环（票拟→批红）", () => {
    it("requestApproval：任务转 blocked 并捕获 resumeStatus，落 checkpoint，blocked 保留 claim", async () => {
      const task = await TaskStore.createTask(mockWorkspace, { title: "Risky task" });
      await TaskStore.updateTask(mockWorkspace, task.id, { status: "in_progress" }, { claimOwner: "agent@sess-a" });

      const result = await TaskStore.requestApproval(mockWorkspace, task.id, {
        title: "是否删除旧数据表？",
        detail: "迁移需要清空 legacy_users 表，涉及 3.2 万行。",
        options: ["删除并继续迁移", "保留旧表只做增量"],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.approval.status).toBe("pending");
      expect(result.approval.resumeStatus).toBe("in_progress");
      expect(result.approval.options.length).toBe(2);
      expect(result.task.status).toBe("blocked");
      // blocked 期间 claim 保留，防止别的会话把待批任务捡走
      expect(result.task.claim?.owner).toBe("agent@sess-a");

      const history = await TaskStore.getTaskHistory(mockWorkspace, task.id);
      expect(history.some((h) => h.field === "approval.request")).toBe(true);
      expect(history.some((h) => h.field === "status" && h.to === '"blocked"')).toBe(true);
    });

    it("同一任务同时只允许一条 pending；终态任务与非法输入被拒绝", async () => {
      const task = await TaskStore.createTask(mockWorkspace, { title: "Dedup task" });
      const first = await TaskStore.requestApproval(mockWorkspace, task.id, {
        title: "问题 A",
        options: ["是", "否"],
      });
      expect(first.ok).toBe(true);

      const dup = await TaskStore.requestApproval(mockWorkspace, task.id, {
        title: "问题 B",
        options: ["甲", "乙"],
      });
      expect(dup.ok).toBe(false);
      if (!dup.ok) expect(dup.reason).toBe("pending-exists");

      // 选项不足 2 个 / 空标题
      expect(
        (await TaskStore.requestApproval(mockWorkspace, task.id, { title: " ", options: ["a", "b"] })).ok
      ).toBe(false);
      const doneTask = await TaskStore.createTask(mockWorkspace, { title: "Done task" });
      await TaskStore.addConclusion(mockWorkspace, doneTask.id, { summary: "finished" });
      const onDone = await TaskStore.requestApproval(mockWorkspace, doneTask.id, {
        title: "太晚的问题",
        options: ["x", "y"],
      });
      expect(onDone.ok).toBe(false);
      if (!onDone.ok) expect(onDone.reason).toBe("invalid");
    });

    it("resolveApproval 批准：自动落 DecisionRecord（含选项原话与未选项）、回链、状态恢复、checkpoint 齐全", async () => {
      const task = await TaskStore.createTask(mockWorkspace, { title: "Approval flow task" });
      await TaskStore.updateTask(mockWorkspace, task.id, { status: "in_progress" }, { claimOwner: "agent@sess-a" });
      const req = await TaskStore.requestApproval(mockWorkspace, task.id, {
        title: "改用 JSON 存储？",
        detail: "SQLite 引入原生依赖，部署成本高。",
        options: ["改用 JSON 文件", "坚持 SQLite", "换 better-sqlite3"],
      });
      if (!req.ok) throw new Error("request failed");
      const approvalId = req.approval.id;

      const resolved = await TaskStore.resolveApproval(mockWorkspace, task.id, approvalId, {
        optionId: "opt-1",
        note: "部署简单优先",
      });

      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      // 审批状态与回链
      expect(resolved.approval.status).toBe("approved");
      expect(resolved.approval.resolvedOptionId).toBe("opt-1");
      expect(resolved.approval.decisionId).toBe(resolved.decision!.id);
      // 状态恢复 resumeStatus，claim 保留
      expect(resolved.task.status).toBe("in_progress");
      expect(resolved.task.claim?.owner).toBe("agent@sess-a");
      // 决策自包含：标题、选项原话、背景、批注、未选项、actor=human
      const dec = resolved.decision!;
      expect(dec.title).toBe("拍板：改用 JSON 存储？");
      expect(dec.rationale).toContain("批准选项「改用 JSON 文件」");
      expect(dec.rationale).toContain("SQLite 引入原生依赖");
      expect(dec.rationale).toContain("部署简单优先");
      expect(dec.alternatives).toEqual(["坚持 SQLite", "换 better-sqlite3"]);
      expect(dec.actor).toBe("human");

      // 决策进入任务决策日志（append-only 头部）
      const decisions = await TaskStore.listDecisions(mockWorkspace, task.id);
      expect(decisions[0]?.id).toBe(dec.id);

      // checkpoint 齐全：approval.resolve + decision + status 恢复
      const history = await TaskStore.getTaskHistory(mockWorkspace, task.id);
      expect(history.some((h) => h.field === "approval.resolve" && h.to.includes('"approved"'))).toBe(true);
      expect(history.some((h) => h.field === "decision" && h.to.includes(dec.id))).toBe(true);
      expect(history.some((h) => h.field === "status" && h.to === '"in_progress"')).toBe(true);

      // 已批准的请求不能再次批红
      const again = await TaskStore.resolveApproval(mockWorkspace, task.id, approvalId, { optionId: "opt-2" });
      expect(again.ok).toBe(false);
      if (!again.ok) expect(again.reason).toBe("not-pending");
    });

    it("resolveApproval：非法选项与不存在审批的防护", async () => {
      const task = await TaskStore.createTask(mockWorkspace, { title: "Guard approval task" });
      const req = await TaskStore.requestApproval(mockWorkspace, task.id, {
        title: "选一个",
        options: ["A", "B"],
      });
      if (!req.ok) throw new Error("request failed");

      const badOption = await TaskStore.resolveApproval(mockWorkspace, task.id, req.approval.id, {
        optionId: "opt-99",
      });
      expect(badOption.ok).toBe(false);
      if (!badOption.ok) expect(badOption.reason).toBe("invalid-option");

      const missing = await TaskStore.resolveApproval(mockWorkspace, task.id, "APR-000-x", { optionId: "opt-1" });
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.reason).toBe("not-found");

      // 防护失败不破坏原状态
      const { tasks } = await TaskStore.listTasks(mockWorkspace);
      expect(tasks[0]?.status).toBe("blocked");
      expect(tasks[0]?.approvals?.[0]?.status).toBe("pending");
    });

    it("rejectApproval 驳回：不落决策、保持 blocked、记录备注", async () => {
      const task = await TaskStore.createTask(mockWorkspace, { title: "Reject task" });
      const req = await TaskStore.requestApproval(mockWorkspace, task.id, {
        title: "对外发布 v2？",
        options: ["立即发布", "下周发布"],
      });
      if (!req.ok) throw new Error("request failed");

      const rejected = await TaskStore.rejectApproval(mockWorkspace, task.id, req.approval.id, {
        note: "等合规评审结束再议",
      });
      expect(rejected.ok).toBe(true);
      if (!rejected.ok) return;
      expect(rejected.approval.status).toBe("rejected");
      expect(rejected.approval.resolveNote).toBe("等合规评审结束再议");
      expect(rejected.task.status).toBe("blocked");

      // 不落任何决策
      const decisions = await TaskStore.listDecisions(mockWorkspace, task.id);
      expect(decisions.length).toBe(0);

      // 驳回后可以发起新的请求（重新规划）
      const second = await TaskStore.requestApproval(mockWorkspace, task.id, {
        title: "只做内部灰度？",
        options: ["灰度 10%", "暂停发布"],
      });
      expect(second.ok).toBe(true);
    });

    it("listPendingApprovals 跨任务收集待批请求", async () => {
      const t1 = await TaskStore.createTask(mockWorkspace, { title: "Task one" });
      const t2 = await TaskStore.createTask(mockWorkspace, { title: "Task two" });
      await TaskStore.createTask(mockWorkspace, { title: "Task three" });

      await TaskStore.requestApproval(mockWorkspace, t1.id, { title: "Q1", options: ["a", "b"] });
      await TaskStore.requestApproval(mockWorkspace, t2.id, { title: "Q2", options: ["c", "d"] });

      const pending = await TaskStore.listPendingApprovals(mockWorkspace);
      expect(pending.length).toBe(2);
      expect(pending.map((p) => p.taskId).sort()).toEqual([t1.id, t2.id]);
      expect(pending[0]?.taskTitle).toBeTruthy();
    });

    it("批红尊重最新状态：待批期间被 conclude/archive 的任务不被复活", async () => {
      const task = await TaskStore.createTask(mockWorkspace, { title: "Stale approval task" });
      await TaskStore.updateTask(mockWorkspace, task.id, { status: "in_progress" }, { claimOwner: "agent@sess-a" });
      const req = await TaskStore.requestApproval(mockWorkspace, task.id, {
        title: "继续吗？",
        options: ["继续", "停"],
      });
      if (!req.ok) throw new Error("request failed");

      // 待批期间任务被人通过其他路径完成了
      await TaskStore.addConclusion(mockWorkspace, task.id, { summary: "人工直接做完了" });

      const resolved = await TaskStore.resolveApproval(mockWorkspace, task.id, req.approval.id, {
        optionId: "opt-1",
      });
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      // 决策照常落盘（批红的价值仍在），但状态尊重 done，不复活为 in_progress
      expect(resolved.decision).toBeDefined();
      expect(resolved.task.status).toBe("done");
      const decisions = await TaskStore.listDecisions(mockWorkspace, task.id);
      expect(decisions[0]?.title).toBe("拍板：继续吗？");
    });
  });
});
