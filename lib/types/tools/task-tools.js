import path from "node:path";
import { TaskStore } from "../store/task-store.js";
const TOOL_DESCRIPTION = `Manage project tasks and record execution conclusions in the current workspace.

Actions:
- list: Fetch all tasks and summary metrics for the current workspace.
- get_ready_tasks: Fetch only tasks whose prerequisite dependencies are satisfied and ready for execution.
- create: Create a single task (via title, description, priority, tags) or batch create multiple tasks (via tasks array).
- update: Update task status (todo/in_progress/review/done/blocked/archived), description, priority, tags, or assignee.
- conclude: Complete a task and record execution conclusion, key deliverables (files created/modified), and insights. Automatically transitions task status to "done".
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

3. **Claiming / Starting a Task (认领并开始执行)**:
   When the user asks you to execute, pick up, or resume a task (e.g. TASK-001):
   - First, call \`workspace_task\` with \`action: "update"\`, setting \`taskId\`, \`status: "in_progress"\`, and \`assignee: "agent"\`.

4. **Executing the Task (执行任务)**:
   - Perform the code modifications, write tests, and run commands as needed.

5. **Finishing & Concluding the Task (结单归档与沉淀)**:
   - Once all code changes and verifications are done, ALWAYS call \`workspace_task\` with \`action: "conclude"\`.
   - Provide:
     - \`summary\`: Concise summary of what was implemented or resolved.
     - \`deliverables\`: Array of relative paths of created or modified files.
     - \`insights\`: Array of key findings, architectural decisions, or caveats.
   - The conclude action will automatically transition the task status to \`done\` and persist your conclusions.`;
export function registerTaskTools(ctx) {
    const tools = ctx.tools;
    const systemPrompt = ctx.systemPrompt;
    const disposers = [];
    if (systemPrompt) {
        disposers.push(systemPrompt.section({
            name: "tool:workspace_task",
            order: 140,
            text: SYSTEM_PROMPT_INSTRUCTION,
        }));
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
                        enum: ["list", "get_ready_tasks", "create", "update", "conclude", "export_report", "archive", "delete"],
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
                },
                required: ["action"],
            },
            output: {
                schema: {
                    type: "object",
                },
                render: (_args, value) => [
                    {
                        type: "text",
                        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
                    },
                ],
            },
            isConcurrencySafe: () => false,
            async execute(args, exec) {
                const sessionCwd = exec?.agent?.session?.header?.cwd;
                const agentSessionId = exec?.agent?.session?.header?.id;
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
                        const readyTasks = await TaskStore.getReadyTasks(cwd);
                        return {
                            ok: true,
                            action: "get_ready_tasks",
                            workspacePath: cwd,
                            count: readyTasks.length,
                            tasks: readyTasks,
                            message: readyTasks.length > 0
                                ? `Found ${readyTasks.length} task(s) whose dependencies are satisfied and ready for execution: ${readyTasks.map((t) => `${t.id} ("${t.title}")`).join(", ")}`
                                : `No tasks are currently ready for execution.`,
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
                            const tasksToCreate = args.tasks.map((t) => ({
                                ...t,
                                ...(agentSessionId ? { sessionId: agentSessionId } : {}),
                            }));
                            const createdList = await TaskStore.createTasks(cwd, tasksToCreate);
                            return {
                                ok: true,
                                action: "create",
                                workspacePath: cwd,
                                message: `Batch created ${createdList.length} task(s) in ${cwd}: ${createdList.map((t) => `${t.id} ("${t.title}")`).join(", ")}`,
                                tasks: createdList,
                            };
                        }
                        if (!args.title)
                            throw new Error("Missing required 'title' or 'tasks' for create");
                        const task = await TaskStore.createTask(cwd, {
                            title: args.title,
                            description: args.description,
                            priority: args.priority,
                            tags: args.tags,
                            assignee: args.assignee,
                            dependsOn: args.dependsOn,
                            ...(agentSessionId ? { sessionId: agentSessionId } : {}),
                        });
                        if (!task)
                            throw new Error(`Task ${args.taskId} not found in ${cwd}`);
                        return {
                            ok: true,
                            action: "create",
                            workspacePath: cwd,
                            message: `Created task ${task.id} in ${cwd}: "${task.title}"`,
                            task,
                        };
                    }
                    case "update": {
                        if (!args.taskId)
                            throw new Error("Missing required 'taskId' for update");
                        const task = await TaskStore.updateTask(cwd, args.taskId, {
                            title: args.title,
                            description: args.description,
                            status: args.status,
                            priority: args.priority,
                            tags: args.tags,
                            assignee: args.assignee,
                            dependsOn: args.dependsOn,
                            ...(agentSessionId ? { sessionId: agentSessionId } : {}),
                        });
                        if (!task)
                            throw new Error(`Task ${args.taskId} not found in ${cwd}`);
                        return {
                            ok: true,
                            action: "update",
                            workspacePath: cwd,
                            message: `Updated task ${task.id} status to ${task.status}`,
                            task,
                        };
                    }
                    case "conclude": {
                        if (!args.taskId)
                            throw new Error("Missing required 'taskId' for conclude");
                        if (!args.summary)
                            throw new Error("Missing required 'summary' for conclude");
                        const task = await TaskStore.addConclusion(cwd, args.taskId, {
                            summary: args.summary,
                            deliverables: args.deliverables,
                            insights: args.insights,
                            ...(agentSessionId ? { sessionId: agentSessionId } : {}),
                        });
                        if (!task)
                            throw new Error(`Task ${args.taskId} not found in ${cwd}`);
                        return {
                            ok: true,
                            action: "conclude",
                            workspacePath: cwd,
                            message: `Concluded task ${task.id} successfully with conclusion record`,
                            task,
                        };
                    }
                    case "archive": {
                        if (!args.taskId)
                            throw new Error("Missing required 'taskId' for archive");
                        const task = await TaskStore.archiveTask(cwd, args.taskId);
                        if (!task)
                            throw new Error(`Task ${args.taskId} not found in ${cwd}`);
                        return {
                            ok: true,
                            action: "archive",
                            workspacePath: cwd,
                            message: `Archived task ${task.id} in ${cwd}`,
                            task,
                        };
                    }
                    case "delete": {
                        if (!args.taskId)
                            throw new Error("Missing required 'taskId' for delete");
                        const success = await TaskStore.deleteTask(cwd, args.taskId);
                        return {
                            ok: success,
                            action: "delete",
                            workspacePath: cwd,
                            message: success ? `Deleted task ${args.taskId} from ${cwd}` : `Task ${args.taskId} not found in ${cwd}`,
                        };
                    }
                    default:
                        throw new Error(`Unknown action ${args.action}`);
                }
            },
        };
        disposers.push(tools.register(toolDef));
    }
    return () => {
        for (const dispose of disposers)
            dispose?.();
    };
}
//# sourceMappingURL=task-tools.js.map