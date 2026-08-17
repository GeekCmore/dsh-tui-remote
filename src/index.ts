import type { Context } from '@deepseek-ai/cordis'
import { installLiveRuntime } from '@dsh-remote/live-runtime'
import type { TuiCommandTreeProvider } from '@deepseek-harness-tui/dsh-tui/command-trees'
import type { TuiSceneDescriptor } from '@deepseek-harness-tui/dsh-tui/scenes'
import type { TuiWorkspaceProvider } from '@deepseek-harness-tui/dsh-tui/workspaces'
import { resolveConfig } from './config.js'
import type { Config as PluginConfig } from './config.js'
import { createRemoteScene } from './scene.js'
import { ConnectionStore } from './store.js'
import { RemoteWorkspaceController } from './workspaces.js'

export const name = 'dsh-remote'
export { Config } from './config.js'

interface CommandResult {
  kind: 'success' | 'error'
  text?: string
}

interface CommandsLike {
  register(definition: {
    name: string
    description: string
    input?: { hint: string }
    recordInput?: boolean
    handler(invocation: { rawInput: string }): CommandResult | Promise<CommandResult>
  }): () => void
}

interface ScenesLike {
  register(descriptor: TuiSceneDescriptor): () => void
  open(id: string): boolean
}

interface WorkspacesLike {
  register(provider: TuiWorkspaceProvider): () => void
}

interface CommandTreesLike {
  register(provider: TuiCommandTreeProvider): () => void
}

function commandError(error: unknown): CommandResult {
  return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
}

export function apply(ctx: Context, config: PluginConfig = {}): void {
  const resolved = resolveConfig(config)
  const auth = resolved.auth === 'key'
    ? { type: 'key' as const, privateKeyPath: resolved.privateKeyPath }
    : { type: 'agent' as const }
  const runtime = installLiveRuntime(ctx, {
    targetId: resolved.targetId,
    title: resolved.title,
    host: resolved.host,
    port: resolved.port,
    username: resolved.username,
    auth,
    readyTimeoutMs: resolved.readyTimeoutMs,
    keepaliveIntervalMs: resolved.keepaliveIntervalMs,
    defaultCwd: resolved.workspaces[0] ?? '/',
    monitorIntervalMs: resolved.monitorIntervalMs,
  })
  const configurationError = resolved.auth === 'key' && resolved.privateKeyPath.length === 0
    ? 'privateKeyPath is required when auth is key'
    : undefined
  const store = new ConnectionStore(runtime, configurationError)
  const workspaceController = new RemoteWorkspaceController(runtime, {
    targetId: resolved.targetId,
    title: resolved.title,
    host: resolved.host,
    username: resolved.username,
    paths: resolved.workspaces,
  })

  const scenes = ctx.get('tuiScenes', false) as ScenesLike | undefined
  const workspaces = ctx.get('tuiWorkspaces', false) as WorkspacesLike | undefined
  const commandTrees = ctx.get('tuiCommandTrees', false) as CommandTreesLike | undefined
  const commands = ctx.get('commands', false) as CommandsLike | undefined

  if (scenes !== undefined) {
    ctx.effect(() => scenes.register(createRemoteScene(store, workspaceController, resolved)), 'dsh-remote scene')
  }
  if (workspaces !== undefined) {
    ctx.effect(() => workspaces.register(workspaceController.provider), 'dsh-remote workspace provider')
  }
  if (commandTrees !== undefined) {
    ctx.effect(() => commandTrees.register({
      root: 'remote',
      descriptions: { zh: '管理 SSH Live 远端', en: 'Manage the SSH live target' },
      children: path => path.length === 1
        ? [
            { name: 'connect', description: 'Connect the live target' },
            { name: 'disconnect', description: 'Disconnect the live target' },
            { name: 'reconnect', description: 'Reconnect the live target' },
          ]
        : [],
    }), 'dsh-remote command tree')
  }
  if (commands !== undefined) {
    ctx.effect(() => commands.register({
      name: 'remote',
      description: 'Open and manage the SSH live target',
      input: { hint: '[connect|disconnect|reconnect]' },
      recordInput: false,
      handler: async ({ rawInput }) => {
        const action = rawInput.trim().toLowerCase()
        if (action.length === 0) {
          return scenes?.open('dsh-remote') === true
            ? { kind: 'success' }
            : { kind: 'error', text: 'The dsh-TUI scene service is unavailable' }
        }
        try {
          if (action === 'connect') await store.connect()
          else if (action === 'disconnect') await store.disconnect()
          else if (action === 'reconnect') await store.reconnect()
          else return { kind: 'error', text: 'Usage: /remote [connect|disconnect|reconnect]' }
          return { kind: 'success', text: `Remote ${action} complete` }
        } catch (error) {
          return commandError(error)
        }
      },
    }), 'dsh-remote command')
  }

  if (resolved.autoConnect && configurationError === undefined) {
    queueMicrotask(() => void store.connect().catch(() => undefined))
  }
}
