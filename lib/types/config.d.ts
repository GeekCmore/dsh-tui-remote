export type Config = {
    targetId?: string;
    title?: string;
    host?: string;
    port?: number;
    username?: string;
    auth?: 'agent' | 'key';
    privateKeyPath?: string;
    autoConnect?: boolean;
    workspaces?: string[];
    monitorIntervalMs?: number;
    readyTimeoutMs?: number;
    keepaliveIntervalMs?: number;
};
export interface ResolvedConfig {
    targetId: string;
    title: string;
    host: string;
    port: number;
    username: string;
    auth: 'agent' | 'key';
    privateKeyPath: string;
    autoConnect: boolean;
    workspaces: string[];
    monitorIntervalMs: number;
    readyTimeoutMs: number;
    keepaliveIntervalMs: number;
}
export declare const Config: Schemastery<Config>;
export declare function resolveConfig(config: Config): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map