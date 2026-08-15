/**
 * `example/turn` session event — a log-only, non-surface snapshot appended by
 * this plugin for any UI consumer. It never enters derived model history (no
 * `surfaceOp`), so it cannot leak into prompts.
 * @module @dsh-tui-ecosystem/example-plugin/events
 */
/** Durable payload of one `example/turn` snapshot. */
export interface ExampleTurnEvent {
    /** Turn counter for the session (1-based). */
    readonly turn: number;
    /** Wall-clock time (epoch ms) the turn ended. */
    readonly at: number;
}
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /**
         * Log-only UI snapshot: the session's completed turn count. Never a
         * surface event: UIs render it, the model never sees it.
         * @param data - The turn snapshot.
         */
        'example/turn': ExampleTurnEvent;
    }
}
//# sourceMappingURL=events.d.ts.map