import { installLiveRuntime } from '@dsh-remote/live-runtime';
import { resolveConfig } from './config.js';
import { createRemoteScene } from './scene.js';
import { commandContributionId, manifestSource } from './manifest.js';
import { createStatusItemsProvider } from './status.js';
import { ConnectionStore } from './store.js';
import { RemoteWorkspaceController } from './workspaces.js';
import { hostKeyIdentity, HostKeyVerifier } from './hostkeys.js';
export const name = 'dsh-remote';
export { Config } from './config.js';
function commandError(error) {
    return { kind: 'error', text: error instanceof Error ? error.message : String(error) };
}
export function apply(ctx, config = {}) {
    const resolved = resolveConfig(config);
    const auth = resolved.auth === 'key'
        ? { type: 'key', privateKeyPath: resolved.privateKeyPath }
        : resolved.auth === 'password'
            ? { type: 'password' }
            : { type: 'agent' };
    const hostKeyVerifier = new HostKeyVerifier(hostKeyIdentity(resolved.targetId, resolved.host, resolved.port, resolved.username), `${resolved.username}@${resolved.host}:${resolved.port}`);
    const runtime = installLiveRuntime(ctx, {
        targetId: resolved.targetId,
        title: resolved.title,
        host: resolved.host,
        port: resolved.port,
        username: resolved.username,
        auth,
        readyTimeoutMs: resolved.readyTimeoutMs,
        keepaliveIntervalMs: resolved.keepaliveIntervalMs,
        defaultCwd: resolved.workspaces[0] ?? '/',
        monitorIntervalMs: resolved.monitorIntervalMs,
        hostVerifier: hostKeyVerifier.verify,
    });
    const configurationError = resolved.auth === 'key' && resolved.privateKeyPath.length === 0
        ? 'privateKeyPath is required when auth is key'
        : undefined;
    const store = new ConnectionStore(runtime, configurationError, hostKeyVerifier);
    const scenes = ctx.get('tuiScenes', false);
    const workspaces = ctx.get('tuiWorkspaces', false);
    const commandTrees = ctx.get('tuiCommandTrees', false);
    const statusItems = ctx.get('tuiStatusItems', false);
    const tuiStatus = ctx.get('tuiStatus', false);
    const tuiPluginHost = ctx.get('tuiPluginHost', false);
    const tuiPluginStorage = ctx.get('tuiPluginStorage', false);
    const commands = ctx.get('commands', false);
    let admitted = false;
    if (tuiPluginHost !== undefined) {
        try {
            tuiPluginHost.admit(ctx, manifestSource, {
                source: 'dsh-plugin.json',
            });
            admitted = true;
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            ctx.logger.warn(`dsh-remote: plugin admission unavailable; optional mediated capabilities disabled (${detail})`);
        }
    }
    let workspaceStorage;
    if (admitted && tuiPluginStorage !== undefined) {
        try {
            workspaceStorage = tuiPluginStorage.open(ctx);
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            ctx.logger.warn(`dsh-remote: workspace persistence unavailable; configured workspaces remain available (${detail})`);
        }
    }
    const workspaceController = new RemoteWorkspaceController(runtime, {
        targetId: resolved.targetId,
        title: resolved.title,
        host: resolved.host,
        port: resolved.port,
        username: resolved.username,
        paths: resolved.workspaces,
        storage: workspaceStorage,
        onStorageError: error => {
            const detail = error instanceof Error ? error.message : String(error);
            ctx.logger.warn(`dsh-remote: workspace persistence unavailable; configured workspaces remain available (${detail})`);
        },
    });
    if (scenes !== undefined) {
        hostKeyVerifier.subscribe(() => {
            if (hostKeyVerifier.getSnapshot() !== undefined)
                scenes.open('dsh-remote');
        });
    }
    if (scenes !== undefined) {
        ctx.effect(() => scenes.register(createRemoteScene(store, workspaceController, resolved)), 'dsh-remote scene');
    }
    ctx.effect(() => () => hostKeyVerifier.dispose(), 'dsh-remote host-key verifier');
    if (workspaces !== undefined) {
        ctx.effect(() => {
            let active = true;
            let dispose;
            void workspaceController.ready().then(() => {
                if (!active)
                    return;
                dispose = workspaces.register(workspaceController.provider);
            }).catch(error => {
                const detail = error instanceof Error ? error.message : String(error);
                ctx.logger.warn(`dsh-remote: workspace restoration failed; configured workspaces remain available (${detail})`);
                if (active)
                    dispose = workspaces.register(workspaceController.provider);
            });
            return () => {
                active = false;
                dispose?.();
            };
        }, 'dsh-remote workspace provider');
    }
    if (tuiStatus !== undefined) {
        ctx.effect(() => {
            const disposers = new Map();
            const publish = () => {
                const snapshot = store.getSnapshot();
                const statusText = snapshot.status === 'connected'
                    ? 'remote: connected'
                    : snapshot.status === 'connecting'
                        ? 'remote: connecting'
                        : snapshot.status === 'disconnecting'
                            ? 'remote: disconnecting'
                            : snapshot.status === 'degraded'
                                ? 'remote: degraded'
                                : 'remote: offline';
                const values = {
                    'dsh-remote:status': statusText,
                    'dsh-remote:target': `${resolved.username}@${resolved.host}`,
                    'dsh-remote:latency': snapshot.roundTripMs !== undefined && snapshot.status === 'connected'
                        ? `${snapshot.roundTripMs} ms`
                        : undefined,
                };
                for (const [key, text] of Object.entries(values)) {
                    disposers.set(key, tuiStatus.set(key, text, ctx));
                }
            };
            publish();
            const unsubscribe = store.subscribe(publish);
            return () => {
                unsubscribe();
                for (const dispose of disposers.values())
                    dispose();
            };
        }, 'dsh-remote official status');
    }
    else if (statusItems !== undefined) {
        ctx.effect(() => statusItems.register(createStatusItemsProvider(store, resolved)), 'dsh-remote status items');
    }
    if (commandTrees !== undefined) {
        ctx.effect(() => commandTrees.register({
            root: 'remote',
            descriptions: { zh: '管理 SSH Live 远端', en: 'Manage the SSH live target' },
            children: path => path.length === 1
                ? [
                    { name: 'connect', description: 'Connect the live target' },
                    { name: 'disconnect', description: 'Disconnect the live target' },
                    { name: 'reconnect', description: 'Reconnect the live target' },
                ]
                : [],
        }), 'dsh-remote command tree');
    }
    if (commands !== undefined) {
        const commandDefinition = {
            name: 'remote',
            description: 'Open and manage the SSH live target',
            input: { hint: '[connect|disconnect|reconnect]' },
            recordInput: false,
            handler: async ({ rawInput }) => {
                const action = rawInput.trim().toLowerCase();
                if (action.length === 0) {
                    return scenes?.open('dsh-remote') === true
                        ? { kind: 'success' }
                        : { kind: 'error', text: 'The dsh-TUI scene service is unavailable' };
                }
                try {
                    if (resolved.auth === 'password' && (action === 'connect' || action === 'reconnect')) {
                        store.requestCredentials(action);
                        if (scenes?.open('dsh-remote') === true)
                            return { kind: 'success' };
                        store.cancelCredentials();
                        return { kind: 'error', text: 'Open /remote to enter the SSH password' };
                    }
                    if (action === 'connect')
                        await store.connect();
                    else if (action === 'disconnect')
                        await store.disconnect();
                    else if (action === 'reconnect')
                        await store.reconnect();
                    else
                        return { kind: 'error', text: 'Usage: /remote [connect|disconnect|reconnect]' };
                    return { kind: 'success', text: `Remote ${action} complete` };
                }
                catch (error) {
                    return commandError(error);
                }
            },
        };
        if (tuiPluginHost !== undefined) {
            if (admitted) {
                ctx.effect(() => tuiPluginHost.registerCommand(ctx, commandContributionId, commandDefinition), 'dsh-remote mediated command');
            }
            else {
                ctx.logger.warn('dsh-remote: command admission unavailable; remote command registration skipped');
            }
        }
        else {
            ctx.effect(() => commands.register(commandDefinition), 'dsh-remote command');
        }
    }
    if (resolved.autoConnect && resolved.auth !== 'password' && configurationError === undefined) {
        queueMicrotask(() => void store.connect().catch(() => undefined));
    }
}
