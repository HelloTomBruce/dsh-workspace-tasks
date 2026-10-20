import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { registerTaskTools } from "../src/tools/task-tools.ts";

/**
 * Mirrors the dsh harness lossless-JSON snapshot boundary
 * (deepseek-harness packages/core/session/src/json.ts):
 * rejects undefined own-property values, non-finite numbers, -0,
 * exotic prototypes, sparse arrays and cyclic structures.
 */
function assertLosslessJson(value: unknown, path = "value", seen = new Set<object>()): void {
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error(`${path} is not a lossless JSON number`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`${path} is not lossless JSON (typeof ${typeof value})`);
  }
  if (seen.has(value as object)) throw new Error(`${path} is cyclic`);
  seen.add(value as object);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) assertLosslessJson(value[i], `${path}[${i}]`, seen);
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`${path} has a non-plain prototype`);
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) throw new Error(`${path}.${key} is undefined (dropped by JSON round-trip)`);
    assertLosslessJson(v, `${path}.${key}`, seen);
  }
}

describe("registerTaskTools", () => {
  let tmpDir: string;
  const mockWorkspace = "/Users/zhangbei/code/my-agent-project";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-tools-test-"));
    process.env.DSH_TASKS_STORAGE_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.DSH_TASKS_STORAGE_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should register workspace_task tool and execute actions without touching git", async () => {
    let registeredTool: any = null;
    const mockCtx: any = {
      tools: {
        register: (tool: any) => {
          registeredTool = tool;
          return () => {};
        },
      },
      systemPrompt: {
        section: () => () => {},
      },
    };

    registerTaskTools(mockCtx);
    expect(registeredTool).not.toBeNull();
    expect(registeredTool.name).toBe("workspace_task");
    expect(registeredTool.output).toBeDefined();
    expect(typeof registeredTool.output.render).toBe("function");
    expect(registeredTool.parameters.type).toBe("object");
    expect(registeredTool.parameters.properties).toBeDefined();

    // 1. Create task
    const createRes = await registeredTool.execute({
      action: "create",
      title: "Write documentation",
      description: "Document all endpoints",
      priority: "P0",
      workspacePath: mockWorkspace,
    });
    expect(createRes.ok).toBe(true);
    expect(createRes.task.id).toBe("TASK-001");

    // 2. Update task
    const updateRes = await registeredTool.execute({
      action: "update",
      taskId: "TASK-001",
      status: "in_progress",
      workspacePath: mockWorkspace,
    });
    expect(updateRes.ok).toBe(true);
    expect(updateRes.task.status).toBe("in_progress");

    // 3. Conclude task
    const concRes = await registeredTool.execute({
      action: "conclude",
      taskId: "TASK-001",
      summary: "Completed documentation with 100% API coverage",
      deliverables: ["docs/api.md"],
      insights: ["Keep router examples concise"],
      workspacePath: mockWorkspace,
    });
    expect(concRes.ok).toBe(true);
    expect(concRes.task.status).toBe("done");
    expect(concRes.task.conclusions.length).toBe(1);

    // 4. List tasks
    const listRes = await registeredTool.execute({
      action: "list",
      workspacePath: mockWorkspace,
    });
    expect(listRes.ok).toBe(true);
    expect(listRes.tasks.length).toBe(1);
    expect(listRes.summary.done).toBe(1);

    // 验证确实写入在本地全局目录，未在工作区新建文件
    const files = await fs.readdir(tmpDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/my-agent-project-.*\.json/);

    // 验证 output.render 输出格式
    const rendered = registeredTool.output.render({}, listRes);
    expect(Array.isArray(rendered)).toBe(true);
    expect(rendered[0].type).toBe("text");
    expect(rendered[0].text).toContain("TASK-001");

    // 5. Batch create tasks (AI decomposition simulation)
    const batchRes = await registeredTool.execute({
      action: "create",
      tasks: [
        { title: "Subtask 1: Parse schema", priority: "P0" },
        { title: "Subtask 2: Generate types", priority: "P1" },
      ],
      workspacePath: mockWorkspace,
    });
    // 6. Test auto resolution of workspace from exec.agent.session.header.cwd
    const sessionWorkspace = "/Users/zhangbei/code/dsh-browser";
    const autoCwdRes = await registeredTool.execute(
      {
        action: "create",
        title: "Auto session workspace task",
        priority: "P1",
      },
      {
        agent: {
          session: {
            header: {
              cwd: sessionWorkspace,
            },
          },
        },
      }
    );
    expect(autoCwdRes.ok).toBe(true);
    expect(autoCwdRes.workspacePath).toBe(sessionWorkspace);
    expect(autoCwdRes.task.id).toBe("TASK-001");

    // 7. Test archive action via tool
    const archiveRes = await registeredTool.execute({
      action: "archive",
      taskId: "TASK-001",
      workspacePath: mockWorkspace,
    });
    expect(archiveRes.ok).toBe(true);
    expect(archiveRes.task.status).toBe("archived");
  });

  it("should return lossless-JSON outputs for every action (harness snapshot boundary)", async () => {
    let registeredTool: any = null;
    const mockCtx: any = {
      tools: {
        register: (tool: any) => {
          registeredTool = tool;
          return () => {};
        },
      },
      systemPrompt: { section: () => () => {} },
    };
    registerTaskTools(mockCtx);

    const createRes = await registeredTool.execute({
      action: "create",
      title: "Lossless check",
      workspacePath: mockWorkspace,
    });
    expect(() => assertLosslessJson(createRes, "create")).not.toThrow();

    const batchRes = await registeredTool.execute({
      action: "create",
      tasks: [{ title: "Batch A" }, { title: "Batch B", priority: "P0" }],
      workspacePath: mockWorkspace,
    });
    expect(() => assertLosslessJson(batchRes, "batchCreate")).not.toThrow();

    const updateRes = await registeredTool.execute({
      action: "update",
      taskId: "TASK-001",
      status: "in_progress",
      workspacePath: mockWorkspace,
    });
    expect(() => assertLosslessJson(updateRes, "update")).not.toThrow();

    const concludeRes = await registeredTool.execute({
      action: "conclude",
      taskId: "TASK-001",
      summary: "done",
      workspacePath: mockWorkspace,
    });
    expect(() => assertLosslessJson(concludeRes, "conclude")).not.toThrow();

    const listRes = await registeredTool.execute({ action: "list", workspacePath: mockWorkspace });
    expect(() => assertLosslessJson(listRes, "list")).not.toThrow();

    const archiveRes = await registeredTool.execute({
      action: "archive",
      taskId: "TASK-002",
      workspacePath: mockWorkspace,
    });
    expect(() => assertLosslessJson(archiveRes, "archive")).not.toThrow();

    const deleteRes = await registeredTool.execute({
      action: "delete",
      taskId: "TASK-003",
      workspacePath: mockWorkspace,
    });
    expect(() => assertLosslessJson(deleteRes, "delete")).not.toThrow();
  });

  it("should support dependsOn in create, batch create and update", async () => {
    let registeredTool: any = null;
    const mockCtx: any = {
      tools: {
        register: (tool: any) => {
          registeredTool = tool;
          return () => {};
        },
      },
      systemPrompt: { section: () => () => {} },
    };
    registerTaskTools(mockCtx);

    const task1 = await registeredTool.execute({
      action: "create",
      title: "Step 1",
      workspacePath: mockWorkspace,
    });
    const task2 = await registeredTool.execute({
      action: "create",
      title: "Step 2",
      dependsOn: [task1.task.id],
      workspacePath: mockWorkspace,
    });

    expect(task2.task.dependsOn).toEqual(["TASK-001"]);
    expect(() => assertLosslessJson(task2, "createWithDeps")).not.toThrow();

    const batchRes = await registeredTool.execute({
      action: "create",
      tasks: [
        { title: "Step 3", dependsOn: [task1.task.id, task2.task.id] },
      ],
      workspacePath: mockWorkspace,
    });
    expect(batchRes.tasks[0].dependsOn).toEqual(["TASK-001", "TASK-002"]);
    expect(() => assertLosslessJson(batchRes, "batchCreateWithDeps")).not.toThrow();

    const updateRes = await registeredTool.execute({
      action: "update",
      taskId: "TASK-002",
      dependsOn: [],
      workspacePath: mockWorkspace,
    });
    expect(updateRes.task.dependsOn).toBeUndefined();
    expect(() => assertLosslessJson(updateRes, "updateDeps")).not.toThrow();
  });

  it("should support tags, get_ready_tasks and export_report actions", async () => {
    let registeredTool: any = null;
    const mockCtx: any = {
      tools: {
        register: (tool: any) => {
          registeredTool = tool;
          return () => {};
        },
      },
      systemPrompt: { section: () => () => {} },
    };
    registerTaskTools(mockCtx);

    // 1. Create task with tags
    const task1 = await registeredTool.execute({
      action: "create",
      title: "Build auth module",
      tags: ["backend", "security"],
      workspacePath: mockWorkspace,
    });
    expect(task1.task.tags).toEqual(["backend", "security"]);
    expect(() => assertLosslessJson(task1, "createWithTags")).not.toThrow();

    // 2. Create task2 depending on task1
    const task2 = await registeredTool.execute({
      action: "create",
      title: "Write auth tests",
      tags: ["test"],
      dependsOn: [task1.task.id],
      workspacePath: mockWorkspace,
    });
    expect(task2.task.tags).toEqual(["test"]);

    // 3. get_ready_tasks (only task1 is ready)
    const ready1 = await registeredTool.execute({
      action: "get_ready_tasks",
      workspacePath: mockWorkspace,
    });
    expect(ready1.ok).toBe(true);
    expect(ready1.count).toBe(1);
    expect(ready1.tasks[0].id).toBe(task1.task.id);
    expect(() => assertLosslessJson(ready1, "ready1")).not.toThrow();

    // 4. Conclude task1
    await registeredTool.execute({
      action: "conclude",
      taskId: task1.task.id,
      summary: "Auth module complete",
      deliverables: ["src/auth.ts"],
      insights: ["Always salt passwords"],
      workspacePath: mockWorkspace,
    });

    // 5. get_ready_tasks (now task2 is ready)
    const ready2 = await registeredTool.execute({
      action: "get_ready_tasks",
      workspacePath: mockWorkspace,
    });
    expect(ready2.count).toBe(1);
    expect(ready2.tasks[0].id).toBe(task2.task.id);
    expect(() => assertLosslessJson(ready2, "ready2")).not.toThrow();

    // 6. export_report
    const reportRes = await registeredTool.execute({
      action: "export_report",
      workspacePath: mockWorkspace,
    });
    expect(reportRes.ok).toBe(true);
    expect(reportRes.report).toContain("工作区交付与工程总结报告");
    expect(reportRes.report).toContain("src/auth.ts");
    expect(reportRes.report).toContain("Always salt passwords");
    expect(() => assertLosslessJson(reportRes, "exportReport")).not.toThrow();
  });
});
