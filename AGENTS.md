# plugin-template — local rules

This folder is the `dsh-tui-ecosystem/plugin-template` repository: a starting
scaffold for dsh-TUI ecosystem plugins.

- This is a **template**: copy the folder (or fork the repo) and rename
  `package.json`'s `name` before publishing.
- Keep the ESM contract: `.js` import suffixes, `name`/`Config`/`apply`
  exports, no default export, `lib/types/` build output committed on release.
- `src/registration.ts` and `src/events.ts` implement the log-only session
  event rules from the core guide (`docs/plugins.md`) — keep them in sync with
  upstream when copying.
- Remote workspace persistence follows the dsh-TUI capability contract at
  commit `836b7aae05cd93a46a4c704199ca111974599770`:
  - use admitted `storage.local` through `ctx.get('tuiPluginStorage', false)`;
    never read or write `~/.dsh-tui`, `~/.dsh`, or a plugin-owned JSON file;
  - call `tuiPluginHost.admit()` before opening storage and declare the
    `LocalStorage` contract plus `storage.local.read`/`storage.local.write`;
  - storage absence, denied permissions, malformed values, and unavailable
    backends must degrade to configured workspaces without blocking startup;
  - storage keys and values must not be written to logs, and workspace
    metadata must not be added as session events;
  - keep the upstream capability reference in sync when changing this flow.
- Do not commit, tag, or publish without an explicit user request.
