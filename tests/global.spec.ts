import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { TaskStore, getTasksFilePath } from "../src/store/task-store.ts";
import { DispatchEngine } from "../src/store/dispatch.ts";
import { listGlobalOverview } from "../src/store/global.ts";

describe("跨工作区全局聚合（中台视图）", () => {
  let tmpDir: string;
  const wsA = "/Users/zhangbei/code/proj-alpha";
  const wsB = "/Users/zhangbei/code/proj-beta";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-global-test-"));
    process.env.DSH_TASKS_STORAGE_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.DSH_TASKS_STORAGE_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("聚合多个工作区：summary/分组/待拍板标题/就绪预览", async () => {
    // 工作区 A：一个进行中（带锁）、一个待拍板、一个完成、一个就绪
    const inProgress = await TaskStore.createTask(wsA, { title: "A in-progress", priority: "P0" });
    await TaskStore.updateTask(wsA, inProgress.id, { status: "in_progress" }, { claimOwner: "agent@sess-x" });
    const approving = await TaskStore.createTask(wsA, { title: "A approval task" });
    await TaskStore.requestApproval(wsA, approving.id, {
      title: "删旧表？",
      options: ["删", "留"],
    });
    const doneOne = await TaskStore.createTask(wsA, { title: "A done" });
    await TaskStore.addConclusion(wsA, doneOne.id, { summary: "finished" });
    await TaskStore.createTask(wsA, { title: "A ready", priority: "P1" });

    // 工作区 B：一个 review、一个纯阻塞
    const reviewOne = await TaskStore.createTask(wsB, { title: "B review" });
    await TaskStore.updateTask(wsB, reviewOne.id, { status: "review" });
    const blockedOne = await TaskStore.createTask(wsB, { title: "B blocked" });
    await TaskStore.updateTask(wsB, blockedOne.id, { status: "blocked" });

    const overview = await listGlobalOverview();
    expect(overview.workspaces.length).toBe(2);

    const a = overview.workspaces.find((w) => w.workspacePath === wsA)!;
    expect(a.title).toBe("proj-alpha");
    expect(a.inProgress.length).toBe(1);
    expect(a.inProgress[0]?.claim?.owner).toBe("agent@sess-x");
    expect(a.pendingApprovals.length).toBe(1);
    expect(a.pendingApprovals[0]?.approval.title).toBe("删旧表？");
    expect(a.pendingApprovals[0]?.taskTitle).toBe("A approval task");
    expect(a.done.length).toBe(1);
    expect(a.readyPreview.count).toBe(1);
    expect(a.readyPreview.tasks[0]?.title).toBe("A ready");

    const b = overview.workspaces.find((w) => w.workspacePath === wsB)!;
    expect(b.review.length).toBe(1);
    expect(b.blocked.length).toBe(1);
    expect(b.pendingApprovals.length).toBe(0);

    // 汇总计数
    expect(overview.totals.pendingApprovals).toBe(1);
    expect(overview.totals.inProgress).toBe(1);
    expect(overview.totals.review).toBe(1);
    expect(overview.totals.done).toBe(1);
    expect(overview.totals.blocked).toBe(1);
    expect(overview.totals.ready).toBe(1);
  });

  it("排除 -dispatch.json 文件：派发配置不产生幻影工作区", async () => {
    await TaskStore.createTask(wsA, { title: "Real task" });
    // 只创建 dispatch 文件的"工作区"不应出现在聚合里
    await DispatchEngine.updateRules("/Users/zhangbei/code/ghost-project", { mode: "auto" });

    const overview = await listGlobalOverview();
    expect(overview.workspaces.length).toBe(1);
    expect(overview.workspaces[0]?.workspacePath).toBe(wsA);
  });

  it("坏 JSON 文件 dangling 降级：不抛错，产生降级条目", async () => {
    await TaskStore.createTask(wsA, { title: "Healthy" });
    // 手写一个损坏的 JSON 文件
    const badPath = path.join(tmpDir, "broken-ws-deadbeef.json");
    await fs.writeFile(badPath, "{ not valid json !!!", "utf-8");

    const overview = await listGlobalOverview();
    expect(overview.workspaces.length).toBe(2);
    const broken = overview.workspaces.find((w) => w.dangling);
    expect(broken).toBeDefined();
    expect(broken?.fileName).toBe("broken-ws-deadbeef.json");
    expect(broken?.summary.total).toBe(0);
    // 健康工作区不受影响
    expect(overview.workspaces.find((w) => w.workspacePath === wsA)?.summary.total).toBe(1);
  });

  it("dispatchMode 徽标：配置过 auto 的工作区显示 auto，未配置的显示默认 observe", async () => {
    await TaskStore.createTask(wsA, { title: "T" });
    await TaskStore.createTask(wsB, { title: "T" });
    await DispatchEngine.updateRules(wsB, { mode: "auto" });

    const overview = await listGlobalOverview();
    expect(overview.workspaces.find((w) => w.workspacePath === wsA)?.dispatchMode).toBe("observe");
    expect(overview.workspaces.find((w) => w.workspacePath === wsB)?.dispatchMode).toBe("auto");
  });

  it("活跃排序：updatedAt 最近的工作区排最前", async () => {
    // 直接写文件控制 updatedAt，消除时序敏感
    const docA = {
      version: 1,
      workspacePath: wsA,
      tasks: [],
      updatedAt: "2026-11-10T01:00:00.000Z",
    };
    const docB = {
      version: 1,
      workspacePath: wsB,
      tasks: [],
      updatedAt: "2026-11-11T09:00:00.000Z",
    };
    await fs.writeFile(getTasksFilePath(wsA), JSON.stringify(docA), "utf-8");
    await fs.writeFile(getTasksFilePath(wsB), JSON.stringify(docB), "utf-8");

    const overview = await listGlobalOverview();
    expect(overview.workspaces[0]?.workspacePath).toBe(wsB);
    expect(overview.workspaces[1]?.workspacePath).toBe(wsA);
  });

  it("存储目录不存在时返回空聚合（不抛错）", async () => {
    process.env.DSH_TASKS_STORAGE_DIR = path.join(tmpDir, "nonexistent-dir");
    const overview = await listGlobalOverview();
    expect(overview.workspaces).toEqual([]);
    expect(overview.totals.workspaces).toBe(0);
  });
});
