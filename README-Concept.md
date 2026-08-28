# opencontract

## 基于可执行 Artifact 契约的原子行为图心智模型

`opencontract` 是一套面向智能体工作的心智模型与轻量基础设施。

它将任意工作拆解为可自由组合的原子行为（Action），并使用可执行的 Artifact Contract 约束结构化行为的输入与输出。智能体负责选择和执行行为，人类负责判断、协作和干预，`opencontract` 负责提供行为方法、契约定义以及 Artifact 校验能力。

`opencontract` 不是固定工作流，也不是任务执行器或工作流编排器。

## 核心目标

- 将小型任务和超大型项目都展平为原子行为图
- 允许智能体根据当前状态自由选择、跳转、循环、分支和结束
- 让结构化产物具有机器可校验的契约
- 让非结构化行为保持灵活，不被模板和流程束缚
- 通过 Skills 指导模型理解行为和行为方法
- 通过 CLI 提供独立、可移植的 Artifact 校验能力
- 通过 Harness 斜杠命令让人类直接发现和调用行为
- 兼容 Codex、Cursor、DeepSeek Harness、WorkBuddy 等不同 Harness

## 一、原子行为

每个行为类型由固定四元组定义：

```text
Action = (action, define, inputs, outputs)
```

### 字段含义

- `action`：稳定的行为名称或标识符
- `define`：行为定义、目标、执行边界和完成条件
- `inputs`：行为需要读取的 Artifact 或上下文
- `outputs`：行为应该产生的 Artifact

四元组描述的是行为类型。一次具体执行应额外记录为 `ActionRun`，包括输入、输出、状态、证据和用户确认等运行信息。

## 二、两类行为

### 非结构化行为

非结构化行为没有强制的 Artifact 契约，主要依赖当前上下文、对话和智能体判断。

```yaml
action: explore
define: >
  阅读文件、检索信息、在线搜索、思考分析并验证结论；
  必要时与用户交互，以形成可靠判断并给出反馈。
inputs: None
outputs: None
```

`outputs: None` 表示没有强制产出物，不表示绝对不能产生内容。探索可以给出对话结论，也可以产生临时笔记；但未声明或未契约化的产物不能成为下游结构化行为的硬依赖。

典型行为：

- `explore`：探索、检索、分析和验证
- `clarify`：澄清目标、范围、约束和偏好
- `brainstorm`：发散方案和可能性
- `discuss`：与人类共同判断和决策

### 结构化行为

结构化行为至少有一个必须遵守的输入或输出 Artifact Contract，通常用于计划、执行、验证、报告和交付。

```yaml
action: execute
define: >
  根据任务计划完成实际工作，并生成可验证的执行报告。
inputs:
  - artifact: tasks.md
    contract: task@v1
    required: true
outputs:
  - artifact: report.md
    contract: report@v1
    required: true
```

结构化行为的重点不是“行为复杂”，而是“输入或输出存在可验证的契约边界”。

## 三、Artifact Contract

Contract 不是普通模板，而是可执行契约。

```text
Template  = 告诉人类应该怎么写
Contract  = 告诉系统什么才算有效
```

一个 Contract 至少应描述：

- Artifact 的格式和类型
- 必填字段或章节
- 字段类型、枚举值和唯一性规则
- 引用关系和依赖关系
- 语义约束
- 校验器和校验器版本
- 错误码、错误位置和修正建议

示例：

```yaml
contract: task
version: 1
artifact:
  type: markdown
  filename: tasks.md
validation:
  structural: true
  semantic: true
  validator:
    runtime: python
    entrypoint: validators/task.py
```

推荐的 Contract 包结构：

```text
contracts/task/v1/
├── contract.yaml
├── schema.json
├── validator.py
├── README.md
└── fixtures/
    ├── valid.md
    └── invalid.md
```

校验应至少分为三层：

```text
parse → schema/structure → semantic
```

- 语法校验：能否解析
- 结构校验：格式、章节、字段和类型是否正确
- 语义校验：内容是否满足实际业务约束

除单个 Artifact 校验外，还可以进行 Action 级的跨 Artifact 关系校验。例如，`report.md` 必须覆盖 `tasks.md` 中的全部任务 ID。

## 四、opencontract 的职责边界

### 智能体负责

- 发现并选择 Action
- 执行 Action
- 与人类交互和共同判断
- 决定是否继续、分支、循环、修正或结束
- 根据校验结果修正输入或输出 Artifact

### 人类负责

