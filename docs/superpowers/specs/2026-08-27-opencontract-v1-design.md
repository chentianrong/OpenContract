# OpenContract v1.0.0 设计规范

## 1. 项目定位

> 让智能体自由行动，让交付结果有据可验。

OpenContract 给智能体一套“行动说明书”和“交付验收单”：智能体可以自己决定先做什么、怎么走；但每个重要成果，都必须符合约定、经得起检查。

工程定义如下：

> OpenContract 是面向智能体的 Action 与 Markdown Artifact Contract 规范及校验工具，不负责任务编排和执行。

OpenContract 提供：

- 符合 Agent Skills 标准的 Action 定义；
- Markdown-first 的 Artifact Contract；
- Artifact、ActionRun 和引用图校验；
- 项目内的系统定义、正式 Spec 和任务历史管理；
- Codex、Claude、Cursor 等 Harness 的轻量适配。

OpenContract 不提供：

- 固定工作流或中央调度器；
- Action 自动执行器；
- 自动决定下一步的工作流运行时；
- 后台服务、数据库或强制状态机；
- 对所有非结构化行为的模板化约束。

## 2. 核心心智模型

### 2.1 Action 与 ActionRun

`Action` 描述“能做什么”，是可复用的行动说明书；`ActionRun` 描述“这次实际做了什么”，是某个任务下被跟踪的一次行动。

Action 的核心关系仍可表达为：

```text
Action = (action, define, inputs, outputs)
```

但 Action 的权威载体不是单独的 YAML，而是符合 Agent Skills 标准的 `SKILL.md`。

ActionRun 不使用 JSON 日志或中央清单。需要跟踪时，它表现为任务目录下的一个 Action 目录，其中包含本次行动产生的 Markdown Artifact。

### 2.2 Artifact 与 Contract

Artifact 是智能体产生并可被后续行动引用的 Markdown 文件。Contract 是该类 Artifact 的唯一权威定义，负责说明：

- 文件表达什么；
- 公共字段与专用字段；
- 必需章节和结构；
- 语义规则；
- 错误码和修正建议；
- 可选的自定义语义 Validator。

Action 与 Contract 相互独立，通过 Action 的输入输出规则建立多对多关系。不得为每个 Action 机械创建同名 Contract。

### 2.3 状态与行为图

OpenContract 不维护中央状态文件、数据库或真实 DAG。当前状态由以下内容动态推导：

```text
当前状态 =
  用户目标
  + 当前对话
  + 项目现状
  + 已有 Artifact
  + 已跟踪的 Action 目录
  + 人类决策
  + 当前约束
```

所谓“行为图”是智能体实际执行轨迹形成的图，而不是系统预先规定的流程。智能体可以选择、跳转、重复、分支、并行、合并或结束 Action。

## 3. 项目目录模型

系统控制层与用户产物层必须分离：

```text
project/
├── .opencontract/                    # 系统控制层
│   ├── config.yaml
│   ├── system/                       # CLI 覆盖式管理的内置内容
│   │   ├── manifest.yaml
│   │   ├── actions/
│   │   │   ├── opencontract/
│   │   │   │   └── SKILL.md
│   │   │   └── <action>/SKILL.md
│   │   └── contracts/
│   │       └── <contract>/
│   ├── cache/                        # 历史精确版本
│   ├── actions/                      # 项目自定义 Action
│   └── contracts/                    # 项目自定义 Contract
├── .codex/                           # Codex 适配层
├── .claude/                          # Claude 适配层
├── .cursor/                          # Cursor 适配层
└── opencontract/                     # 用户可见内容
    ├── specs/                        # 当前有效的正式 SDD Spec
    └── artifacts/                    # 活跃任务和历史任务
        └── archive/
```

`.opencontract/system/` 是系统内置定义的当前权威来源，由 `init/update` 管理，不建议手工修改。`.opencontract/actions/` 和 `.opencontract/contracts/` 归项目所有，系统升级不得覆盖。

