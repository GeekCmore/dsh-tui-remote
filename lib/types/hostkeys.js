import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
function storagePath() {
    const root = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
    return join(root, 'dsh-remote', 'known-hosts.json');
}
function normalizeFingerprint(value) {
    const trimmed = value.trim();
    return trimmed.startsWith('SHA256:') ? trimmed : `SHA256:${trimmed}`;
}
function readEntries(path) {
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        if (parsed.version !== 1 || parsed.entries === undefined || typeof parsed.entries !== 'object' || parsed.entries === null) {
            throw new Error('invalid host-key store format');
        }
        const entries = {};
        for (const [key, fingerprint] of Object.entries(parsed.entries)) {
            if (typeof fingerprint !== 'string' || fingerprint.trim().length === 0) {
                throw new Error(`invalid host-key fingerprint for ${key}`);
            }
            entries[key] = normalizeFingerprint(fingerprint);
        }
        return entries;
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
            return {};
        throw new Error(`cannot read host-key store ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
function writeEntries(path, entries) {
    const directory = dirname(path);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    try {
        writeFileSync(temporary, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        chmodSync(temporary, 0o600);
        renameSync(temporary, path);
        chmodSync(path, 0o600);
    }
    catch (error) {
        try {
            // Best effort cleanup; the original store remains intact.
            unlinkSync(temporary);
        }
        catch {
            // Ignore cleanup failures while preserving the original error.
        }
        throw new Error(`cannot write host-key store ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
export function hostKeyIdentity(targetId, host, port, username) {
    return `${targetId}|${username}@${host}:${port}`;
}
export class HostKeyVerifier {
    identity;
    target;
    path;
    entries;
    loadError;
    pending;
    listeners = new Set();
    constructor(identity, target, path = storagePath()) {
        this.identity = identity;
        this.target = target;
        this.path = path;
        try {
            this.entries = readEntries(path);
        }
        catch (error) {
            this.entries = {};
            this.loadError = error instanceof Error ? error : new Error(String(error));
        }
    }
    getSnapshot() {
        return this.pending?.request;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    verify = async (fingerprint, _hostKey) => {
        if (this.loadError !== undefined)
            throw this.loadError;
        const normalized = normalizeFingerprint(fingerprint);
        const expected = this.entries[this.identity];
        if (expected === normalized)
            return true;
        if (this.pending !== undefined) {
            if (this.pending.request.fingerprint === normalized && this.pending.request.expectedFingerprint === expected) {
                return this.pending.promise;
            }
            this.pending.resolve(false);
        }
        const request = {
            state: expected === undefined ? 'pending' : 'changed',
            target: this.target,
            fingerprint: normalized,
            ...(expected === undefined ? {} : { expectedFingerprint: expected }),
        };
        let resolve;
        const promise = new Promise(done => { resolve = done; });
        this.pending = { request, promise, resolve };
        this.publish(request);
        return promise;
    };
    trust() {
        const pending = this.pending;
        if (pending === undefined)
            return;
        const nextEntries = { ...this.entries, [this.identity]: pending.request.fingerprint };
        writeEntries(this.path, nextEntries);
        this.entries[this.identity] = pending.request.fingerprint;
        this.pending = undefined;
        pending.resolve(true);
        this.publish(undefined);
    }
    reject() {
        const pending = this.pending;
        if (pending === undefined)
            return;
        this.pending = undefined;
        pending.resolve(false);
        this.publish(undefined);
    }
    dispose() {
        this.reject();
        this.listeners.clear();
    }
    publish(_request) {
        for (const listener of this.listeners)
            listener();
    }
}
