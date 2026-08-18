# @dsh-tui-ecosystem/dsh-remote

`dsh-remote` 面向 [dsh-TUI](https://dshtui.com) 提供 Live + Daemon 双模式远程控制：
Live mode 将文件系统和子进程执行切换到远端 Linux 主机，Daemon mode 用于远端
session 的创建、attach 与断线恢复。

当前版本先交付 Live MVP；Daemon、文件传输和多 target 见
[`docs/roadmap.md`](docs/roadmap.md)。

## 当前能力

- 通过 SSH 将 dsh 的文件系统和 subprocess provider 切换到远端 Linux。
- `/remote` 场景提供连接管理、主机指标、诊断和远端 workspace 切换。
- 支持 SSH Agent、私钥和交互式密码三种认证。
- 远端 workspace 会创建独立的 dsh-TUI session；`!command` 和 Agent 工具在远端执行。

## 前置条件

- 本机 Node.js `^22.19` 或 `>=24`、pnpm 10+（建议 pnpm 11）和 dsh CLI。
- dsh-TUI `0.8.1` 或更高版本。`0.8.0` 的部分终端渲染路径可能出现空白页面。
- 可从本机访问的远端 Linux SSH 服务；远端需要 `/bin/sh`。
- 使用密码认证时，远端 sshd 必须允许该账号密码登录。root 账号还需要允许 root
  密码登录。

先创建或更新 `dsh-tui` profile：

```sh
npm install -g @deepseek-ai/dsh pnpm@latest
dsh plugin --profile dsh-tui add @deepseek-harness-tui/dsh-tui@latest
```

## 从源码安装

插件尚未发布到 npm，目前必须从源码安装。远程核心以 Git submodule 固定在
`vendor/dsh-remote`，因此要使用 `--recurse-submodules`；GitHub 自动生成的
Source ZIP 不包含 submodule，不能用于安装。

```sh
git clone --recurse-submodules https://github.com/GeekCmore/dsh-tui-remote.git
cd dsh-tui-remote
pnpm install --frozen-lockfile
pnpm build
dsh plugin --profile dsh-tui add "$PWD"
dsh --profile dsh-tui
```

`add "$PWD"` 会把当前源码目录链接到这个 profile。安装插件和启动 TUI 时必须使用
同一个 profile；上面的示例统一使用 `dsh-tui`。当前不要使用
`dsh plugin add dsh-tui-remote`，该名称尚未发布到 npm。

已有普通 clone 可以补拉 submodule 后再安装：

```sh
git submodule sync --recursive
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm build
dsh plugin --profile dsh-tui add "$PWD"
```

## 快速配置

### 密码认证

不要把 SSH 密码写进环境变量或 YAML。只配置目标和认证模式，插件会在每次
Connect/Reconnect 时通过 TUI 遮罩输入密码：

```sh
DSH_REMOTE_HOST=203.0.113.10 \
DSH_REMOTE_PORT=22 \
DSH_REMOTE_USER=root \
DSH_REMOTE_AUTH=password \
DSH_REMOTE_CWD=/root \
dsh --profile dsh-tui
```

进入 TUI 后执行 `/remote connect`，输入密码并回车。也可以执行 `/remote`，用左右键
选择 Connect 后按回车。

连接失败时先用系统 SSH 客户端验证网络、账号和 sshd 设置：

```sh
ssh -p 22 root@203.0.113.10
```

常见的远端 sshd 要求是 `PasswordAuthentication yes`；root 密码登录时
`PermitRootLogin` 不能是 `no` 或 `prohibit-password`。修改 sshd 配置后需要按远端
系统的方式 reload/restart SSH 服务。

### 私钥认证

设置 `DSH_REMOTE_KEY` 会自动选择私钥认证：

```sh
DSH_REMOTE_HOST=203.0.113.10 \
DSH_REMOTE_USER=deploy \
DSH_REMOTE_KEY="$HOME/.ssh/id_ed25519" \
DSH_REMOTE_CWD=/srv/app \
dsh --profile dsh-tui
```

### SSH Agent 认证

`agent` 是默认认证方式。确保 `ssh-add -l` 能看到可用密钥，然后启动：

```sh
DSH_REMOTE_HOST=203.0.113.10 \
DSH_REMOTE_USER=deploy \
DSH_REMOTE_AUTH=agent \
DSH_REMOTE_CWD=/srv/app \
dsh --profile dsh-tui
```

## 持久配置

临时环境变量最适合单个目标。需要固定配置或多个 workspace 时，编辑：

```text
$DSH_HOME/profiles/dsh-tui/cordis.patch.yml
```

未设置 `DSH_HOME` 时通常是 `~/.dsh/profiles/dsh-tui/cordis.patch.yml`。按相同
`id` 覆盖 `dsh-remote` 行；`config` 是整块替换，必须保留全部字段：

```yaml
- id: dsh-remote
  config:
    targetId: production
    title: Production
    host: 203.0.113.10
    port: 22
    username: root
    auth: password
    privateKeyPath: ''
    autoConnect: false
    workspaces:
      - /root
      - /srv/app
    monitorIntervalMs: 5000
    readyTimeoutMs: 15000
    keepaliveIntervalMs: 0
```

密码仍然不会从配置文件读取。重启 `dsh --profile dsh-tui` 后执行
`/remote connect`，在 TUI 中临时输入。

## 配置参考

插件包自带 `cordis.patch.yml`，会禁用本地 `fs-sandbox` 和
`dsh-subprocess-local`，并将 shell sandbox 策略固定为 `danger-full-access`。
这样保留 dsh-TUI 的 sandbox/preset contract，但实际 Bash 与 PTY 都通过 SSH
执行，不会在本机或远端额外要求 `bwrap`。远程 profile 只提供
`danger-full-access` 权限档位，避免切换到需要本地 bwrap 的模式；有效边界是
SSH 账号权限。
默认 target id 为 `default`。

### 配置字段

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

### 环境变量

| 环境变量 | 对应配置 | 说明 |
| --- | --- | --- |
| `DSH_REMOTE_HOST` | `host` | SSH 主机名或 IP |
| `DSH_REMOTE_PORT` | `port` | SSH 端口 |
| `DSH_REMOTE_USER` | `username` | SSH 用户名 |
| `DSH_REMOTE_AUTH` | `auth` | `agent`、`key` 或 `password` |
| `DSH_REMOTE_KEY` | `privateKeyPath` | 私钥路径；设置后默认选择 `key` |
| `DSH_REMOTE_CWD` | `workspaces[0]` | 初始远端绝对路径 |

## TUI 操作

`/remote` 打开全屏场景，包含 Overview、Diagnostics、Workspaces：

- `Tab` / `Shift+Tab` 切换页面。
- Overview 中用左右键选择 Connect、Disconnect、Reconnect，回车执行。
- `/remote connect`、`/remote disconnect`、`/remote reconnect` 可以直接执行操作。
- Workspaces 中用上下键选择配置路径，也可以输入远端绝对路径并回车。
- `Esc` 或 `q` 关闭场景；`r` 重连；`d` 断开。

密码认证下，Connect 和 Reconnect 会显示遮罩输入框；密码只保留到本次连接尝试结束。

未指定 `DSH_REMOTE_CWD` 时，新会话默认使用远端 `/`，避免把本机启动目录误传给 SSH。
设置该变量后，新会话使用指定目录。在 Workspaces 中选择已配置路径，或输入一个
远端绝对路径，dsh-TUI 会在该远端 cwd 新建 session。这个 session 的
`!command` 由远端 `/bin/sh -lc` 执行，默认 30 秒超时。

临时输入的 workspace 在当前进程内会被识别为远端路径；要让它在重启后仍能被
识别，应将路径加入 `workspaces` 或 `DSH_REMOTE_CWD`。

## 更新和验证

```sh
git pull --ff-only
git submodule sync --recursive
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm build
pnpm test
dsh plugin --profile dsh-tui add "$PWD"
```

如果 `/remote` 命令不存在，通常是插件安装到了另一个 profile。检查 `add` 和启动命令
是否使用同一个 `--profile`。如果命令存在但场景空白，先更新 dsh-TUI：

```sh
dsh plugin --profile dsh-tui add @deepseek-harness-tui/dsh-tui@latest
```

SSH 握手超时通常表示地址、端口、防火墙或安全组不可达；`Permission denied` 通常表示
用户名、认证方式或远端 sshd 策略不匹配。

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