`opencontract/specs/` 保存当前项目事实；`opencontract/artifacts/` 保存任务过程和历史证据。系统升级绝不修改这两个目录。

### 3.1 工作区发现

CLI 和智能体从当前目录向上查找最近的：

```text
.opencontract/config.yaml
```

其父目录即工作区根目录。嵌套工作区采用最近配置优先。找不到配置时返回 `WORKSPACE_NOT_FOUND`，不得擅自初始化。

最小配置如下：

```yaml
version: "v1.0.0"

paths:
  specs: opencontract/specs
  artifacts: opencontract/artifacts

validators:
  trusted_roots:
    - .opencontract/system/contracts
    - .opencontract/contracts
  timeout_seconds: 10

registries: []
```

路径必须相对于工作区根目录，且不得逃离工作区。

### 3.2 任务、ActionRun 与 Artifact

持久化结构固定为三级：

```text
opencontract/artifacts/
└── {datetime}-{task-description}/
    └── {datetime}-{action-description}/
        └── {artifact-description}.md
```

目录时间格式为 `YYYYMMDDTHHmmss`，描述部分使用简短、可读的 kebab-case。

一级目录表示用户提出的一个任务，二级目录表示被跟踪的一次 ActionRun，三级 Markdown 文件表示 Artifact 实例。目录名只用于管理，不是语义来源。

任务目录由智能体按价值决定是否创建。若任务只需要对话回答或临时探索，可以不持久化；一旦在 `opencontract/artifacts/` 中持久化任何受管理 Artifact，就必须创建完整三级结构，不允许将受管理 Artifact 零散放在 `artifacts/` 根目录。

以下情况应创建任务目录：

- 跨轮次持续工作；
- 产生结构化工程规格或计划；
- 存在多个 Action；
- 需要审计、验证或归档；
- 涉及高风险操作或人类决策；
- Artifact 会被后续 Action 通过 `inputs` 引用。

## 4. Action 标准

### 4.1 总入口

总入口本身也是标准 Agent Skill，其权威位置为：

```text
.opencontract/system/actions/opencontract/SKILL.md
```

不能使用 `.opencontract/SKILL.md`，因为 Agent Skills 要求 `name` 与父目录同名，而 `.opencontract` 不符合 `name: opencontract`。

总入口只负责发现、选择和跳转，不内置默认流程。常见路径可以作为示例，但不具有约束力。

总入口的选择规则：

- 用户未指定 Action 时，智能体自主选择当前最合适的 Action；
- 用户显式指定 Action 时优先尊重，但不能盲目执行；
- 缺少客观前提时，智能体说明证据、给出建议，并推荐合适的前置 Action；
- 改变原请求或创建前置任务必须由人类决定；
- 每次声明一个当前主 Action，独立子问题可以分支或并行；
- Action 结束后回到总入口重新评估，不预先绑定下一 Action；
- 先读取 Action 的 `name`、`description`、`version`，选定后再加载完整 `SKILL.md` 和必要资源。

显式调用某个 Action 表示“请求智能体进入该 Action”，不表示绕过前提、安全边界和人类授权强制执行。

### 4.2 具体 Action 的 SKILL.md

Action 的唯一权威定义是标准 `SKILL.md`：

````markdown
---
name: plan
description: 将已确认的目标和设计转化为可执行、可验证的实施任务。用于准备进入工程实施时。
metadata:
  opencontract: "action"
  version: "v1.0.0"
---

# Plan

## 目标与边界

## Artifact 契约

```yaml opencontract
inputs:
  - contract: design
    version: "v1.0.0"
    required: false

outputs:
  - contract: tasks
    version: "v1.0.0"
    required: true
    min: 1
```

## 行动指引

## 人类协作

## 有效性检查

## 结束后的判断
````

规则如下：

- frontmatter 严格符合 Agent Skills 标准；
- `metadata.version` 使用精确的 `vX.Y.Z`；
- `yaml opencontract` 声明可机器校验的 Artifact 边界；
- 输入输出声明是最低契约要求，不是输出白名单；
- 对话、源代码和普通项目上下文不需要伪装为 Artifact；
- “行动指引”提供规范、思路和边界，不写成僵硬流水线；
- 非结构化 Action 可以声明空输入和空输出；
- 每个 Action 完成后返回总入口重新判断。

