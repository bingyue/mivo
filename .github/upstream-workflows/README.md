# 上游工作流留存

此目录保留社区桌面壳原有工作流，供历史与构建逻辑追溯；仍适用上游许可。GitHub Actions 只读取 `.github/workflows/`，因此这里的上游发布、移动端、定时任务不会在 Mivo 仓库执行。

Mivo 使用 `../workflows/mivo-ci.yml` 运行独立 Core 测试，`../workflows/mivo-build.yml` 提供手动桌面构建。不自动发布公共二进制 Release。
