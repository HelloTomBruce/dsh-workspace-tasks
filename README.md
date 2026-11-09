# dsh-workspace-tasks

DSH（DeepSeek Harness）工作区任务与执行结论管理插件。

集成于 DSH **右侧侧边栏引导页（Right Sidebar Tab Guide）**，与“工作区文件 (order: 10)”、“新建终端 (order: 20)”并列为系统级入口（order: 30），点击后以**新开标签页（Tab）**的形式打开任务看板。

---

## 🧬 设计哲学：记录 / 留痕 / 可追溯（Stigmergy）

本插件的定位不只是任务看板，而是多 Agent 协作的**痕迹介质（stigmergy medium）**：Agent 之间不做点对点的无效寒暄，只改共享环境、留痕迹，后来的 Agent 读痕迹直接行动。三条不变量：

1. **决策自包含**：决策记录（`DecisionRecord`）的 `title` + `rationale` + `alternatives` 完整落盘在任务文档内。会话/Agent 会被删除，决策内容不会——`sessionId` / `actor` 仅为**装饰性溯源线索，可悬挂**，读取路径零依赖。
2. **Append-only**：决策正文与过程检查点一旦写入即不可改写。改主意只能通过 `supersedeDecisionId` 取代旧决策（旧记录仅打 `supersededBy` 标记，建立演进链），保证追溯时看到的永远是当时写下的原话。
3. **引用可悬挂**：跨工作区痕迹引用（`TraceRef`）是只读的、与被引用方完全解耦——来源任务被删除或工作区不可达时降级为 `dangling` 提示，绝不阻塞本工作区读写。

由此形成完整的追溯链：**任务 → 决策记录（自包含）→ 过程检查点（`{at, field, from, to}` 事件日志）→ 交付物指针 → 可选 session 线索**。

### 痕迹能力一览

| 能力 | 工具 action | REST API | 说明 |
|---|---|---|---|
| 记录决策 | `record_decision` | `POST /__dsh-tasks__/decision` | 自包含决策，支持 supersede 链 |
| 查询过程 | `get_task_history` | `GET /__dsh-tasks__/history?taskId=` | 检查点事件 + 决策日志，最新在前 |
| 跨工作区引用 | `link_trace` | `POST /__dsh-tasks__/trace` | 只读引用，同引用去重 |
| 解析引用 | — | `GET /__dsh-tasks__/trace?taskId=` | 填充来源标题/结论摘要，悬挂降级 |

### 与 AI 对话示例（痕迹场景）

* *"TASK-003 里我们改用了原子写入方案，请记录这个决策并取代之前的 DEC-xxxx，理由是避免半写。"*
* *"给我看 TASK-003 的完整过程历史和所有决策演进链。"*
* *"把 /path/to/other-workspace 的 TASK-002 作为设计依据引用到 TASK-005 上。"*

---

## 🌟 核心功能

1. **原生右侧栏 Tab 集成**：
   - 打开右侧栏引导页，直接呈现【工作区任务】卡片入口（紧随【新建终端】之后）。
   - 点击以新开 Tab 形式加载，支持与终端/文件树多格分屏（Split Pane）、全屏放大、自由拖拽。

2. **工作区级隔离且完全不与 Git 同步（零代码仓库污染）**：
   - 数据统一持久化在本地用户主目录：`~/.dsh/storages/workspace-tasks/<工作区名>-<hash>.json`。
   - 绝不在代码仓库中新建任何 `.dsh` 文件夹，不影响 `git status`，永不随 Git 提交、合并或推送。
   - 切换 Git 分支、`git clean -fdx` 或重置仓库，任务与结论都不会丢失。

3. **任务编排与前置依赖 (`dependsOn`)**：
   - 支持设置前置依赖任务列表（例如 `dependsOn: ["TASK-001"]`），看板自动展示依赖状态标识（`🔒 依赖待完成` / `✓ 依赖已就绪`）。
   - 前置依赖未全部完成时，派发给 Agent 会弹出确认提示，仍支持强制派发。
   - 点击依赖 Chip 自动平滑滚动并高亮定位对应任务卡片。

4. **就绪流水线与自动化唤醒 (Ready Tasks Pipeline)**：
   - 前置依赖全部满足后，系统自动计算就绪任务，看板置顶展示 **“🎯 依赖已就绪”** 快捷横幅，支持一键派发下一个就绪任务。
   - `workspace_task` 工具新增 `get_ready_tasks` 操作，Agent 可在会话中自主识别并认领就绪任务，实现多任务自动化流水线执行。

