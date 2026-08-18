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
`dsh-subprocess-local`，并将 shell sandbox 策略固定为 `danger-full-access`。
这样保留 dsh-TUI 的 sandbox/preset contract，但实际 Bash 与 PTY 都通过 SSH
执行，不会在本机或远端额外要求 `bwrap`。远程 profile 只提供
`danger-full-access` 权限档位，避免切换到需要本地 bwrap 的模式；有效边界是
SSH 账号权限。
默认 target id 为 `default`。

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `host` | `localhost` | SSH 主机 |
| `port` | `22` | SSH 端口 |
| `username` | `$USER` / `root` | SSH 用户 |
| `auth` | `agent` | `agent`、`key` 或 `password` |
| `privateKeyPath` | 空 | `key` 模式必填 |
| `autoConnect` | `true` | 插件挂载后连接；`password` 模式下不自动连接 |
| `workspaces` | `['/']` | 常用远端绝对 POSIX 路径 |
| `monitorIntervalMs` | `5000` | 指标采样周期 |
| `readyTimeoutMs` | `15000` | SSH 握手超时 |
| `keepaliveIntervalMs` | `0` | SSH keepalive 周期，0 为关闭 |

bundle patch 支持以下环境变量：

- `DSH_REMOTE_HOST`
- `DSH_REMOTE_PORT`
- `DSH_REMOTE_USER`
- `DSH_REMOTE_AUTH`
- `DSH_REMOTE_KEY`
- `DSH_REMOTE_CWD`

设置 `DSH_REMOTE_KEY` 会自动选择私钥认证。只有账号密码时，设置
`DSH_REMOTE_AUTH=password`；插件不会从环境变量或配置文件读取密码，而是在每次
Connect/Reconnect 时通过 TUI 遮罩输入临时询问。

## TUI 操作

`/remote` 打开全屏场景，包含 Overview、Diagnostics、Workspaces。命令也可以
直接执行 `/remote connect`、`/remote disconnect` 或 `/remote reconnect`。
密码认证下，`/remote connect` 和 `/remote reconnect` 会打开场景并请求密码。

未指定 `DSH_REMOTE_CWD` 时，新会话默认使用远端 `/`，避免把本机启动目录误传给 SSH。
设置该变量后，新会话使用指定目录。在 Workspaces 中选择已配置路径，或输入一个
远端绝对路径，dsh-TUI 会在该远端 cwd 新建 session。这个 session 的
`!command` 由远端 `/bin/sh -lc` 执行，默认 30 秒超时。

临时输入的 workspace 在当前进程内会被识别为远端路径；要让它在重启后仍能被
识别，应将路径加入 `workspaces` 或 `DSH_REMOTE_CWD`。

## 安全边界

- Live mode 不使用本地 sandbox，远端 SSH 账户权限就是有效权限边界。
- 密码仅用于当前连接尝试，不写入插件配置或环境变量；插件不输出密码或私钥内容。
- 当前 Hub 尚未向 TUI 暴露 host-key verification 结果，Diagnostics 不会声称
  主机密钥已验证。
- 插件包包含 Community Consensus v0.15 的 `dsh-plugin.json`。在提供
  `tuiPluginHost` 的新 profile 中，`/remote` 会先经过 admission，再通过宿主
  mediated command path 注册；旧 profile 回退到传统 command registration。
- 新 profile 使用官方 `tuiStatus` 显示连接状态、target 和延迟；旧 profile
  回退到 `tuiStatusItems`。
