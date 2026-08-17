import { installLiveRuntime } from '@dsh-remote/live-runtime';
import { resolveConfig } from './config.js';
import { createRemoteScene } from './scene.js';
import { ConnectionStore } from './store.js';
import { RemoteWorkspaceController } from './workspaces.js';
export const name = 'dsh-remote';
export { Config } from './config.js';
function commandError(error) {
    return { kind: 'error', text: error instanceof Error ? error.message : String(error) };
}
export function apply(ctx, config = {}) {
    const resolved = resolveConfig(config);
    const auth = resolved.auth === 'key'
        ? { type: 'key', privateKeyPath: resolved.privateKeyPath }
        : { type: 'agent' };
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
    });
    const configurationError = resolved.auth === 'key' && resolved.privateKeyPath.length === 0
        ? 'privateKeyPath is required when auth is key'
        : undefined;
    const store = new ConnectionStore(runtime, configurationError);
    const workspaceController = new RemoteWorkspaceController(runtime, {
        targetId: resolved.targetId,
        title: resolved.title,
        host: resolved.host,
        username: resolved.username,
        paths: resolved.workspaces,
    });
    const scenes = ctx.get('tuiScenes', false);
    const workspaces = ctx.get('tuiWorkspaces', false);
    const commandTrees = ctx.get('tuiCommandTrees', false);
    const commands = ctx.get('commands', false);
    if (scenes !== undefined) {
        ctx.effect(() => scenes.register(createRemoteScene(store, workspaceController, resolved)), 'dsh-remote scene');
    }
    if (workspaces !== undefined) {
        ctx.effect(() => workspaces.register(workspaceController.provider), 'dsh-remote workspace provider');
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
        ctx.effect(() => commands.register({
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
        }), 'dsh-remote command');
    }
    if (resolved.autoConnect && configurationError === undefined) {
        queueMicrotask(() => void store.connect().catch(() => undefined));
    }
}
