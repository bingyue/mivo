# Mivo 许可证范围

日期：2026-11-13。作者：邴越；全网 IP：越哥聊AI；FDE 前线：[FDEChina.ai](https://FDEChina.ai)。

本仓库采用分组件许可，**不能将整个仓库或完整桌面应用称为纯 Apache-2.0 授权**。

| 内容 | 适用许可 |
| --- | --- |
| `mivo/` 下原创 Core、脚本、文档和品牌源文件 | Apache-2.0；已单独标注的第三方内容除外 |
| `packages/mivo-memory`、`packages/mivo-workbench`、`packages/mivo-bundle` 的原创代码 | Apache-2.0；依赖仍受各自许可约束 |
| 新增 Mivo README、贡献指南、安全说明、更新记录及 Mivo CI | Apache-2.0 |
| 社区桌面壳、对其既有文件的衍生修改、`patches/mivo-desktop.patch` | 上游 MIT + `LICENSE.details` 附加条款，未重新授权 |
| 官方 DeepSeek Harness 子模块 | 官方 MIT，保留原版权与许可证 |
| 其他依赖、子模块、模型与编解码库 | 各自许可证；不是自动改成 Apache-2.0 |

Apache-2.0 全文位于根目录 [LICENSE-MIVO](../../LICENSE-MIVO)，组件包也附有 LICENSE / NOTICE。根目录 [LICENSE](../../LICENSE) 和 [LICENSE.details](../../LICENSE.details) 是社区桌面壳的原始文件，完整保留。

## Apache-2.0 不覆盖哪些限制

上游 `LICENSE.details` 的 “No Commercial Secondary Development” 禁止商业目的的修改、改编或衍生，并声明冲突时附加条款优先。为 Mivo 原创代码选择 Apache-2.0，不会消除该限制；对桌面壳的改名、品牌化或补丁也不会改变许可。

因此，包含该壳的桌面构建继续限定 `personal_noncommercial`，`commercial` 构建门禁继续生效。独立的 Mivo Core 不包含社区壳、可单独运行，其原创代码按 Apache-2.0 使用；相关 Python、ASR、模型和媒体依赖仍需分别履行许可义务。

商业桌面衍生需要上游权利人授予适用许可，或替换受限代码后重新审计。当前未取得或声称取得这种额外授权。

## 源码公开与安装包发行

本次 GitHub 发布包含源码、文档和测试记录，不包含密钥、个人 Vault、ASR 权重或安装包。公开源码不代表已经解决所有二进制发行义务。

本地 PyAV wheel 所带 FFmpeg / codec 的许可与源码提供要求需单独核验。安装包签名、公证和 Windows 实机测试也不是 Apache-2.0 文本能替代的工作。详情见 [第三方声明](../THIRD_PARTY_NOTICES.md) 与 [验收记录](acceptance.md)。

## 上游归属

- 社区壳：[dsh-tauri/deepseek-harness-desktop](https://github.com/dsh-tauri/deepseek-harness-desktop)，基线 `ff5e4815a7d7a7920d4b4dc02af18fdf0ac9e937`。
- 官方 Runtime：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，源码子模块 `b830ec950faba0a46dda564be3e2d854afed94f1`，API / 打包 Runtime `0.2.2-rc.1`。
- 上游 README 与工作流分别保存于 `README.upstream.md` 和 `.github/upstream-workflows/`；Git 历史与版权声明保留。

Mivo 为独立项目，不代表获得 DeepSeek 官方背书。新增贡献的许可规则见 [CONTRIBUTING.md](../../CONTRIBUTING.md)。
