# dsh-workspace-tasks

DSH（DeepSeek Harness）工作区任务与执行结论管理插件。

集成于 DSH **右侧侧边栏引导页（Right Sidebar Tab Guide）**，与“工作区文件 (order: 10)”、“新建终端 (order: 20)”并列为系统级入口（order: 30），点击后以**新开标签页（Tab）**的形式打开任务看板。

---

## 🌟 核心功能

1. **原生右侧栏 Tab 集成**：
   - 打开右侧栏引导页，直接呈现【工作区任务】卡片入口（紧随【新建终端】之后）。
   - 点击以新开 Tab 形式加载，支持与终端/文件树多格分屏（Split Pane）、全屏放大、自由拖拽。

2. **工作区级隔离且完全不与 Git 同步（零代码仓库污染）**：
   - 数据统一持久化在本地用户主目录：`~/.dsh/storages/workspace-tasks/<工作区名>-<hash>.json`。
   - 绝不在代码仓库中新建任何 `.dsh` 文件夹，不影响 `git status`，永不随 Git 提交、合并或推送。
   - 切换 Git 分支、`git clean -fdx` 或重置仓库，任务与结论都不会丢失。

3. **任务状态与执行结论追踪（Human-AI 协同闭环）**：
   - 状态流转：`待办 (todo)` -> `进行中 (in_progress)` -> `审查 (review)` -> `已完成 (done)` / `阻塞 (blocked)`。
   - **执行结论（Conclusions）沉淀**：每次任务完成后，沉淀**结论核心摘要、产出文件交付物清单（Deliverables）、经验与踩坑心得（Insights）**，支持多轮迭代追加。

4. **AI Agent 原生工具赋能**：
   - 注册了 `workspace_task` 工具，AI Agent 在对话中可以自主拆解需求、创建任务、更新进度，并在代码写完后自动回写执行结论。
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

Agent 将直接调用内置的 `workspace_task` 工具完成状态与结论持久化，右侧任务 Tab 会自动刷新展示！
