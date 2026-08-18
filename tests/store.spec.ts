import { describe, expect, it, vi } from 'vitest'
import type { LiveConnectionStatus, LiveCredentials, LiveRuntime } from '@dsh-remote/live-runtime'
import { HostKeyVerifier } from '../src/hostkeys.js'
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

  it('passes temporary credentials to the runtime', async () => {
    const connect = vi.fn(async (_credentials?: LiveCredentials) => undefined)
    const store = new ConnectionStore(runtime({ connect }))
    await store.connect({ password: 'secret' })
    expect(connect).toHaveBeenCalledWith({ password: 'secret' })
  })

  it('tracks and cancels credential requests', () => {
    const store = new ConnectionStore(runtime())
    store.requestCredentials('reconnect')
    expect(store.getSnapshot().credentialRequest).toBe('reconnect')
    store.cancelCredentials()
    expect(store.getSnapshot().credentialRequest).toBeUndefined()
  })

  it('blocks key authentication without a key path', async () => {
    const connect = vi.fn(async () => undefined)
    const store = new ConnectionStore(runtime({ connect }), 'privateKeyPath is required')
    await expect(store.connect()).rejects.toThrow('privateKeyPath is required')
    expect(connect).not.toHaveBeenCalled()
  })

  it('publishes host-key verification requests and clears them after rejection', async () => {
    const verifier = new HostKeyVerifier(
      'test-store-id',
      'deploy@example:22',
      `/tmp/dsh-remote-test-hostkeys-store-${process.pid}-${Date.now()}.json`,
    )
    const store = new ConnectionStore(runtime(), undefined, verifier)
    const pending = verifier.verify('pending-key', Buffer.from('key'))
    expect(store.getSnapshot().hostKeyVerification).toMatchObject({
      state: 'pending',
      fingerprint: 'SHA256:pending-key',
    })
    store.rejectHostKey()
    await expect(pending).resolves.toBe(false)
    expect(store.getSnapshot().hostKeyVerification).toBeUndefined()
  })
})
