import { TaskStore } from "../store/task-store.js";
const TOOL_DESCRIPTION = `Manage project tasks and record execution conclusions in the current workspace.

Actions:
- list: Fetch all tasks and summary metrics for the current workspace.
- create: Create a single task (via title, description, priority) or batch create multiple tasks (via tasks array).
- update: Update task status (todo/in_progress/review/done/blocked), description, or assignee.
- conclude: Complete a task and record execution conclusion, key deliverables (files created/modified), and insights. Automatically transitions task status to "done".
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
   - IMMEDIATELY call \`workspace_task\` with \`action: "create"\` and \`tasks: [...]\` to batch write the planned subtasks into the workspace board.
   - In your chat response, clearly summarize the decomposition, list the created task IDs (e.g. TASK-001, TASK-002), and ask the user if they'd like you to start executing the first task.

2. **Claiming / Starting a Task (认领并开始执行)**:
   When the user asks you to execute, pick up, or resume a task (e.g. TASK-001):
   - First, call \`workspace_task\` with \`action: "update"\`, setting \`taskId\`, \`status: "in_progress"\`, and \`assignee: "agent"\`.

3. **Executing the Task (执行任务)**:
   - Perform the code modifications, write tests, and run commands as needed.

4. **Finishing & Concluding the Task (结单归档与沉淀)**:
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
                        enum: ["list", "create", "update", "conclude", "delete"],
                        description: "Action to perform on workspace tasks",
                    },
                    taskId: {
                        type: "string",
                        description: "Task ID (e.g. TASK-001), required for update/conclude/delete",
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
                        enum: ["todo", "in_progress", "review", "done", "blocked"],
                        description: "Task status",
                    },
                    priority: {
                        type: "string",
                        enum: ["P0", "P1", "P2"],
                        description: "Task priority",
                    },
                    assignee: {
                        type: "string",
                        description: "Task assignee (e.g. 'agent' or user name)",
                    },
                    tasks: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                title: { type: "string", description: "Task title" },
                                description: { type: "string", description: "Task description or acceptance criteria (Markdown)" },
                                priority: { type: "string", enum: ["P0", "P1", "P2"], description: "Task priority (P0=highest, P1=normal, P2=low)" },
                                assignee: { type: "string", description: "Task assignee (default: 'agent')" },
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
                        description: "Optional workspace root directory (defaults to current working directory)",
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
            async execute(args) {
                const cwd = args.workspacePath || process.cwd();
                switch (args.action) {
                    case "list": {
                        const result = await TaskStore.listTasks(cwd);
                        return {
                            ok: true,
                            action: "list",
                            summary: result.summary,
                            tasks: result.tasks,
                        };
                    }
                    case "create": {
                        if (Array.isArray(args.tasks) && args.tasks.length > 0) {
                            const createdList = await TaskStore.createTasks(cwd, args.tasks);
                            return {
                                ok: true,
                                action: "create",
                                message: `Batch created ${createdList.length} task(s): ${createdList.map((t) => `${t.id} ("${t.title}")`).join(", ")}`,
                                tasks: createdList,
                            };
                        }
                        if (!args.title)
                            throw new Error("Missing required 'title' or 'tasks' for create");
                        const task = await TaskStore.createTask(cwd, {
                            title: args.title,
                            description: args.description,
                            priority: args.priority,
                            assignee: args.assignee,
                        });
                        return {
                            ok: true,
                            action: "create",
                            message: `Created task ${task.id}: "${task.title}"`,
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
                            assignee: args.assignee,
                        });
                        if (!task)
                            throw new Error(`Task ${args.taskId} not found`);
                        return {
                            ok: true,
                            action: "update",
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
                        });
                        if (!task)
                            throw new Error(`Task ${args.taskId} not found`);
                        return {
                            ok: true,
                            action: "conclude",
                            message: `Concluded task ${task.id} successfully with conclusion record`,
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
                            message: success ? `Deleted task ${args.taskId}` : `Task ${args.taskId} not found`,
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