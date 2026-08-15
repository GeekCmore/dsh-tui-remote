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
import type { Context } from '@deepseek-ai/cordis';
export type * from './events.js';
export declare const name = "example-plugin";
/** Configurable knobs; every key has a sane default. */
export type Config = {
    /** Register the `${example}` TUI prompt slot when a TUI host provides one. */
    slot?: boolean;
};
export declare const Config: Schemastery<Config>;
/**
 * Wire the example plugin.
 * @param ctx - Cordis context (session services composed).
 * @param config - Validated plugin config (schema defaults applied).
 */
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map