/**
 * Example dsh-TUI ecosystem plugin: per-session turn counters.
 *
 * Demonstrates the full runtime-plugin contract:
 * - `name` / `Config` (type) / `Config` (schema) / `apply`, no default export;
 * - consuming the durable session stream (`session/event`, `session/disposed`);
 * - appending a log-only session event (`example/turn`) with mandatory type
 *   registration (see `./registration.ts`) and typed `SessionEventMap` merge
 *   (see `./events.ts`);
 * - the optional host-provided TUI prompt slot seam (`ctx.tuiPrompt`): when a
 *   TUI host provides it, `${example}` becomes available in `theme.leftPrompt`;
 * - schema defaults + `??` fallbacks so the plugin degrades to a no-op instead
 *   of failing boot.
 *
 * Follow the core guide for the full seam catalogue and rules:
 * https://github.com/ccch1mneyyy/dsh-TUI/blob/main/docs/plugins.md
 * @module @dsh-tui-ecosystem/example-plugin
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Session } from '@deepseek-ai/dsh-session'
import { registerExampleEventType } from './registration.js'
// Re-export the event type + SessionEventMap merge: the package root must
// carry the declare-module side effect for consumers resolving the built d.ts.
export type * from './events.js'

export const name = 'example-plugin'

/** Configurable knobs; every key has a sane default. */
export type Config = {
  /** Register the `${example}` TUI prompt slot when a TUI host provides one. */
  slot?: boolean
}

// Explicit annotation: the inferred z.dict output references cosmokit's Dict
// through a pnpm-virtual path, which is not portable in declaration emit
// (TS2883). The global `Schemastery` interface comes from schemastery's own
// d.ts (declare global).
export const Config: Schemastery<Config> = z.object({
  slot: z.boolean().default(true),
})

/** Structural view of the TUI prompt service; the real type lives in the host. */
interface TuiPromptLike {
  register(name: string, initialValue?: string): {
    set(value: string | undefined): void
    dispose(): void
  }
}

/**
 * Wire the example plugin.
 * @param ctx - Cordis context (session services composed).
 * @param config - Validated plugin config (schema defaults applied).
 */
export function apply(ctx: Context, config: Config = {}): void {
  // Register the event type BEFORE anything can append or validate: strict
  // read paths (resume seed validation, persistence load) refuse logs with
  // unknown non-ignorable types. Registration is unconditional and idempotent.
  registerExampleEventType()

  const resolved = { slot: config.slot ?? true }
  const counts = new Map<Session, number>()

  // Optional TUI seam: no host composed -> no slot, no error. The register()
  // call is effect-owned, so fiber disposal unregisters the slot.
  const prompt = ctx.get('tuiPrompt', false) as TuiPromptLike | undefined
  const handle = resolved.slot ? prompt?.register('example', undefined) : undefined

  ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return
    const count = (counts.get(session) ?? 0) + 1
    counts.set(session, count)
    // Append inside a microtask: the session's appending guard is still held
    // while session/event callbacks run.
    queueMicrotask(() => {
      handle?.set(`turn ${count}`)
      try {
        session.append('example/turn', { turn: count, at: Date.now() })
      } catch {
        // Session closed or the append guard still held: drop this snapshot.
      }
    })
  })

  ctx.on('session/disposed', (session) => {
    counts.delete(session)
  })

  ctx.effect(() => () => handle?.dispose(), 'example-plugin prompt slot')
}
