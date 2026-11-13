# Mivo — Your Personal AI Memory

基于社区 DeepSeek Harness Desktop 的个人记忆工作台。作者：**邴越**；全网 IP：**越哥聊AI**；FDE 前线：[FDEChina.ai](https://FDEChina.ai)。

Mivo 原创代码采用 **Apache-2.0**，社区桌面壳及其衍生修改保留原许可证。当前整套桌面构建模式为 `personal_noncommercial`；商业桌面衍生需授权或替换受限壳。独立 Core 可按 Apache-2.0 使用。[许可范围](docs/licensing.md) · [审计](docs/audit.md) · [开发说明](docs/architecture.md) · [第三方声明](THIRD_PARTY_NOTICES.md)

## 实际架构

- `mivo/core`：可独立运行的 Python / 原生可执行服务，SQLite + Markdown Vault；不依赖 DSH Session 保存长期记忆。
- `packages/mivo-memory`：DSH Host 插件，启动 Core、注册受限只读工具，调用 DSH 已有 Provider、凭据和 Agent。
- `packages/mivo-workbench`：真实导入、录音、转写、校稿、分析草稿、确认知识、检索与问答界面。
- `packages/mivo-bundle`：插件装配、8 个分析 Skills、允许先使用本地功能的启动配置。
- 桌面壳：Tauri 2 + Electron Runtime；macOS / Windows 构建脚本，独立应用标识 `com.mivo.desktop`。

数据流程：导入原件 → 本地 Whisper 转写 → 用户校稿 → 明确授权后通过 DSH 云模型生成草稿 → 用户确认 → Markdown 与 SQLite 知识库 → 本地 / 商业 Embedding 混合检索 → 带来源问答。独立 MCP 仅能读取启动参数指定的 Vault。

## 开发与构建

需要 Git、Node.js ≥24.9、pnpm 11.7.0、Rust stable、uv / Python 3.11；macOS 需要 Xcode Command Line Tools，Windows 需要 MSVC Build Tools。首次依赖与模型下载需要网络，转写时禁止模型联网下载。

```sh
git submodule update --init --recursive
CI=true pnpm install --frozen-lockfile --ignore-scripts
pnpm mivo:test
pnpm mivo:build
```

macOS 打包须采用上游 Electron 的资源布局配置：

```sh
pnpm mivo:prepare
pnpm --filter dsh-desktop tauri build --bundles app,dmg --config src-tauri/tauri.macos-bundle.conf.json
```

Windows：`pnpm mivo:prepare` 后执行 `pnpm --filter dsh-desktop tauri build --bundles nsis`。可用 `.github/workflows/mivo-build.yml` 在目标平台构建；工作流存在不等于已经通过 Windows 实机验收。

`mivo:prepare` 下载 `runtime-lock.json` 锁定的 DSH，验证 DSH / pnpm 校验和，构建独立 Core，复制许可证。安装包不包含模型。资料详情提供按需下载 Whisper tiny（78.2 MB，MIT），显示进度、支持暂停/重试，并逐文件验证固定 SHA-256；仅下载模型，不上传资料。模型独立保存在 Vault/models，不进入知识备份。Whisper tiny 主要用于入门；较长中文录音可在资料详情指定本地 Whisper small / medium 模型目录。DSH 运行数据默认保存在 `~/.mivo-dsh`，可用专用 `MIVO_DSH_HOME` 覆盖；不会读取其他 DSH 安装的 `DSH_HOME`。

默认 CPU int8；CUDA 要求兼容 NVIDIA 运行环境。Apple Silicon 暂用 CPU，无虚构的 Metal 支持。

自定义包/API 改动后生成客户端契约（Mivo 范围）：`MIVO_GENAPI=1 pnpm genapi`。全仓 genapi 当前另有上游模型能力表类型不匹配，详见验收记录。

## 使用

1. 首次打开 Mivo，选择本机可写的 Vault 绝对路径；推荐新建独立目录。
2. 导入音频、视频、TXT、Markdown、PDF、DOCX、HTML、CSV、JSON，或粘贴文字；扫描 PDF 需要先 OCR。
3. 音频选择本地模型进行转写。任务可暂停、失败重试；恢复会重新转写该文件，不伪称从中断时间点续算。文字导入无需 ASR。
4. 按时间片段校正逐字稿。历史版本保留；旧版本分析不能在校稿后直接确认。
5. 使用 DSH 原有模型设置配置 DeepSeek / OpenAI / Claude 或兼容 API。其他 OpenAI 格式的云服务可在「自定义提供商」中选择 OpenAI Chat Completions，填写 Base URL、API Key 和实际模型 ID；工具调用能力取决于服务商。Mivo 不复制模型管理器、不存另一份 LLM API Key，也不启用本地 LLM。
6. 选择分析方式、模型，并确认外发说明。得到的摘要、人物、观点、决策、待办是草稿；点击确认后才进入长期知识和检索。
7. 问答默认本地全文召回，再将问题及检索证据发送给已授权模型。每项结果带 `mivo://source/<id>` 和时间范围，可回到原文。查询匹配不等于事实验证，模型答案须以证据为准。

## 商业 Embedding

沿用兼容 API 的 Provider 边界；不引入本地 Embedding 模型。配置宿主进程环境变量后重启 Mivo：

- `MIVO_EMBEDDING_URL`：完整 HTTPS embeddings 接口地址。
- `MIVO_EMBEDDING_MODEL`：服务提供的模型名。
- `MIVO_EMBEDDING_API_KEY`：密钥，使用本机环境/秘密管理器注入，不写入仓库、Vault 或聊天。

在「Vault 与 MCP」中授权建立向量索引；只发送已确认知识片段。在问答中启用语义检索会把问题发往 Embedding 服务。切换模型后重建向量索引；索引按端点、模型与维度隔离。没有配置时本地检索仍可用，云端操作明确失败。

## Vault 与安全边界

`originals/` 哈希去重、只读原件；`transcripts/` 版本化逐字稿；`knowledge/` 确认后的 Markdown；`database/mivo.sqlite` 包含来源、分析、任务、检索与审计。Core 仅监听回环地址并使用随机 bearer token，token 只在父子进程中传递。插件桥接也限制本机连接和允许的路由；Agent 工具限制为本次授权来源，不提供写文件、终端或任意路径读取。

这些限制保护 Mivo 的受控接口，不宣称能阻止本机管理员、其他有文件权限的应用或用户主动安装的 DSH 插件访问文件。Mivo MCP 默认只读；把它接到外部 AI 即允许该客户端读取返回内容，使用前请检查授权 Vault。

「完整备份」会生成包含原件、逐字稿、知识和 SQLite 快照的 ZIP，并写入校验清单。恢复必须用空目录：

```sh
mivo-core --vault /absolute/path/NewVault --restore /absolute/path/backup.zip
```

安装包中的真实 Core 路径与 MCP 配置可在「Vault 与 MCP」查看。源码运行可使用：

```sh
uv run --project mivo/core --extra whisper mivo-core --vault /absolute/path/MivoVault
uv run --project mivo/core --extra whisper mivo-mcp --vault /absolute/path/MivoVault
```

MCP 工具：`search_memories`、`list_recordings`、`get_transcript`、`get_memory`、`get_topic_context`、`get_person_context`、`get_project_context`、`get_timeline`、`search_tasks`。不提供写入工具；超过结果上限需缩小查询或分页。

## 可选本地 ASR

源码环境可安装 `uv sync --project mivo/core --extra whisper --extra funasr` 后选择本地 FunASR / SenseVoice 模型。禁用远端模型代码和自动更新；缺少依赖或模型会明确失败，不回退收费转写。默认安装包只集成 Whisper 引擎，模型按需下载；实际验收使用 Whisper。FunASR 的无细粒度时间戳输出按整段标记；不声称已实现说话人分离。

## 当前验收范围

已执行的测试、平台结果、云端凭据缺口及安装包路径写入 `docs/acceptance.md`。示例分析数据仅存在测试目录并明确标记为人工 fixture；不将其作为真实云模型结果。未实现云同步、多用户、移动端、知识图谱和自研 Agent Runtime。

已准备 [真实云端闭环验收脚本](docs/cloud-acceptance.md)：默认只预检，配置后加 `--run` 才执行真实模型分析、商业向量生成、跨录音 RAG 与 MCP 检查。当前预检因没有可用模型和 Embedding 配置而阻塞，尚未通过完整云端验收。
