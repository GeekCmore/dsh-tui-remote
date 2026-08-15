/**
 * `example/turn` session event — a log-only, non-surface snapshot appended by
 * this plugin for any UI consumer. It never enters derived model history (no
 * `surfaceOp`), so it cannot leak into prompts.
 * @module @dsh-tui-ecosystem/example-plugin/events
 */
export {};
