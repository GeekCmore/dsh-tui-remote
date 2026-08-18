/**
 * The admission manifest is kept as a static string so the installed ESM
 * entry does not depend on resolving a package-root JSON file at runtime.
 * `dsh-plugin.json` is the discoverable copy shipped in the package.
 */
export const manifestSource = JSON.stringify({
  $schema: 'https://dsh.community/schemas/dsh-plugin-0.15.json',
  id: 'com.dsh-tui-ecosystem.dsh-remote',
  name: 'dsh-remote',
  version: '0.1.0',
  manifestVersion: '0.15',
  facets: {
    host: {
      entry: 'lib/types/index.js',
      apiVersion: 'v1alpha1',
    },
  },
  requires: {
    contracts: [
      {
        apiVersion: 'commands.dsh/v1alpha1',
        kind: 'Command',
        optional: true,
        fallback: 'Remote scene and workspace providers remain available',
      },
      {
        apiVersion: 'storage.dsh/v1alpha1',
        kind: 'LocalStorage',
        optional: true,
        fallback: 'Configured workspaces remain available without temporary workspace persistence',
      },
    ],
  },
  permissions: [
    {
      name: 'commands.invoke',
      scope: 'com.dsh-tui-ecosystem.dsh-remote.remote',
      reason: 'invoke the remote control command',
    },
    {
      name: 'storage.local.read',
      scope: 'com.dsh-tui-ecosystem.dsh-remote',
      reason: 'restore temporary remote workspace ownership',
    },
    {
      name: 'storage.local.write',
      scope: 'com.dsh-tui-ecosystem.dsh-remote',
      reason: 'persist temporary remote workspace ownership',
    },
  ],
  contributes: {
    commands: [
      {
        id: 'com.dsh-tui-ecosystem.dsh-remote.remote',
        title: 'Remote',
        description: 'Open and manage the SSH live target',
      },
    ],
  },
  subscriptions: [],
  license: 'MIT',
  source: {
    repository: 'https://github.com/GeekCmore/dsh-tui-remote',
  },
})

export const commandContributionId = 'com.dsh-tui-ecosystem.dsh-remote.remote'
