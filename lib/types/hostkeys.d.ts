export type HostKeyVerificationState = 'pending' | 'changed';
export interface HostKeyVerificationRequest {
    state: HostKeyVerificationState;
    target: string;
    fingerprint: string;
    expectedFingerprint?: string;
}
export declare function hostKeyIdentity(targetId: string, host: string, port: number, username: string): string;
export declare class HostKeyVerifier {
    private readonly identity;
    private readonly target;
    private readonly path;
    private readonly entries;
    private readonly loadError?;
    private pending?;
    private readonly listeners;
    constructor(identity: string, target: string, path?: string);
    getSnapshot(): HostKeyVerificationRequest | undefined;
    subscribe(listener: () => void): () => void;
    verify: (fingerprint: string, _hostKey: Buffer) => Promise<boolean>;
    trust(): void;
    reject(): void;
    dispose(): void;
    private publish;
}
//# sourceMappingURL=hostkeys.d.ts.map