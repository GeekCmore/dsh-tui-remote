/**
 * Runtime registration of the `example/turn` session-event type.
 *
 * dsh-session's read paths (resume seed validation, persistence load) refuse
 * any log containing a type outside KNOWN_SESSION_EVENT_TYPES unless every
 * such event carries the envelope's `ignorable` marker — and `session.append()`
 * exposes no ignorable flag, so an unregistered published type makes the whole
 * session unresumable. This module registers its own type at load.
 *
 * Why "every reachable copy": a runtime can load dsh-session more than once.
 * The dsh CLI tree and a plugin profile tree resolve different physical copies
 * during upgrade windows, and the strict validators consult only THEIR copy's
 * Set. Anchors: this module (plugin/profile tree) and the process entry point
 * (the CLI tree the persistence backend resolves from). A copy that cannot be
 * resolved from an anchor simply is not there; registration never throws.
 *
 * Self-adjusting: when upstream's generated catalog adopts this type (or a
 * real registration API ships), the add() call becomes a no-op and this module
 * can be deleted.
 * @module @dsh-tui-ecosystem/example-plugin/registration
 */
import { createRequire } from 'node:module';
/** The session-event type this plugin publishes. */
const EXAMPLE_EVENT_TYPE = 'example/turn';
/**
 * Register `example/turn` as a known session-event type in every reachable
 * dsh-session copy. Idempotent; silently skips anchors whose resolution fails.
 */
export function registerExampleEventType() {
    const anchors = [import.meta.url, process.argv[1]].filter((anchor) => typeof anchor === 'string' && anchor.length > 0);
    for (const anchor of anchors) {
        try {
            const req = createRequire(anchor);
            const mod = req('@deepseek-ai/dsh-session');
            mod.KNOWN_SESSION_EVENT_TYPES?.add(EXAMPLE_EVENT_TYPE);
        }
        catch {
            // No resolvable dsh-session copy from this anchor — nothing to register into.
        }
    }
}
