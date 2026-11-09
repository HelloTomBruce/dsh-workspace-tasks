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
});
