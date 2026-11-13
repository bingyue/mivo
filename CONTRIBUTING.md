# 参与 Mivo

欢迎通过 [Issues](https://github.com/bingyue/mivo/issues) 和 Pull Request 贡献。维护者为邴越（[@bingyue](https://github.com/bingyue)），全网 IP：越哥聊AI，FDE 前线：[FDEChina.ai](https://FDEChina.ai)。

## 开始之前

先阅读 [README](README.md)、[架构说明](mivo/docs/architecture.md)与[许可范围](mivo/docs/licensing.md)。当前是 MVP 预览版，云端闭环和 Windows 验收仍有未完成项；不要用模拟结果声称这些能力已通过。

本仓库保留社区桌面壳的 Git 历史与子模块。新增业务优先放在 Mivo Core、插件和 Bundle，避免修改 DSH Runtime 或重复实现上游模型管理。

## 本地验证

```sh
git submodule update --init --recursive
pnpm install --frozen-lockfile --ignore-scripts
pnpm mivo:test
pnpm --filter mivo-memory typecheck
pnpm --filter mivo-workbench typecheck
```

Python 测试用真实 SQLite、临时文件和 MCP 进程；云端测试必须由贡献者显式配置并承担 API 用量。使用独立测试 Vault，禁止读写个人数据来运行测试。

## 提交要求

- 一个 PR 解决一个明确问题，说明触发条件、行为变化和实际验证结果。
- 保留原件不可覆盖、来源引用、人工确认和只读 MCP 等边界。
- API、许可、数据格式或模型行为变化时更新对应文档。
- 不提交 API Key、令牌、私人录音、Vault、模型权重、依赖目录、安装包或运行日志。
- 不对未运行的平台标记通过；复现材料使用公开或获准分享的样本。
- 遵循 [AGENTS.md](AGENTS.md) 和与修改路径对应的 `docs/specs/` 规范。

## 贡献的许可证

提交到 Mivo 原创组件的贡献，默认按 Apache-2.0 提供；应确认自己有权贡献代码。对社区桌面壳、其既有文件或其他第三方组件的修改，必须保持原许可与归属。不要把受限上游代码复制到 Apache-2.0 目录来规避许可。

上游工作流保留在 `.github/upstream-workflows/` 供追溯，不由本仓库自动运行。Mivo CI 只执行核心测试；桌面打包按需手动触发，不自动创建公共 Release。
