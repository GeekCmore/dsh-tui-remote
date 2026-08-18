import { posix } from 'node:path'
import type { LiveRuntime } from '@dsh-remote/live-runtime'
import type {
  TuiCommandShell,
  TuiWorkspaceProvider,
  TuiWorkspaceTarget,
} from '@deepseek-harness-tui/dsh-tui/workspaces'

export interface RemoteWorkspaceOptions {
  targetId: string
  title: string
  host: string
  port: number
  username: string
  paths: readonly string[]
  storage?: RemoteWorkspaceStorage
  onStorageError?: (error: unknown) => void
}

export interface RemoteWorkspaceStorage {
  get(input: { key: string }): Promise<{ value: unknown | null }>
  set(input: { key: string; value: unknown }): Promise<{ stored: true }>
}

interface ShellRequest {
  command: string
  workdir?: string
  timeoutMs?: number
}

const WORKSPACE_STORAGE_KEY = 'remote-workspaces.v1'
const WORKSPACE_REGISTRY_VERSION = 1

interface WorkspaceRegistry {
  version: 1
  targets: Record<string, string[]>
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function isRemoteAbsolutePath(path: string): boolean {
  return path.startsWith('/') && !path.includes('\0')
}

export function remoteWorkspaceUri(targetId: string, path: string): string {
  return `dsh-remote://${encodeURIComponent(targetId)}/${encodeURIComponent(path)}`
}

export function remoteWorkspaceTargetKey(options: Pick<RemoteWorkspaceOptions, 'targetId' | 'host' | 'port' | 'username'>): string {
  return `${options.targetId}|${options.username}@${options.host}:${options.port}`
}

export function parseRemoteWorkspaceUri(uri: string): { targetId: string; path: string } | undefined {
  const match = /^dsh-remote:\/\/([^/]+)\/(.+)$/u.exec(uri)
  if (match === null) return undefined
  try {
    const targetId = decodeURIComponent(match[1]!)
    const path = decodeURIComponent(match[2]!)
    if (targetId.length === 0 || !isRemoteAbsolutePath(path)) return undefined
    return { targetId, path }
  } catch {
    return undefined
  }
}

export class RemoteWorkspaceController {
  private readonly knownPaths: Set<string>
  private readonly configuredPaths: Set<string>
  private readonly dynamicPaths = new Set<string>()
  private registry: WorkspaceRegistry = { version: WORKSPACE_REGISTRY_VERSION, targets: {} }
  private persistenceEnabled: boolean
  private persistenceChain: Promise<void> = Promise.resolve()
  private readonly restorePromise: Promise<void>
  readonly provider: TuiWorkspaceProvider

  constructor(
    private readonly runtime: LiveRuntime,
    readonly options: RemoteWorkspaceOptions,
  ) {
    this.configuredPaths = new Set(options.paths.filter(isRemoteAbsolutePath).map(path => posix.normalize(path)))
    this.knownPaths = new Set(this.configuredPaths)
    this.persistenceEnabled = options.storage !== undefined
    this.restorePromise = this.restore()
    this.provider = {
      schemes: ['dsh-remote'],
      list: () => [...this.knownPaths].map(path => this.target(path)),
      resolve: async (uri, signal) => {
        const parsed = parseRemoteWorkspaceUri(uri)
        if (parsed?.targetId !== options.targetId) return undefined
        const normalized = posix.normalize(parsed.path)
        return this.knownPaths.has(normalized) ? this.target(normalized) : undefined
      },
      resolvePath: async (path, cwd, signal) => {
        if (!this.knownPaths.has(cwd)) return undefined
        return this.prepare(posix.resolve(cwd, path), signal)
      },
      describe: cwd => this.knownPaths.has(cwd) ? this.target(cwd) : undefined,
      commandShell: cwd => this.knownPaths.has(cwd) ? this.commandShell(cwd) : undefined,
    }
  }

  paths(): readonly string[] {
    return [...this.knownPaths]
  }

  ready(): Promise<void> {
    return this.restorePromise
  }

  remember(path: string): TuiWorkspaceTarget {
    if (!isRemoteAbsolutePath(path)) throw new Error('Remote workspace must be an absolute POSIX path')
    const normalized = posix.normalize(path)
    this.knownPaths.add(normalized)
    if (!this.configuredPaths.has(normalized)) {
      this.dynamicPaths.add(normalized)
      this.schedulePersist()
    }
    return this.target(normalized)
  }

