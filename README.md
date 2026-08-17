# @dsh-tui-ecosystem/dsh-remote

`dsh-remote` 面向 [dsh-TUI](https://dshtui.com) 提供 Live + Daemon 双模式远程控制：
Live mode 将文件系统和子进程执行切换到远端 Linux 主机，Daemon mode 用于远端
session 的创建、attach 与断线恢复。

当前版本先交付 Live MVP；Daemon、文件传输和多 target 见
[`docs/roadmap.md`](docs/roadmap.md)。

## 源码安装

插件暂不发布 npm 包。[`dsh-remote`](https://github.com/GeekCmore/dsh-remote)
作为 Git submodule 固定在 `vendor/dsh-remote`，Live 与后续 Daemon mode 共用
同一份远程核心源码。

```sh
git clone --recurse-submodules https://github.com/GeekCmore/dsh-tui-remote.git
cd dsh-tui-remote
pnpm install --frozen-lockfile
pnpm build
pnpm test
dsh plugin --profile dsh-tui add "$PWD"
dsh --profile dsh-tui
```

已有普通 clone 可补拉 submodule：

```sh
git submodule update --init --recursive
```

更新源码时同步主仓库记录的 submodule commit，再重新安装和构建：

```sh
git pull
git submodule sync --recursive
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm build
```

GitHub 自动生成的 Source ZIP 不包含 submodule 源码，不适用于本安装方式。

## 配置

插件包自带 `cordis.patch.yml`，会禁用本地 `fs-sandbox` 和
`dsh-subprocess-local`，然后挂载单个 Live target。默认 target id 为
`default`。

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `host` | `localhost` | SSH 主机 |
| `port` | `22` | SSH 端口 |
| `username` | `$USER` / `root` | SSH 用户 |
| `auth` | `agent` | `agent` 或 `key` |
| `privateKeyPath` | 空 | `key` 模式必填 |
| `autoConnect` | `true` | 插件挂载后连接 |
| `workspaces` | `[]` | 常用远端绝对 POSIX 路径 |
| `monitorIntervalMs` | `5000` | 指标采样周期 |
| `readyTimeoutMs` | `15000` | SSH 握手超时 |
| `keepaliveIntervalMs` | `0` | SSH keepalive 周期，0 为关闭 |

bundle patch 支持以下环境变量：

- `DSH_REMOTE_HOST`
- `DSH_REMOTE_PORT`
- `DSH_REMOTE_USER`
- `DSH_REMOTE_KEY`
- `DSH_REMOTE_CWD`

设置 `DSH_REMOTE_KEY` 会自动选择私钥认证。MVP 不支持密码认证。

## TUI 操作

`/remote` 打开全屏场景，包含 Overview、Diagnostics、Workspaces。命令也可以
直接执行 `/remote connect`、`/remote disconnect` 或 `/remote reconnect`。

连接成功不会修改当前会话的 cwd。在 Workspaces 中选择已配置路径，或输入一个
远端绝对路径，dsh-TUI 会在该远端 cwd 新建 session。这个 session 的
`!command` 由远端 `/bin/sh -lc` 执行，默认 30 秒超时。

临时输入的 workspace 在当前进程内会被识别为远端路径；要让它在重启后仍能被
识别，应将路径加入 `workspaces` 或 `DSH_REMOTE_CWD`。

## 安全边界

- Live mode 不使用本地 sandbox，远端 SSH 账户权限就是有效权限边界。
- 插件不支持密码，不输出私钥内容。
- 当前 Hub 尚未向 TUI 暴露 host-key verification 结果，Diagnostics 不会声称
  主机密钥已验证。
- dsh-TUI 0.8.0 没有常驻状态栏插件接缝，连接状态集中显示在 `/remote`、
  workspace 的 `REMOTE` badge 和操作通知中。
