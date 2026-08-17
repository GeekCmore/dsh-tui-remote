import type { ConnectionStore } from './store.js'
import type { ResolvedConfig } from './config.js'

/**
 * Local mirror of the dsh-TUI `tuiStatusItems` seam types — the plugin keeps
 * its own copy so it still compiles against dsh-TUI releases that predate the
 * seam (registration degrades to a no-op there; see index.ts).
 */
export interface StatusItem {
  id: string
  text: string
  color?: string
  dimColor?: boolean
}

export interface StatusItemsProvider {
  items(): readonly StatusItem[]
  subscribe(listener: () => void): () => void
}

const STATUS_PRESENTATION: Record<string, { text: string; color?: string; dimColor?: boolean }> = {
  connected: { text: 'remote: connected', color: 'professionalBlue' },
  connecting: { text: 'remote: connecting…', color: 'warning' },
  disconnecting: { text: 'remote: disconnecting…', color: 'warning' },
  disconnected: { text: 'remote: offline', dimColor: true },
  degraded: { text: 'remote: degraded', color: 'warning' },
}

/**
 * Status-bar contribution for the live target: connection state, the
 * `user@host` target label, and the last measured round-trip once one exists.
 * The store already notifies on every snapshot change, so the provider just
 * re-reads the snapshot.
 */
export function createStatusItemsProvider(
  store: ConnectionStore,
  resolved: Pick<ResolvedConfig, 'host' | 'username'>,
): StatusItemsProvider {
  return {
    items() {
      const snapshot = store.getSnapshot()
      const presentation = STATUS_PRESENTATION[snapshot.status] ?? { text: `remote: ${snapshot.status}` }
      const items: StatusItem[] = [
        { id: 'dsh-remote-status', ...presentation },
        { id: 'dsh-remote-target', text: `${resolved.username}@${resolved.host}`, dimColor: true },
      ]
      if (snapshot.roundTripMs !== undefined && snapshot.status === 'connected') {
        items.push({ id: 'dsh-remote-latency', text: `${snapshot.roundTripMs} ms`, dimColor: true })
      }
      return items
    },
    subscribe: listener => store.subscribe(listener),
  }
}
