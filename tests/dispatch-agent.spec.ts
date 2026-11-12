import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildDispatchPrompt, dispatchPromptToAgent, notifyApprovalResolved } from "../src/client/dispatch-agent";

describe("buildDispatchPrompt 提示词模板（单一来源）", () => {
  const task = { id: "TASK-009", title: "做个功能", description: "需求描述正文" };

  it("完整参数：含工作区根目录与任务详情", () => {
    const p = buildDispatchPrompt(task, { workspacePath: "/repo" });
    expect(p).toContain('请帮我执行工作区就绪任务 [TASK-009]: "做个功能"。');
    expect(p).toContain("【工作区根目录】：/repo");
    expect(p).toContain("任务详情：\n需求描述正文");
    expect(p).toContain("请先用 workspace_task 的 update 把状态置为 in_progress");
    expect(p).toContain("conclude 登记执行结论与交付物");
    expect(p).not.toContain("[自动派发]");
  });

  it("auto 模式：加 [自动派发] 前缀", () => {
    const p = buildDispatchPrompt(task, { workspacePath: "/repo", auto: true });
    expect(p.startsWith("[自动派发] 请帮我执行工作区就绪任务")).toBe(true);
  });

  it("最小参数：无 description 无 workspacePath 也不产生空段落", () => {
    const p = buildDispatchPrompt({ id: "T-1", title: "t" });
    expect(p).not.toContain("【工作区根目录】");
    expect(p).not.toContain("任务详情：");
    expect(p).toContain("请先用 workspace_task");
  });
});

/**
 * 统一派发通道的严格路由测试（串台 bug 回归保护）：
 * 指定 workspacePath 时，绝不退避到当前活跃会话。
 */

const WS_A = "/Users/zhangbei/code/proj-alpha";
const WS_B = "/Users/zhangbei/code/proj-beta";

interface MockCtxOptions {
  /** sessions.list 快照行 */
  sessionRows?: Array<{ sessionId: string; cwd?: string; updatedAt?: number }>;
  /** workspaces.list 快照行 */
  workspaceItems?: Array<{ workspaceId: string; path: string }>;
  /** connectWorkspace 返回值 */
  connectSessionId?: string;
  /** 发送通道行为 */
  promptOk?: boolean;
}

function makeCtx(opts: MockCtxOptions) {
  const byId: Record<string, { sessionId: string; cwd?: string; updatedAt?: number }> = {};
  for (const row of opts.sessionRows ?? []) byId[row.sessionId] = row;
  const sent: Array<{ sessionId: string; text: string }> = [];
  const connectCalls: string[] = [];
  const ctx = {
    sessions: {
      list: { getSnapshot: () => ({ byId }) },
      binding: (sessionId: string) => ({
        session: {
          prompt: async (parts: Array<{ type: string; text: string }>) => {
            sent.push({ sessionId, text: parts.map((p) => p.text).join("") });
            return { ok: opts.promptOk !== false };
          },
        },
      }),
      scope: () => ({ conversation: undefined }),
    },
    workspaces: {
      list: { getSnapshot: () => ({ items: opts.workspaceItems ?? [] }) },
    },
    uiWorkspace: {
      connectWorkspace: async (workspaceId: string) => {
        connectCalls.push(workspaceId);
        return opts.connectSessionId;
      },
      openSession: () => {},
    },
  };
  return { ctx, sent, connectCalls };
}

