import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { getReadyTasks, generateWorkspaceSummaryReport } from "./pipeline.js";
import type {
  ProjectTask,
  TaskConclusion,
  TaskPriority,
  TaskStatus,
  WorkspaceTasksDocument,
  WorkspaceTasksSummary,
} from "./types.ts";

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

function computeSummary(tasks: readonly ProjectTask[]): WorkspaceTasksSummary {
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
      sessionId?: string;
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
        // 仅在确有值时写入：undefined 自有属性无法通过 harness 的 lossless-JSON 快照校验
        ...(params.sessionId !== undefined ? { sessionId: params.sessionId } : {}),
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
      sessionId?: string;
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
    patch: Partial<Pick<ProjectTask, "title" | "description" | "status" | "priority" | "tags" | "assignee" | "dependsOn" | "sessionId">>
  ): Promise<ProjectTask | null> {
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    if (!task) return null;

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
    if (patch.sessionId !== undefined) {
      if (patch.sessionId) {
        task.sessionId = patch.sessionId;
      } else {
        delete task.sessionId;
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

    task.updatedAt = new Date().toISOString();
    await this.save(workspacePath, doc);
    return task;
  }

  static async addConclusion(
    workspacePath: string,
    taskId: string,
    conclusion: {
      summary: string;
      deliverables?: string[];
      insights?: string[];
      sessionId?: string;
    }
  ): Promise<ProjectTask | null> {
    const doc = await this.load(workspacePath);
    const task = doc.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    const conclusionSessionId = conclusion.sessionId ?? task.sessionId;
    const newConclusion: TaskConclusion = {
      id: `CONC-${Date.now()}`,
      summary: conclusion.summary.trim(),
      deliverables: conclusion.deliverables ?? [],
      insights: conclusion.insights ?? [],
      completedAt: new Date().toISOString(),
      // 仅在确有值时写入：undefined 自有属性无法通过 harness 的 lossless-JSON 快照校验
      ...(conclusionSessionId !== undefined ? { sessionId: conclusionSessionId } : {}),
    };

    task.conclusions.unshift(newConclusion);
    task.status = "done";
    task.updatedAt = new Date().toISOString();

    await this.save(workspacePath, doc);
    return task;
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

  static async getReadyTasks(workspacePath: string): Promise<ProjectTask[]> {
    const doc = await this.load(workspacePath);
    return getReadyTasks(doc.tasks);
  }

  static async exportSummaryReport(workspacePath: string): Promise<string> {
    const doc = await this.load(workspacePath);
    return generateWorkspaceSummaryReport(doc.tasks, workspacePath);
  }
}
