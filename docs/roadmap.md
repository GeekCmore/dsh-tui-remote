# dsh-remote for dsh-TUI Roadmap

本文档记录 TUI 插件从 Live MVP 到完整远程会话体验的演进边界。优先级遵循：
先稳定本地 session + 远端执行世界，再扩展文件互操作，最后接入 daemon session。

## 1. Live MVP

- 单 SSH target，支持 SSH agent、私钥与临时密码询问认证。
- `/remote` 全屏 Overview、Diagnostics、Workspaces。
- 连接、断开、重连及连接错误可见化。
- CPU、内存、磁盘、load average、进程数监控。
- 配置路径和临时绝对路径切换；切换时创建远端 cwd 的新 session。
- workspace `REMOTE` badge 与远端 `!command`。
- Git submodule 固定的 `dsh-remote` 源码与本地 `@dsh-remote/live-runtime` 构建，暂不发布 npm。

## 2. Live UX 完善

- 接入 dsh-TUI 官方 `tuiPluginHost` admission 与 mediated command registration；旧宿主保留兼容回退。
- 使用官方 `tuiStatus` keyed status service 提供常驻连接状态、target 与延迟信息；旧 `tuiStatusItems` 仅作为回退。
- 增加启动时远端 cwd 参数，避免初始 session 先落在本地 cwd。
- 设计 host-key verification 的首次信任、指纹变化和拒绝流程。
- 持久化临时 workspace 归属，使重启和 `/resume` 后仍显示 `REMOTE` badge。
- 扩展多 target 管理、target picker、独立认证与连接状态。
- 为 `/resume` 增加远端 session badge 和离线提示。

## 3. 文件互操作

- 上传、下载、文本/二进制预览。
- 大文件进度、速率、取消与失败重试。
- 本地与远端同名冲突策略和覆盖确认。
- 明确传输权限、临时文件清理与敏感文件展示边界。

## 4. Daemon mode

- 展示远端 daemon session catalog，并支持创建、attach、detach。
- 只读 watch 与单写者 lease 状态。
- lease takeover 的确认和冲突反馈。
- 使用 seq cursor 恢复断线期间的事件，明确 gap 和 compact 后的行为。
- Live/Daemon mode 在同一插件内切换，保持 workspace 与 session 归属清晰。

## 5. 发布稳定化

- 发布 `@dsh-remote/live-runtime` 与 `@dsh-tui-ecosystem/dsh-remote` npm 包。
- 将 submodule 源码安装迁移为正式发布包，并移除本地 `link:` 依赖。
- 建立 Node、pnpm、dsh-TUI、DeepSeek Harness 兼容矩阵。
- 加入真实 sshd、真实 TTY、断线重连和 workspace resume E2E。
- 发布前提交 `lib/types/`，执行 package 内容检查、变更日志和升级说明。