  async prepare(path: string, signal?: AbortSignal): Promise<TuiWorkspaceTarget> {
    if (!isRemoteAbsolutePath(path)) throw new Error('Remote workspace must be an absolute POSIX path')
    if (this.runtime.status !== 'connected') throw new Error('Connect the remote target before switching workspace')
    const normalized = posix.normalize(path)
    const result = await this.runtime.exec({
      // POSIX `test` (including dash's builtin) does not accept `--`.
      // Absolute shell-quoted paths do not need an option terminator here.
      command: `test -d ${shellQuote(normalized)}`,
      signal,
    })
    if (result.exitCode !== 0) throw new Error(`Remote directory does not exist: ${normalized}`)
    return this.remember(normalized)
  }

  target(path: string): TuiWorkspaceTarget {
    const label = path === '/' ? '/' : posix.basename(path)
    return {
      uri: remoteWorkspaceUri(this.options.targetId, path),
      cwd: path,
      label,
      description: `${this.options.username}@${this.options.host}:${path}`,
      kind: 'provider',
      badge: 'REMOTE',
    }
  }

  private commandShell(cwd: string): TuiCommandShell {
    return {
      resolve: request => request,
      run: async (spec) => {
        const request = spec as ShellRequest
        const result = await this.runtime.runCommand({
          command: request.command,
          cwd: request.workdir ?? cwd,
          timeoutMs: request.timeoutMs ?? 30_000,
        })
        return {
          exitCode: result.exitCode,
          stdout: { text: result.stdout },
          stderr: { text: result.stderr },
          timedOut: result.timedOut,
        }
      },
    }
  }

  private async restore(): Promise<void> {
    const storage = this.options.storage
    if (storage === undefined) return
    let value: unknown | null
    try {
      value = (await storage.get({ key: WORKSPACE_STORAGE_KEY })).value
    } catch (error) {
      this.disablePersistence(error)
      return
    }
    if (value === null) return
    const registry = parseWorkspaceRegistry(value)
    if (registry === undefined) {
      this.disablePersistence(new Error('stored remote workspace registry has an invalid shape'))
      return
    }
    this.registry = registry
    const paths = registry.targets[remoteWorkspaceTargetKey(this.options)] ?? []
    for (const path of paths) {
      const normalized = posix.normalize(path)
      if (this.configuredPaths.has(normalized)) continue
      this.knownPaths.add(normalized)
      this.dynamicPaths.add(normalized)
    }
  }

  private schedulePersist(): void {
    if (!this.persistenceEnabled || this.options.storage === undefined) return
    this.persistenceChain = this.persistenceChain
      .then(async () => {
        await this.restorePromise
        if (!this.persistenceEnabled || this.options.storage === undefined) return
        const targetKey = remoteWorkspaceTargetKey(this.options)
        this.registry.targets[targetKey] = [...this.dynamicPaths]
        await this.options.storage.set({
          key: WORKSPACE_STORAGE_KEY,
          value: this.registry,
        })
      })
      .catch(error => {
        this.disablePersistence(error)
      })
  }

  private disablePersistence(error: unknown): void {
    this.persistenceEnabled = false
    this.reportStorageError(error)
  }

  private reportStorageError(error: unknown): void {
    this.options.onStorageError?.(error)
  }
}

function parseWorkspaceRegistry(value: unknown): WorkspaceRegistry | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const candidate = value as { version?: unknown; targets?: unknown }
  if (candidate.version !== WORKSPACE_REGISTRY_VERSION || candidate.targets === null || typeof candidate.targets !== 'object' || Array.isArray(candidate.targets)) {
    return undefined
  }
  const targets: Record<string, string[]> = {}
  for (const [target, paths] of Object.entries(candidate.targets as Record<string, unknown>)) {
    if (target.length === 0 || !Array.isArray(paths)) return undefined
    targets[target] = [...new Set(
      paths
        .filter((path): path is string => typeof path === 'string' && isRemoteAbsolutePath(path))
        .map(path => posix.normalize(path)),
    )]
  }
  return { version: WORKSPACE_REGISTRY_VERSION, targets }
}
