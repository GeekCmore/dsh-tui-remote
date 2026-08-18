const REMOTE_COMMANDS = ['bash', 'realpath', 'stat', 'base64', 'setsid', 'ps'];
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export class ConnectionStore {
    runtime;
    configurationError;
    current;
    listeners = new Set();
    active;
    diagnosticsRun;
    constructor(runtime, configurationError) {
        this.runtime = runtime;
        this.configurationError = configurationError;
        this.current = {
            status: runtime.status,
            error: configurationError,
            metrics: runtime.metrics,
            diagnostics: REMOTE_COMMANDS.map(name => ({ name, status: 'pending' })),
            diagnosticsBusy: false,
        };
        runtime.subscribe(() => this.sync());
    }
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };
    getSnapshot = () => this.current;
    connect(credentials) {
        return this.perform('connect', () => this.runtime.connect(credentials));
    }
    disconnect() {
        return this.perform('disconnect', () => this.runtime.disconnect());
    }
    reconnect(credentials) {
        return this.perform('reconnect', () => this.runtime.reconnect(credentials));
    }
    requestCredentials(action) {
        if (this.active !== undefined)
            return;
        this.publish({ ...this.current, credentialRequest: action, error: undefined });
    }
    cancelCredentials() {
        if (this.current.credentialRequest === undefined)
            return;
        this.publish({ ...this.current, credentialRequest: undefined });
    }
    refreshDiagnostics() {
        if (this.diagnosticsRun !== undefined)
            return this.diagnosticsRun;
        const run = this.collectDiagnostics();
        this.diagnosticsRun = run;
        void run.finally(() => {
            if (this.diagnosticsRun === run)
                this.diagnosticsRun = undefined;
        });
        return run;
    }
    perform(action, operation) {
        if (this.active !== undefined)
            return this.active;
        if (this.configurationError !== undefined) {
            const failure = Promise.reject(new Error(this.configurationError));
            void failure.catch(() => undefined);
            return failure;
        }
        this.publish({
            ...this.current,
            busy: action,
            credentialRequest: undefined,
            status: action === 'disconnect' ? 'disconnecting' : 'connecting',
            error: undefined,
        });
        const startedAt = Date.now();
        const active = operation().then(() => {
            this.publish({
                ...this.current,
                busy: undefined,
                status: this.runtime.status,
                error: undefined,
                metrics: this.runtime.metrics,
                roundTripMs: action === 'disconnect' ? undefined : Date.now() - startedAt,
            });
        }, (error) => {
            this.publish({
                ...this.current,
                busy: undefined,
                status: this.runtime.status,
                error: errorMessage(error),
                metrics: this.runtime.metrics,
            });
            throw error;
        }).finally(() => {
            if (this.active === active)
                this.active = undefined;
        });
        this.active = active;
        return active;
    }
    async collectDiagnostics() {
        if (this.runtime.status !== 'connected') {
            this.publish({
                ...this.current,
                diagnostics: REMOTE_COMMANDS.map(name => ({ name, status: 'pending', detail: 'Connect first' })),
                diagnosticsBusy: false,
            });
            return;
        }
        this.publish({ ...this.current, diagnosticsBusy: true });
        try {
            const command = REMOTE_COMMANDS
                .map(name => `command -v -- ${name} >/dev/null 2>&1 && printf '${name}=ok\\n' || printf '${name}=missing\\n'`)
                .join('; ');
            const startedAt = Date.now();
            const result = await this.runtime.exec({ command });
            const roundTripMs = Date.now() - startedAt;
            const statuses = new Map(result.stdout.trim().split('\n').map(line => line.split('=', 2)));
            this.publish({
                ...this.current,
                diagnostics: REMOTE_COMMANDS.map(name => ({
                    name,
                    status: statuses.get(name) === 'ok' ? 'ok' : 'missing',
                })),
                diagnosticsBusy: false,
                roundTripMs,
            });
        }
        catch (error) {
            const detail = errorMessage(error);
            this.publish({
                ...this.current,
                diagnostics: REMOTE_COMMANDS.map(name => ({ name, status: 'error', detail })),
                diagnosticsBusy: false,
            });
        }
    }
    sync() {
        this.publish({
            ...this.current,
            status: this.current.busy === 'disconnect'
                ? 'disconnecting'
                : this.current.busy !== undefined
                    ? 'connecting'
                    : this.runtime.status,
            metrics: this.runtime.metrics,
        });
    }
    publish(snapshot) {
        this.current = snapshot;
        for (const listener of this.listeners)
            listener();
    }
}
