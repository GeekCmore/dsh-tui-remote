import { posix } from 'node:path';
function shellQuote(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
export function isRemoteAbsolutePath(path) {
    return path.startsWith('/') && !path.includes('\0');
}
export function remoteWorkspaceUri(targetId, path) {
    return `dsh-remote://${encodeURIComponent(targetId)}/${encodeURIComponent(path)}`;
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
    provider;
    constructor(runtime, options) {
        this.runtime = runtime;
        this.options = options;
        this.knownPaths = new Set(options.paths.filter(isRemoteAbsolutePath));
        this.provider = {
            schemes: ['dsh-remote'],
            list: () => [...this.knownPaths].map(path => this.target(path)),
            resolve: async (uri, signal) => {
                const parsed = parseRemoteWorkspaceUri(uri);
                if (parsed?.targetId !== options.targetId)
                    return undefined;
                return this.prepare(parsed.path, signal);
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
    remember(path) {
        if (!isRemoteAbsolutePath(path))
            throw new Error('Remote workspace must be an absolute POSIX path');
        const normalized = posix.normalize(path);
        this.knownPaths.add(normalized);
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
}
