import path from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import { ClaimConflictError, TaskStore } from "../store/task-store.ts";
import type { TaskPriority, TaskStatus } from "../store/types.ts";

export interface TaskCreateItem {
  title: string;
  description?: string;
  priority?: TaskPriority;
  tags?: string[];
  assignee?: string;
  dependsOn?: string[];
}

export interface WorkspaceTaskToolArgs {
  action:
    | "list"
    | "create"
    | "update"
    | "conclude"
    | "archive"
    | "delete"
    | "get_ready_tasks"
    | "export_report"
    | "record_decision"
    | "get_task_history"
    | "link_trace"
    | "claim"
    | "release"
    | "request_approval";
  taskId?: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  assignee?: string;
  dependsOn?: string[];
  tasks?: TaskCreateItem[];
  summary?: string;
  deliverables?: string[];
  insights?: string[];
  workspacePath?: string;
  /** record_decision / supersedeDecision 时使用：决策标题 */
  decisionTitle?: string;
  /** record_decision 时使用：决策理由（自包含，不依赖会话内容） */
  rationale?: string;
  /** record_decision 时使用：已考虑并否决的备选方案 */
  alternatives?: string[];
  /** record_decision 时使用：决策者标识（自由文本快照） */
  actor?: string;
  /** record_decision 时使用：产生决策的会话 ID（装饰性可悬挂线索） */
  sessionId?: string;
  /** record_decision 时使用：要取代（supersede）的既有决策 ID */
  supersedeDecisionId?: string;
  /** link_trace 时使用：被引用工作区路径 */
  refWorkspacePath?: string;
  /** link_trace 时使用：被引用任务 ID */
  refTaskId?: string;
  /** link_trace 时使用：引用说明 */
  refNote?: string;
  /** claim / update(in_progress) 时使用：租约分钟数（默认 60，可调 1–240） */
  leaseMinutes?: number;
  /** request_approval 时使用：拍板事项标题（票拟标题） */
  approvalTitle?: string;
  /** request_approval 时使用：背景说明（可选） */
  approvalDetail?: string;
  /** request_approval 时使用：批红候选选项文本（≥2 个） */
  options?: string[];
}

/**
 * 派生认领者标识：能拿到会话 ID 时拼 `base@<短码>` 区分并行会话，
 * 拿不到时退化为 base（如 'agent'）。sessionHint 为装饰性可悬挂线索。
 */
function deriveOwner(args: WorkspaceTaskToolArgs, exec?: any): { owner: string; sessionHint?: string } {
  const sessionId = exec?.agent?.session?.header?.id ?? exec?.agent?.session?.id ?? undefined;
  const short = sessionId ? String(sessionId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) : "";
  const base = args.assignee?.trim() || "agent";
  return {
    owner: short ? `${base}@${short}` : base,
    ...(sessionId ? { sessionHint: String(sessionId) } : {}),
  };
}

/** 认领冲突的统一结构化响应：这是正常分支而非错误，Agent 应主动让开另认领就绪任务 */
function conflictResponse(action: string, cwd: string, taskId: string, err: ClaimConflictError) {
  return {
    ok: false,
    action,
    workspacePath: cwd,
    conflict: true,
    taskId,
    claim: err.claim,
    message: `Task ${taskId} is actively claimed by "${err.claim.owner}" (lease until ${err.claim.leaseUntil}). Back off — do NOT work on it; call get_ready_tasks and pick another one.`,
  };
}