- 提供目标、约束和偏好
- 通过对话或斜杠命令调用行为
- 在重要判断和高风险操作处进行确认
- 对最终结果进行接受或否决

### opencontract 负责

- 定义 Action 和 Contract 的描述格式
- 通过 Skills 指导模型理解心智模型和行为方法
- 提供 Contract Registry 和 Artifact Validator
- 通过 CLI 输出结构化校验结果
- 提供 Harness 安装和斜杠命令适配

`opencontract` 不负责执行 `execute`，也不自动决定下一步行为，不强制所有任务遵循同一条工作流。

## 五、校验机制

校验器是智能体可调用的能力，而不是工作流控制器。

```bash
opencontract validate \
  --contract task@v1 \
  --artifact tasks.md \
  --json
```

返回结果示例：

```json
{
  "valid": false,
  "contract": "task@v1",
  "artifact": "tasks.md",
  "errors": [
    {
      "code": "MISSING_SECTION",
      "path": "acceptance_criteria",
      "message": "缺少验收标准"
    }
  ],
  "repair_hints": [
    "为每个任务补充可验证的验收标准"
  ]
}
```

建议使用稳定退出码：

```text
0 = 校验通过
1 = Artifact 不符合契约
2 = Contract 或校验器配置错误
3 = 校验过程异常
```

典型的智能体使用方式：

```text
读取输入 Artifact
  ↓
调用 opencontract 校验
  ↓
无效：修正 Artifact 或询问用户
  ↓
执行结构化 Action
  ↓
生成输出 Artifact
  ↓
校验自身输出
  ↓
无效：继续修正或明确报告失败
```

未通过契约验证的输出，不得被智能体当作后续结构化行为的有效输入。

## 六、Skills

Skills 负责让模型理解和使用这套心智模型，不负责强制编排流程。

建议分为两层：

```text
skills/opencontract-core/SKILL.md
skills/opencontract-actions/
├── explore/SKILL.md
├── clarify/SKILL.md
├── plan/SKILL.md
├── execute/SKILL.md
├── verify/SKILL.md
└── report/SKILL.md
```

核心 Skill 说明：

- Action 四元组如何解释
- 如何区分结构化和非结构化行为
- 如何在行为图中自由流转
- 何时调用 Artifact 校验
- 校验失败后如何修正或请求协助
- 如何判断行为和任务是否完成

Action Skill 说明某个行为的目标、方法、边界、交互方式、输入输出 Contract 以及完成条件。

## 七、行为发现和斜杠命令

可以通过 Action Registry 描述可用行为：

```text
actions/
├── index.yaml
├── explore.yaml
├── plan.yaml
├── execute.yaml
└── verify.yaml
```

智能体可通过 Skill 和 Registry 发现行为，人类可通过 Harness 斜杠命令发现和调用行为：

```text
/opencontract help
/opencontract actions
/opencontract inspect execute
/opencontract explore
/opencontract plan
/opencontract execute
/opencontract verify
/opencontract validate task@v1 tasks.md
```

行为类斜杠命令的含义是“请求智能体进入指定 Action”，不是由 CLI 直接执行该行为。

例如：

```text
/opencontract execute
```

表示让智能体按照 `execute` Action 的定义、方法和 Contract 处理当前任务。

而：

```text
/opencontract validate task@v1 tasks.md
```

表示调用 opencontract 校验能力。

## 八、Harness 兼容

不依赖 MCP。兼容性通过以下通用接口实现：

```text
Skills 文件
CLI 命令
JSON 输出
Artifact 文件
Slash Command 适配文件
```

不同 Harness 只需要安装不同位置的轻量适配文件：

```text
Codex
  ├── opencontract Skill
  └── Slash Command 定义

Cursor
  ├── .cursor/rules/opencontract.mdc
  └── .cursor/commands/opencontract-*.md

DeepSeek Harness
  ├── Skill 指令文件
  └── Command 配置

WorkBuddy
  ├── Skill 指令文件
  └── Slash Command 配置
```

核心 Contract、Validator 和 Action 定义保持不变，只有 Skill 加载位置和斜杠命令声明格式不同。

## 九、极简安装

推荐采用单一 CLI 加项目初始化：

```bash
opencontract init --harness auto
```

初始化工具可以：

- 检测当前 Harness
- 安装核心 Skill 和 Action Skill
- 安装或生成斜杠命令
- 创建项目配置
- 注册本地 Contract
- 运行环境诊断

项目中只需要保留：

```text
opencontract.yaml
contracts/
actions/
```

不需要后台服务，不需要 MCP Server，也不需要引入复杂的工作流运行时。

