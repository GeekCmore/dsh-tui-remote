import { readFileSync } from 'node:fs'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

interface JsExpression {
  __jsExpr: string
}

interface PatchEntry {
  id?: string
  config?: Record<string, unknown>
  insert?: Array<{
    id?: string
    config?: Record<string, unknown>
  }>
}

const jsExpression = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: data => typeof data === 'string',
  construct: data => ({ __jsExpr: data }) satisfies JsExpression,
})

describe('cordis.patch.yml', () => {
  it('parses every dynamic config value as a scalar JS expression', () => {
    const source = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const patches = yaml.load(source, { schema: yaml.JSON_SCHEMA.extend(jsExpression) }) as PatchEntry[]
    const remote = patches.flatMap(entry => entry.insert ?? []).find(entry => entry.id === 'dsh-remote')
    const config = remote?.config

    expect(config).toBeDefined()
    expect(config?.host).toEqual({ __jsExpr: "process.env.DSH_REMOTE_HOST ?? 'localhost'" })
    expect(config?.port).toEqual({ __jsExpr: 'Number(process.env.DSH_REMOTE_PORT ?? 22)' })
    expect(config?.username).toEqual({ __jsExpr: "process.env.DSH_REMOTE_USER ?? process.env.USER ?? 'root'" })
    expect(config?.auth).toEqual({
      __jsExpr: "process.env.DSH_REMOTE_AUTH ?? (process.env.DSH_REMOTE_KEY ? 'key' : 'agent')",
    })
    expect(config?.privateKeyPath).toEqual({ __jsExpr: "process.env.DSH_REMOTE_KEY ?? ''" })
    expect(config?.workspaces).toEqual({
      __jsExpr: "process.env.DSH_REMOTE_CWD ? [process.env.DSH_REMOTE_CWD] : ['/']",
    })
    const tui = patches.find(entry => entry.id === 'dsh-tui')
    expect(tui?.config?.cwd).toEqual({ __jsExpr: "process.env.DSH_REMOTE_CWD ?? '/'" })
    expect(tui?.config).toMatchObject({
      provider: 'deepseek-official',
      fullscreen: false,
      effort: 'max',
      preset: { __jsExpr: 'process.env.DSH_TUI_PRESET ?? undefined' },
      workspace: { __jsExpr: 'process.env.DSH_TUI_WORKSPACE_TARGET ?? undefined' },
      sessionId: {
        __jsExpr: 'process.env.DSH_TUI_RESUME_SESSION ?? process.env.DSH_CC_RESUME_SESSION ?? undefined',
      },
      modes: [{ id: 'remote', plan: false, sandbox: 'danger-full-access', approval: 'never' }],
    })
    const topLevel = patches.find(entry => entry.insert?.some(item => item.id === 'terminals'))
    expect(topLevel?.insert).toEqual(expect.arrayContaining([
      { id: 'terminals', name: '@deepseek-ai/dsh-terminal' },
    ]))
    expect(patches.find(entry => entry.id === 'sandbox-policy')).toMatchObject({
      config: { mode: 'danger-full-access', workspaceRoot: { __jsExpr: "process.env.DSH_REMOTE_CWD ?? '/'" } },
    })
    expect(patches.find(entry => entry.id === 'permission')).toMatchObject({
      config: {
        defaultPreset: 'danger-full-access',
        presets: {
          'danger-full-access': { sandbox: 'danger-full-access', approval: 'never' },
        },
      },
    })
  })
})
