import { describe, expect, it, vi } from 'vitest'
import type { LiveConnectionStatus, LiveRuntime } from '@dsh-remote/live-runtime'
import { ConnectionStore } from '../src/store.js'

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

function runtime(overrides: Partial<LiveRuntime> = {}): LiveRuntime {
  let status: LiveConnectionStatus = 'disconnected'
  return {
    targetId: 'default',
    hub: {} as LiveRuntime['hub'],
    fs: {},
    subprocess: {},
    monitor: {} as LiveRuntime['monitor'],
    get status() { return status },
    runtimeRoot: undefined,
    metrics: undefined,
    async connect() { status = 'connected' },
    async disconnect() { status = 'disconnected' },
    async reconnect() { status = 'connected' },
    async exec() { return { exitCode: 0, stdout: '', stderr: '' } },
    async runCommand() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } },
    subscribe() { return () => undefined },
    ...overrides,
  }
}

describe('ConnectionStore', () => {
  it('deduplicates concurrent connection actions', async () => {
    const pending = deferred()
    const connect = vi.fn(() => pending.promise)
    const store = new ConnectionStore(runtime({ connect }))
    const first = store.connect()
    const second = store.connect()
    expect(first).toBe(second)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().status).toBe('connecting')
    pending.resolve()
    await first
  })

  it('surfaces connection errors', async () => {
    const store = new ConnectionStore(runtime({ connect: async () => { throw new Error('connection refused') } }))
    await expect(store.connect()).rejects.toThrow('connection refused')
    expect(store.getSnapshot().error).toBe('connection refused')
  })

  it('blocks key authentication without a key path', async () => {
    const connect = vi.fn(async () => undefined)
    const store = new ConnectionStore(runtime({ connect }), 'privateKeyPath is required')
    await expect(store.connect()).rejects.toThrow('privateKeyPath is required')
    expect(connect).not.toHaveBeenCalled()
  })
})
