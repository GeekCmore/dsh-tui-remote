import type { LiveRuntime } from '@dsh-remote/live-runtime';
import type { TuiWorkspaceProvider, TuiWorkspaceTarget } from '@deepseek-harness-tui/dsh-tui/workspaces';
export interface RemoteWorkspaceOptions {
    targetId: string;
    title: string;
    host: string;
    port: number;
    username: string;
    paths: readonly string[];
    storage?: RemoteWorkspaceStorage;
    onStorageError?: (error: unknown) => void;
}
export interface RemoteWorkspaceStorage {
    get(input: {
        key: string;
    }): Promise<{
        value: unknown | null;
    }>;
    set(input: {
        key: string;
        value: unknown;
    }): Promise<{
        stored: true;
    }>;
}
export declare function isRemoteAbsolutePath(path: string): boolean;
export declare function remoteWorkspaceUri(targetId: string, path: string): string;
export declare function remoteWorkspaceTargetKey(options: Pick<RemoteWorkspaceOptions, 'targetId' | 'host' | 'port' | 'username'>): string;
export declare function parseRemoteWorkspaceUri(uri: string): {
    targetId: string;
    path: string;
} | undefined;
export declare class RemoteWorkspaceController {
    private readonly runtime;
    readonly options: RemoteWorkspaceOptions;
    private readonly knownPaths;
    private readonly configuredPaths;
    private readonly dynamicPaths;
    private registry;
    private persistenceEnabled;
    private persistenceChain;
    private readonly restorePromise;
    readonly provider: TuiWorkspaceProvider;
    constructor(runtime: LiveRuntime, options: RemoteWorkspaceOptions);
    paths(): readonly string[];
    ready(): Promise<void>;
    remember(path: string): TuiWorkspaceTarget;
    prepare(path: string, signal?: AbortSignal): Promise<TuiWorkspaceTarget>;
    target(path: string): TuiWorkspaceTarget;
    private commandShell;
    private restore;
    private schedulePersist;
    private disablePersistence;
    private reportStorageError;
}
//# sourceMappingURL=workspaces.d.ts.map