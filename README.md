# OpenContract

OpenContract 是一套为智能体驱动的工作提供契约验证能力的轻量级工具链。它通过可执行的 Artifact Contract 确保结构化产物符合约定，同时让智能体保持自由选择行为路径的灵活性。

## 核心价值

- **契约验证，不是流程控制** — 校验 Artifact 是否有效，但不决定下一步做什么
- **结构化边界，自由路径** — 关键交付物有契约约束，行为选择由智能体决定
- **本地优先，无需服务** — 一个 CLI + 本地文件，无后台服务、无 MCP 依赖
- **Harness 无关** — 核心能力独立于 Codex、Claude、Cursor 等具体 harness
- **精确版本，可复现** — 所有 Contract 和 Action 使用精确语义化版本

## 快速开始

### 安装

```bash
npm install -g @opencontract/cli
```

或通过 npx 直接使用：

```bash
npx @opencontract/cli --help
```

### 初始化工作区

```bash
cd your-project
opencontract init --harness claude
```

这会创建工作区结构并安装系统定义：

```
.opencontract/          # OpenContract 工作区
├── config.yaml         # 配置文件
├── system/             # 系统 Actions 和 Contracts（13 + 14）
├── actions/            # 项目自定义 Actions
└── contracts/          # 项目自定义 Contracts

opencontract/           # 受管理的工作产物
├── specs/              # 规范文档
└── artifacts/          # Artifact 和 ActionRuns
    └── archive/        # 已归档任务

.claude/skills/opencontract/  # 生成的 Harness 适配器
```

### 验证 Artifact

```bash
# 单文件验证
opencontract validate opencontract/artifacts/task-001/note.md

# 目录验证（递归扫描 .md 文件）
opencontract validate opencontract/artifacts/task-001/

# 递归验证输入引用链
opencontract validate opencontract/artifacts/task-001/report.md --recursive

# JSON 格式输出（供脚本使用）
opencontract validate opencontract/artifacts/task-001/note.md --json
```

### 验证 ActionRun

ActionRun 是包含多个输出 Artifact 的目录，校验会检查：
- 每个输出是否符合声明的 Contract
- 输入数量和必需约束是否满足
- 引用路径是否存在

```bash
opencontract validate-action opencontract/artifacts/task-001/20260828T100500-explore
```

### 检查工作区健康状态

```bash
opencontract doctor
```

## 使用场景

### 1. 智能体产生结构化产物时验证契约

```markdown
---
contract: proposal
version: v1.0.0
action: build
action_version: v1.0.0
created_at: "2026-08-28T10:00:00Z"
inputs: []
---

## Why

重构认证模块以支持多租户。

## What Changes

将用户表拆分为租户表和用户表，添加租户 ID 外键。

## Impact

需要数据迁移脚本；现有 API 需要增加租户上下文参数。
```

智能体在生成此 Artifact 后调用：

```bash
opencontract validate proposal.md
# 退出码 0 表示通过，1 表示不符合契约
```

### 2. ActionRun 输入输出约束检查

Action 声明输入输出 Contract（来自 SKILL.md）：

```yaml
inputs:
  - contract: proposal
    version: v1.0.0
    required: true
    minCount: 1

outputs:
  - contract: tasks
    version: v1.0.0
    required: true
    minCount: 1
    maxCount: 1
```

智能体完成 ActionRun 后验证：

```bash
opencontract validate-action opencontract/artifacts/task-001/20260828T110000-plan
# 检查是否有 1 个 proposal 输入、1 个 tasks 输出
```

### 3. 跨 Artifact 引用验证

Artifact 可在 frontmatter 声明输入依赖：

```markdown
---
contract: tasks
version: v1.0.0
action: plan
action_version: v1.0.0
created_at: "2026-08-28T11:00:00Z"
inputs: ["../20260828T100500-build/proposal.md"]
---

## Tasks

- [ ] 编写数据迁移脚本
- [ ] 更新 API 签名
- [ ] 添加租户上下文测试
```

使用 `--recursive` 递归验证引用链：

```bash
opencontract validate tasks.md --recursive
# 同时验证 tasks.md 和 proposal.md，检测引用循环
```

## 核心概念

### Action

一类工作的定义，声明输入输出 Contract。系统提供 13 个 Actions：

- `explore` — 调查、分析和验证以形成可靠结论
- `clarify` — 通过询问用户解决歧义并记录决策
- `decompose` — 将大目标拆解为独立可工作的部分
- `suggest` — 提供多个可行选项及权衡和推荐
- `build` — 将商定的方向转化为书面提案
- `plan` — 将提案转化为规范、设计和有序任务列表
- `execute` — 实施计划任务并记录实际完成内容
- `debug` — 诊断缺陷并记录根因和修复
- `review` — 审查变更的正确性和简化机会
- `verify` — 根据规范检查交付工作
- `report` — 为未参与工作的读者总结
- `archive` — 将已验证任务事实整合到规范并归档

### Contract

对 Artifact 的可执行约束，定义结构、章节、字段和语义规则。系统提供 14 个 Contracts：

