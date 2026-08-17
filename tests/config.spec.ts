import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'

describe('resolveConfig', () => {
  it('applies stable defaults', () => {
    const config = resolveConfig({ host: 'example.test', username: 'alice' })
    expect(config).toMatchObject({
      targetId: 'default',
      title: 'example.test',
      host: 'example.test',
      port: 22,
      username: 'alice',
      auth: 'agent',
      autoConnect: true,
      monitorIntervalMs: 5_000,
      readyTimeoutMs: 15_000,
      keepaliveIntervalMs: 0,
      workspaces: ['/'],
    })
  })

  it('normalizes duplicate workspace paths', () => {
    const config = resolveConfig({ workspaces: ['/srv/app', ' /srv/app ', '', '/opt/code'] })
    expect(config.workspaces).toEqual(['/srv/app', '/opt/code'])
  })

  it('uses the remote root when no workspace is configured', () => {
    expect(resolveConfig({}).workspaces).toEqual(['/'])
  })

  it('accepts password authentication without storing a password', () => {
    const config = resolveConfig({ auth: 'password' })
    expect(config.auth).toBe('password')
    expect(config).not.toHaveProperty('password')
  })
})
