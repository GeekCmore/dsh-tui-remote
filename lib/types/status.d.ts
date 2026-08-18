import type { ConnectionStore } from './store.js';
import type { ResolvedConfig } from './config.js';
/**
 * Local mirror of the dsh-TUI `tuiStatusItems` seam types — the plugin keeps
 * its own copy so it still compiles against dsh-TUI releases that predate the
 * seam (registration degrades to a no-op there; see index.ts).
 */
export interface StatusItem {
    id: string;
    text: string;
    color?: string;
    dimColor?: boolean;
}
export interface StatusItemsProvider {
    items(): readonly StatusItem[];
    subscribe(listener: () => void): () => void;
}
/**
 * Status-bar contribution for the live target: connection state, the
 * `user@host` target label, and the last measured round-trip once one exists.
 * The store already notifies on every snapshot change, so the provider just
 * re-reads the snapshot.
 */
export declare function createStatusItemsProvider(store: ConnectionStore, resolved: Pick<ResolvedConfig, 'host' | 'username'>): StatusItemsProvider;
//# sourceMappingURL=status.d.ts.map