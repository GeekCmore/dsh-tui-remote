import { describe, expect, it, vi } from 'vitest'
import type { LiveRuntime } from '@dsh-remote/live-runtime'
import {
  RemoteWorkspaceController,
  parseRemoteWorkspaceUri,
  remoteWorkspaceUri,
} from '../src/workspaces.js'

function runtime(): LiveRuntime {
  return {
    targetId: 'default',
    hub: {} as LiveRuntime['hub'],
    fs: {},
    subprocess: {},
    monitor: {} as LiveRuntime['monitor'],
    status: 'connected',
    runtimeRoot: '/home/alice/.cache/dsh-remote/session',
    metrics: undefined,
    async connect() {},
    async disconnect() {},
    async reconnect() {},
    exec: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
    runCommand: vi.fn(async () => ({ exitCode: 0, stdout: '/srv/app\n', stderr: '', timedOut: false })),
    subscribe() { return () => undefined },
  }
}

describe('remote workspaces', () => {
  it('round-trips provider URIs', () => {
    const uri = remoteWorkspaceUri('default', '/srv/a project')
    expect(parseRemoteWorkspaceUri(uri)).toEqual({ targetId: 'default', path: '/srv/a project' })
    expect(parseRemoteWorkspaceUri('dsh-remote://default/relative')).toBeUndefined()
  })

  it('verifies and remembers temporary paths', async () => {
    const live = runtime()
    const controller = new RemoteWorkspaceController(live, {
      targetId: 'default', title: 'dev', host: 'host', port: 22, username: 'alice', paths: ['/srv/app'],
    })
    const target = await controller.prepare('/opt/code')
    expect(target).toMatchObject({ cwd: '/opt/code', badge: 'REMOTE', kind: 'provider' })
    expect(controller.paths()).toEqual(['/srv/app', '/opt/code'])
    expect(live.exec).toHaveBeenCalledWith({ command: "test -d '/opt/code'", signal: undefined })
  })

  it('routes command shell execution through the live runtime', async () => {
    const live = runtime()
    const controller = new RemoteWorkspaceController(live, {
      targetId: 'default', title: 'dev', host: 'host', port: 22, username: 'alice', paths: ['/srv/app'],
    })
    const shell = await controller.provider.commandShell?.('/srv/app')
    const spec = shell?.resolve({ command: 'pwd', workdir: '/srv/app', timeoutMs: 1_000 })
    const result = await shell?.run(spec)
    expect(result?.stdout.text).toBe('/srv/app\n')
    expect(live.runCommand).toHaveBeenCalledWith({ command: 'pwd', cwd: '/srv/app', timeoutMs: 1_000 })
  })

  it('restores dynamic paths and resolves them while disconnected', async () => {
    const live = runtime()
    live.status = 'disconnected'
    const storage = {
      get: vi.fn(async () => ({
        value: {
          version: 1,
          targets: { 'default|alice@host:22': ['/opt/code', '/srv/app', 'relative'] },
        },
      })),
      set: vi.fn(async () => ({ stored: true as const })),
    }
    const controller = new RemoteWorkspaceController(live, {
      targetId: 'default', title: 'dev', host: 'host', port: 22, username: 'alice', paths: ['/srv/app'], storage,
    })

    await controller.ready()

    expect(controller.paths()).toEqual(['/srv/app', '/opt/code'])
    await expect(controller.provider.resolve?.(remoteWorkspaceUri('default', '/opt/code'))).resolves.toMatchObject({
      cwd: '/opt/code',
      badge: 'REMOTE',
    })
    expect(await controller.provider.resolve?.(remoteWorkspaceUri('default', '/missing'))).toBeUndefined()
  })

  it('persists only temporary paths for the current target', async () => {
    const live = runtime()
    const storage = {
      get: vi.fn(async () => ({ value: { version: 1, targets: { 'other|alice@other:22': ['/other'] } } })),
      set: vi.fn(async () => ({ stored: true as const })),
    }
    const controller = new RemoteWorkspaceController(live, {
      targetId: 'default', title: 'dev', host: 'host', port: 22, username: 'alice', paths: ['/srv/app'], storage,
    })

    await controller.ready()
    controller.remember('/opt/code')
    await Promise.resolve()
    await Promise.resolve()

    expect(storage.set).toHaveBeenCalledWith({
      key: 'remote-workspaces.v1',
      value: {
        version: 1,
        targets: {
          'other|alice@other:22': ['/other'],
          'default|alice@host:22': ['/opt/code'],
        },
      },
    })
  })

  it('keeps configured paths available when storage is unavailable', async () => {
    const live = runtime()
    const onStorageError = vi.fn()
    const controller = new RemoteWorkspaceController(live, {
      targetId: 'default', title: 'dev', host: 'host', port: 22, username: 'alice', paths: ['/srv/app'],
      storage: {
        get: vi.fn(async () => { throw new Error('storage unavailable') }),
        set: vi.fn(async () => ({ stored: true as const })),
      },
      onStorageError,
    })

    await controller.ready()
    expect(controller.paths()).toEqual(['/srv/app'])
    expect(onStorageError).toHaveBeenCalledOnce()
    controller.remember('/opt/code')
    await Promise.resolve()
    expect(controller.paths()).toEqual(['/srv/app', '/opt/code'])
  })

  it('does not overwrite a malformed stored registry', async () => {
    const live = runtime()
    const onStorageError = vi.fn()
    const storage = {
      get: vi.fn(async () => ({ value: { version: 99, targets: {} } })),
      set: vi.fn(async () => ({ stored: true as const })),
    }
    const controller = new RemoteWorkspaceController(live, {
      targetId: 'default', title: 'dev', host: 'host', port: 22, username: 'alice', paths: ['/srv/app'], storage,
      onStorageError,
    })

    await controller.ready()
    controller.remember('/opt/code')
    await Promise.resolve()
    await Promise.resolve()

    expect(onStorageError).toHaveBeenCalledOnce()
    expect(storage.set).not.toHaveBeenCalled()
    expect(controller.paths()).toEqual(['/srv/app', '/opt/code'])
  })
})
