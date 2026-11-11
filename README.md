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
| 认领/释放任务锁 | `claim` / `release` | `POST /__dsh-tasks__/claim`、`POST /__dsh-tasks__/release` | 租约锁（默认 60 分钟，惰性过期），冲突返回结构化响应 |
| 请求拍板（票拟） | `request_approval` | `POST /__dsh-tasks__/approval` | 任务挂起 blocked，等待人工批红 |
| 批红/驳回 | —（仅 UI，Agent 不可自我批准） | `POST /__dsh-tasks__/approval/resolve`、`POST /__dsh-tasks__/approval/reject` | 批准自动落 DecisionRecord 并恢复任务 |
| 派发规则读写 | —（UI 配置） | `GET/POST /__dsh-tasks__/dispatch/rules` | 三态模式/优先级/排除标签/白名单/并发上限 |
| 派发取件与回执 | —（客户端执行器） | `GET /__dsh-tasks__/dispatch/pending`、`POST /__dsh-tasks__/dispatch/ack`、`POST /__dsh-tasks__/dispatch/ignore` | queued 取件、sent/failed/ignored 回执 |
| 派发记录 | — | `GET /__dsh-tasks__/dispatch/log?limit=` | 最近 200 条，含 hop 链与状态 |

### 🖋️ 票拟→批红：决策请求闭环（Approval Loop）

Agent 遇到必须人拍板的事（删数据、停服、花钱、对外发布、改产品方向、密钥/权限变更）时，调 `request_approval` 提交一条带 ≥2 个结构化选项的「票拟」：

1. **挂起零消耗**：任务转入 `blocked`，无任何进程、无轮询（SOP 明确禁止 Agent 等候），认领锁保留防止被其他会话捡走；
2. **批红**：看板出现 🔔 待拍板横幅与批红卡片，人点选一个选项（或驳回备注）——**resolve/reject 只走 REST（UI），Agent 工具永不开放，防止自我批准**；
3. **自动落决策**：批准即生成一条不可改写 `DecisionRecord`（标题「拍板：…」，含选中选项原话、未选项进入 alternatives、`actor: human`），审批记录回链 `decisionId`，任务恢复原状态（通常 `in_progress`）无缝续跑；驳回不落决策，任务保持 blocked 等 Agent 重新规划。

### 🔒 认领锁（Claim/Lease）：同一件事只一个负责人

多 Agent 会话并行时，认领即加锁：`update status→in_progress` 自动认领（owner 从会话 ID 派生 `agent@<短码>`），冲突返回结构化响应（不抛异常）让 Agent 主动退让；同一 owner 重入即续租；`conclude` 自动释放；租约过期在读取路径**惰性释放（无定时器）**；`get_ready_tasks` 自动排除被他人活跃锁定的任务。看板显示 🔒 锁 Chip，人可强制释放死锁。

### ⚡ 就绪任务自动派发（Fast Path 事件驱动）

架构「**宿主算、客户端发**」：任务完成（conclude/done）或任务创建（含批量拆解）触发宿主侧纯规则引擎（零 Token），客户端执行器负责唤醒 Agent。

1. **触发**：`TaskStore` 事件钩子（完成 + 创建，工具/REST/UI 手动全路径覆盖）→ 引擎 `evaluate()`：模式关闭或并发闸门满（默认 `maxConcurrent=1`，批量拆解时最多派一张）即静默退出；否则按规则过滤就绪任务（优先级/排除标签/白名单）、去重（已派发未完成/已观察的不重复）、取队首并记录 hop 链深度；
2. **三态模式**：`👁️ 观察`（默认，只记录「本会派发什么」不进队列——验证规则靠谱再切自动）/ `⚡ 自动`（标记 queued 等待执行器取件）/ `⏸️ 关闭`；
3. **唤醒**：客户端后台轮询（30s，GUI 启动即活不依赖看板打开）取 queued 条目，复用手动派发通道（composer 注入提示词）唤醒 Agent，置 `in_progress` 触发认领锁后 `ack` 回执；失败标 `failed` 不静默重试；
4. **可见可干预**：看板头部三态开关 + 规则摘要（hover），观察横幅一键「立即执行/忽略」，📜 派发记录区展示最近 20 条（触发源、hop、状态徽标）。规则与记录持久化在 `~/.dsh/storages/workspace-tasks/<工作区>-dispatch.json`，不进 git。

### 🛡️ 两道纯规则保险（Watchdog & TTL）

- **停滞检测**：`in_progress` 任务超过 `staleHours`（默认 24 小时，可经派发规则接口调整）无新检查点即判定停滞——看板顶部黄条提醒，支持一键「降级回待办」（同时释放认领锁，重新进入就绪队列）；
- **派发 TTL 熔断**：自动派发链每次唤醒 `hop+1`（人工干预不清零，与网络包 TTL 同语义），超过 **8 层**即熔断——不再派发，记录 `tripped` 并把目标任务转 `blocked` 斩断失控链，看板顶部红色告警等人工处置（去处理/知道了）；
- **可派发语义对齐**：阻塞待拍板与待验收（review）的任务是「等人的」而非「等 Agent 的」，自动派发引擎与全局中台的就绪分组都只统计 `todo / in_progress（未认领续跑）`，同一件事绝不重复打扰你。

### 🗂️ 任务中台（跨工作区全局看板）

左侧菜单「插件」区新增「任务中台」入口，点击在主区域打开全宽只读视图：总览计数条 + 工作区卡片（按最近活跃排序），分组呈现🔔待拍板（直接列出票拟标题）/⚡进行中（带锁信息）/🔍待验收/✅已完成待归档/🔒阻塞/🎯就绪预览。点击任意任务行自动打开右栏工作区看板并滚动定位到对应卡片。数据来自 `GET /__dsh-tasks__/global`（扫描本地存储目录，坏文件 dangling 降级）。

### 与 AI 对话示例（痕迹场景）

* *"TASK-003 里我们改用了原子写入方案，请记录这个决策并取代之前的 DEC-xxxx，理由是避免半写。"*
* *"给我看 TASK-003 的完整过程历史和所有决策演进链。"*
* *"把 /path/to/other-workspace 的 TASK-002 作为设计依据引用到 TASK-005 上。"*
* *"要不要删除 legacy 表我拿不准——发个拍板请求，选项是「删除并迁移」和「保留旧表」。"*（看板出现待批卡片，你点一下即可批红）

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
│   │   ├── types.ts           # 任务/结论/决策/检查点/跨工作区引用数据模型
│   │   └── task-store.ts      # 本地文件持久化驱动 (~/.dsh/storages/workspace-tasks/)
│   ├── api/
│   │   └── router.ts          # REST API (/__dsh-tasks__/list, create, decision, history, trace...)
│   ├── tools/
│   │   └── task-tools.ts      # Agent 工具 (workspace_task: record_decision / get_task_history / link_trace...)
│   └── client/
│       ├── index.ts           # 客户端入口（注册 sidebarRightTabs 与 UI 插槽）
│       ├── icons.tsx          # 主题自适应 SVG 图标
│       ├── markdown.tsx       # Markdown 渲染器（描述/结论/决策 rationale 共用）
│       ├── TraceSections.tsx  # 痕迹 UI：决策演进链 / 跨工作区引用 / 过程检查点时间线
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
