'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptBytes, encryptBytes, encryptData } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { wsClient, WSEvent } from '@/services/frontend/lib/ws';
import { Avatar, Chip, Tooltip } from '@heroui/react';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { useEffect, useRef, useState } from 'react';

type SyncState = 'connecting' | 'synced' | 'saving' | 'offline' | 'error';

interface CollaborativeDescriptionEditorProps {
    taskId: string;
    initialValue: string;
    isEncrypted: boolean;
    documentKey: CryptoKey | null;
    isEditable: boolean;
    compact?: boolean;
}

type EditorRuntime = {
    destroy: () => void;
};

const REMOTE_ORIGIN = Symbol('remote-collaboration-update');
const REMOTE_AWARENESS_ORIGIN = Symbol('remote-collaboration-awareness');
const COLOR_TOKENS = ['accent', 'success', 'warning', 'danger', 'default'] as const;

function bytesToBase64(bytes: Uint8Array): string {
    let value = '';
    const chunkSize = 8192;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        value += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(value);
}

function base64ToBytes(value: string): Uint8Array {
    const raw = atob(value);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
    return bytes;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

function colorForUser(userId: string) {
    let hash = 0;
    for (let index = 0; index < userId.length; index += 1) hash = (hash * 31 + userId.charCodeAt(index)) | 0;
    const token = COLOR_TOKENS[Math.abs(hash) % COLOR_TOKENS.length];
    const muted = token === 'default' ? 'var(--default)' : `var(--${token}-muted)`;
    return { token, color: `var(--${token})`, colorLight: muted };
}

export function CollaborativeDescriptionEditor({ taskId, initialValue, isEncrypted, documentKey, isEditable, compact = false }: CollaborativeDescriptionEditorProps) {
    const { user } = useAuth();
    const hostRef = useRef<HTMLDivElement | null>(null);
    const ydocRef = useRef<Y.Doc | null>(null);
    const awarenessRef = useRef<awarenessProtocol.Awareness | null>(null);
    const documentIdRef = useRef<string | null>(null);
    const editorRef = useRef<EditorRuntime | null>(null);
    const sendQueueRef = useRef(Promise.resolve());
    const needsRecoveryRef = useRef(false);
    const awarenessTimerRef = useRef<number | null>(null);
    const [syncState, setSyncState] = useState<SyncState>('connecting');
    const [collaborators, setCollaborators] = useState<Array<{ clientId: number; name: string; color: string }>>([]);

    useEffect(() => {
        if (isEncrypted && !documentKey) return;
        let cancelled = false;

        const decodeUpdate = async (payload: string, iv?: string): Promise<Uint8Array> => {
            const bytes = base64ToBytes(payload);
            if (!isEncrypted) return bytes;
            if (!documentKey || !iv) throw new Error('Encrypted collaboration update is unavailable');
            return new Uint8Array(await decryptBytes({ ciphertext: asArrayBuffer(bytes), iv }, documentKey));
        };

        const encodeUpdate = async (update: Uint8Array) => {
            if (!isEncrypted) return { payload: bytesToBase64(update) };
            if (!documentKey) throw new Error('Vault is locked');
            const encrypted = await encryptBytes(asArrayBuffer(update), documentKey);
            return { payload: bytesToBase64(encrypted.ciphertext), iv: encrypted.iv };
        };

        const materializeDescription = async (value: string) => {
            if (!isEncrypted) return value;
            if (!documentKey) throw new Error('Vault is locked');
            return JSON.stringify(await encryptData(value, documentKey));
        };

        const queueAwareness = () => {
            if (awarenessTimerRef.current) return;
            awarenessTimerRef.current = window.setTimeout(() => {
                awarenessTimerRef.current = null;
                const awareness = awarenessRef.current;
                const documentId = documentIdRef.current;
                if (!awareness || !documentId) return;
                const encoded = awarenessProtocol.encodeAwarenessUpdate(awareness, [awareness.clientID]);
                void db.broadcastCollaborationAwareness(documentId, { update: bytesToBase64(encoded) }).catch(() => setSyncState('offline'));
            }, 90);
        };

        const refreshCollaborators = () => {
            const awareness = awarenessRef.current;
            if (!awareness) return;
            const next = Array.from(awareness.getStates().entries())
                .filter(([clientId]) => clientId !== awareness.clientID)
                .map(([clientId, state]) => ({
                    clientId,
                    name: typeof state.user?.name === 'string' ? state.user.name : 'Collaborator',
                    color: typeof state.user?.color === 'string' ? state.user.color : 'var(--accent)',
                }));
            setCollaborators(next);
        };

        const start = async () => {
            setSyncState('connecting');
            let sync = await db.getTaskDescriptionCollaboration(taskId);
            if (cancelled) return;

            if (!sync.document) {
                const seed = new Y.Doc();
                seed.getText('description').insert(0, initialValue);
                const encoded = await encodeUpdate(Y.encodeStateAsUpdate(seed));
                const materializedDescription = await materializeDescription(initialValue);
                sync = await db.initializeTaskDescriptionCollaboration(taskId, {
                    ...encoded,
                    clientUpdateId: crypto.randomUUID(),
                    materializedDescription,
                    isEncrypted,
                });
                seed.destroy();
            }
            if (cancelled || !sync.document) return;

            documentIdRef.current = sync.document.id;
            const ydoc = new Y.Doc();
            const ytext = ydoc.getText('description');
            for (const update of sync.updates) {
                Y.applyUpdate(ydoc, await decodeUpdate(update.payload, update.iv), REMOTE_ORIGIN);
            }
            if (cancelled) {
                ydoc.destroy();
                return;
            }

            const awareness = new awarenessProtocol.Awareness(ydoc);
            const userColor = colorForUser(user?.id || 'anonymous');
            awareness.setLocalStateField('user', {
                id: user?.id || 'anonymous',
                name: user?.name || 'You',
                color: userColor.color,
                colorLight: userColor.colorLight,
            });
            awareness.on('update', (_change: unknown, origin: unknown) => {
                refreshCollaborators();
                if (origin !== REMOTE_AWARENESS_ORIGIN) queueAwareness();
            });
            ydoc.on('update', (update, origin) => {
                if (origin === REMOTE_ORIGIN || !documentIdRef.current || !isEditable) return;
                const documentId = documentIdRef.current;
                setSyncState('saving');
                sendQueueRef.current = sendQueueRef.current
                    .catch(() => undefined)
                    .then(async () => {
                        const encoded = await encodeUpdate(needsRecoveryRef.current ? Y.encodeStateAsUpdate(ydoc) : update);
                        const materializedDescription = await materializeDescription(ytext.toString());
                        await db.createCollaborationUpdate(documentId, {
                            ...encoded,
                            clientUpdateId: crypto.randomUUID(),
                            materializedDescription,
                        });
                        needsRecoveryRef.current = false;
                        if (!cancelled) setSyncState('synced');
                    })
                    .catch(() => {
                        needsRecoveryRef.current = true;
                        if (!cancelled) setSyncState('offline');
                    });
            });

            ydocRef.current = ydoc;
            awarenessRef.current = awareness;
            const [{ EditorView, basicSetup }, { EditorState }, { markdown }, { yCollab }] = await Promise.all([
                import('codemirror'),
                import('@codemirror/state'),
                import('@codemirror/lang-markdown'),
                import('y-codemirror.next'),
            ]);
            if (cancelled || !hostRef.current) return;
            const state = EditorState.create({
                doc: ytext.toString(),
                extensions: [
                    basicSetup,
                    markdown(),
                    yCollab(ytext, awareness, { undoManager: new Y.UndoManager(ytext) }),
                    EditorView.lineWrapping,
                    EditorView.editable.of(isEditable),
                    EditorView.theme({
                        '&': { minHeight: compact ? '4rem' : '10rem', backgroundColor: 'var(--field-background)', color: 'var(--field-foreground)', borderRadius: '0.5rem' },
                        '.cm-content': { fontFamily: 'var(--font-sans)', fontSize: compact ? '0.75rem' : '0.875rem', padding: compact ? '0.5rem' : '0.75rem', minHeight: compact ? '4rem' : '10rem' },
                        '.cm-scroller': { fontFamily: 'inherit' },
                        '&.cm-focused': { outline: '2px solid var(--focus)', outlineOffset: '2px' },
                        '.cm-gutters': { display: 'none' },
                        '.cm-activeLine': { backgroundColor: 'transparent' },
                    }),
                ],
            });
            const view = new EditorView({ state, parent: hostRef.current });
            editorRef.current = view;
            setSyncState('synced');
            queueAwareness();
        };

        void start().catch((error) => {
            console.error('Failed to start collaborative editor:', error);
            if (!cancelled) setSyncState('error');
        });

        const unsubscribe = wsClient.subscribe((event: WSEvent) => {
            const ydoc = ydocRef.current;
            const awareness = awarenessRef.current;
            const documentId = documentIdRef.current;
            if (!ydoc || !documentId) return;
            if (event.collection === 'collaboration_updates') {
                const payload = event.document as { document?: { id?: string }; update?: { payload?: string; iv?: string } };
                if (payload.document?.id !== documentId || !payload.update?.payload) return;
                void decodeUpdate(payload.update.payload, payload.update.iv)
                    .then((update) => Y.applyUpdate(ydoc, update, REMOTE_ORIGIN))
                    .catch((error) => console.error('Failed to apply collaborative update:', error));
            }
            if (event.collection === 'collaboration_awareness') {
                const payload = event.document as { documentId?: string; state?: { update?: string } };
                if (payload.documentId !== documentId || !payload.state?.update || !awareness) return;
                try {
                    awarenessProtocol.applyAwarenessUpdate(awareness, base64ToBytes(payload.state.update), REMOTE_AWARENESS_ORIGIN);
                } catch (error) {
                    console.error('Failed to apply collaboration awareness:', error);
                }
            }
        });

        return () => {
            cancelled = true;
            unsubscribe();
            if (awarenessTimerRef.current) window.clearTimeout(awarenessTimerRef.current);
            awarenessRef.current?.setLocalState(null);
            editorRef.current?.destroy();
            editorRef.current = null;
            awarenessRef.current?.destroy();
            awarenessRef.current = null;
            ydocRef.current?.destroy();
            ydocRef.current = null;
            documentIdRef.current = null;
        };
    }, [taskId, initialValue, isEncrypted, documentKey, isEditable, compact, user?.id, user?.name]);

    const label = syncState === 'synced' ? null : syncState === 'saving' ? 'Saving…' : syncState === 'connecting' ? 'Connecting…' : syncState === 'offline' ? 'Offline — next edit will retry' : 'Sync unavailable';
    const color = syncState === 'error' || syncState === 'offline' ? 'warning' : 'default';

    return (
        <div className="space-y-2">
            <div className="flex min-h-6 items-center justify-between gap-3">
                <div className="flex -space-x-2" aria-label="Active collaborators">
                    {collaborators.slice(0, 4).map((collaborator) => (
                        <Tooltip key={collaborator.clientId}>
                            <Tooltip.Trigger>
                                <Avatar size="sm" variant="soft" className="border border-surface">
                                    <Avatar.Fallback style={{ backgroundColor: collaborator.color }}>{collaborator.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                </Avatar>
                            </Tooltip.Trigger>
                            <Tooltip.Content>{collaborator.name} is editing<Tooltip.Arrow /></Tooltip.Content>
                        </Tooltip>
                    ))}
                </div>
                {label && <Chip size="sm" variant="soft" color={color}><Chip.Label>{label}</Chip.Label></Chip>}
            </div>
            <div ref={hostRef} aria-label="Task description" className="rounded-lg bg-field-background" />
        </div>
    );
}
