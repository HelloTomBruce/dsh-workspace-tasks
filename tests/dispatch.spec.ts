import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { TaskStore, onTasksCreated } from "../src/store/task-store.ts";
import { DispatchEngine } from "../src/store/dispatch.ts";

describe("DispatchEngine 自动派发引擎", () => {
  let tmpDir: string;
  const mockWorkspace = "/Users/zhangbei/code/dispatch-project";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-dispatch-test-"));
    process.env.DSH_TASKS_STORAGE_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.DSH_TASKS_STORAGE_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function createTask(title: string, opts?: { priority?: "P0" | "P1" | "P2"; tags?: string[] }) {
    return TaskStore.createTask(mockWorkspace, { title, ...opts });
  }

  it("off 模式短路：有就绪任务也不派发", async () => {
    await createTask("Ready P0", { priority: "P0" });
    await DispatchEngine.updateRules(mockWorkspace, { mode: "off" });

    const record = await DispatchEngine.evaluate(mockWorkspace, "TASK-999");
    expect(record).toBeNull();
    const log = await DispatchEngine.listLog(mockWorkspace);
    expect(log.length).toBe(0);
  });

  it("observe 默认模式：只记录 would-dispatch，不进队列", async () => {
    await createTask("Ready P0", { priority: "P0" });

    const record = await DispatchEngine.evaluate(mockWorkspace);
    expect(record).not.toBeNull();
    expect(record?.mode).toBe("observe");
    expect(record?.status).toBe("would-dispatch");
    expect(record?.hop).toBe(1);

    const pending = await DispatchEngine.listPending(mockWorkspace);
    expect(pending.length).toBe(0);
  });

  it("规则过滤：P2 不派、tagsExclude 排除、whitelist 收紧", async () => {
    await createTask("P2 task", { priority: "P2" });
    await createTask("Excluded tag", { priority: "P0", tags: ["manual"] });
    const allowed = await createTask("Whitelisted", { priority: "P1" });

    await DispatchEngine.updateRules(mockWorkspace, {
      mode: "auto",
      tagsExclude: ["manual"],
      whitelist: [allowed.id],
    });

    const record = await DispatchEngine.evaluate(mockWorkspace);
    expect(record?.taskId).toBe(allowed.id);
  });

  it("auto 模式：queued 入队；maxConcurrent=1 闸门阻止连续派发", async () => {
    await createTask("First", { priority: "P0" });
    await createTask("Second", { priority: "P1" });
    await DispatchEngine.updateRules(mockWorkspace, { mode: "auto" });

    const first = await DispatchEngine.evaluate(mockWorkspace);
    expect(first?.status).toBe("queued");

    // 未 ack 时并发闸门生效：第二条不再派
    const second = await DispatchEngine.evaluate(mockWorkspace);
    expect(second).toBeNull();

    // ack sent 后闸门放开，派下一个
    await DispatchEngine.ack(mockWorkspace, first!.id, "sent");
    const third = await DispatchEngine.evaluate(mockWorkspace);
    expect(third).not.toBeNull();
    expect(third?.taskId).not.toBe(first?.taskId);
  });

  it("同任务去重：would-dispatch 未处理前不重复观察，ignored 后可重新观察", async () => {
    const task = await createTask("Observed task", { priority: "P0" });

    const first = await DispatchEngine.evaluate(mockWorkspace);
    expect(first?.status).toBe("would-dispatch");

    // 未处理前重复触发 → 不再记录
    const dup = await DispatchEngine.evaluate(mockWorkspace);
    expect(dup).toBeNull();
    expect((await DispatchEngine.listLog(mockWorkspace)).length).toBe(1);

    // 忽略后可重新观察
    await DispatchEngine.ack(mockWorkspace, first!.id, "ignored");
    const again = await DispatchEngine.evaluate(mockWorkspace);
    expect(again?.taskId).toBe(task.id);
    expect(again?.status).toBe("would-dispatch");
  });

  it("hop 链递增：完成 → 派发 → 再完成 → hop+1", async () => {
    const a = await createTask("A", { priority: "P0" });
    await createTask("B", { priority: "P0" });
    await createTask("C", { priority: "P0" });
    await DispatchEngine.updateRules(mockWorkspace, { mode: "auto" });

    // A 完成 → 派 B/C 中排在就绪队首者（同优先级同毫秒创建，不做顺序假设）
    const r1 = await DispatchEngine.evaluate(mockWorkspace, a.id);
    expect(r1).not.toBeNull();
    expect(r1?.taskId).not.toBe(a.id);
    expect(r1?.hop).toBe(1);
    await DispatchEngine.ack(mockWorkspace, r1!.id, "sent");
    await TaskStore.updateTask(mockWorkspace, r1!.taskId, { status: "in_progress" });

    // 被派任务完成 → 派下一个，hop = 2
    const r2 = await DispatchEngine.evaluate(mockWorkspace, r1!.taskId);
    expect(r2).not.toBeNull();
    expect(r2?.taskId).not.toBe(r1?.taskId);
    expect(r2?.hop).toBe(2);
    expect(r2?.triggerTaskId).toBe(r1?.taskId);
  });

  it("排除触发任务本身：即使它又变就绪也不自派", async () => {
    const a = await createTask("Self task", { priority: "P0" });
    // 模拟：A 完成后被重开（done → in_progress），引擎收到以 A 为触发源的事件
    const record = await DispatchEngine.evaluate(mockWorkspace, a.id);
    expect(record?.taskId ?? null).toBeNull();
  });

  it("ack 状态机：仅 queued/would-dispatch 可回执，重复回执拒绝", async () => {
    await createTask("Ack task", { priority: "P0" });
    await DispatchEngine.updateRules(mockWorkspace, { mode: "auto" });
    const record = await DispatchEngine.evaluate(mockWorkspace);
    expect(record?.status).toBe("queued");

    const acked = await DispatchEngine.ack(mockWorkspace, record!.id, "sent");
    expect(acked?.status).toBe("sent");
    expect(acked?.ackedAt).toBeTruthy();

    // 重复 ack / 不存在的 id
    expect(await DispatchEngine.ack(mockWorkspace, record!.id, "failed")).toBeNull();
    expect(await DispatchEngine.ack(mockWorkspace, "DSP-000-x", "sent")).toBeNull();
  });

  it("updateRules 清洗：非法 mode 忽略、maxConcurrent 收敛 1-8、空数组清空可选字段", async () => {
    const dirty = await DispatchEngine.updateRules(mockWorkspace, {
      mode: "turbo" as any,
      maxConcurrent: 99,
      tagsExclude: [" manual ", "", "manual"],
    });
    expect(dirty.mode).toBe("observe"); // 非法值不落
    expect(dirty.maxConcurrent).toBe(8);
    expect(dirty.tagsExclude).toEqual(["manual"]);

    const cleared = await DispatchEngine.updateRules(mockWorkspace, { tagsExclude: [], whitelist: [] });
    expect(cleared.tagsExclude).toBeUndefined();
    expect(cleared.whitelist).toBeUndefined();
  });

  it("端到端钩子：conclude 触发 onTaskDone → 引擎产生观察记录", async () => {
    const { onTaskDone } = await import("../src/store/task-store.ts");
    // 注意：createTask 必须逐个 await——并发创建会因 load/save 竞态丢任务
    const trigger = await createTask("Trigger task", { priority: "P0" });
    await createTask("Next ready", { priority: "P0" });

    const dispose = onTaskDone((wp, task) => {
      void DispatchEngine.evaluate(wp, task.id);
    });
    try {
      await TaskStore.addConclusion(mockWorkspace, trigger.id, { summary: "done" });
      // 引擎为 fire-and-forget：等待宏任务轮转
      await new Promise((resolve) => setTimeout(resolve, 50));

      const log = await DispatchEngine.listLog(mockWorkspace);
      expect(log.length).toBe(1);
      expect(log[0]?.taskTitle).toBe("Next ready");
      expect(log[0]?.triggerTaskId).toBe(trigger.id);
      expect(log[0]?.status).toBe("would-dispatch");
    } finally {
      dispose();
    }
  });

  it("blocked/review 任务不可派发：等人的活不叫醒 Agent", async () => {
    const blockedTask = await createTask("Awaiting approval", { priority: "P0" });
    await TaskStore.requestApproval(mockWorkspace, blockedTask.id, { title: "删吗？", options: ["删", "留"] });
    const reviewTask = await createTask("Awaiting review", { priority: "P0" });
    await TaskStore.updateTask(mockWorkspace, reviewTask.id, { status: "review" });
    const realReady = await createTask("Actually ready", { priority: "P1" });
    await DispatchEngine.updateRules(mockWorkspace, { mode: "auto" });

    const record = await DispatchEngine.evaluate(mockWorkspace);
    expect(record?.taskId).toBe(realReady.id);
  });

  it("TTL 熔断：hop 超过 8 层停止派发、记 tripped、目标任务转 blocked；人工忽略后可消告警", async () => {
    const trigger = await createTask("Chain source", { priority: "P0" });
    const target = await createTask("Chain target", { priority: "P0" });
    await DispatchEngine.updateRules(mockWorkspace, { mode: "auto" });

    // 构造一条已经 8 层的派发链（直接写 dispatch 文档）
    const doc = await DispatchEngine.load(mockWorkspace);
    doc.log.unshift({
      id: "DSP-seed-8",
      taskId: trigger.id,
      triggerTaskId: undefined,
      hop: 8,
      mode: "auto",
      status: "sent",
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      ackedAt: new Date(Date.now() - 50_000).toISOString(),
    });
    await DispatchEngine.save(mockWorkspace, doc);

    // 触发源完成 → hop 应为 9 → 熔断
    const tripped = await DispatchEngine.evaluate(mockWorkspace, trigger.id);
    expect(tripped).not.toBeNull();
    expect(tripped?.status).toBe("tripped");
    expect(tripped?.hop).toBe(9);
    expect(tripped?.taskId).toBe(target.id);

    // 不进入 queued 队列
    const pending = await DispatchEngine.listPending(mockWorkspace);
    expect(pending.length).toBe(0);

    // 目标任务被转 blocked（斩断失控链），检查点留痕
    const { tasks } = await TaskStore.listTasks(mockWorkspace);
    expect(tasks.find((t) => t.id === target.id)?.status).toBe("blocked");
    const history = await TaskStore.getTaskHistory(mockWorkspace, target.id);
    expect(history.some((h) => h.field === "status" && h.to === '"blocked"')).toBe(true);

    // 熔断后不会反复熔断同一目标（blocked 不再是候选）
    const again = await DispatchEngine.evaluate(mockWorkspace, trigger.id);
    expect(again).toBeNull();

    // 人工确认后忽略告警
    const dismissed = await DispatchEngine.ack(mockWorkspace, tripped!.id, "ignored");
    expect(dismissed?.status).toBe("ignored");
  });

  it("观察模式下 TTL 不熔断（观察无副作用，只记录）", async () => {
    const trigger = await createTask("Obs chain source", { priority: "P0" });
    await createTask("Obs chain target", { priority: "P0" });

    const doc = await DispatchEngine.load(mockWorkspace);
    doc.log.unshift({
      id: "DSP-obs-8",
      taskId: trigger.id,
      hop: 8,
      mode: "observe",
      status: "would-dispatch",
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await DispatchEngine.save(mockWorkspace, doc);

    const record = await DispatchEngine.evaluate(mockWorkspace, trigger.id);
    expect(record?.status).toBe("would-dispatch");
    expect(record?.hop).toBe(9);
  });

  it("updateRules 支持 staleHours（收敛 1-720）", async () => {
    const rules = await DispatchEngine.updateRules(mockWorkspace, { staleHours: 48 });
    expect(rules.staleHours).toBe(48);
    const clamped = await DispatchEngine.updateRules(mockWorkspace, { staleHours: 9999 });
    expect(clamped.staleHours).toBe(720);
  });

  it("创建触发：批量建卡触发评估，并发闸门保证最多派一条，hop 从 1 开始", async () => {
    await DispatchEngine.updateRules(mockWorkspace, { mode: "auto" });

    const dispose = onTasksCreated((wp) => {
      void DispatchEngine.evaluate(wp);
    });
    try {
      // 模拟需求拆解：一次批量建两张卡（都会触发，但整批只 emit 一次）
      await TaskStore.createTasks(mockWorkspace, [
        { title: "Created A", priority: "P0" },
        { title: "Created B", priority: "P0" },
      ]);
      await new Promise((r) => setTimeout(r, 50));

      const log = await DispatchEngine.listLog(mockWorkspace);
      expect(log.length).toBe(1);
      expect(log[0]?.status).toBe("queued");
      expect(log[0]?.hop).toBe(1); // 无触发链（人为起点），hop 从 1 开始
      expect(log[0]?.triggerTaskId).toBeUndefined();
    } finally {
      dispose();
    }
  });

  it("创建触发但全部不就绪（依赖未满足）：静默不派", async () => {
    const blocker = await createTask("Blocker", { priority: "P0" });
    // blocker 被他人活跃锁定（派过了），不作为候选；只验证「依赖未满足的新卡不派」
    await TaskStore.claimTask(mockWorkspace, blocker.id, { owner: "agent@other" });
    const dispose = onTasksCreated((wp) => {
      void DispatchEngine.evaluate(wp);
    });
    try {
      await TaskStore.createTask(mockWorkspace, {
        title: "Blocked by dep",
        priority: "P0",
        dependsOn: [blocker.id],
      });
      await new Promise((r) => setTimeout(r, 50));
      const log = await DispatchEngine.listLog(mockWorkspace);
      expect(log.length).toBe(0);
    } finally {
      dispose();
    }
  });
});