OpenContract 只报告 ActionRun `valid/invalid`，不替智能体宣布 `complete`。业务完成度由智能体结合行动目标判断，主观接受与授权由人类决定。

## 5. 人机协作原则

统一原则是：

> 智能体负责调查、分析、提出方案并给出明确建议；人类只负责需要授权、价值判断或范围取舍的决策。

智能体不得把可自行解决的执行问题推给人类。只有存在重要取舍、风险授权、不可逆操作或无法确定的业务意图时，才请求人类决定。

请求决定时必须提供：

```text
需要决定的问题
客观背景与证据
可选方案
智能体建议
建议理由
各方案的影响
等待人类决定
```

智能体必须明确推荐方案，不能只罗列选项。人类作出决定后，智能体负责记录、落实和验证。

### 5.1 Decision 两阶段模型

`decision` Artifact 初始由智能体生成：

```yaml
---
contract: decision
version: "v1.0.0"
action: build
action_version: "v1.0.0"
created_at: "2026-08-27T14:30:00+08:00"
inputs: []
status: pending
decider: human
---
```

人类回复后，由智能体更新为：

```yaml
status: decided
decider: human
decided_at: "2026-08-27T15:00:00+08:00"
selected_option: option-a
```

`pending` 与 `decided` 都可以结构有效，但需要授权的后续操作只能接受 `status: decided` 的 Decision。`decider` 支持 `human` 或 `agent`；范围授权、高风险和重要主观取舍必须由人类决定。

未跟踪任务中的普通对话选择不强制持久化；影响受管理任务范围、授权或长期设计的决定必须记录。归档后的 Decision 不再修改。

## 6. Artifact Core

所有受管理 Artifact 必须符合 `artifact-core@v1.0.0`：

```yaml
---
contract: tasks
version: "v1.0.0"
action: plan
action_version: "v1.0.0"
created_at: "2026-08-27T14:30:00+08:00"
inputs:
  - "../../20260827T141000-build-login/login-design.md"
---
```

公共字段规则：

- `contract`、`action` 使用小写 kebab-case；
- `version` 表示 Contract 的精确版本；
- `action_version` 表示 Action 的精确版本；
- 所有版本均采用 `vX.Y.Z`；
- `created_at` 使用带时区的 RFC 3339 时间；
- `inputs` 使用 `/` 分隔、以当前 Artifact 所在目录为基准的相对路径，无输入时必须为 `[]`；
- 输入必须指向 `opencontract/` 内其他受管理 Markdown Artifact；
- 禁止绝对路径、目录穿越和通过符号链接逃离 `opencontract/`；
- `inputs` 不允许重复，顺序不表达执行顺序；
- 其他字段由具体 Contract 决定。

默认校验只检查直接输入存在、可解析并具有有效公共字段；`--recursive` 才沿 `inputs` 递归校验并检测循环依赖。

### 6.1 可变性与溯源

- `created_at` 表示 Artifact 第一次创建的时间，保持不变；
- `action` 和 `action_version` 表示最近一次实质性生成或修改当前内容的 Action；
- `inputs` 表示当前修订直接采用的来源，不累积整个历史来源；
- `specification`、`design` 等活文档可额外要求 `updated_at`；
- 完整历史由 Git 与历次 `archive-report` 保存；
- `opencontract/artifacts/archive/` 是不可变历史证据；
- `opencontract/specs/` 是持续演进的项目事实，每次更新必须重新校验。

## 7. Contract 标准

### 7.1 Contract 包

```text
contracts/
└── tasks/
    ├── contract.md              # 唯一权威定义
    ├── template.md              # 默认写作脚手架
    ├── templates/               # 可选模板变体
    ├── validator.py             # 可选语义校验器
    └── fixtures/
        ├── valid/
        └── invalid/
```

