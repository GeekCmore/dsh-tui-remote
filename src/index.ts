import type { Context } from '@deepseek-ai/cordis'
import { installLiveRuntime } from '@dsh-remote/live-runtime'
import type { TuiCommandTreeProvider } from '@deepseek-harness-tui/dsh-tui/command-trees'
import type { TuiSceneDescriptor } from '@deepseek-harness-tui/dsh-tui/scenes'
import type { TuiWorkspaceProvider } from '@deepseek-harness-tui/dsh-tui/workspaces'
import { resolveConfig } from './config.js'
import type { Config as PluginConfig } from './config.js'
import { createRemoteScene } from './scene.js'
import { commandContributionId, manifestSource } from './manifest.js'
import { createStatusItemsProvider } from './status.js'
import type { StatusItemsProvider } from './status.js'
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

type CommandDefinition = Parameters<CommandsLike['register']>[0]

interface TuiPluginHostLike {
  admit(pluginCtx: Context, source: string, options?: { source?: string; activationId?: string }): unknown
  registerCommand(pluginCtx: Context, contributionId: string, definition: CommandDefinition): () => void
}

interface TuiStatusLike {
  set(key: string, text: string | number | boolean | undefined, identity?: Context): () => void
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

interface StatusItemsLike {
  register(provider: StatusItemsProvider): () => void
}

function commandError(error: unknown): CommandResult {
  return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
}

export function apply(ctx: Context, config: PluginConfig = {}): void {
  const resolved = resolveConfig(config)
  const auth = resolved.auth === 'key'
    ? { type: 'key' as const, privateKeyPath: resolved.privateKeyPath }
    : resolved.auth === 'password'
      ? { type: 'password' as const }
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
  const statusItems = ctx.get('tuiStatusItems', false) as StatusItemsLike | undefined
  const tuiStatus = ctx.get('tuiStatus', false) as TuiStatusLike | undefined
  const tuiPluginHost = ctx.get('tuiPluginHost', false) as TuiPluginHostLike | undefined
  const commands = ctx.get('commands', false) as CommandsLike | undefined

  if (scenes !== undefined) {
    ctx.effect(() => scenes.register(createRemoteScene(store, workspaceController, resolved)), 'dsh-remote scene')
  }
  if (workspaces !== undefined) {
    ctx.effect(() => workspaces.register(workspaceController.provider), 'dsh-remote workspace provider')
  }
  if (tuiStatus !== undefined) {
    ctx.effect(() => {
      const disposers = new Map<string, () => void>()
      const publish = (): void => {
        const snapshot = store.getSnapshot()
        const statusText = snapshot.status === 'connected'
          ? 'remote: connected'
          : snapshot.status === 'connecting'
            ? 'remote: connecting'
            : snapshot.status === 'disconnecting'
              ? 'remote: disconnecting'
              : snapshot.status === 'degraded'
                ? 'remote: degraded'
                : 'remote: offline'
        const values: Record<string, string | undefined> = {
          'dsh-remote:status': statusText,
          'dsh-remote:target': `${resolved.username}@${resolved.host}`,
          'dsh-remote:latency': snapshot.roundTripMs !== undefined && snapshot.status === 'connected'
            ? `${snapshot.roundTripMs} ms`
            : undefined,
        }
        for (const [key, text] of Object.entries(values)) {
          disposers.set(key, tuiStatus.set(key, text, ctx))
        }
      }
      publish()
      const unsubscribe = store.subscribe(publish)
      return () => {
        unsubscribe()
        for (const dispose of disposers.values()) dispose()
      }
    }, 'dsh-remote official status')
  } else if (statusItems !== undefined) {
    ctx.effect(() => statusItems.register(createStatusItemsProvider(store, resolved)), 'dsh-remote status items')
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
    const commandDefinition: CommandDefinition = {
      name: 'remote',
      description: 'Open and manage the SSH live target',
      input: { hint: '[connect|disconnect|reconnect]' },
      recordInput: false,
      handler: async ({ rawInput }): Promise<CommandResult> => {
        const action = rawInput.trim().toLowerCase()
        if (action.length === 0) {
          return scenes?.open('dsh-remote') === true
            ? { kind: 'success' }
            : { kind: 'error', text: 'The dsh-TUI scene service is unavailable' }
        }
        try {
          if (resolved.auth === 'password' && (action === 'connect' || action === 'reconnect')) {
            store.requestCredentials(action)
            if (scenes?.open('dsh-remote') === true) return { kind: 'success' }
            store.cancelCredentials()
            return { kind: 'error', text: 'Open /remote to enter the SSH password' }
          }
          if (action === 'connect') await store.connect()
          else if (action === 'disconnect') await store.disconnect()
          else if (action === 'reconnect') await store.reconnect()
          else return { kind: 'error', text: 'Usage: /remote [connect|disconnect|reconnect]' }
          return { kind: 'success', text: `Remote ${action} complete` }
        } catch (error) {
          return commandError(error)
        }
      },
    }
    if (tuiPluginHost !== undefined) {
      try {
        tuiPluginHost.admit(ctx, manifestSource, {
          source: 'dsh-plugin.json',
        })
        ctx.effect(
          () => tuiPluginHost.registerCommand(ctx, commandContributionId, commandDefinition),
          'dsh-remote mediated command',
        )
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        ctx.logger.warn(`dsh-remote: command admission unavailable; remote scene remains available (${detail})`)
      }
    } else {
      ctx.effect(() => commands.register(commandDefinition), 'dsh-remote command')
    }
  }

  if (resolved.autoConnect && resolved.auth !== 'password' && configurationError === undefined) {
    queueMicrotask(() => void store.connect().catch(() => undefined))
  }
}
