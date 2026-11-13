# 更新记录

## 0.1.0 — 2026-11-13 · 源码预览

首个 Mivo 个人记忆工作台源码版本；不是已完成全面验收的稳定发行版。

### 已实现

- Mivo 品牌桌面工作台、独立 Vault、资料导入、本地 ASR 和逐字稿校正。
- SQLite + Markdown 知识存储，带来源与版本的分析草稿及人工确认。
- DSH Agent / Provider 接入、8 种分析模板与 Skills。
- 全文检索、商业 Embedding 接口与混合检索。
- 独立只读 MCP、导出、备份、恢复和任务处理。
- macOS 本机构建与 Windows 构建配置。
- Mivo 原创代码 Apache-2.0 授权、作者归属和混合许可范围说明。

### 验证与限制

macOS、真实 Whisper CPU 转写、Core 与 MCP 已执行的验证见 [验收报告](mivo/docs/acceptance.md)。DeepSeek 模型列表接口已成功连接，但 Agent 分析、商业 Embedding 和跨录音综合回答仍待真实验收。Windows 尚未完成实机验证。

当前桌面壳保留上游非商业衍生限制，安装包未签名、未公证。公开仓库不自动发布桌面二进制；PyAV / FFmpeg 等组件的再分发义务需单独落实。