`contract.md` 基线如下：

````markdown
---
name: tasks
version: "v1.0.0"
artifact_type: markdown
artifact_core: "v1.0.0"
template: template.md
validator:
  runtime: python
  entrypoint: validator.py
  required: false
---

# Tasks Contract

## 用途与边界

## 可执行规则

```yaml opencontract
protocol: opencontract-rules
version: "v1.0.0"
frontmatter: {}
markdown: {}
```

## 语义规则

## 错误与修正建议

## 示例
````

`contract.md` 是唯一权威定义；`template.md` 只负责引导写作，不是第二份规则。模板可以包含待填写提示，本身不要求是完整有效的 Artifact。

### 7.2 声明式规则

frontmatter 直接采用 JSON Schema Draft 2020-12，Markdown 正文采用小型 AST 规则：

````yaml
protocol: opencontract-rules
version: "v1.0.0"

frontmatter:
  $schema: "https://json-schema.org/draft/2020-12/schema"
  type: object
  required:
    - contract
    - version
    - action
    - action_version
    - created_at
    - inputs
  properties:
    contract:
      const: tasks
    version:
      const: "v1.0.0"
    action:
      type: string
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"
    action_version:
      type: string
      pattern: "^v\\d+\\.\\d+\\.\\d+$"
    created_at:
      type: string
      format: date-time
    inputs:
      type: array
      uniqueItems: true
      items:
        type: string
  additionalProperties: true

markdown:
  sections:
    - heading: 目标
      level: 2
      required: true
      min_occurs: 1
      max_occurs: 1
      min_content_chars: 1
  ordered: true
````

Markdown 规则只负责标题、层级、顺序、数量和最小内容。唯一性、依赖环、跨 Artifact 一致性等复杂语义交给自定义 Validator。

### 7.3 自定义 Validator

声明式规则默认执行。自定义代码只有位于显式信任根目录时才执行。Registry 获取的 Validator 默认不受信任。

MVP 只支持 Python Validator，并通过独立子进程执行。子进程隔离不是安全沙箱；显式信任代表用户接受该代码拥有当前进程用户的系统权限。

CLI 通过 stdin 发送临时 JSON 请求：

```json
{
  "protocol": "opencontract-validator",
  "version": "v1.0.0",
  "artifact": {
    "path": "/absolute/path/login-plan.md",
    "content": "# 登录计划\n..."
  },
  "contract": {
    "name": "tasks",
    "version": "v1.0.0",
    "path": "/absolute/path/contracts/tasks/contract.md"
  },
  "context": {
    "workspace_root": "/absolute/path/project",
    "task_root": "/absolute/path/project/opencontract/artifacts/..."
  }
}
```

Validator 通过 stdout 返回临时 JSON：

```json
{
  "valid": false,
  "errors": [
    {
      "code": "DUPLICATE_TASK_ID",
      "path": "任务/TASK-002",
      "message": "任务 ID TASK-002 重复"
    }
  ],
  "repair_hints": [
    "为重复任务分配新的唯一 ID"
  ]
}
```

`stdout` 只能输出协议 JSON，日志写入 `stderr`。CLI 设置超时和输出上限，并将结果转换成统一 ValidationResult。Validator 不负责自动修复 Artifact。

## 8. SDD 规范

OpenContract 兼容 OpenSpec 与 Superpowers 的规范语义和 SDD 方法，但不要求复制其物理目录。

推荐路径之一是：

```text
build   → 形成提案、需求变化和设计
plan    → 形成实施任务
execute → 实施
verify  → 验证
archive → 同步正式 Spec 并归档历史
```

这只是常见路径，不是固定工作流。

### 8.1 Specification

任务中的增量规格和正式规格共用 `specification` Contract，通过 `mode` 区分。

增量规格：

```yaml
mode: delta
capability: user-authentication
```

正文使用 `ADDED / MODIFIED / REMOVED`，Requirement 使用明确的 `SHALL/MUST` 等规范性语言，Scenario 使用可验证的 `WHEN/THEN`。

