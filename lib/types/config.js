import z from '@deepseek-ai/schemastery';
function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
const envWorkspace = process.env.DSH_REMOTE_CWD;
const envKey = process.env.DSH_REMOTE_KEY;
const envAuth = process.env.DSH_REMOTE_AUTH;
const defaultAuth = envAuth === 'agent' || envAuth === 'key' || envAuth === 'password'
    ? envAuth
    : envKey
        ? 'key'
        : 'agent';
export const Config = z.object({
    targetId: z.string().default('default'),
    title: z.string().default(''),
    host: z.string().default(process.env.DSH_REMOTE_HOST ?? 'localhost'),
    port: z.number().default(positiveInteger(process.env.DSH_REMOTE_PORT, 22)),
    username: z.string().default(process.env.DSH_REMOTE_USER ?? process.env.USER ?? 'root'),
    auth: z.union(['agent', 'key', 'password']).default(defaultAuth),
    privateKeyPath: z.string().default(envKey ?? ''),
    autoConnect: z.boolean().default(true),
    // A remote subprocess always needs a directory that exists on the target.
    // `/` is the portable fallback when no target-specific workspace is given.
    workspaces: z.array(z.string()).default(envWorkspace ? [envWorkspace] : ['/']),
    monitorIntervalMs: z.number().default(5_000),
    readyTimeoutMs: z.number().default(15_000),
    keepaliveIntervalMs: z.number().default(0),
});
export function resolveConfig(config) {
    const host = config.host?.trim() || process.env.DSH_REMOTE_HOST || 'localhost';
    const requestedAuth = config.auth ?? defaultAuth;
    const auth = requestedAuth === 'key' || requestedAuth === 'password' ? requestedAuth : 'agent';
    const workspaces = [...new Set((config.workspaces ?? ['/']).map(path => path.trim()).filter(Boolean))];
    return {
        targetId: config.targetId?.trim() || 'default',
        title: config.title?.trim() || host,
        host,
        port: Number.isSafeInteger(config.port) && (config.port ?? 0) > 0 ? config.port : 22,
        username: config.username?.trim() || process.env.DSH_REMOTE_USER || process.env.USER || 'root',
        auth,
        privateKeyPath: config.privateKeyPath?.trim() || process.env.DSH_REMOTE_KEY || '',
        autoConnect: config.autoConnect ?? true,
        workspaces,
        monitorIntervalMs: positiveInteger(String(config.monitorIntervalMs ?? ''), 5_000),
        readyTimeoutMs: positiveInteger(String(config.readyTimeoutMs ?? ''), 15_000),
        keepaliveIntervalMs: Number.isSafeInteger(config.keepaliveIntervalMs) && (config.keepaliveIntervalMs ?? -1) >= 0
            ? config.keepaliveIntervalMs
            : 0,
    };
}
