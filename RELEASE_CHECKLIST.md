# Release Checklist for @opencontract/cli v1.0.2

执行以下步骤验证发布就绪性：

## 1. 清洁构建

```bash
rm -rf dist/ node_modules/.cache
pnpm install --frozen-lockfile
pnpm type-check
pnpm build
```

**验证点**：
- [ ] TypeScript 编译无错误
- [ ] `scripts/verify-resources.mjs` 通过
- [ ] 输出确认：`dist output present, 79 system resource file(s), 1 harness resource file(s)`

## 2. 完整测试套件

```bash
pnpm test:run
```

**验证点**：
- [ ] 337 个测试全部通过
- [ ] 无跳过或待办测试
- [ ] 无超时或不稳定测试

## 3. Skills 符合性

```bash
pnpm validate:skills
```

**验证点**：
- [ ] 13 个 Skills（1 个入口 + 12 个业务 Action）通过 `skills-ref@0.1.5` 验证
- [ ] 输出确认：`Skills conformance passed: 13 Skill(s) validated`

## 4. 打包产物验证

```bash
pnpm pack --pack-destination /tmp
tar -tzf /tmp/opencontract-cli-1.0.2.tgz | wc -l
tar -tzf /tmp/opencontract-cli-1.0.2.tgz | grep -c "resources/system/actions/.*SKILL.md$"
tar -tzf /tmp/opencontract-cli-1.0.2.tgz | grep -c "resources/system/contracts/.*/contract.md$"
tar -tzf /tmp/opencontract-cli-1.0.2.tgz | grep "resources/system/manifest.yaml"
tar -tzf /tmp/opencontract-cli-1.0.2.tgz | grep "README.md"
```

**验证点**：
- [ ] tarball 文件数 > 300
- [ ] 13 个 Action SKILL.md 文件
- [ ] 14 个 Contract contract.md 文件
- [ ] 包含 `resources/system/manifest.yaml`
- [ ] 包含 `README.md`
- [ ] 包含 `dist/cli/index.js` 和 `dist/index.js`

## 5. CLI 入口点测试

```bash
node dist/cli/index.js --help
node dist/cli/index.js init --help
node dist/cli/index.js validate --help
```

**验证点**：
- [ ] 所有命令显示帮助信息
- [ ] 无启动错误或警告
- [ ] 版本号显示为 `1.0.2`

## 6. 库 API 导出验证

```bash
node -e "import('@opencontract/cli').then(m => console.log(Object.keys(m).length))"
```

**验证点**：
- [ ] 导出 65 个符号
- [ ] 无导入错误

## 7. 工作区初始化冒烟测试

```bash
tmpdir=$(mktemp -d)
cd "$tmpdir"
node /path/to/OpenContract/dist/cli/index.js init --harness claude
node /path/to/OpenContract/dist/cli/index.js update
node /path/to/OpenContract/dist/cli/index.js action list
node /path/to/OpenContract/dist/cli/index.js contract list
node /path/to/OpenContract/dist/cli/index.js doctor
cd -
rm -rf "$tmpdir"
```

**验证点**：
- [ ] `init` 创建目录结构
- [ ] `update` 安装系统树
- [ ] `action list` 列出 13 个 Actions
- [ ] `contract list` 列出 14 个 Contracts
- [ ] `doctor` 报告 healthy
- [ ] 生成的 `.claude/skills/opencontract/SKILL.md` 存在且包含标记

## 8. 系统目录完整性

在临时工作区运行 `update` 后检查：

```bash
find .opencontract/system -name "SKILL.md" | wc -l
find .opencontract/system/contracts -name "contract.md" | wc -l
find .opencontract/system/contracts -name "template.md" | wc -l
find .opencontract/system/contracts -name "fixtures" -type d | wc -l
```

**验证点**：
- [ ] 13 个 SKILL.md
- [ ] 14 个 contract.md
- [ ] 14 个 template.md
- [ ] 14 个 fixtures 目录
- [ ] 每个 fixtures 目录包含 `valid/` 和 `invalid/` 子目录

## 9. Contract 符合性检查

```bash
pnpm vitest run test/contract-fixtures.test.ts test/catalog-conformance.test.ts
```

**验证点**：
- [ ] 所有 Contract fixtures（valid 和 invalid）按预期工作
- [ ] 所有 Contract 模板包含所需 frontmatter
- [ ] 无意外的校验失败

## 10. package.json 元数据验证

```bash
node -e "const p = require('./package.json'); console.log(p.name, p.version, p.engines.node, p.bin.opencontract, p.exports['.'].import)"
```

**验证点**：
- [ ] name: `@opencontract/cli`
- [ ] version: `1.0.2`
- [ ] engines.node: `>=22.0.0`
- [ ] bin.opencontract: `./dist/cli/index.js`
- [ ] exports['.'].import: `./dist/index.js`
- [ ] repository、homepage、bugs 字段完整

## 11. 文档审查

手工审查：

- [ ] [README.md](README.md) 与实际 CLI 行为一致
- [ ] 快速开始示例可用
- [ ] 配置示例匹配 `init` 生成的文件
- [ ] Contract/Action 编写示例准确
- [ ] 验证 JSON 协议文档与实现一致
- [ ] 信任边界和安全说明清晰
- [ ] 显式非目标列表正确

## 12. CI/CD 状态

GitHub Actions：

- [ ] 最新 commit 在所有平台（Linux、macOS、Windows）通过
- [ ] Node.js 22 和 20 矩阵通过
- [ ] Contract 符合性作业通过
- [ ] Skills 符合性作业通过
- [ ] 覆盖率作业通过

## 13. Git 清洁状态

```bash
git status
```

**验证点**：
- [ ] 无未提交的更改
- [ ] 无未追踪文件（除了 `dist/`、`node_modules/`、临时文件）
- [ ] 所有测试、文档和资源文件已提交

## 14. 版本标签

```bash
git tag v1.0.2
git push origin v1.0.2
```

**验证点**：
- [ ] 标签指向最终发布 commit
- [ ] 标签已推送到远程

## 15. npm 发布（最后一步）

```bash
npm publish --access public --dry-run
# 验证输出后执行真实发布：
npm publish --access public
```

**验证点**：
- [ ] `--dry-run` 显示正确的文件列表
- [ ] 无发布错误
- [ ] npm 注册表显示 `@opencontract/cli@1.0.2`
- [ ] 包含所有必要文件（dist、resources、README）

## 发布后验证

```bash
npm view @opencontract/cli@1.0.2
npx @opencontract/cli@1.0.2 --help
```

**验证点**：
- [ ] npm registry 显示正确的包元数据
- [ ] `npx` 执行成功
- [ ] 版本号正确

---

**完成日期**: ___________________

**发布者**: ___________________

**npm 包 URL**: https://www.npmjs.com/package/@opencontract/cli

**Git 标签**: https://github.com/opencontract/opencontract/releases/tag/v1.0.2
