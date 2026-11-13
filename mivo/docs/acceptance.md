# Mivo 0.1.0 验收记录

日期：2026-11-13（Asia/Shanghai）。模式：personal_noncommercial。仓库：`feature/mivo-productization`，社区基线 `ff5e4815a7d7a7920d4b4dc02af18fdf0ac9e937`。四个上游子模块均未修改。Mivo Core、插件、Bundle 和桌面应用层改动均在本仓库；桌面补丁为 `patches/mivo-desktop.patch`。

## 已执行结果

| 范围 | 实际结果与证据 |
| --- | --- |
| Core 自动化测试 | **23 passed**。实际 SQLite、磁盘文件、HTTP TestClient、真实 ASR 子进程失败/恢复、父进程管道关闭后的 Core 自动退出和 MCP stdio 进程；包含哈希去重、原件只读、历史版本、并发校稿、证据校验、确认门槛、中文/多来源检索、备份恢复、路径穿越/符号链接、DOCX/HTML/可提取 PDF、导出、索引、HTTP 令牌/Origin、下载授权。独立 Core 在 personal_noncommercial / commercial 环境下均启动并正常退出，桌面商业构建门禁仍拒绝。 |
| Whisper 真实 CPU 转写 | 公开 JFK 11 秒录音，无模拟逐字稿。WAV 和从同一录音编码的 MP3 均通过本地 Whisper tiny 转写；原件哈希保持不变。见 `asr-acceptance.json`、`packaged-asr-acceptance.json`。 |
| 模型按需下载 | 实际下载固定 revision 的 78.2 MB 模型，全部文件 SHA-256 验证通过。也已在原生窗口点击下载按钮完成下载，再启动转写。模型未放入最终安装包。见 `model-download-acceptance.json`。 |
| 原生桌面流程 | 从实际 Mivo.app 启动 Electron + DSH + Mivo Core，创建独立 Vault、输入文字、导入 MP3、下载模型、CPU 转写、播放音频、校正逐字稿、生成备份、查看可用 MCP 路径；云端/Embedding 未授权时按钮禁用。见 `native-ui-acceptance.json`。 |
| 安装与重启 | 从实际 DMG 只读挂载并复制应用到另一个目录，重新打开已有 Vault，逐字稿和校稿版本仍在；无效 Vault 切换后恢复原配置、正常退出后 Core 进程回收通过；不是仅运行开发服务器。见 `installed-restart-acceptance.json`。 |
| MCP | 官方 SDK ClientSession 连接实际 stdio 服务，验证 9 个工具、全部只读声明、检索结果、拒绝另一 Vault ID、路径穿越及不存在的写入工具。冻结的 Core 可执行文件重复通过同一测试，**1 passed**。 |
| 插件/桌面构建 | 两个 Mivo 插件 TypeScript 检查通过；API 在 Mivo 范围生成成功；完整内置插件部署、桌面 TypeScript/Vite、Rust release、PyInstaller、Tauri app/dmg 构建成功。 |
| 云端验收预检 | 从重新打包的原生应用查询实际 DSH 模型，并发送 `consent:false` 的分析请求。模型发现正常、未授权请求被拒绝；两个默认 Provider 均无可用模型。报告为 **blocked / cloudCalled:false**，见 `cloud-preflight.json`；不算云模型验收通过。 |
| 许可证门禁 | 默认非商业模式允许；`MIVO_DISTRIBUTION_MODE=commercial` 实测拒绝。上游许可证保留；实际安装资源复制 646 个 JS 包及 65 个 Python 构建/运行环境包的许可证清单。 |
| 分组件授权 | 原创 Mivo 组件 Apache-2.0；上游 LICENSE / LICENSE.details 与基线字节一致。独立 Core wheel 实际构建成功，包含 Apache-2.0 License-Expression、完整 LICENSE 与 NOTICE；根许可清单复制新声明。旧本地 DMG 为此前的个人验收产物，不作为本次公开源码发布的二进制附件。 |

Python 测试中的分析摘要明确标为 `human-authored-test-fixture`，只验证数据契约、确认与检索，**不把这些摘要冒充云模型输出**。真实 ASR 验收从公开录音运行模型得到逐字稿，不用预制逐字稿替代推理。原生验收中转写完成后 memories 仍为 0；只有确认接口才能沉淀知识。