const TOOL_DESCRIPTION = `Manage project tasks and record execution conclusions in the current workspace.

Actions:
- list: Fetch all tasks and summary metrics for the current workspace.
- get_ready_tasks: Fetch only tasks whose prerequisite dependencies are satisfied and ready for execution. Tasks actively claimed by OTHER sessions are excluded — never work on someone else's locked task.
- create: Create a single task (via title, description, priority, tags) or batch create multiple tasks (via tasks array).
- update: Update task status (todo/in_progress/review/done/blocked/archived), description, priority, tags, or assignee. Setting status to "in_progress" automatically claims the task with a lease lock (default 60 min, adjustable 1-240 via leaseMinutes); if another session holds an active lock you get a structured conflict response — back off and pick another ready task.
- conclude: Complete a task and record execution conclusion, key deliverables (files created/modified), and insights. Automatically transitions task status to "done" and releases the claim lock.
- claim: Explicitly claim a task with a lease lock so other agent sessions back off. Re-claiming as the same owner renews the lease (keeps claimedAt, extends leaseUntil).
- release: Release your own claim. Claims also auto-release on conclude and on status changes to todo/review/done/archived, and lazily expire after the lease — no timers involved. Status "blocked" keeps the claim so no one snatches a task awaiting human decision.
- record_decision: Append an immutable decision record (title + rationale + alternatives). Pass supersedeDecisionId to replace an old decision — old decisions are never rewritten, only superseded via a chain. sessionId is a decorative dangling-safe hint, never required for reading.
- request_approval: Escalate a decision to the human (approvalTitle + approvalDetail + options, ≥2 options). The task turns "blocked" and suspends at zero cost — STOP working on it, do NOT poll or wait. The human resolves it on the task board (批红); resolving is intentionally NOT available to agents — approvals can never be self-granted. An approval resolution is recorded automatically as a decision with the chosen option's verbatim text.
- get_task_history: Fetch the append-only checkpoint event log of a task (field changes, conclusions, decisions, claim events), newest first.
- link_trace: Add a read-only cross-workspace trace reference {refWorkspacePath, refTaskId, refNote} to a task. Resolution degrades gracefully (dangling) when the source is deleted or unreachable.
- export_report: Generate a comprehensive Markdown sprint/delivery summary report for the current workspace.
- archive: Archive a completed task, removing it from active board.
- delete: Remove a task.

All task data is stored outside git in ~/.dsh/storages/workspace-tasks/.`;

const SYSTEM_PROMPT_INSTRUCTION = `## Workspace Task Management (工作区任务协同)
You have access to the \`workspace_task\` tool to manage project tasks and execution conclusions on the task board.

### Standard Operating Procedure (SOP):

1. **Requirement Planning & Task Decomposition (需求规划与自动拆解)**:
   When the user presents a multi-step feature requirement, architectural change, or asks to plan/decompose tasks:
   - Deeply inspect the codebase to understand existing structure, components, and patterns.
   - Proactively decompose the requirement into 3 to 5 clear, modular, verifiable subtasks.
   - Assign appropriate priorities (P0: core functionality/blocking, P1: normal features/extensions, P2: tests/documentation).
   - If subtasks have sequential or causal dependencies, specify prerequisite task IDs in \`dependsOn\` (e.g. \`dependsOn: ["TASK-001"]\`).
   - Add descriptive tags (e.g. \`tags: ["frontend", "api"]\`).
   - IMMEDIATELY call \`workspace_task\` with \`action: "create"\` and \`tasks: [...]\` to batch write the planned subtasks into the workspace board.
   - In your chat response, clearly summarize the decomposition, list the created task IDs (e.g. TASK-001, TASK-002), and ask the user if they'd like you to start executing the first task.

2. **Discovering Ready Tasks (主动识别就绪任务)**:
   - Call \`workspace_task\` with \`action: "get_ready_tasks"\` to find tasks whose prerequisite dependencies are fully met and ready to be executed.
   - Tasks actively claimed by OTHER sessions are excluded automatically — one task, one owner. Never work on a task locked by someone else.

3. **Claiming / Starting a Task (认领并开始执行)**:
   When the user asks you to execute, pick up, or resume a task (e.g. TASK-001):
   - First, call \`workspace_task\` with \`action: "update"\`, setting \`taskId\`, \`status: "in_progress"\`, and \`assignee: "agent"\`. This automatically acquires a lease lock (default 60 min).
   - If you receive a structured conflict response (\`conflict: true\`), another session owns the task — do NOT retry or force it; call \`get_ready_tasks\` and pick a different task instead.
   - While working on a long task, re-claim (or re-update) periodically to renew the lease before it expires.

4. **Executing the Task (执行任务)**:
   - Perform the code modifications, write tests, and run commands as needed.

5. **Finishing & Concluding the Task (结单归档与沉淀)**:
   - Once all code changes and verifications are done, ALWAYS call \`workspace_task\` with \`action: "conclude"\`.
   - Provide:
     - \`summary\`: Concise summary of what was implemented or resolved.
     - \`deliverables\`: Array of relative paths of created or modified files.
     - \`insights\`: Array of key findings, architectural decisions, or caveats.
   - The conclude action will automatically transition the task status to \`done\` and persist your conclusions.
    - When a **key architectural/technical decision** was made during execution, ALSO call \`record_decision\` with a self-contained \`rationale\` (survives session deletion; \`sessionId\` is only a decorative hint). If revising a previous decision, pass \`supersedeDecisionId\` instead of rewriting it.

6. **Escalating Decisions to the Human (请求拍板，票拟→批红)**:
   When you hit a decision that a human must make — deleting data, stopping services, spending money, messaging external parties, changing product direction, creating/rotating keys, modifying permissions:
   - Call \`workspace_task\` with \`action: "request_approval"\`: \`approvalTitle\` (the question), \`approvalDetail\` (context), and \`options\` (≥2 concrete choices you could execute).
   - Then STOP immediately. The task suspends at zero cost (blocked, no process, no polling) — do NOT poll for the answer, do NOT proceed with any of the options on your own.
   - The human resolves it on the task board; the resolution is recorded as an immutable decision. When you are invoked again, read the task's decisions and resume accordingly.
   - Only ask for decisions that genuinely need a human. Everything else is yours to finish.`;

