import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { commandContributionId, manifestSource } from '../src/manifest.js'

describe('dsh-plugin manifest', () => {
  it('keeps the discoverable and runtime admission manifests aligned', () => {
    const rootManifest = JSON.parse(readFileSync(resolve(process.cwd(), 'dsh-plugin.json'), 'utf8')) as {
      id: string
      manifestVersion: string
      facets: { host: { entry: string } }
      contributes: { commands: Array<{ id: string }> }
    }
    const runtimeManifest = JSON.parse(manifestSource) as typeof rootManifest

    expect(runtimeManifest).toEqual(rootManifest)
    expect(rootManifest.manifestVersion).toBe('0.15')
    expect(rootManifest.facets.host.entry).toBe('lib/types/index.js')
    expect(rootManifest.contributes.commands[0]?.id).toBe(commandContributionId)
  })

  it('declares optional local storage with a degraded fallback', () => {
    const manifest = JSON.parse(manifestSource) as {
      requires: { contracts: Array<{ apiVersion: string; kind: string; optional?: boolean; fallback?: string }> }
      permissions: Array<{ name: string; scope: string }>
    }
    const storage = manifest.requires.contracts.find(contract => contract.kind === 'LocalStorage')
    expect(storage).toMatchObject({
      apiVersion: 'storage.dsh/v1alpha1',
      kind: 'LocalStorage',
      optional: true,
    })
    expect(storage?.fallback).toContain('Configured workspaces remain available')
    expect(manifest.permissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'storage.local.read', scope: 'com.dsh-tui-ecosystem.dsh-remote' }),
      expect.objectContaining({ name: 'storage.local.write', scope: 'com.dsh-tui-ecosystem.dsh-remote' }),
    ]))
  })
})
