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
  username: string
  paths: readonly string[]
}

interface ShellRequest {
  command: string
  workdir?: string
  timeoutMs?: number
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
  readonly provider: TuiWorkspaceProvider

  constructor(
    private readonly runtime: LiveRuntime,
    readonly options: RemoteWorkspaceOptions,
  ) {
    this.knownPaths = new Set(options.paths.filter(isRemoteAbsolutePath))
    this.provider = {
      schemes: ['dsh-remote'],
      list: () => [...this.knownPaths].map(path => this.target(path)),
      resolve: async (uri, signal) => {
        const parsed = parseRemoteWorkspaceUri(uri)
        if (parsed?.targetId !== options.targetId) return undefined
        return this.prepare(parsed.path, signal)
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

  remember(path: string): TuiWorkspaceTarget {
    if (!isRemoteAbsolutePath(path)) throw new Error('Remote workspace must be an absolute POSIX path')
    const normalized = posix.normalize(path)
    this.knownPaths.add(normalized)
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
}
