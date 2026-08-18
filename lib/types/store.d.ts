import type { LiveConnectionStatus, LiveCredentials, LiveMetrics, LiveRuntime } from '@dsh-remote/live-runtime';
export type RemoteDisplayStatus = LiveConnectionStatus | 'disconnecting';
export type RemoteAction = 'connect' | 'disconnect' | 'reconnect';
export type RemoteCredentialAction = Exclude<RemoteAction, 'disconnect'>;
export type DiagnosticStatus = 'ok' | 'missing' | 'error' | 'pending';
export interface DiagnosticCheck {
    name: string;
    status: DiagnosticStatus;
    detail?: string;
}
export interface ConnectionSnapshot {
    status: RemoteDisplayStatus;
    busy?: RemoteAction;
    error?: string;
    metrics?: LiveMetrics;
    diagnostics: readonly DiagnosticCheck[];
    diagnosticsBusy: boolean;
    credentialRequest?: RemoteCredentialAction;
    /** Round-trip time of the latest connect/reconnect or diagnostics exec. */
    roundTripMs?: number;
}
export declare class ConnectionStore {
    readonly runtime: LiveRuntime;
    private readonly configurationError?;
    private current;
    private readonly listeners;
    private active?;
    private diagnosticsRun?;
    constructor(runtime: LiveRuntime, configurationError?: string | undefined);
    readonly subscribe: (listener: () => void) => (() => void);
    readonly getSnapshot: () => ConnectionSnapshot;
    connect(credentials?: LiveCredentials): Promise<void>;
    disconnect(): Promise<void>;
    reconnect(credentials?: LiveCredentials): Promise<void>;
    requestCredentials(action: RemoteCredentialAction): void;
    cancelCredentials(): void;
    refreshDiagnostics(): Promise<void>;
    private perform;
    private collectDiagnostics;
    private sync;
    private publish;
}
//# sourceMappingURL=store.d.ts.map