正式规格：

```yaml
mode: canonical
capability: user-authentication
```

正文只描述当前有效事实，不保留增量标记。推荐路径为：

```text
opencontract/specs/<capability>/spec.md
```

Contract 包提供默认 delta 模板和 canonical 模板变体。`archive` 负责将一个或多个 delta 智能合并到 canonical。

### 8.2 Design

`design` Contract 同样采用双模式：

```yaml
mode: change
scope: user-authentication
```

或：

```yaml
mode: canonical
scope: user-authentication
```

`change` 描述当前任务的技术方案和取舍；`canonical` 描述长期有效的架构与设计事实。正式设计通常位于：

```text
opencontract/specs/<scope>/design.md
```

跨 capability 的架构设计可以由智能体放入符合 SDD 语义的结构，例如：

```text
opencontract/specs/architecture/<scope>.md
```

## 9. MVP 内置 Action

MVP 包含十二个 Action：

```text
explore
clarify
decompose
suggest
build
plan
execute
debug
review
verify
report
archive
```

总入口 `opencontract` 是额外的元 Action，不计入上述业务 Action 集。

### 9.1 Artifact 边界

下表中的必要输出只在 Action 被持久化跟踪时适用：

| Action | 必要输出 | 可选输出 |
|---|---|---|
| `explore` | `note` | `decision` |
| `clarify` | `note` | `decision` |
| `decompose` | `decomposition` | `note`、`decision` |
| `suggest` | `suggestion` | `decision` |
| `build` | 1 个 `proposal`、至少 1 个 `specification` | `design`、`note`、`decision` |
| `plan` | 至少 1 个 `tasks` | `note`、`decision` |
| `execute` | 至少 1 个 `execution-report` | `note`、`decision` |
| `debug` | 至少 1 个 `debug-report` | `note`、`decision` |
| `review` | 至少 1 个 `review-report` | `note`、`decision` |
| `verify` | 至少 1 个 `verification-report` | `note`、`decision` |
| `report` | 至少 1 个 `report` | `note`、`decision` |
| `archive` | 1 个 `archive-report` | `note`、`decision` |

`build` 只构建工程规格，不修改业务代码。涉及架构、接口、数据模型、安全或重要技术取舍时必须产生 `design`；纯需求变更可以不产生 Design，但智能体应说明理由。

`plan` 不强制必须先经过 `build`。`execute` 负责实际工程修改。`debug` 是否实施修复取决于用户授权。`review` 默认只读，回答“是否合理、清晰、可维护”；`verify` 回答“是否满足明确要求”，发现失败时不自动修改实现。

### 9.2 Suggest 与前置任务

`suggest` 用于智能体发现原任务缺少客观前提时提出独立流程：

```text
发现缺失前提
→ 收集证据
→ 提出独立任务及影响
→ 给出明确建议
→ 等待人类决定
```

人类同意后，在 `opencontract/artifacts/` 下创建新的同级任务，而不是嵌套第四层。新任务的首个 Artifact 通过 `inputs` 引用原 `suggestion` 和已决定的 `decision`。人类拒绝后，不创建新任务，智能体返回原任务寻找替代方案或报告限制。

## 10. MVP 内置 Contract

MVP 包含十四个 Contract：

```text
note
decision
decomposition
suggestion
proposal
specification
design
tasks
execution-report
debug-report
review-report
verification-report
report
archive-report
```

其中：

- `note` 为探索和澄清提供轻量持久化；
- `decision` 记录建议、理由和最终决定；
- `specification` 同时支持 delta 与 canonical；
- `design` 同时支持 change 与 canonical；
- 专项报告 Contract 分别约束执行、诊断、审查、验证和归档证据。

所有内置 Contract 初始版本均为 `v1.0.0`。

## 11. Archive 语义

任何 Artifact 都可以成为归档同步的来源。Contract 不通过 `syncable` 字段硬编码同步资格。

`archive` 的行动原则：

