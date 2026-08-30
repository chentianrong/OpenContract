# OpenContract 项目开发约定

## 不用 OpenContract 迭代 OpenContract

本仓库是 OpenContract 系统自身的实现。在本项目内开发时，**不要使用 OpenContract 的 Skill 或 Command**：

- 不要调用 `/oc:*` 斜杠命令（`/oc:explore`、`/oc:build` 等）
- 不要使用 `oc-*` Skill（`oc-explore`、`oc-build` 等）
- 不要把 `opencontract` CLI 当作工作流工具使用

原因：这些适配器由本仓库的 `src/system/generators.ts` 生成，用它们来驱动本仓库的迭代会造成自引用混乱——被测对象同时是执行工具，一旦生成逻辑有缺陷，开发流程本身也会受影响。

允许的例外：**显式验证 CLI 行为时**可以运行 `opencontract` 命令（例如执行测试、复现缺陷、验证 `install`/`update` 的输出）。这属于测试被测对象，不是用它编排工作。

## 使用 OpenSpec 管理变更

本项目的变更走 OpenSpec 流程，`/opsx:*` 命令可正常使用（`/opsx:propose`、`/opsx:apply`、`/opsx:archive` 等）。

各 harness 的同等规则另见 [.claude/rules/no-self-use.md](.claude/rules/no-self-use.md)、[.codex/rules/no-self-use.md](.codex/rules/no-self-use.md)、[.cursor/rules/no-self-use.md](.cursor/rules/no-self-use.md)。

## 常用命令

```bash
pnpm type-check      # tsc --noEmit
pnpm test:run        # vitest run
pnpm build           # tsc + 校验 resources/
```
