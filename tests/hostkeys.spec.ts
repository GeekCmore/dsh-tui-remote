import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HostKeyVerifier } from '../src/hostkeys.js'

const tempDirectories: string[] = []

function storePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-remote-hostkeys-'))
  tempDirectories.push(directory)
  return join(directory, 'known-hosts.json')
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('HostKeyVerifier', () => {
  it('waits for and persists first-use trust', async () => {
    const path = storePath()
    const verifier = new HostKeyVerifier('default|deploy@example:22', 'deploy@example:22', path)
    const pending = verifier.verify('abc123', Buffer.from('key'))
    expect(verifier.getSnapshot()).toMatchObject({ state: 'pending', fingerprint: 'SHA256:abc123' })
    verifier.trust()
    await expect(pending).resolves.toBe(true)

    const restored = new HostKeyVerifier('default|deploy@example:22', 'deploy@example:22', path)
    await expect(restored.verify('SHA256:abc123', Buffer.from('key'))).resolves.toBe(true)
    expect(restored.getSnapshot()).toBeUndefined()
  })

  it('rejects a pending key without persisting it', async () => {
    const verifier = new HostKeyVerifier('id', 'target', storePath())
    const pending = verifier.verify('first', Buffer.from('key'))
    verifier.reject()
    await expect(pending).resolves.toBe(false)
    expect(verifier.getSnapshot()).toBeUndefined()
  })

  it('requires explicit trust when a saved fingerprint changes', async () => {
    const path = storePath()
    const first = new HostKeyVerifier('id', 'target', path)
    const accepted = first.verify('old', Buffer.from('key'))
    first.trust()
    await accepted

    const changed = new HostKeyVerifier('id', 'target', path)
    const pending = changed.verify('new', Buffer.from('key'))
    expect(changed.getSnapshot()).toMatchObject({
      state: 'changed',
      expectedFingerprint: 'SHA256:old',
      fingerprint: 'SHA256:new',
    })
    changed.trust()
    await expect(pending).resolves.toBe(true)
    await expect(new HostKeyVerifier('id', 'target', path).verify('new', Buffer.from('key'))).resolves.toBe(true)
  })

  it('fails closed on malformed storage', async () => {
    const path = storePath()
    writeFileSync(path, '{not-json\n')
    const verifier = new HostKeyVerifier('id', 'target', path)
    await expect(verifier.verify('key', Buffer.from('key'))).rejects.toThrow(/cannot read host-key store/)
  })
})
