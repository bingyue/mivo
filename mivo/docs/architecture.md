# Mivo MVP 开发说明

本说明对应 Mivo Desktop / Core / Bundle 0.1.0，社区壳基线 0.31.4，DSH API 与打包 Runtime 0.2.2-rc.1。固定的 Runtime 发布、模型 revision 和校验值在 `../runtime-lock.json`、Core 的 `models.py` 中；安装依赖使用 pnpm / uv 锁文件。

## 边界与集成

Mivo 的 Runtime 数据目录默认 `~/.mivo-dsh`，仅读取专用 `MIVO_DSH_HOME`；传给 DSH 子进程时才设置其 `DSH_HOME`，不会复用或改写其他 DSH 安装的全局环境变量。CLI 入口隔离在应用数据目录的 bin 下，不自动注册全局 PATH。

桌面壳继续负责 Electron、窗口、DSH Profile、插件、模型配置和凭据。`mivo-bundle/cordis.patch.yml` 用实际 Bundle patch 装配 Memory 与 Workbench，并关闭强制凭据引导。`mivo-memory` 的 Host service 通过父子进程握手启动 Core，随机令牌保存在进程内；Core 监听父进程专用 stdin 管道的 EOF，在父进程异常退出时关闭 HTTP 与 ASR Worker；桌面启动层把随包 Core 可执行文件路径注入插件，避免依赖开发机 Python。`mivo-workbench` 使用 `definePanel`、`defineStore`、`defineRegister` 与既有 UI 组件。模型列表和分析通过生成的 dsh-h3 API 调用。

AI 使用 `ctx.agents.create` 和 DSH 现有 Provider；Mivo 不存 LLM 密钥、不实现 Agent loop。每次分析建立短期授权 scope，只向该 session 注册三种 Mivo 只读工具，限定来源/知识 ID；不开放终端或任意文件工具。分析八个模板独立提供提示词，Skills 随插件注册。完整九个记忆查询能力通过独立 MCP 提供。DSH 自身的通用 MCP/插件/Skills 管理保持上游能力。

## 数据与确认

SQLite schema v1 包含 sources、transcripts、analyses、memories、chunks、chunks_fts、embeddings、jobs、audit。建库可重复执行，使用 WAL 和外键；发现更高版本拒绝启动，不擅自降级。来源由 SHA-256 去重；原件只读复制到 `originals`。逐字稿使用 revision 乐观锁并生成历史 Markdown。

分析保存在 analyses，关联模型、模板、Prompt 版本、来源及逐字稿 revision，证据必须是有效段索引。确认前不进知识检索。确认写入 memories、Markdown、FTS chunks 和审计，重复确认幂等；校稿后旧草稿不可确认。已确认历史知识保留当时证据，不以新观点覆盖旧来源。每块约 1400 字、重叠 200 字，保留来源与证据时间范围。

全文检索使用 SQLite FTS5 trigram，短词和自然语言零命中时使用参数化关键词匹配。Embedding 经明确授权调用商业兼容 API，向量按 endpoint/model/dimension 隔离，SQLite 存储，CPU cosine 与全文结果做 reciprocal-rank fusion。此 MVP 为个人数据量采用精简扫描，不宣称百万级索引性能。

## 转写与模型

Core 的持久化队列独立执行本地 ASR 子进程；PyAV 解码音频/视频，Whisper 使用离线本地模型。默认 CPU int8，可选兼容 CUDA；FunASR/SenseVoice 为可选源码环境集成。Whisper tiny 不打进安装包，用户主动下载固定版本，校验全部文件；支持下载字节续传，模型与个人知识分目录。转写任务恢复会重跑文件，校稿并发仍由 revision 防覆盖。

## 本地接口

Core 启动打印单行 JSON 握手（URL + bearer，禁止记入用户日志），只监听 127.0.0.1。全部请求校验 Host、Origin、bearer。主要路由为 `/sources/text`、`/sources/upload`、`/sources/{id}/transcript`、`/sources/{id}/transcribe`、`/sources/{id}/model`、`/jobs`、`/analyses`、`/analyses/{id}/confirm`、`/search`、`/search/hybrid`、`/embeddings`、`/exports`、`/backups`。Host 代理限制方法和路径，拒绝远程连接。UI 核心动作均调用这些实际接口。

`mivo-core --mcp --vault <absolute-path>` 使用官方 MCP Python SDK stdio；以 SQLite 只读模式打开授权 Vault。仅接收业务 ID 与查询，不接受用户任意路径。转写分页和结果上限限制内容量。源材料始终视为不可信文本。不能把这些约束当作对用户自行安装的其他 DSH 插件的系统级沙箱。

## 备份与维护

备份在持锁期间创建 SQLite backup 快照，包含原件、全部逐字稿版本、知识 Markdown 和 SHA-256 清单。恢复仅允许空目录，检查路径、重复项、符号链接、大小、哈希与原件一致性。模型不纳入知识备份，可重新下载。FTS 可重建。Core 与 MCP 无需 DSH 即可使用，替换 Agent Runtime 时可复用业务 API 和 Vault。

## 常用开发命令

在仓库根目录执行：

```sh
CI=true pnpm install --frozen-lockfile --ignore-scripts
pnpm mivo:test
pnpm --filter mivo-memory typecheck
pnpm --filter mivo-workbench typecheck
MIVO_GENAPI=1 pnpm genapi
pnpm mivo:prepare
pnpm --filter dsh-desktop tauri build --bundles app,dmg --config src-tauri/tauri.macos-bundle.conf.json
open apps/desktop/src-tauri/target/release/bundle/macos/Mivo.app
```

Windows 使用 `--bundles nsis`，不传 macOS 配置。开发热重载可使用上游 `pnpm dev:desktop`，另运行两个 Mivo 插件的 `tsdown --watch`；Core 源码路径通过 `MIVO_PYTHON`、`MIVO_CORE_PATH` 注入。用户数据、模型、构建产物和测试 scratch 位于已忽略目录，禁止加入 Git。
