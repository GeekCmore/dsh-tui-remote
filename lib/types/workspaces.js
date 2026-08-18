import { posix } from 'node:path';
const WORKSPACE_STORAGE_KEY = 'remote-workspaces.v1';
const WORKSPACE_REGISTRY_VERSION = 1;
function shellQuote(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
export function isRemoteAbsolutePath(path) {
    return path.startsWith('/') && !path.includes('\0');
}
export function remoteWorkspaceUri(targetId, path) {
    return `dsh-remote://${encodeURIComponent(targetId)}/${encodeURIComponent(path)}`;
}
export function remoteWorkspaceTargetKey(options) {
    return `${options.targetId}|${options.username}@${options.host}:${options.port}`;
}
export function parseRemoteWorkspaceUri(uri) {
    const match = /^dsh-remote:\/\/([^/]+)\/(.+)$/u.exec(uri);
    if (match === null)
        return undefined;
    try {
        const targetId = decodeURIComponent(match[1]);
        const path = decodeURIComponent(match[2]);
        if (targetId.length === 0 || !isRemoteAbsolutePath(path))
            return undefined;
        return { targetId, path };
    }
    catch {
        return undefined;
    }
}
export class RemoteWorkspaceController {
    runtime;
    options;
    knownPaths;
    configuredPaths;
    dynamicPaths = new Set();
    registry = { version: WORKSPACE_REGISTRY_VERSION, targets: {} };
    persistenceEnabled;
    persistenceChain = Promise.resolve();
    restorePromise;
    provider;
    constructor(runtime, options) {
        this.runtime = runtime;
        this.options = options;
        this.configuredPaths = new Set(options.paths.filter(isRemoteAbsolutePath).map(path => posix.normalize(path)));
        this.knownPaths = new Set(this.configuredPaths);
        this.persistenceEnabled = options.storage !== undefined;
        this.restorePromise = this.restore();
        this.provider = {
            schemes: ['dsh-remote'],
            list: () => [...this.knownPaths].map(path => this.target(path)),
            resolve: async (uri, signal) => {
                const parsed = parseRemoteWorkspaceUri(uri);
                if (parsed?.targetId !== options.targetId)
                    return undefined;
                const normalized = posix.normalize(parsed.path);
                return this.knownPaths.has(normalized) ? this.target(normalized) : undefined;
            },
            resolvePath: async (path, cwd, signal) => {
                if (!this.knownPaths.has(cwd))
                    return undefined;
                return this.prepare(posix.resolve(cwd, path), signal);
            },
            describe: cwd => this.knownPaths.has(cwd) ? this.target(cwd) : undefined,
            commandShell: cwd => this.knownPaths.has(cwd) ? this.commandShell(cwd) : undefined,
        };
    }
    paths() {
        return [...this.knownPaths];
    }
    ready() {
        return this.restorePromise;
    }
    remember(path) {
        if (!isRemoteAbsolutePath(path))
            throw new Error('Remote workspace must be an absolute POSIX path');
        const normalized = posix.normalize(path);
        this.knownPaths.add(normalized);
        if (!this.configuredPaths.has(normalized)) {
            this.dynamicPaths.add(normalized);
            this.schedulePersist();
        }
        return this.target(normalized);
    }
    async prepare(path, signal) {
        if (!isRemoteAbsolutePath(path))
            throw new Error('Remote workspace must be an absolute POSIX path');
        if (this.runtime.status !== 'connected')
            throw new Error('Connect the remote target before switching workspace');
        const normalized = posix.normalize(path);
        const result = await this.runtime.exec({
            // POSIX `test` (including dash's builtin) does not accept `--`.
            // Absolute shell-quoted paths do not need an option terminator here.
            command: `test -d ${shellQuote(normalized)}`,
            signal,
        });
        if (result.exitCode !== 0)
            throw new Error(`Remote directory does not exist: ${normalized}`);
        return this.remember(normalized);
    }
    target(path) {
        const label = path === '/' ? '/' : posix.basename(path);
        return {
            uri: remoteWorkspaceUri(this.options.targetId, path),
            cwd: path,
            label,
            description: `${this.options.username}@${this.options.host}:${path}`,
            kind: 'provider',
            badge: 'REMOTE',
        };
    }
    commandShell(cwd) {
        return {
            resolve: request => request,
            run: async (spec) => {
                const request = spec;
                const result = await this.runtime.runCommand({
                    command: request.command,
                    cwd: request.workdir ?? cwd,
                    timeoutMs: request.timeoutMs ?? 30_000,
                });
                return {
                    exitCode: result.exitCode,
                    stdout: { text: result.stdout },
                    stderr: { text: result.stderr },
                    timedOut: result.timedOut,
                };
            },
        };
    }
    async restore() {
        const storage = this.options.storage;
        if (storage === undefined)
            return;
        let value;
        try {
            value = (await storage.get({ key: WORKSPACE_STORAGE_KEY })).value;
        }
        catch (error) {
            this.disablePersistence(error);
            return;
        }
        if (value === null)
            return;
        const registry = parseWorkspaceRegistry(value);
        if (registry === undefined) {
            this.disablePersistence(new Error('stored remote workspace registry has an invalid shape'));
            return;
        }
        this.registry = registry;
        const paths = registry.targets[remoteWorkspaceTargetKey(this.options)] ?? [];
        for (const path of paths) {
            const normalized = posix.normalize(path);
            if (this.configuredPaths.has(normalized))
                continue;
            this.knownPaths.add(normalized);
            this.dynamicPaths.add(normalized);
        }
    }
    schedulePersist() {
        if (!this.persistenceEnabled || this.options.storage === undefined)
            return;
        this.persistenceChain = this.persistenceChain
            .then(async () => {
            await this.restorePromise;
            if (!this.persistenceEnabled || this.options.storage === undefined)
                return;
            const targetKey = remoteWorkspaceTargetKey(this.options);
            this.registry.targets[targetKey] = [...this.dynamicPaths];
            await this.options.storage.set({
                key: WORKSPACE_STORAGE_KEY,
                value: this.registry,
            });
        })
            .catch(error => {
            this.disablePersistence(error);
        });
    }
    disablePersistence(error) {
        this.persistenceEnabled = false;
        this.reportStorageError(error);
    }
    reportStorageError(error) {
        this.options.onStorageError?.(error);
    }
}
function parseWorkspaceRegistry(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const candidate = value;
    if (candidate.version !== WORKSPACE_REGISTRY_VERSION || candidate.targets === null || typeof candidate.targets !== 'object' || Array.isArray(candidate.targets)) {
        return undefined;
    }
    const targets = {};
    for (const [target, paths] of Object.entries(candidate.targets)) {
        if (target.length === 0 || !Array.isArray(paths))
            return undefined;
        targets[target] = [...new Set(paths
                .filter((path) => typeof path === 'string' && isRemoteAbsolutePath(path))
                .map(path => posix.normalize(path)))];
    }
    return { version: WORKSPACE_REGISTRY_VERSION, targets };
}
