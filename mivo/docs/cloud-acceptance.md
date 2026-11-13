# 真实云端闭环验收

脚本为 `mivo/scripts/cloud-acceptance.mjs`。先构建 macOS 应用，安装仓库开发依赖，在 Mivo 自带的模型设置中配置商业 Provider 与 Model。密钥只在本机配置，勿发到聊天或提交 Git。退出正在运行的 Mivo 后执行，避免占用相同的运行时端口。当前脚本通过 macOS 打包应用的 CDP 驱动真实 DSH；不代表 Windows 已验收。

每次使用新的隔离目录作为 `MIVO_CLOUD_ACCEPTANCE_DIR`。脚本读取指定的 DSH Provider 配置，但创建独立的测试 Vault，不写入个人知识库。不要并发运行两个实例。

## 本机配置

除 Embedding 密钥外，以下均为名称或本机路径。Provider 和 Model 必须使用 DSH 返回的实际 ID；预检报告的 `providers` 字段可列出当前配置。

```sh
export MIVO_ACCEPTANCE_DSH_HOME="$HOME/.mivo-dsh"
export MIVO_ACCEPTANCE_PROVIDER="实际 Provider ID"
export MIVO_ACCEPTANCE_MODEL="实际 Model ID"
export MIVO_ACCEPTANCE_ASR_MODEL="/absolute/path/to/whisper-model"
export MIVO_ACCEPTANCE_AUDIO_A="/absolute/path/to/recording-a.wav"
export MIVO_ACCEPTANCE_AUDIO_B="/absolute/path/to/recording-b.mp3"
export MIVO_CLOUD_ACCEPTANCE_DIR=".mivo-local/cloud-acceptance-new"
```

通过本机环境或秘密管理器另行注入 `MIVO_EMBEDDING_URL`、`MIVO_EMBEDDING_MODEL`、`MIVO_EMBEDDING_API_KEY`。URL 为商业服务完整的 HTTPS embeddings 地址。两份音频必须是真实、不同内容且获准用于测试的录音；不是同一段音频的两种编码。ASR 使用已有的本地模型，测试不自动下载模型、不调用云端转写。

本机已准备两份公开测试录音：`.mivo-local/fixtures/jfk.mp3` 和 `.mivo-local/fixtures/harvard.wav`。后者来自 [Real Python 语音识别示例](https://github.com/realpython/python-speech-recognition/blob/master/audio_files/harvard.wav)，已运行真实 CPU 转写，见 `second-audio-acceptance.json`。这些短音频适合检查技术闭环，不代表会议录音准确率或分析质量已验收；音频不进入 Git 或安装包。

## 预检与执行

```sh
node mivo/scripts/cloud-acceptance.mjs
node mivo/scripts/cloud-acceptance.mjs --run
```

默认预检实际模型发现和拒绝未授权请求，不调用云模型。输出 `blocked`（退出码 2）或 `ready-not-run`；后者也不表示已验收。首次无 DSH 配置目录时只报告缺项，不创建或伪造凭据。

`--run` 会产生商业 API 用量：两份录音在本地转写，逐字稿发送到所选 LLM；第一份执行 meeting / critical / actions / knowledge 四种分析，第二份执行 meeting 分析，共五次分析。然后在隔离测试 Vault 中明确确认两个草稿，把确认后的片段发送至 Embedding 服务，再发送一个跨录音 RAG 问题及检索证据。底层 Agent 可因工具调用产生额外模型请求。原始音频始终只在本机处理。

完整流程断言：真实 DSH 逐字稿工具成功调用、草稿证据索引有效、确认前无永久记忆或检索结果、确认后检索包含两个来源、商业向量生成成功、RAG 答案引用两个真实来源且不编造来源 ID、检索证据带时间范围、官方 MCP 客户端可检索并拒绝路径越界、原件 SHA-256 不变。任一步失败都不会写出 `passed`。

报告保存在测试目录 `report.json`，权限为仅当前用户可读写。成功报告包含真实模型名、工具执行记录与答案；不要把包含个人录音内容的报告公开。测试结束会请求正常关闭应用及子进程。真实云模型调用当前仍待配置后执行，已有预检见 [cloud-preflight.json](cloud-preflight.json)。
