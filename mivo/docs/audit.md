# Mivo 仓库审计与实施边界

审计日：2026-11-13（Asia/Shanghai）。基础仓库完整克隆，保留历史；分支 feature/mivo-productization；社区基线 ff5e4815a7d7a7920d4b4dc02af18fdf0ac9e937（0.31.4）。远程 upstream-community / upstream-dsh 保留。

源码确认：当前是 apps/desktop 下的 Tauri 2 + Electron Runtime + React 19，不使用旧版 WebView 实现。packages/builtin-plugin-* 提供插件；source/deepseek-harness 是只读上游子模块。依赖 pnpm-lock.yaml 锁定，DSH API 为 0.2.2-rc.1，不能把 minimum 字段误读为运行期版本 pin。

已检查 README、两份许可证、第三方声明、package.json、workspace/lock、Tauri 配置、资源清单、构建部署脚本、profile/carrier.mjs、插件 patch 安装机制及客户端 definePanel。Bundle 实际字段为 package.json 的 dsh.bundle.patch 与 cordis.patch.yml 的 insert；UI 使用 dsh-tauri/client definePanel，经 sidebar.panellist 与 main 槽位装配。模型/Agent 依实际安装包 .d.ts 接口接入，不编造 API。

LICENSE 是 MIT，但 LICENSE.details 明确禁止商业目的二次开发，并声明冲突时附加条款优先。因此桌面版默认且当前唯一允许的构建模式为 personal_noncommercial，commercial 必须失败；保留上游全部声明。Mivo 原创 Core、插件、Bundle 等另按 Apache-2.0 授权，独立 Core 不受桌面构建门禁限制；具体范围见 licensing.md。商业桌面路径：取得权利人书面授权，或重新审计其他壳，或基于官方 MIT Harness 重建独立壳；本轮不声称已获得商业授权。DSH 官方包的 LICENSE 核实为 MIT。Rust 桥接子模块、Python/JS 完整依赖声明随实际安装结果记录，未验证组件不宣称许可证检查完成。

实现：mivo/core 独立本地服务（SQLite + Markdown），不读取 DSH session 数据库；原件内容哈希去重并只读保存；本地 ASR 子进程、持久化任务；分析草稿经人工确认进入长期知识；FTS5 与商业 Embedding 混合检索；独立只读 stdio MCP。Mivo 插件复用 DSH 模型、凭据、Agent 工具与面板能力。桌面应用层修改用 patches/mivo-desktop.patch 记录，不修改官方 Runtime。

任务中的新前置约束优先于附件旧需求：不集成本地 LLM，不启用云同步、多用户、移动端、图谱；Embedding 使用商业 API。附件较宽的交互需求按核心 MVP 闭环落地，验证范围逐项记录，不将未运行的云模型/Windows 验收写成通过。
