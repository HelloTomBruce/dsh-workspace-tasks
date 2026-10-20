import { describe, it, expect } from "vitest";
import {
  getTaskDependencyStatus,
  isTaskReady,
  getReadyTasks,
  generateWorkspaceSummaryReport,
} from "../src/store/pipeline.js";
import { ProjectTask } from "../src/store/types.js";

describe("Pipeline & Readiness Engine", () => {
  const mockTasks: ProjectTask[] = [
    {
      id: "TASK-001",
      title: "基础服务搭建",
      status: "done",
      priority: "P0",
      createdAt: "2026-10-20T10:00:00Z",
      updatedAt: "2026-10-20T10:30:00Z",
      conclusions: [
        {
          id: "CONC-001",
          summary: "完成基础服务搭建",
          deliverables: ["src/server.ts", "package.json"],
          insights: ["记得保留端口重试逻辑"],
          completedAt: "2026-10-20T10:30:00Z",
          sessionId: "sess-12345678",
        },
      ],
    },
    {
      id: "TASK-002",
      title: "API 端点实现",
      status: "todo",
      priority: "P1",
      dependsOn: ["TASK-001"],
      createdAt: "2026-10-20T10:10:00Z",
      updatedAt: "2026-10-20T10:10:00Z",
      conclusions: [],
    },
    {
      id: "TASK-003",
      title: "前端页面渲染",
      status: "todo",
      priority: "P0",
      dependsOn: ["TASK-002"],
      createdAt: "2026-10-20T10:20:00Z",
      updatedAt: "2026-10-20T10:20:00Z",
      conclusions: [],
    },
    {
      id: "TASK-004",
      title: "文档编写 (无依赖)",
      status: "todo",
      priority: "P2",
      createdAt: "2026-10-20T10:05:00Z",
      updatedAt: "2026-10-20T10:05:00Z",
      conclusions: [],
    },
  ];

  it("should calculate task dependency status correctly", () => {
    // TASK-002 depends on TASK-001 (done) => ready
    const status2 = getTaskDependencyStatus(mockTasks[1], mockTasks);
    expect(status2.isReady).toBe(true);
    expect(status2.unfulfilledDeps).toEqual([]);

    // TASK-003 depends on TASK-002 (todo) => not ready
    const status3 = getTaskDependencyStatus(mockTasks[2], mockTasks);
    expect(status3.isReady).toBe(false);
    expect(status3.unfulfilledDeps).toEqual(["TASK-002"]);
  });

  it("should identify ready tasks and filter out done tasks", () => {
    expect(isTaskReady(mockTasks[0], mockTasks)).toBe(false); // TASK-001 is already done
    expect(isTaskReady(mockTasks[1], mockTasks)).toBe(true); // TASK-002 is todo, dep TASK-001 is done
    expect(isTaskReady(mockTasks[2], mockTasks)).toBe(false); // TASK-003 dep TASK-002 not done
    expect(isTaskReady(mockTasks[3], mockTasks)).toBe(true); // TASK-004 has no deps
  });

  it("should sort ready tasks by priority then createdAt", () => {
    const ready = getReadyTasks(mockTasks);
    // TASK-002 (P1) and TASK-004 (P2) are ready. P1 should come before P2.
    expect(ready.map((t) => t.id)).toEqual(["TASK-002", "TASK-004"]);
  });

  it("should generate a comprehensive workspace summary report", () => {
    const report = generateWorkspaceSummaryReport(mockTasks, "/test/workspace");
    expect(report).toContain("工作区交付与工程总结报告");
    expect(report).toContain("/test/workspace");
    expect(report).toContain("src/server.ts");
    expect(report).toContain("记得保留端口重试逻辑");
    expect(report).toContain("TASK-001");
    expect(report).toContain("TASK-002");
  });

  it("should exclude archived tasks from summary report", () => {
    const tasksWithArchived: ProjectTask[] = [
      ...mockTasks,
      {
        id: "TASK-099",
        title: "旧废弃功能",
        status: "archived",
        priority: "P2",
        createdAt: "2026-10-19T10:00:00Z",
        updatedAt: "2026-10-19T10:00:00Z",
        conclusions: [
          {
            id: "CONC-099",
            summary: "旧废弃结论",
            deliverables: ["legacy/file.ts"],
            insights: ["过时经验"],
            completedAt: "2026-10-19T10:00:00Z",
          },
        ],
      },
    ];
    const report = generateWorkspaceSummaryReport(tasksWithArchived, "/test/workspace");
    expect(report).not.toContain("TASK-099");
    expect(report).not.toContain("旧废弃功能");
    expect(report).not.toContain("legacy/file.ts");
    expect(report).not.toContain("过时经验");
  });
});