describe("dispatchPromptToAgent 严格路由（指定 workspacePath）", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).window = {};
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    vi.restoreAllMocks();
  });

  it("有同 cwd 会话：直接送达该会话", async () => {
    const { ctx, sent } = makeCtx({
      sessionRows: [{ sessionId: "sess-b", cwd: WS_B, updatedAt: 2 }],
    });
    (globalThis as Record<string, unknown>).window = { __DSH_TASK_CLIENT_CTX__: ctx };

    const ok = await dispatchPromptToAgent("干活", { workspacePath: WS_B });
    expect(ok).toBe(true);
    expect(sent).toEqual([{ sessionId: "sess-b", text: "干活" }]);
  });

  it("cwd 尾斜杠归一化后仍可匹配", async () => {
    const { ctx, sent } = makeCtx({
      sessionRows: [{ sessionId: "sess-b", cwd: `${WS_B}/`, updatedAt: 2 }],
    });
    (globalThis as Record<string, unknown>).window = { __DSH_TASK_CLIENT_CTX__: ctx };

    const ok = await dispatchPromptToAgent("干活", { workspacePath: WS_B });
    expect(ok).toBe(true);
    expect(sent[0]?.sessionId).toBe("sess-b");
  });

  it("无同 cwd 会话但工作区在列表中：connectWorkspace 唤起目标工作区会话", async () => {
    const { ctx, sent, connectCalls } = makeCtx({
      sessionRows: [{ sessionId: "sess-a", cwd: WS_A, updatedAt: 5 }],
      workspaceItems: [
        { workspaceId: "ws-a", path: WS_A },
        { workspaceId: "ws-b", path: WS_B },
      ],
      connectSessionId: "sess-b-new",
    });
    (globalThis as Record<string, unknown>).window = { __DSH_TASK_CLIENT_CTX__: ctx };

    const ok = await dispatchPromptToAgent("干活", { workspacePath: WS_B });
    expect(ok).toBe(true);
    expect(connectCalls).toEqual(["ws-b"]);
    expect(sent).toEqual([{ sessionId: "sess-b-new", text: "干活" }]);
  });

  it("无同 cwd 会话且工作区不在列表：返回 false，绝不用当前活跃会话兜底（串台回归）", async () => {
    // 只有 A 工作区的活跃会话；目标是 B 工作区
    const { ctx, sent, connectCalls } = makeCtx({
      sessionRows: [{ sessionId: "sess-a", cwd: WS_A, updatedAt: 5 }],
      workspaceItems: [{ workspaceId: "ws-a", path: WS_A }],
    });
    (globalThis as Record<string, unknown>).window = { __DSH_TASK_CLIENT_CTX__: ctx };

    const ok = await dispatchPromptToAgent("B 的活", { workspacePath: WS_B });
    expect(ok).toBe(false);
    expect(sent).toEqual([]); // 一条消息都不许发出去
    expect(connectCalls).toEqual([]); // 也不许误连 A 工作区
  });

  it("显式 workspaceId 优先于按路径解析", async () => {
    const { ctx, connectCalls } = makeCtx({
      workspaceItems: [{ workspaceId: "ws-b", path: WS_B }],
      connectSessionId: "sess-explicit",
    });
    (globalThis as Record<string, unknown>).window = { __DSH_TASK_CLIENT_CTX__: ctx };

    const ok = await dispatchPromptToAgent("干活", { workspacePath: WS_B, workspaceId: "ws-explicit" });
    expect(ok).toBe(true);
    expect(connectCalls).toEqual(["ws-explicit"]);
  });

  it("sessionId 直发：跳过一切路由（批红唤醒场景）", async () => {
    const { ctx, sent, connectCalls } = makeCtx({
      // 路由诱饵：另一个 cwd 匹配的会话存在，但直发必须命中指定 sessionId
      sessionRows: [{ sessionId: "sess-decoy", cwd: WS_B, updatedAt: 9 }],
      workspaceItems: [{ workspaceId: "ws-b", path: WS_B }],
    });
    (globalThis as Record<string, unknown>).window = { __DSH_TASK_CLIENT_CTX__: ctx };

    const ok = await dispatchPromptToAgent("批红反馈", {
      sessionId: "sess-target",
      workspacePath: WS_B,
    });
    expect(ok).toBe(true);
    expect(sent).toEqual([{ sessionId: "sess-target", text: "批红反馈" }]);
    expect(connectCalls).toEqual([]); // 直发不触发 connectWorkspace
  });
});

describe("notifyApprovalResolved 审批反馈唤醒", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).window = {};
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    vi.restoreAllMocks();
  });

  it("无 sessionHint：返回 no-session，不发送任何消息", async () => {
    const { ctx, sent } = makeCtx({});
    (globalThis as Record<string, unknown>).window = { __DSH_TASK_CLIENT_CTX__: ctx };

    const result = await notifyApprovalResolved({
      taskId: "TASK-001",
      approvalTitle: "删旧表？",
      approved: true,
      optionLabel: "删除并迁移",
      workspacePath: WS_A,
    });
    expect(result).toBe("no-session");
    expect(sent).toEqual([]);
  });

  it("批红：向 sessionHint 定向注入含选中选项的反馈", async () => {
    const { ctx, sent } = makeCtx({});
    (globalThis as Record<string, unknown>).window = { __DSH_TASK_CLIENT_CTX__: ctx };

    const result = await notifyApprovalResolved({
      taskId: "TASK-001",
      approvalTitle: "删旧表？",
      approved: true,
      optionLabel: "删除并迁移",
      sessionHint: "sess-owner",
      workspacePath: WS_A,
    });
    expect(result).toBe("sent");
    expect(sent.length).toBe(1);
    expect(sent[0]?.sessionId).toBe("sess-owner");
    expect(sent[0]?.text).toContain("已被批红");
    expect(sent[0]?.text).toContain("删除并迁移");
  });

  it("驳回：反馈含备注与保持 blocked 的指引", async () => {
    const { ctx, sent } = makeCtx({});
    (globalThis as Record<string, unknown>).window = { __DSH_TASK_CLIENT_CTX__: ctx };

    const result = await notifyApprovalResolved({
      taskId: "TASK-002",
      approvalTitle: "上线？",
      approved: false,
      note: "再等一周",
      sessionHint: "sess-owner",
      workspacePath: WS_A,
    });
    expect(result).toBe("sent");
    expect(sent[0]?.text).toContain("已被驳回");
    expect(sent[0]?.text).toContain("再等一周");
  });

  it("发送通道失败：返回 failed", async () => {
    const { ctx } = makeCtx({ promptOk: false });
    (globalThis as Record<string, unknown>).window = { __DSH_TASK_CLIENT_CTX__: ctx };

    const result = await notifyApprovalResolved({
      taskId: "TASK-001",
      approvalTitle: "t",
      approved: true,
      sessionHint: "sess-gone",
      workspacePath: WS_A,
    });
    expect(result).toBe("failed");
  });
});