- `note` — 探索中捕获的非正式观察
- `decision` — 需要人工授权的问题，含选项和推荐
- `decomposition` — 拆解后的独立可工作部分
- `suggestion` — 多个可行选项及权衡
- `proposal` — 意图变更声明：为什么、是什么、影响
- `specification` — 用规范性语言描述的必需行为
- `design` — 架构决策和组件关系
- `tasks` — 有序可验证任务列表
- `execution-report` — 已实施内容、已验证内容、剩余内容
- `debug-report` — 症状、重现、根因、修复
- `review-report` — 正确性和简化审查发现
- `verification-report` — 已检查内容、通过内容、失败内容
- `report` — 工作体的独立总结
- `archive-report` — 规范更新、修复引用、最终归档位置

### Artifact

带 frontmatter 的 Markdown 文件，可被 Contract 校验。Frontmatter 必须包含：

```yaml
contract: <contract-name>
version: <v1.0.0>
action: <action-name>
action_version: <v1.0.0>
created_at: <ISO-8601-timestamp>
inputs: [<relative-path>, ...]
```

### ActionRun

一次具体的 Action 执行记录，表现为包含多个输出 Artifact 的目录。目录名格式：`<ISO-timestamp>-<action-name>`。

## 命令参考

### `init`

```bash
opencontract init [--harness <names>]
```

初始化工作区。`--harness` 接受逗号分隔的 harness 名称：`codex`、`claude`、`cursor`。

### `update`

```bash
opencontract update [--json]
```

安装或刷新系统树和 harness 适配器。幂等操作，可安全重复运行。

### `doctor`

```bash
opencontract doctor [--json]
```

报告工作区健康状态：配置、manifest、定义、信任根、适配器。

### `validate`

```bash
opencontract validate <path> [--json] [--recursive]
```

验证 Artifact 或目录。`--recursive` 递归验证 `inputs` 引用链并检测循环。

### `validate-action`

```bash
opencontract validate-action <directory> [--json]
```

验证 ActionRun 目录，检查输入输出是否满足 Action 的 Contract 约束。

### `action list`

```bash
opencontract action list [--json]
```

列出已安装的 Actions。

### `action inspect`

```bash
opencontract action inspect <name> --version <version> [--json]
```

显示 Action 的输入输出 Contract 声明。

### `contract list`

```bash
opencontract contract list [--json]
```

列出已安装的 Contracts。

### `contract inspect`

```bash
opencontract contract inspect <name> --version <version> [--json]
```

显示 Contract 的规则、模板和 validator。

### `contract test`

```bash
opencontract contract test <name> --version <version> [--json]
```

运行 Contract 的 fixture 检查和模板校验。

## 配置

`.opencontract/config.yaml` 示例：

```yaml
# 系统定义树（由 opencontract update 管理）
system: .opencontract/system

# 缓存的精确版本定义
cache: .opencontract/cache

# 项目自定义 Actions 和 Contracts
projectActions: .opencontract/actions
projectContracts: .opencontract/contracts

# 规范和受管理 Artifacts 的位置
specs: opencontract/specs
artifacts: opencontract/artifacts
archive: opencontract/artifacts/archive

# 外部注册表（可选）
registries: []

# 信任配置：允许运行 validator 的根目录
trust:
  validatorRoots:
    - .opencontract/system

# Validator 子进程配置
validator:
  pythonExecutable: python3
  timeoutMs: 30000
  maxOutputBytes: 1048576

# 定义源冲突时的覆盖规则（可选）
overrides:
  actions: {}
  contracts: {}

# 已选择的 Harness 适配器
harnesses: ["claude"]
```

所有路径相对于工作区根目录（`.opencontract/` 的父目录）。

## 编写自定义 Contract

Contract 定义一种 Artifact 的结构和语义约束。目录结构：

```
.opencontract/contracts/<name>/v1.0.0/
├── contract.md          # Contract 元数据和规则
├── template.md          # 模板（供智能体参考）
├── fixtures/
│   ├── valid/          # 应该通过校验的示例
│   └── invalid/        # 应该失败的示例
└── validator.py        # 可选的语义校验器
```

### contract.md

```markdown
---
name: note
version: v1.0.0
artifactType: note
artifactCoreVersion: v1.0.0
description: Quick observation captured during exploration.
template: template.md
rules:
  frontmatterSchema:
    type: object
    required: [contract, version, action, action_version, created_at, inputs]
  sections:
    - name: Observation
      level: 2
      required: false
      minimumContent: 1
---

# Note Contract

该 Contract 校验 `note` Artifact 类型 v1.0.0。

## 结构

Frontmatter 必须包含 artifact-core 元数据字段。正文可选包含 `## Observation` 章节。

## 用途