```text
理解任务及全部 Artifact
→ 检查项目现有正式 Spec
→ 判断哪些内容代表新的项目事实
→ 选择合适的目标位置和表达方式
→ 创建、合并、重写、拆分或移除内容
→ 校验修改后的正式 Spec
→ 修复引用
→ 生成 archive-report
→ 移动任务目录
```

智能体自主决定如何同步，Contract 只校验来源和最终 Spec 是否有效。发生重大语义冲突、范围变化或破坏性删除时，智能体必须给出建议并等待人类决定。

`archive-report` 至少记录：

- 使用了哪些来源 Artifact；
- 更新了哪些正式 Spec；
- 执行了哪些提炼、合并、拆分或删除；
- 如何处理冲突；
- 执行了哪些校验；
- 任务最终归档到哪里。

只有正式 Spec、引用修复和归档报告全部有效后，才能将任务目录移动到：

```text
opencontract/artifacts/archive/
```

由于 `inputs` 使用相对路径，归档移动必须搜索并改写 `opencontract/` 内受影响的 `inputs` 和 Markdown 链接，再执行递归校验。无法安全修复时停止归档，并由智能体给出决策建议。

归档任务视为不可变历史。需要继续演进时，创建新的同级任务并引用旧 Artifact。

## 12. ActionRun 校验

`opencontract validate-action <action-directory>` 执行以下检查：

1. Action 目录名符合 `{YYYYMMDDTHHmmss}-{short-description}`；
2. 扫描目录直属的受管理 Markdown；
3. 所有 Artifact 的 `action` 与 `action_version` 一致；
4. 精确解析对应 `SKILL.md`；
5. 将当前目录中的受管理 Markdown 视为输出；
6. 合并所有输出的 `inputs`，形成受管理输入集合；
7. 检查 Action 声明的必要输入、输出、版本和数量；
8. 逐个校验所有输出 Artifact；
9. 允许额外的有效 Artifact；
10. 非 Markdown 附件不参与 Contract 校验；
11. 普通无 frontmatter Markdown 不得混放在 Action 目录；
12. `decision.status: pending` 不影响目录结构有效性；
13. `--recursive` 才校验完整依赖图并检测循环。

`validate-action` 只判断 ActionRun 是否满足契约，不判断业务是否完成或是否获得授权。

## 13. 定义解析、版本与缓存

所有版本采用 `vMAJOR.MINOR.PATCH`：

- MAJOR：不兼容变化；
- MINOR：向后兼容的能力扩展；
- PATCH：不改变原设计意图的错误修正和说明改进。

已发布的精确版本不可修改。Artifact 和 Action 输入输出规则都使用精确版本，不允许 `latest`、隐式升级或版本范围。

解析顺序：

1. 解析 Artifact 等精确引用时，按名称和精确版本搜索项目定义与当前系统定义；
2. 只有一个精确匹配项时使用；同一名称和版本存在多个来源时报告冲突；
3. 为新 Artifact 或显式 Action 请求选择当前版本时，同名项目定义与系统定义同时存在即视为来源不明确，即使二者版本不同；
4. 项目替换系统定义需要在配置中显式声明 override；
5. 当前定义缺失时查历史缓存；
6. 缓存缺失时查显式 Registry；
7. Registry 内容进入缓存，但 Validator 默认不受信任；
8. 均未找到时返回 `ACTION_NOT_FOUND` 或 `CONTRACT_NOT_FOUND`。

override 示例：

```yaml
overrides:
  actions:
    plan: project
  contracts:
    tasks: project
```

MVP 只实现本地目录型 Registry。远程 Registry 保留接口，后续实现。

## 14. ValidationResult 协议

默认输出适合人类阅读；`--json` 提供临时机器接口，不属于持久化 Artifact。需要保存校验结果时，智能体生成符合对应报告 Contract 的 Markdown。

统一 JSON 结果示例：

