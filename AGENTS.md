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
- Do not commit, tag, or publish without an explicit user request.
