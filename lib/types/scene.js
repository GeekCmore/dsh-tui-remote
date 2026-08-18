const TABS = ['Overview', 'Diagnostics', 'Workspaces'];
const ACTIONS = [
    { label: 'Connect', action: 'connect' },
    { label: 'Disconnect', action: 'disconnect' },
    { label: 'Reconnect', action: 'reconnect' },
];
function formatBytes(bytes) {
    if (bytes === undefined || !Number.isFinite(bytes))
        return '-';
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let value = Math.max(0, bytes);
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
function statusColor(status) {
    if (status === 'connected')
        return 'success';
    if (status === 'degraded')
        return 'error';
    if (status === 'connecting' || status === 'disconnecting')
        return 'warning';
    return 'subtle';
}
function createRemoteSceneComponent(store, workspaces, config) {
    return function RemoteScene(props) {
        const { React, ui, channel, close } = props;
        const { Box, Text, useInput, useTerminalSize } = ui;
        const snapshot = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
        const [tab, setTab] = React.useState(0);
        const [actionIndex, setActionIndex] = React.useState(0);
        const [workspaceIndex, setWorkspaceIndex] = React.useState(0);
        const [draft, setDraft] = React.useState('');
        const [workspaceError, setWorkspaceError] = React.useState();
        const [workspaceBusy, setWorkspaceBusy] = React.useState(false);
        const [password, setPassword] = React.useState('');
        const [passwordError, setPasswordError] = React.useState();
        const [hostKeyChoice, setHostKeyChoice] = React.useState(0);
        const { columns } = useTerminalSize();
        const narrow = columns < 78;
        const paths = workspaces.paths();
        React.useEffect(() => {
            if (tab === 1)
                void store.refreshDiagnostics();
        }, [tab]);
        React.useEffect(() => {
            if (snapshot.hostKeyVerification !== undefined)
                setHostKeyChoice(0);
        }, [snapshot.hostKeyVerification?.fingerprint, snapshot.hostKeyVerification?.expectedFingerprint]);
        const runAction = React.useCallback((action, submittedPassword) => {
            const operation = action === 'connect'
                ? store.connect(submittedPassword === undefined ? undefined : { password: submittedPassword })
                : action === 'disconnect'
                    ? store.disconnect()
                    : store.reconnect(submittedPassword === undefined ? undefined : { password: submittedPassword });
            void operation.then(() => channel.notify(`Remote ${action} complete`, { color: 'success' }), error => channel.notify(error instanceof Error ? error.message : String(error), { color: 'error', timeoutMs: 8_000 }));
        }, [channel]);
        const requestAction = React.useCallback((action) => {
            if (config.auth === 'password' && action !== 'disconnect') {
                setPassword('');
                setPasswordError(undefined);
                store.requestCredentials(action);
                return;
            }
            runAction(action);
        }, [runAction]);
        const openWorkspace = React.useCallback((path) => {
            setWorkspaceBusy(true);
            setWorkspaceError(undefined);
            void workspaces.prepare(path).then(async (target) => {
                const switched = await channel.switchWorkspace(target);
                if (switched)
                    close();
            }).catch(error => {
                const message = error instanceof Error ? error.message : String(error);
                setWorkspaceError(message);
                channel.notify(message, { color: 'error', timeoutMs: 8_000 });
            }).finally(() => setWorkspaceBusy(false));
        }, [channel, close]);
        useInput((input, key, event) => {
            const hostKeyVerification = snapshot.hostKeyVerification;
            if (hostKeyVerification !== undefined) {
                if (key.escape) {
                    store.rejectHostKey();
                    return;
                }
                if (key.leftArrow || key.rightArrow) {
                    setHostKeyChoice(choice => choice === 0 ? 1 : 0);
                    return;
                }
                if (key.return) {
                    if (hostKeyChoice === 0) {
                        try {
                            store.trustHostKey();
                        }
                        catch (error) {
                            channel.notify(error instanceof Error ? error.message : String(error), { color: 'error', timeoutMs: 8_000 });
                        }
                    }
                    else {
                        store.rejectHostKey();
                    }
                    return;
                }
                return;
            }
            const credentialAction = snapshot.credentialRequest;
            if (credentialAction !== undefined) {
                if (key.escape) {
                    setPassword('');
                    setPasswordError(undefined);
                    store.cancelCredentials();
                    return;
                }
                if (key.backspace || key.delete) {
                    setPassword(value => value.slice(0, -1));
                    setPasswordError(undefined);
                    return;
                }
                if (key.return) {
                    if (password.length === 0) {
                        setPasswordError('Password is required');
                        return;
                    }
                    const submittedPassword = password;
                    setPassword('');
                    setPasswordError(undefined);
                    store.cancelCredentials();
                    runAction(credentialAction, submittedPassword);
                    return;
                }
                if (!key.ctrl && !key.meta && input.length > 0) {
                    const text = event.isPasted ? input.replace(/[\r\n]+/g, '') : input;
                    setPassword(value => value + text);
                    setPasswordError(undefined);
                }
                return;
            }
            if (key.escape) {
                close();
                return;
            }
            if (key.tab) {
                setTab(current => (current + (key.shift ? TABS.length - 1 : 1)) % TABS.length);
                setWorkspaceError(undefined);
                return;
            }
            if (tab !== 2) {
                if (input === 'q' && !key.ctrl && !key.meta) {
                    close();
                    return;
                }
                if (input === 'r' && !key.ctrl && !key.meta) {
                    requestAction('reconnect');
                    return;
                }
                if (input === 'd' && !key.ctrl && !key.meta) {
                    runAction('disconnect');
                    return;
                }
                if (key.leftArrow) {
                    setActionIndex(index => (index + ACTIONS.length - 1) % ACTIONS.length);
                    return;
                }
                if (key.rightArrow) {
                    setActionIndex(index => (index + 1) % ACTIONS.length);
                    return;
                }
                if (key.return && snapshot.busy === undefined) {
                    requestAction(ACTIONS[actionIndex].action);
                }
                return;
            }
            if (workspaceBusy)
                return;
            if (key.upArrow && paths.length > 0) {
                setWorkspaceIndex(index => (index + paths.length - 1) % paths.length);
                return;
            }
            if (key.downArrow && paths.length > 0) {
                setWorkspaceIndex(index => (index + 1) % paths.length);
                return;
            }
            if (key.backspace || key.delete) {
                setDraft(value => value.slice(0, -1));
                return;
            }
            if (key.return) {
                const path = draft.trim() || paths[workspaceIndex];
                if (path !== undefined)
                    openWorkspace(path);
                return;
            }
            if (!key.ctrl && !key.meta && input.length > 0) {
                const text = event.isPasted ? input.replace(/[\r\n]+/g, '') : input;
                setDraft(value => value + text);
            }
        });
        const tabRow = React.createElement(Box, { flexDirection: 'row', gap: 2, marginTop: 1 }, ...TABS.map((label, index) => React.createElement(Text, { key: label, bold: tab === index, inverse: tab === index }, ` ${label} `)));
        const actionRow = React.createElement(Box, { flexDirection: 'row', gap: 1, marginTop: 1 }, ...ACTIONS.map((entry, index) => React.createElement(Text, {
            key: entry.action,
            inverse: actionIndex === index,
            color: snapshot.busy === entry.action ? 'warning' : undefined,
        }, ` ${entry.label} `)));
        const passwordPrompt = snapshot.credentialRequest === undefined
            ? null
            : React.createElement(Box, { flexDirection: 'column', marginTop: 1, paddingX: 1, borderStyle: 'single', borderColor: 'warning' }, React.createElement(Text, { bold: true }, `SSH password for ${config.username}@${config.host}`), React.createElement(Text, { wrap: 'truncate-end' }, `Password  ${'*'.repeat(password.length)}`), passwordError === undefined ? null : React.createElement(Text, { color: 'error' }, passwordError));
        const hostKeyPrompt = snapshot.hostKeyVerification === undefined
            ? null
            : React.createElement(Box, { flexDirection: 'column', marginTop: 1, paddingX: 1, borderStyle: 'single', borderColor: 'warning' }, React.createElement(Text, { bold: true }, snapshot.hostKeyVerification.state === 'changed' ? 'SSH host key changed' : 'Trust SSH host key'), React.createElement(Text, { wrap: 'truncate-end' }, `Target       ${snapshot.hostKeyVerification.target}`), snapshot.hostKeyVerification.expectedFingerprint === undefined
                ? null
                : React.createElement(Text, { color: 'error', wrap: 'truncate-end' }, `Saved        ${snapshot.hostKeyVerification.expectedFingerprint}`), React.createElement(Text, { wrap: 'truncate-end' }, `Presented    ${snapshot.hostKeyVerification.fingerprint}`), React.createElement(Text, { color: 'subtle' }, 'Verify this fingerprint out of band before trusting it.'), React.createElement(Box, { flexDirection: 'row', gap: 2, marginTop: 1 }, React.createElement(Text, { inverse: hostKeyChoice === 0 }, ' Trust '), React.createElement(Text, { inverse: hostKeyChoice === 1 }, ' Reject ')));
        let body;
        if (tab === 0) {
            const metrics = snapshot.metrics;
            const memoryUsed = metrics === undefined ? undefined : metrics.memTotalBytes - metrics.memAvailableBytes;
            const diskUsed = metrics?.diskTotalBytes === undefined || metrics.diskFreeBytes === undefined
                ? undefined
                : metrics.diskTotalBytes - metrics.diskFreeBytes;
            const identity = React.createElement(Box, { flexDirection: 'column', width: narrow ? '100%' : '50%' }, React.createElement(Text, { bold: true }, 'Target'), React.createElement(Text, null, `ID       ${config.targetId}`), React.createElement(Text, null, `Address  ${config.username}@${config.host}:${config.port}`), React.createElement(Text, null, `Auth     ${config.auth === 'agent' ? 'SSH agent' : config.auth === 'key' ? 'Private key' : 'Password prompt'}`), React.createElement(Text, { wrap: 'truncate-end' }, `Root     ${store.runtime.runtimeRoot ?? '-'}`));
            const health = React.createElement(Box, { flexDirection: 'column', width: narrow ? '100%' : '50%', marginTop: narrow ? 1 : 0 }, React.createElement(Text, { bold: true }, 'Host'), React.createElement(Text, null, `CPU      ${metrics?.cpuBusyRatio === undefined ? '-' : `${(metrics.cpuBusyRatio * 100).toFixed(0)}%`}`), React.createElement(Text, null, `Memory   ${formatBytes(memoryUsed)} / ${formatBytes(metrics?.memTotalBytes)}`), React.createElement(Text, null, `Disk     ${formatBytes(diskUsed)} / ${formatBytes(metrics?.diskTotalBytes)}`), React.createElement(Text, null, `Load     ${metrics?.loadavg.map(value => value.toFixed(2)).join('  ') ?? '-'}`), React.createElement(Text, null, `Processes ${metrics?.processCount ?? '-'}`));
            body = React.createElement(Box, { flexDirection: narrow ? 'column' : 'row', marginTop: 1 }, identity, health);
        }
        else if (tab === 1) {
            body = React.createElement(Box, { flexDirection: 'column', marginTop: 1 }, React.createElement(Text, { bold: true }, 'Runtime checks'), React.createElement(Text, { color: snapshot.status === 'connected' ? 'success' : 'warning' }, `Connection  ${snapshot.status}`), React.createElement(Text, { color: store.runtime.runtimeRoot?.startsWith('/') ? 'success' : 'warning' }, `Runtime root ${store.runtime.runtimeRoot ?? 'unavailable'}`), ...snapshot.diagnostics.map(check => React.createElement(Text, { key: check.name, color: check.status === 'ok' ? 'success' : check.status === 'missing' || check.status === 'error' ? 'error' : 'subtle' }, `${check.name.padEnd(12)} ${check.status}${check.detail ? ` - ${check.detail}` : ''}`)));
        }
        else {
            body = React.createElement(Box, { flexDirection: 'column', marginTop: 1 }, React.createElement(Text, { bold: true }, 'Remote directories'), ...(paths.length === 0
                ? [React.createElement(Text, { key: 'empty', color: 'subtle' }, 'No configured directories')]
                : paths.map((path, index) => React.createElement(Text, { key: path, inverse: draft.length === 0 && workspaceIndex === index, wrap: 'truncate-end' }, `${draft.length === 0 && workspaceIndex === index ? '>' : ' '} ${path}`))), React.createElement(Box, { flexDirection: 'row', marginTop: 1 }, React.createElement(Text, { color: 'subtle' }, 'Path  '), React.createElement(Text, { color: draft.length > 0 ? 'text' : 'subtle', wrap: 'truncate-end' }, draft || '/remote/absolute/path')), workspaceError === undefined ? null : React.createElement(Text, { color: 'error', wrap: 'wrap' }, workspaceError));
        }
        return React.createElement(Box, { flexDirection: 'column', width: '100%', paddingX: 1 }, React.createElement(Box, { flexDirection: 'row', justifyContent: 'space-between' }, React.createElement(Text, { bold: true }, `dsh remote  LIVE  ${config.title}`), React.createElement(Text, { color: statusColor(snapshot.status), bold: true }, snapshot.busy ?? snapshot.status)), tabRow, actionRow, hostKeyPrompt, passwordPrompt, snapshot.error === undefined ? null : React.createElement(Text, { color: 'error', wrap: 'wrap' }, snapshot.error), body);
    };
}
export function createRemoteScene(store, workspaces, config) {
    return {
        id: 'dsh-remote',
        title: 'dsh remote',
        component: createRemoteSceneComponent(store, workspaces, config),
    };
}