智能体在探索、分析或调查时产生快速观察记录。
```

### 语义 Validator（可选）

Contract 可声明 Python validator 运行自定义校验逻辑。Validator 通过 stdin/stdout JSON 协议通信：

**请求格式**：

```json
{
  "protocol": "opencontract-validator-request",
  "version": "v1.0.0",
  "artifact": {
    "path": "/absolute/path/to/artifact.md",
    "contract": "note",
    "contractVersion": "v1.0.0",
    "frontmatter": { ... },
    "body": "...",
    "headings": [...]
  }
}
```

**响应格式**：

```json
{
  "protocol": "opencontract-validator-response",
  "version": "v1.0.0",
  "valid": true,
  "errors": [],
  "warnings": []
}
```

只有位于 `trust.validatorRoots` 配置路径下的 validator 才会被执行。

## 编写自定义 Action

Action 定义一类工作的输入、输出和执行方法。目录结构：

```
.opencontract/actions/<name>/v1.0.0/
└── SKILL.md
```

### SKILL.md

```markdown
---
name: explore
description: Investigate, analyze, and verify to form reliable conclusions.
metadata:
  version: v1.0.0
---

# Explore

Use this Action when you need to understand the current state before proposing
changes. Read files, search online, think through implications, and verify your
conclusions.

## Declared contracts

\```yaml opencontract
inputs: []
outputs:
  - contract: note
    version: v1.0.0
    required: false
\```

## When to use

- The user asks you to investigate, research, or analyze something
- You need to understand existing code or behavior before planning changes

## Completion criteria

- You have a clear understanding of the current state
- Your conclusions are backed by evidence
- You've verified any assumptions
```

## 验证输出格式

### 退出码

```
0 = 校验通过
1 = Artifact 不符合契约
2 = Contract 无法解析或配置错误
3 = 意外错误
```

### JSON 协议

`--json` 标志输出机器可读结果：

```json
{
  "protocol": "opencontract-validation",
  "version": "v1.0.0",
  "target": {
    "path": "/abs/path/to/artifact.md",
    "type": "file",
    "contract": "note",
    "contractVersion": "v1.0.0"
  },
  "valid": true,
  "phases": [
    {"phase": "parse", "status": "passed"},
    {"phase": "artifact_core", "status": "passed"},
    {"phase": "contract_structure", "status": "passed"},
    {"phase": "semantic_validator", "status": "skipped"},
    {"phase": "references", "status": "passed"}
  ],
  "errors": [],
  "warnings": []
}
```

## 安全和信任边界

### Validator 信任根

OpenContract 只运行位于 `trust.validatorRoots` 配置路径下的 validator。默认信任 `.opencontract/system`（系统捆绑）。

要信任项目自定义 validators：

```yaml
trust:
  validatorRoots:
    - .opencontract/system
    - .opencontract/contracts
```

未信任的 validator 不会运行，校验阶段跳过并报告 `VALIDATOR_UNTRUSTED`。

### 路径安全

- Artifact `inputs` 字段中的引用必须是相对路径
- 引用不得逃逸 `artifacts` 或 `specs` 目录
- 符号链接会被解析，逃逸检查在解析后执行
- 绝对路径、`..` 遍历出边界、UNC 路径全部被拒绝

### Validator 沙箱

- Validator 通过 stdin/stdout 协议通信
- 超时强制终止子进程（默认 30 秒）
- stdout 超限强制终止（默认 1 MiB）
- Python runtime 路径可配置

## 库 API

`@opencontract/cli` 同时导出库接口，供 Node.js 应用直接调用：

```typescript
import {
  requireWorkspace,
  resolvePaths,
  DefinitionResolver,
  validateArtifact,
  validateActionRun,
} from '@opencontract/cli';

const workspace = requireWorkspace(process.cwd());
const paths = resolvePaths(workspace);
const resolver = new DefinitionResolver(paths, workspace.config);

const result = await validateArtifact('path/to/artifact.md', {
  resolver,
  workspaceRoot: paths.root,
  managedRoot: paths.artifacts,
  trustedValidatorRoots: paths.trustedValidatorRoots,
  validatorRuntime: workspace.config.validator,
});

console.log(result.valid, result.errors);
```

## 显式非目标

OpenContract **不提供**以下能力：

- **Action 调度器** — 不决定下一步执行哪个 Action
- **Action 执行器** — 不运行 `execute` 或其他 Action 的实际工作
- **任务归档 CLI** — 不提供 `opencontract archive` 命令
- **工作流编排** — 不强制 explore → plan → execute 等固定流程
- **注册表协议** — v1.0.0 仅支持本地定义

这些职责由智能体、人类或外部工具承担。OpenContract 专注于提供独立、可移植的契约校验能力。

## 资源和文档

- **概念设计** — [README-Concept.md](README-Concept.md)：心智模型、行为图、设计原则
- **发布检查清单** — [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
- **系统定义** — `resources/system/`：13 个 Actions、14 个 Contracts
- **测试 fixtures** — `test/fixtures/`

## 开发

```bash
# 克隆仓库
git clone https://github.com/opencontract/opencontract.git
cd opencontract

# 安装依赖
pnpm install

# 类型检查
pnpm type-check

# 构建
pnpm build

# 运行测试
pnpm test:run

# 验证 Skills
pnpm validate:skills
```

测试覆盖率：337 个测试用例，覆盖所有核心场景和边界条件。

## License

MIT

## 问题追踪

https://github.com/opencontract/opencontract/issues
