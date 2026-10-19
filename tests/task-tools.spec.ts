import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { registerTaskTools } from "../src/tools/task-tools.ts";

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
    expect(batchRes.ok).toBe(true);
    expect(batchRes.tasks.length).toBe(2);
    expect(batchRes.tasks[0].id).toBe("TASK-002");
    expect(batchRes.tasks[1].id).toBe("TASK-003");
  });
});