```json
{
  "protocol": "opencontract-validation",
  "version": "v1.0.0",
  "valid": false,
  "target": {
    "type": "artifact",
    "path": "opencontract/artifacts/.../login-tasks.md",
    "contract": "tasks",
    "contract_version": "v1.0.0"
  },
  "checks": {
    "artifact_core": "passed",
    "contract_structure": "failed",
    "semantic_validator": "skipped",
    "references": "passed"
  },
  "errors": [
    {
      "code": "MISSING_SECTION",
      "phase": "contract_structure",
      "path": "验收标准",
      "location": {
        "line": 18,
        "column": 1
      },
      "message": "缺少“验收标准”章节",
      "repair_hint": "为每个任务补充可客观验证的验收条件"
    }
  ],
  "warnings": []
}
```

统一阶段为：

```text
parse
artifact_core
contract_structure
semantic_validator
references
action_contract
```

`errors` 使 `valid: false`；`warnings` 不使校验失败。无法执行的后续阶段标记为 `skipped`。目录校验包含汇总和每个文件的独立结果。

退出码：

```text
0  校验通过
1  目标不符合契约
2  配置、定义、信任或参数错误
3  校验过程异常
```

## 15. CLI

MVP CLI 只提供系统管理、发现和校验：

```text
opencontract init [--harness auto]
opencontract update [--harness auto]
opencontract doctor

opencontract action list
opencontract action inspect <name>
opencontract contract list
opencontract contract inspect <name> --version <vX.Y.Z>

opencontract validate <file-or-directory> [--recursive] [--json]
opencontract validate-action <action-directory> [--json]
opencontract contract test <name> --version <vX.Y.Z>
```

MVP 不提供：

```text
opencontract run
opencontract next
opencontract execute
opencontract archive
```

这些属于智能体 Action，不应由 CLI 编排或执行。MVP 也不提供 Artifact 创建命令；智能体读取对应模板后自主决定目录、文件名和内容，CLI 负责校验。

## 16. Harness 适配

统一逻辑调用为：

```text
opencontract
opencontract <action>
opencontract actions
opencontract inspect <action>
opencontract validate <path>
```

各 Harness 映射为自身支持的语法。Harness 目录只安装一个标准 `opencontract` 入口 Skill：

```text
.codex/skills/opencontract/SKILL.md
.claude/skills/opencontract/SKILL.md
.cursor/skills/opencontract/SKILL.md
```

入口引导加载 `.opencontract/system/actions/opencontract/SKILL.md`。具体 Action 不复制到 Harness 目录。支持参数的 Harness 使用统一入口；不支持参数的 Harness 可以生成轻量命令文件。

适配文件带生成标记，`init/update` 只覆盖这些文件，避免破坏用户自己的 Harness 配置。

## 17. Init 与 Update

`init`：

- 创建系统结构、用户 Spec 和 Artifact 根目录；
- 生成默认配置并安装 Harness 适配；
- 已存在工作区时停止并提示使用 `update`；
- 不清空任何已有用户内容。

`update`：

```text
读取随 npm 包发布的新系统包
→ 写入临时 staging 目录
→ 校验全部 Action、Contract 和适配模板
→ 缓存当前精确版本
→ 原子替换 .opencontract/system/
→ 更新带生成标记的 Harness 适配
→ 运行 doctor
→ 失败时恢复旧系统
```

`.opencontract/system/manifest.yaml` 记录系统包版本以及内置 Action、Contract 的精确版本。

`.opencontract/system/` 整体覆盖，不做三方合并；`.opencontract/cache/` 默认不自动删除；项目扩展、配置、正式 Spec 和任务 Artifact 均不覆盖。升级不自动提交 Git，也不修改业务代码。

## 18. 技术架构

核心 CLI 使用：

```text
TypeScript
ESM
Node.js 22+
pnpm
Vitest
```

发布为 npm 包 `@opencontract/cli`，命令入口为 `opencontract`。

主要依赖方向：

- `commander`：CLI；
- `yaml`：YAML 与 frontmatter；
- `unified/remark`：Markdown AST；
- `ajv`：JSON Schema Draft 2020-12；
- `semver`：版本解析；
- Node 原生 `child_process`：Validator 子进程。

