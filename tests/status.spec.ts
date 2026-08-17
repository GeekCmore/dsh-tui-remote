import { describe, expect, it } from 'vitest'
import type { LiveConnectionStatus, LiveRuntime } from '@dsh-remote/live-runtime'
import { createStatusItemsProvider } from '../src/status.js'
import { ConnectionStore } from '../src/store.js'

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

const target = { host: 'example.internal', username: 'deploy' }

describe('createStatusItemsProvider', () => {
  it('shows offline state and target while disconnected', () => {
    const provider = createStatusItemsProvider(new ConnectionStore(runtime()), target)
    const items = provider.items()
    expect(items.map(item => item.id)).toEqual(['dsh-remote-status', 'dsh-remote-target'])
    expect(items[0]).toMatchObject({ text: 'remote: offline', dimColor: true })
    expect(items[1]).toMatchObject({ text: 'deploy@example.internal' })
  })

  it('reflects connection transitions and records latency after connect', async () => {
    const store = new ConnectionStore(runtime())
    const provider = createStatusItemsProvider(store, target)
    const pending = store.connect()
    expect(provider.items()[0]).toMatchObject({ text: 'remote: connecting…', color: 'warning' })
    await pending
    const items = provider.items()
    expect(items[0]).toMatchObject({ text: 'remote: connected', color: 'professionalBlue' })
    expect(items.map(item => item.id)).toContain('dsh-remote-latency')
    expect(items.find(item => item.id === 'dsh-remote-latency')?.text).toMatch(/^\d+ ms$/)
  })

  it('forwards store notifications to subscribers', async () => {
    const store = new ConnectionStore(runtime())
    const provider = createStatusItemsProvider(store, target)
    let notified = 0
    const unsubscribe = provider.subscribe(() => { notified += 1 })
    await store.connect()
    expect(notified).toBeGreaterThan(0)
    unsubscribe()
    const seen = notified
    await store.disconnect()
    expect(notified).toBe(seen)
  })
})