5. **标签分类与全文即时检索 (Tags & Full-Text Search)**：
   - **标签分类 (`tags`)**：支持为任务打标签（如 `frontend`, `api`, `bugfix`），面板头部自动提取标签池，支持点击即时分类过滤。
   - **标签池展开/收起**：标签超过 10 个时自动折叠，仅展示前 10 个并提供「展开 N 个 / 收起」切换，避免标签过多挤占看板空间；被折叠时选中的筛选项始终保持在可见区。
   - **全文即时检索**：秒级搜索任务 ID、标题、描述、交付物文件名或标签，精准高亮过滤。

6. **全景交付与工程总结报告导出 (Summary Report Exporter)**：
   - 点击 **📋 导出报告**，一键聚合工作区内所有交付物清单、核心结论、避坑心得与各任务状态，直接生成 Markdown 格式的 Sprint/Release 交付报告。
   - 支持一键复制 Markdown，方便编写 PR 描述或向上汇报。

7. **交付物闭环与无侵入派发**：
   - **交付物一键直达**：点击结论产出文件列表（`deliverables`），调用 DSH 原生 `workspaces.openPath` 直接在编辑器打开对应文件。
   - **无侵入后台派发**：“交给 Agent”按钮纯后台派发提示词，不再污染/覆盖用户当前的输入框与剪贴板。

8. **AI Agent 原生工具赋能**：
   - 注册了 `workspace_task` 工具，AI Agent 在对话中可以自主拆解需求（支持带 `dependsOn` 与 `tags` 批量创建）、认领任务并自动回写执行结论与交付文件。
   - 前端面板具备轻量静默轮询，Agent 在后台一改，前端看板秒级自动同步！

---

## 📁 目录结构

```text
dsh-workspace-tasks/
├── cordis.patch.yml           # DSH 插件注册补丁
├── package.json               # 模块依赖与 dsh.client 声明
├── tsdown.config.ts           # 双端构建配置 (Node ESM + Client ModuleLoader)
├── tsconfig.json              # TypeScript 编译配置
├── src/
│   ├── index.ts               # Host 端入口（注册 API 路由与 Agent Tools）
│   ├── ambient.d.ts           # 类型声明
│   ├── store/
│   │   ├── types.ts           # 任务与结论数据模型
│   │   └── task-store.ts      # 本地文件持久化驱动 (~/.dsh/storages/workspace-tasks/)
│   ├── api/
│   │   └── router.ts          # REST API (/__dsh-tasks__/list, create, update, conclude...)
│   ├── tools/
│   │   └── task-tools.ts      # 大模型 Agent 专用工具 (workspace_task)
│   └── client/
│       ├── index.ts           # 客户端入口（注册 sidebarRightTabs 与 UI 插槽）
│       ├── icons.tsx          # 主题自适应 SVG 图标
│       └── TaskPanel.tsx      # 看板、状态筛选、任务卡片与结论抽屉组件
└── tests/
    ├── task-store.spec.ts     # 存储层单元测试
    └── task-tools.spec.ts     # Agent 工具层单元测试
```

---

## 🛠️ 安装与启用

### 方式一：在当前 DSH 配置中引入

在你的 `cordis.patch.yml`（例如 `~/.dsh/profiles/desktop/cordis.patch.yml`）中添加插件：

```yaml
- insert:
    - id: workspace-tasks
      name: '/Users/zhangbei/code/dsh-workspace-tasks'
```

### 方式二：构建与测试

```bash
# 运行单元测试
pnpm test

# 重新构建产物 (lib/index.js & lib/client.js)
pnpm run build
```

---

## 🤖 与 AI 对话示例

当插件启用后，你在与 DSH 对话时可以说：

* *"帮我把当前工作区的用户认证重构需求拆解成几个任务并记录下来。"*
* *"我现在开始做 TASK-001，请帮我把它的状态改成进行中。"*
* *"我已完成 TASK-001 的单元测试编写，请帮我登记执行结论，产出文件是 tests/auth.spec.ts，并把状态置为已完成。"*
* *"TASK-002 期间我们决定放弃 SQLite 改用 JSON 文件存储，请把这个决策记录到 TASK-002 上。"*

Agent 将直接调用内置的 `workspace_task` 工具完成状态、结论与决策的持久化，右侧任务 Tab 会自动刷新展示！
