import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { TaskStore } from "../src/store/task-store.ts";

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

  it("should delete task", async () => {
    const task = await TaskStore.createTask(mockWorkspace, { title: "Temporary task" });
    const deleted = await TaskStore.deleteTask(mockWorkspace, task.id);
    expect(deleted).toBe(true);

    const { tasks } = await TaskStore.listTasks(mockWorkspace);
    expect(tasks.length).toBe(0);
  });
});
