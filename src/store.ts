import type {
  LiveConnectionStatus,
  LiveMetrics,
  LiveRuntime,
} from '@dsh-remote/live-runtime'

export type RemoteDisplayStatus = LiveConnectionStatus | 'disconnecting'
export type RemoteAction = 'connect' | 'disconnect' | 'reconnect'
export type DiagnosticStatus = 'ok' | 'missing' | 'error' | 'pending'

export interface DiagnosticCheck {
  name: string
  status: DiagnosticStatus
  detail?: string
}

export interface ConnectionSnapshot {
  status: RemoteDisplayStatus
  busy?: RemoteAction
  error?: string
  metrics?: LiveMetrics
  diagnostics: readonly DiagnosticCheck[]
  diagnosticsBusy: boolean
}

const REMOTE_COMMANDS = ['bash', 'realpath', 'stat', 'base64', 'setsid', 'ps'] as const

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class ConnectionStore {
  private current: ConnectionSnapshot
  private readonly listeners = new Set<() => void>()
  private active?: Promise<void>
  private diagnosticsRun?: Promise<void>

  constructor(
    readonly runtime: LiveRuntime,
    private readonly configurationError?: string,
  ) {
    this.current = {
      status: runtime.status,
      error: configurationError,
      metrics: runtime.metrics,
      diagnostics: REMOTE_COMMANDS.map(name => ({ name, status: 'pending' })),
      diagnosticsBusy: false,
    }
    runtime.subscribe(() => this.sync())
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getSnapshot = (): ConnectionSnapshot => this.current

  connect(): Promise<void> {
    return this.perform('connect', () => this.runtime.connect())
  }

  disconnect(): Promise<void> {
    return this.perform('disconnect', () => this.runtime.disconnect())
  }

  reconnect(): Promise<void> {
    return this.perform('reconnect', () => this.runtime.reconnect())
  }

  refreshDiagnostics(): Promise<void> {
    if (this.diagnosticsRun !== undefined) return this.diagnosticsRun
    const run = this.collectDiagnostics()
    this.diagnosticsRun = run
    void run.finally(() => {
      if (this.diagnosticsRun === run) this.diagnosticsRun = undefined
    })
    return run
  }

  private perform(action: RemoteAction, operation: () => Promise<void>): Promise<void> {
    if (this.active !== undefined) return this.active
    if (this.configurationError !== undefined) {
      const failure = Promise.reject(new Error(this.configurationError))
      void failure.catch(() => undefined)
      return failure
    }
    this.publish({
      ...this.current,
      busy: action,
      status: action === 'disconnect' ? 'disconnecting' : 'connecting',
      error: undefined,
    })
    const active = operation().then(
      () => {
        this.publish({
          ...this.current,
          busy: undefined,
          status: this.runtime.status,
          error: undefined,
          metrics: this.runtime.metrics,
        })
      },
      (error: unknown) => {
        this.publish({
          ...this.current,
          busy: undefined,
          status: this.runtime.status,
          error: errorMessage(error),
          metrics: this.runtime.metrics,
        })
        throw error
      },
    ).finally(() => {
      if (this.active === active) this.active = undefined
    })
    this.active = active
    return active
  }

  private async collectDiagnostics(): Promise<void> {
    if (this.runtime.status !== 'connected') {
      this.publish({
        ...this.current,
        diagnostics: REMOTE_COMMANDS.map(name => ({ name, status: 'pending', detail: 'Connect first' })),
        diagnosticsBusy: false,
      })
      return
    }
    this.publish({ ...this.current, diagnosticsBusy: true })
    try {
      const command = REMOTE_COMMANDS
        .map(name => `command -v -- ${name} >/dev/null 2>&1 && printf '${name}=ok\\n' || printf '${name}=missing\\n'`)
        .join('; ')
      const result = await this.runtime.exec({ command })
      const statuses = new Map(result.stdout.trim().split('\n').map(line => line.split('=', 2) as [string, string]))
      this.publish({
        ...this.current,
        diagnostics: REMOTE_COMMANDS.map(name => ({
          name,
          status: statuses.get(name) === 'ok' ? 'ok' : 'missing',
        })),
        diagnosticsBusy: false,
      })
    } catch (error) {
      const detail = errorMessage(error)
      this.publish({
        ...this.current,
        diagnostics: REMOTE_COMMANDS.map(name => ({ name, status: 'error', detail })),
        diagnosticsBusy: false,
      })
    }
  }

  private sync(): void {
    this.publish({
      ...this.current,
      status: this.current.busy === 'disconnect'
        ? 'disconnecting'
        : this.current.busy !== undefined
          ? 'connecting'
          : this.runtime.status,
      metrics: this.runtime.metrics,
    })
  }

  private publish(snapshot: ConnectionSnapshot): void {
    this.current = snapshot
    for (const listener of this.listeners) listener()
  }
}