## 十、行为图运行模型

工作状态可以抽象为：

```text
State = (
  goal,
  context,
  artifacts,
  decisions,
  action_history,
  constraints
)
```

智能体每一步都可以：

- 选择新的 Action
- 重复当前 Action
- 返回探索或澄清
- 创建或修正 Artifact
- 分支执行多个行为
- 合并多个结果
- 请求人类判断
- 宣布完成或报告阻塞

小型任务可能只有较短路径：

```text
explore → plan → execute → verify
```

大型任务可以形成更长路径：

```text
explore ↔ clarify → decompose → plan → execute
                                      ↕
                                    verify
                                      ↓
                                  integrate
                                      ↓
                                    report
```

这些只是可能的路径，不是系统强制的固定流程。

## 十一、设计原则

1. 行为优先于流程：先定义可复用 Action，再由智能体动态选路。
2. 契约约束交付边界：只对需要稳定传递的 Artifact 设置强制 Contract。
3. 校验不等于执行：Validator 只判断有效性，不代替智能体工作。
4. 非结构化行为保持自由：没有强制 Artifact，不代表没有方法和完成条件。
5. 无效产物不可流转：结构化行为的输入输出必须可验证。
6. 人类始终可介入：重要判断、修正和高风险操作可以回到人类。
7. Harness 无关：核心模型、Contract 和校验协议不依赖特定 Harness。
8. 极简安装：一个 CLI、一组 Skills、一套 Contract，即可开始工作。

## 总结

`opencontract` 的完整表达是：

> 用 Action 描述智能体可以做什么，用 Skill 描述这些行为应该如何理解和执行，用 Contract 描述 Artifact 什么才算有效，用 CLI 提供可执行校验，用 Slash Command 让人类发现和调用行为，用 Harness 承载对话与协作。

最终，`opencontract` 不是另一套固定工作流，而是一层独立于 Harness 的契约化智能体工作基础设施。

---

## 与实现的差异说明

本文是 v1 的**概念设计稿**，写于实现之前，其中部分示例与最终发布的 `@opencontract/cli@1.0.0` 不完全一致。实际的命令、配置与目录结构请以 [README.md](README.md) 为准。主要差异：

- **校验命令形式**：设计稿为 `opencontract validate --contract task@v1 --artifact tasks.md`；实现为 `opencontract validate <path>`，Contract 与版本从 Artifact frontmatter 读取。
- **配置与目录**：设计稿为项目根的 `opencontract.yaml` 加 `contracts/`、`actions/`；实现为 `.opencontract/config.yaml`，定义分为 `.opencontract/system/`（系统所有）与 `.opencontract/actions/`、`.opencontract/contracts/`（项目扩展），产物位于 `opencontract/artifacts/` 与 `opencontract/specs/`。
- **Contract 包结构**：设计稿为 `contract.yaml` 加 `schema.json`；实现为权威的 `contract.md`（frontmatter 内含规则与 JSON Schema）、`template.md` 与 `fixtures/valid`、`fixtures/invalid`。
- **版本形式**：设计稿使用 `task@v1`；实现只接受精确语义化版本 `vMAJOR.MINOR.PATCH`（如 `v1.0.0`），不支持范围。
- **Contract 与 Action 命名**：设计稿示例为 `task@v1`、`report@v1`；实现的 v1.0.0 目录为 14 个 Contract（`tasks`、`note`、`decision`、`proposal` 等）与 13 个 Action（1 个入口 + 12 个业务）。
- **Skills 布局**：设计稿为 `skills/opencontract-core/` 与 `skills/opencontract-actions/<name>/`；实现为 `.opencontract/system/actions/<name>/SKILL.md`，并生成 Harness 入口适配器委托给系统入口 Action。
- **斜杠命令**：设计稿列出 `/opencontract explore`、`/opencontract plan` 等一组命令；实现只生成一个 `opencontract` 入口 Skill，由智能体据其内容选择 Action。
- **Harness 支持**：设计稿提到 Codex、Cursor、DeepSeek Harness、WorkBuddy；实现的 v1.0.0 支持 `codex`、`claude`、`cursor` 三种，且 `--harness auto` 未实现（需显式指定名称）。
- **Action Registry**：设计稿的 `actions/index.yaml` 未实现；Action 通过目录枚举与 `.opencontract/system/manifest.yaml` 发现。
- **归档**：设计稿未细化；实现明确不提供 `opencontract archive` 命令，归档相关能力仅作为库 API 暴露。
