import type { LiveRuntime } from '@dsh-remote/live-runtime';
import type { TuiWorkspaceProvider, TuiWorkspaceTarget } from '@deepseek-harness-tui/dsh-tui/workspaces';
export interface RemoteWorkspaceOptions {
    targetId: string;
    title: string;
    host: string;
    username: string;
    paths: readonly string[];
}
export declare function isRemoteAbsolutePath(path: string): boolean;
export declare function remoteWorkspaceUri(targetId: string, path: string): string;
export declare function parseRemoteWorkspaceUri(uri: string): {
    targetId: string;
    path: string;
} | undefined;
export declare class RemoteWorkspaceController {
    private readonly runtime;
    readonly options: RemoteWorkspaceOptions;
    private readonly knownPaths;
    readonly provider: TuiWorkspaceProvider;
    constructor(runtime: LiveRuntime, options: RemoteWorkspaceOptions);
    paths(): readonly string[];
    remember(path: string): TuiWorkspaceTarget;
    prepare(path: string, signal?: AbortSignal): Promise<TuiWorkspaceTarget>;
    target(path: string): TuiWorkspaceTarget;
    private commandShell;
}
//# sourceMappingURL=workspaces.d.ts.map