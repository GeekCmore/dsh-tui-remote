const STATUS_PRESENTATION = {
    connected: { text: 'remote: connected', color: 'professionalBlue' },
    connecting: { text: 'remote: connecting…', color: 'warning' },
    disconnecting: { text: 'remote: disconnecting…', color: 'warning' },
    disconnected: { text: 'remote: offline', dimColor: true },
    degraded: { text: 'remote: degraded', color: 'warning' },
};
/**
 * Status-bar contribution for the live target: connection state, the
 * `user@host` target label, and the last measured round-trip once one exists.
 * The store already notifies on every snapshot change, so the provider just
 * re-reads the snapshot.
 */
export function createStatusItemsProvider(store, resolved) {
    return {
        items() {
            const snapshot = store.getSnapshot();
            const presentation = STATUS_PRESENTATION[snapshot.status] ?? { text: `remote: ${snapshot.status}` };
            const items = [
                { id: 'dsh-remote-status', ...presentation },
                { id: 'dsh-remote-target', text: `${resolved.username}@${resolved.host}`, dimColor: true },
            ];
            if (snapshot.roundTripMs !== undefined && snapshot.status === 'connected') {
                items.push({ id: 'dsh-remote-latency', text: `${snapshot.roundTripMs} ms`, dimColor: true });
            }
            return items;
        },
        subscribe: listener => store.subscribe(listener),
    };
}