核心组件：

```text
CLI
├── Workspace
├── Markdown
├── Definitions
├── Rule Engine
├── Validator Runner
├── Artifact Validation
├── Action Validation
├── System Manager
├── Harness Adapters
└── Presentation
```

推荐源码结构：

```text
src/
├── cli/
├── workspace/
├── markdown/
├── definitions/
├── validation/
├── validators/
├── actions/
├── system/
├── harnesses/
└── presentation/
```

模块之间传递结构化对象，不传递终端字符串。所有用户输出由 Presentation 统一生成，以便未来复用到编辑器插件或其他接口。

## 19. 测试与验收

### 19.1 单元测试

覆盖：

- frontmatter 与 Markdown AST；
- JSON Schema 与章节规则；
- SemVer 精确解析；
- 安全相对路径、目录穿越和符号链接；
- 来源冲突和 override；
- `inputs` 循环；
- ValidationResult 和退出码。

### 19.2 Contract 一致性测试

每个内置 Contract 必须包含 valid/invalid fixtures。`contract test` 必须确认：

- valid fixtures 全部通过；
- invalid fixtures 全部失败；
- invalid fixtures 返回预期错误码；
- 模板包含正确公共 frontmatter 和必要章节。

### 19.3 集成与安全测试

覆盖：

- `init/update/doctor`；
- 单 Artifact、目录、ActionRun 和递归依赖；
- 归档移动后的引用修复场景；
- Harness 适配；
- JSON 与终端输出；
- 更新失败回滚；
- Validator 未受信任、超时、非法 JSON、stdout 污染、非零退出、输出过大和 Python 缺失。

MVP 不承诺沙箱化受信任 Validator。安全测试只验证 OpenContract 的信任门、协议边界、超时和路径输入，不声称阻止已受信任代码访问当前用户可访问的系统资源。

CI 覆盖 Linux、macOS、Windows，以及 Node.js 22 和当前 LTS。所有内置 Action 必须通过标准 `skills-ref validate`。

MVP 完成标准是：

> 从初始化、生成受管理 Artifact、校验、ActionRun 校验到系统更新和历史版本复验，整条链路都有自动测试证明。

## 20. v1.0.0 MVP 边界

v1.0.0 包含：

- TypeScript/Node.js CLI；
- 工作区初始化与覆盖式升级；
- Artifact、Action、Contract 和 ValidationResult 协议；
- Markdown、JSON Schema 和 AST 校验；
- 受信任 Python Validator 协议；
- Artifact、目录、依赖图和 ActionRun 校验；
- 系统定义、项目扩展、历史缓存和本地 Registry；
- 总入口、十二个 Action 和十四个 Contract；
- Codex、Claude、Cursor 适配；
- Quick Start、完整示例和 conformance fixtures；
- 跨平台自动测试。

v1.0.0 不包含：

- 远程 Registry；
- 独立二进制或图形界面；
- MCP Server、后台服务或数据库；
- CLI 自动执行 Action、自动归档或 Spec 合并；
- Artifact 自动迁移工具；
- Python 之外的 Validator 运行时；
- 强安全沙箱；
- DeepSeek Harness、WorkBuddy 等额外适配；
- 遥测。

## 21. 最终原则

OpenContract v1.0.0 遵循以下原则：

1. 让智能体自由选择行动，不把建议路径变成固定流程。
2. 用标准 Agent Skills 描述行动方法和边界。
3. 用 Markdown Contract 描述产物什么才算有效。
4. 用 CLI 校验，不用 CLI 代替智能体执行。
5. 人类只负责授权、价值判断和范围取舍，智能体必须给出明确建议。
6. 系统定义、项目扩展、正式 Spec 和任务历史彼此隔离。
7. 精确版本、发布后不可变、历史结果可重复验证。
8. 正式 Spec 是持续演进的项目事实，归档 Artifact 是不可变历史证据。
9. 优先发挥智能体判断能力，只把机器必须稳定判断的边界契约化。