export function registerTaskTools(ctx: Context): () => void {
  const tools = (ctx as unknown as { tools?: { register: (tool: unknown) => () => void } }).tools;
  const systemPrompt = (ctx as unknown as { systemPrompt?: { section: (s: unknown) => () => void } }).systemPrompt;

  const disposers: Array<() => void> = [];

  if (systemPrompt) {
    disposers.push(
      systemPrompt.section({
        name: "tool:workspace_task",
        order: 140,
        text: SYSTEM_PROMPT_INSTRUCTION,
      })
    );
  }

  if (tools) {
    const toolDef = {
      name: "workspace_task",
      description: TOOL_DESCRIPTION,
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "list",
              "get_ready_tasks",
              "create",
              "update",
              "conclude",
              "record_decision",
              "get_task_history",
              "link_trace",
              "claim",
              "release",
              "request_approval",
              "export_report",
              "archive",
              "delete",
            ],
            description: "Action to perform on workspace tasks",
          },
          taskId: {
            type: "string",
            description: "Task ID (e.g. TASK-001), required for update/conclude/archive/delete",
          },
          title: {
            type: "string",
            description: "Task title, required for create",
          },
          description: {
            type: "string",
            description: "Detailed task description or requirement context (Markdown)",
          },
          status: {
            type: "string",
            enum: ["todo", "in_progress", "review", "done", "blocked", "archived"],
            description: "Task status",
          },
          priority: {
            type: "string",
            enum: ["P0", "P1", "P2"],
            description: "Task priority",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "List of categorical tags (e.g. ['frontend', 'api', 'bugfix'])",
          },
          assignee: {
            type: "string",
            description: "Task assignee (e.g. 'agent' or user name)",
          },
          dependsOn: {
            type: "array",
            items: { type: "string" },
            description: "List of prerequisite task IDs that must be completed before this task (e.g. ['TASK-001'])",
          },
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Task title" },
                description: { type: "string", description: "Task description or acceptance criteria (Markdown)" },
                priority: { type: "string", enum: ["P0", "P1", "P2"], description: "Task priority (P0=highest, P1=normal, P2=low)" },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Tags for category classification",
                },
                assignee: { type: "string", description: "Task assignee (default: 'agent')" },
                dependsOn: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of prerequisite task IDs",
                },
              },
              required: ["title"],
            },
            description: "Optional list of tasks for batch creation during requirement planning & decomposition",
          },
          summary: {
            type: "string",
            description: "Execution conclusion summary, required for conclude action",
          },
          deliverables: {
            type: "array",
            items: { type: "string" },
            description: "List of produced file paths or artifact deliverables",
          },
          insights: {
            type: "array",
            items: { type: "string" },
            description: "Key findings, architectural decisions, or caveats discovered during task execution",
          },
          workspacePath: {
            type: "string",
            description: "Optional workspace root directory. Defaults to the current session's workspace directory.",
          },
          decisionTitle: {
            type: "string",
            description: "Decision title, required for record_decision (with or without supersedeDecisionId)",
          },
          rationale: {
            type: "string",
            description: "Decision rationale — must be self-contained (survives session deletion), required for record_decision",
          },
          alternatives: {
            type: "array",
            items: { type: "string" },
            description: "Alternatives considered and rejected (optional, for record_decision)",
          },
          actor: {
            type: "string",
            description: "Decision maker identifier (free-text snapshot, e.g. 'agent' or user name)",
          },
          sessionId: {
            type: "string",
            description: "Optional session ID hint (decorative, dangling-safe; never required to read the decision)",
          },
          supersedeDecisionId: {
            type: "string",
            description: "Existing decision ID (DEC-xxx) to supersede — old decision body is never rewritten, only marked superseded",
          },
          refWorkspacePath: {
            type: "string",
            description: "Source workspace absolute path, required for link_trace",
          },
          refTaskId: {
            type: "string",
            description: "Source task ID (e.g. TASK-001), required for link_trace",
          },
          refNote: {
            type: "string",
            description: "Why this trace is referenced (optional, for link_trace)",
          },
          leaseMinutes: {
            type: "number",
            description: "Lease duration in minutes for claim / update(in_progress) (default 60, min 1, max 240)",
          },
          approvalTitle: {
            type: "string",
            description: "The decision question to escalate, required for request_approval",
          },
          approvalDetail: {
            type: "string",
            description: "Context/background for the approval request (optional, for request_approval)",
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Concrete choices the human can pick (≥2), required for request_approval",
          },
        },
        required: ["action"],
      },
      output: {
        schema: {
          type: "object",
        },
        render: (_args: unknown, value: unknown) => [
          {
            type: "text",
            text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
          },
        ],
      },
      isConcurrencySafe: () => false,
      async execute(args: WorkspaceTaskToolArgs, exec?: any) {
        const sessionCwd = exec?.agent?.session?.header?.cwd;
        const rawPath = args.workspacePath || sessionCwd || process.cwd();
        const cwd = path.resolve(rawPath);

        switch (args.action) {
          case "list": {
            const result = await TaskStore.listTasks(cwd);
            return {
              ok: true,
              action: "list",
              workspacePath: cwd,
              summary: result.summary,
              tasks: result.tasks,
            };
          }

          case "get_ready_tasks": {
            const { owner } = deriveOwner(args, exec);
            const readyTasks = await TaskStore.getReadyTasks(cwd, { owner });
            return {
              ok: true,
              action: "get_ready_tasks",
              workspacePath: cwd,
              count: readyTasks.length,
              tasks: readyTasks,
              message:
                readyTasks.length > 0
                  ? `Found ${readyTasks.length} task(s) whose dependencies are satisfied and ready for execution: ${readyTasks.map((t) => `${t.id} ("${t.title}")`).join(", ")}`
                  : `No tasks are currently ready for execution (tasks actively claimed by other sessions are excluded).`,
            };
          }

          case "export_report": {
            const report = await TaskStore.exportSummaryReport(cwd);
            return {
              ok: true,
              action: "export_report",
              workspacePath: cwd,
              report,
            };
          }

          case "create": {
            if (Array.isArray(args.tasks) && args.tasks.length > 0) {
              const createdList = await TaskStore.createTasks(cwd, args.tasks);
              return {
                ok: true,
                action: "create",
                workspacePath: cwd,
                message: `Batch created ${createdList.length} task(s) in ${cwd}: ${createdList.map((t) => `${t.id} ("${t.title}")`).join(", ")}`,
                tasks: createdList,
              };
            }

            if (!args.title) throw new Error("Missing required 'title' or 'tasks' for create");
            const task = await TaskStore.createTask(cwd, {
              title: args.title,
              description: args.description,
              priority: args.priority,
              tags: args.tags,
              assignee: args.assignee,
              dependsOn: args.dependsOn,
            });
            if (!task) throw new Error(`Task ${args.taskId} not found in ${cwd}`);
            return {
              ok: true,
              action: "create",
              workspacePath: cwd,
              message: `Created task ${task.id} in ${cwd}: "${task.title}"`,
              task,
            };
          }

          case "update": {
            if (!args.taskId) throw new Error("Missing required 'taskId' for update");
            try {
              // 转入 in_progress 时自动认领（加锁/续租）；其他状态变更不触碰锁语义
              const claimOpts =
                args.status === "in_progress"
                  ? (() => {
                      const { owner, sessionHint } = deriveOwner(args, exec);
                      return { claimOwner: owner, sessionHint, leaseMinutes: args.leaseMinutes };
                    })()
                  : undefined;
              const task = await TaskStore.updateTask(
                cwd,
                args.taskId,
                {
                  title: args.title,
                  description: args.description,
                  status: args.status,
                  priority: args.priority,
                  tags: args.tags,
                  assignee: args.assignee,
                  dependsOn: args.dependsOn,
                },
                claimOpts
              );
              if (!task) throw new Error(`Task ${args.taskId} not found in ${cwd}`);
              return {
                ok: true,
                action: "update",
                workspacePath: cwd,
                message: `Updated task ${task.id} status to ${task.status}${task.claim ? ` (claimed by ${task.claim.owner}, lease until ${task.claim.leaseUntil})` : ""}`,
                task,
              };
            } catch (err) {
              if (err instanceof ClaimConflictError) {
                return conflictResponse("update", cwd, args.taskId, err);
              }
              throw err;
            }
          }

          case "claim": {
            if (!args.taskId) throw new Error("Missing required 'taskId' for claim");
            const { owner, sessionHint } = deriveOwner(args, exec);
            const result = await TaskStore.claimTask(cwd, args.taskId, {
              owner,
              sessionHint,
              leaseMinutes: args.leaseMinutes,
            });
            if (!result.ok) {
              if (result.reason === "not-found") throw new Error(`Task ${args.taskId} not found in ${cwd}`);
              return {
                ok: false,
                action: "claim",
                workspacePath: cwd,
                conflict: true,
                taskId: args.taskId,
                claim: result.claim,
                message: `Task ${args.taskId} is actively claimed by "${result.claim?.owner}" (lease until ${result.claim?.leaseUntil}). Back off — do NOT work on it; call get_ready_tasks and pick another one.`,
              };
            }
            return {
              ok: true,
              action: "claim",
              workspacePath: cwd,
              message: `Claimed task ${args.taskId} as "${owner}" (lease until ${result.task.claim?.leaseUntil}). Re-claim before expiry to renew.`,
              task: result.task,
            };
          }

          case "release": {
            if (!args.taskId) throw new Error("Missing required 'taskId' for release");
            const { owner } = deriveOwner(args, exec);
            const result = await TaskStore.releaseTask(cwd, args.taskId, { owner });
            if (!result.ok) {
              if (result.reason === "not-found") throw new Error(`Task ${args.taskId} not found in ${cwd}`);
              return {
                ok: false,
                action: "release",
                workspacePath: cwd,
                conflict: true,
                taskId: args.taskId,
                claim: result.claim,
                message: `Task ${args.taskId} is actively claimed by "${result.claim?.owner}" — you cannot release someone else's lock. It expires at ${result.claim?.leaseUntil}.`,
              };
            }
            return {
              ok: true,
              action: "release",
              workspacePath: cwd,
              message: `Released claim on task ${args.taskId}.`,
              task: result.task,
            };
          }

          case "conclude": {
            if (!args.taskId) throw new Error("Missing required 'taskId' for conclude");
            if (!args.summary) throw new Error("Missing required 'summary' for conclude");
            const task = await TaskStore.addConclusion(cwd, args.taskId, {
              summary: args.summary,
              deliverables: args.deliverables,
              insights: args.insights,
            });
            if (!task) throw new Error(`Task ${args.taskId} not found in ${cwd}`);
            return {
              ok: true,
              action: "conclude",
              workspacePath: cwd,
              message: `Concluded task ${task.id} successfully with conclusion record`,
              task,
            };
          }

          case "record_decision": {
            if (!args.taskId) throw new Error("Missing required 'taskId' for record_decision");
            if (!args.decisionTitle?.trim()) throw new Error("Missing required 'decisionTitle' for record_decision");
            if (!args.rationale?.trim()) throw new Error("Missing required 'rationale' for record_decision");
            const decisionPayload = {
              title: args.decisionTitle,
              rationale: args.rationale,
              alternatives: args.alternatives,
              actor: args.actor ?? "agent",
              sessionId: args.sessionId,
            };
            let record;
            if (args.supersedeDecisionId?.trim()) {
              record = await TaskStore.supersedeDecision(cwd, args.taskId, args.supersedeDecisionId.trim(), decisionPayload);
              if (!record) {
                throw new Error(`Decision ${args.supersedeDecisionId} not found (or already superseded) on task ${args.taskId}`);
              }
            } else {
              record = await TaskStore.addDecision(cwd, args.taskId, decisionPayload);
              if (!record) throw new Error(`Task ${args.taskId} not found in ${cwd}`);
            }
            return {
              ok: true,
              action: "record_decision",
              workspacePath: cwd,
              decisionId: record.id,
              message: `Recorded decision ${record.id} on ${args.taskId}: "${record.title}"${args.supersedeDecisionId ? ` (supersedes ${args.supersedeDecisionId})` : ""}`,
              decision: record,
            };
          }

          case "get_task_history": {
            if (!args.taskId) throw new Error("Missing required 'taskId' for get_task_history");
            const [history, decisions] = await Promise.all([
              TaskStore.getTaskHistory(cwd, args.taskId),
              TaskStore.listDecisions(cwd, args.taskId),
            ]);
            return {
              ok: true,
              action: "get_task_history",
              workspacePath: cwd,
              taskId: args.taskId,
              checkpoints: history,
              decisions,
              message: `Task ${args.taskId}: ${history.length} checkpoint(s), ${decisions.length} decision(s)`,
            };
          }

          case "link_trace": {
            if (!args.taskId) throw new Error("Missing required 'taskId' for link_trace");
            if (!args.refWorkspacePath?.trim()) throw new Error("Missing required 'refWorkspacePath' for link_trace");
            if (!args.refTaskId?.trim()) throw new Error("Missing required 'refTaskId' for link_trace");
            const task = await TaskStore.addTraceRef(cwd, args.taskId, {
              workspacePath: args.refWorkspacePath,
              taskId: args.refTaskId,
              note: args.refNote,
            });
            if (!task) throw new Error(`Task ${args.taskId} not found in ${cwd}`);
            return {
              ok: true,
              action: "link_trace",
              workspacePath: cwd,
              message: `Linked trace ${args.refTaskId} of ${args.refWorkspacePath} to ${task.id}`,
              task,
            };
          }

          case "request_approval": {
            if (!args.taskId) throw new Error("Missing required 'taskId' for request_approval");
            if (!args.approvalTitle?.trim()) throw new Error("Missing required 'approvalTitle' for request_approval");
            if (!Array.isArray(args.options) || args.options.filter((o) => o?.trim()).length < 2) {
              throw new Error("request_approval requires 'options' with at least 2 non-empty choices");
            }
            const result = await TaskStore.requestApproval(cwd, args.taskId, {
              title: args.approvalTitle,
              detail: args.approvalDetail,
              options: args.options,
            });
            if (!result.ok) {
              if (result.reason === "not-found") throw new Error(`Task ${args.taskId} not found in ${cwd}`);
              return {
                ok: false,
                action: "request_approval",
                workspacePath: cwd,
                taskId: args.taskId,
                reason: result.reason,
                message:
                  result.reason === "pending-exists"
                    ? `Task ${args.taskId} already has a pending approval — one question at a time. Wait for the human to resolve it (do NOT poll).`
                    : `Task ${args.taskId} cannot accept approval requests in its current state (done/archived).`,
              };
            }
            return {
              ok: true,
              action: "request_approval",
              workspacePath: cwd,
              // 返回独立副本：与 task.approvals 内的同一引用会让 JSON 往返边界判定为循环引用
              approval: structuredClone(result.approval),
              task: result.task,
              message: `Approval requested on ${args.taskId} (${result.approval.id}): "${result.approval.title}". The task is now blocked and suspended at zero cost. STOP working on it — do NOT poll, do NOT proceed with any option yourself. The human will resolve it on the task board.`,
            };
          }

          case "archive": {
            if (!args.taskId) throw new Error("Missing required 'taskId' for archive");
            const task = await TaskStore.archiveTask(cwd, args.taskId);
            if (!task) throw new Error(`Task ${args.taskId} not found in ${cwd}`);
            return {
              ok: true,
              action: "archive",
              workspacePath: cwd,
              message: `Archived task ${task.id} in ${cwd}`,
              task,
            };
          }

          case "delete": {
            if (!args.taskId) throw new Error("Missing required 'taskId' for delete");
            const success = await TaskStore.deleteTask(cwd, args.taskId);
            return {
              ok: success,
              action: "delete",
              workspacePath: cwd,
              message: success ? `Deleted task ${args.taskId} from ${cwd}` : `Task ${args.taskId} not found in ${cwd}`,
            };
          }

          default:
            throw new Error(`Unknown action ${(args as { action: string }).action}`);
        }
      },
    };

    disposers.push(tools.register(toolDef));
  }

  return () => {
    for (const dispose of disposers) dispose?.();
  };
}
