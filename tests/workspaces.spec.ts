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
      targetId: 'default', title: 'dev', host: 'host', username: 'alice', paths: ['/srv/app'],
    })
    const target = await controller.prepare('/opt/code')
    expect(target).toMatchObject({ cwd: '/opt/code', badge: 'REMOTE', kind: 'provider' })
    expect(controller.paths()).toEqual(['/srv/app', '/opt/code'])
    expect(live.exec).toHaveBeenCalledWith({ command: "test -d '/opt/code'", signal: undefined })
  })

  it('routes command shell execution through the live runtime', async () => {
    const live = runtime()
    const controller = new RemoteWorkspaceController(live, {
      targetId: 'default', title: 'dev', host: 'host', username: 'alice', paths: ['/srv/app'],
    })
    const shell = await controller.provider.commandShell?.('/srv/app')
    const spec = shell?.resolve({ command: 'pwd', workdir: '/srv/app', timeoutMs: 1_000 })
    const result = await shell?.run(spec)
    expect(result?.stdout.text).toBe('/srv/app\n')
    expect(live.runCommand).toHaveBeenCalledWith({ command: 'pwd', cwd: '/srv/app', timeoutMs: 1_000 })
  })
})