分析请求已补充来源 ID，短逐字稿要求 Agent 先通过 `mivo_get_transcript` 核对来源。响应中的 `execution.successfulTools` 仅记录 DSH 实际发出的成功工具结果，供后续真实云端验收断言；目前没有将该工具链标为云端验收通过。

## 尚未验证与当前限制

- **真实云端闭环尚未验收。** 首次预检时没有模型凭据；之后已使用授权凭据成功查询 DeepSeek 模型列表，返回 deepseek-flash 与 deepseek-v4-pro，但未完成 DSH Agent 摘要、多模板分析、向量生成和跨录音 RAG 综合回答验收。商业 Embedding 仍缺配置，不能据此宣称完整 AI 闭环通过。LLM 复用 Mivo 的 DSH 模型设置，Embedding 使用 README 中的环境变量；密钥不提交仓库。
- Windows x64 提供原生 NSIS 构建配置和手动触发工作流，**尚未运行 Windows 构建或实机测试**。不会把 macOS 构建成功等同于 Windows 验证通过。
- 本机实际验证 macOS arm64 + CPU。CUDA、FunASR/SenseVoice、长录音准确率、真实麦克风录音尚未实测；无说话人分离、无 Metal 推理。FunASR 为可选依赖，安装包只含 Whisper 引擎。
- Whisper tiny 为入门模型。转写恢复会从文件起点重跑；模型下载可复用已下载字节。浏览器录音在停止后保存，关闭窗口前需点击停止并保存。
- 第一版不包含文件夹监听、完整标签/收藏管理、自定义 Agent 编辑器、批量并行分析、复杂记忆合并或知识图谱。保留来源与版本，不自动合并冲突事实。
- 全仓 genapi 存在上游 PiAiBuiltinModel 类型映射问题，Mivo 范围生成通过；未为绕过此问题修改 DSH Runtime。ESLint 无错误，剩余两个逐字稿/条目数组索引 key 警告。Rust release 有 4 个上游未使用 Windows shim 符号警告，Vite 提示较大 chunk。
- 安装包未做 Developer ID 签名与 Apple 公证，仅供本机个人测试。社区附加许可证禁止商业目的衍生开发；PyAV 所带 FFmpeg/codec 的公开再分发义务仍需进一步处理，不将此构建视为公开/商业发行许可结论。

## 重跑

仓库根目录：

```sh
pnpm mivo:test
pnpm --filter mivo-memory typecheck
pnpm --filter mivo-workbench typecheck
MIVO_GENAPI=1 pnpm genapi
pnpm mivo:build
```

真实转写验收（使用自己的公开/授权测试音频和本地模型）：

```sh
uv run --project mivo/core --extra whisper python mivo/scripts/acceptance.py \
  --binary apps/desktop/src-tauri/resources/mivo/core/mivo-core/mivo-core \
  --audio .mivo-local/fixtures/jfk.mp3 \
  --model .mivo-local/download-vault/models/whisper-tiny \
  --vault .mivo-local/acceptance-new \
  --report .mivo-local/acceptance-new.json
```

该脚本针对公开 JFK 样本断言英文关键句；换用其他音频需相应修改期望。公开样本为 whisper.cpp 的 `samples/jfk.wav`，SHA-256 为 `59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e`；原生测试的 MP3 从它通过 PyAV 编码而来。

macOS 原生端自动化：安装开发依赖后设置 `MIVO_ACCEPTANCE_AUDIO` 为上述 MP3；设置 `MIVO_ACCEPTANCE_DOWNLOAD=1` 可走真实下载。`node mivo/scripts/native-acceptance.mjs` 启动打包应用和 Playwright CDP，只使用隔离的测试目录。`MIVO_DESKTOP_EXECUTABLE` 可指定从 DMG 复制后的应用可执行文件；使用相同 `MIVO_ACCEPTANCE_DIR` 加 `MIVO_ACCEPTANCE_RESTART=1` 重跑已有 Vault 的重启检查。测试服务退出时关闭，不提供远程调试端口给正常产品启动。

最终文件、大小、SHA-256、签名与模型打包状态见 `build-artifact.json`。安装包实际位置为 `apps/desktop/src-tauri/target/release/bundle/dmg/Mivo_0.1.0_aarch64.dmg`；应用为同级 `macos/Mivo.app`。

云端综合验收脚本与配置说明见 [cloud-acceptance.md](cloud-acceptance.md)。默认仅预检，必须显式加 `--run` 才调用已配置的商业 API。脚本无模拟模型、假向量或预制 AI 摘要。
