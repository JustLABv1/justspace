'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { SnippetDetailModal } from '@/components/SnippetDetailModal';
import { SnippetModal } from '@/components/SnippetModal';
import { VersionHistoryModal } from '@/components/VersionHistoryModal';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { wsClient, WSEvent } from '@/lib/ws';
import { EncryptedData, ResourceVersion, Snippet } from '@/types';
import { Button, Chip, Spinner, toast } from "@heroui/react";
import {
    Code,
    Edit,
    History,
    Lock,
    Plus,
    Search,
    Trash2
} from "lucide-react";
import { useCallback, useEffect, useState } from 'react';

export default function SnippetsPage() {
    const { user, userKeys, privateKey } = useAuth();
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSnippetModalOpen, setIsSnippetModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [selectedSnippet, setSelectedSnippet] = useState<Snippet | undefined>(undefined);

    const fetchSnippets = useCallback(async (isInitial = false) => {
        if (isInitial) setIsLoading(true);
        try {
            const data = await db.listSnippets();
            const allSnippets = data.documents;

            const decryptedSnippets = await Promise.all(allSnippets.map(async (snippet) => {
                if (snippet.isEncrypted) {
                    if (privateKey && user) {
                        try {
                            const access = await db.getAccessKey(snippet.id);
                            if (access) {
                                const snippetKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                const titleRaw = JSON.parse(snippet.title) as EncryptedData;
                                const contentRaw = JSON.parse(snippet.content) as EncryptedData;
                                const blocksRaw = snippet.blocks ? (JSON.parse(snippet.blocks) as EncryptedData) : null;
                                const descRaw = snippet.description ? (JSON.parse(snippet.description) as EncryptedData) : null;

                                return {
                                    ...snippet,
                                    title: await decryptData(titleRaw, snippetKey),
                                    content: await decryptData(contentRaw, snippetKey),
                                    blocks: blocksRaw ? await decryptData(blocksRaw, snippetKey) : snippet.blocks,
                                    description: descRaw ? await decryptData(descRaw, snippetKey) : snippet.description
                                };
                            }
                        } catch (e) {
                            console.error('Failed to decrypt snippet:', snippet.id, e);
                            return { ...snippet, title: 'Encrypted Snippet', content: '// Access Denied' };
                        }
                    }
                    // If vault is locked or no access
                    return { 
                        ...snippet, 
                        title: "Encrypted Snippet", 
                        content: "// Unlock vault to view content",
                        description: "Unlock vault to access snippet details."
                    };
                }
                return snippet;
            }));

            setSnippets(decryptedSnippets);
        } catch (error) {
            console.error(error);
        } finally {
            if (isInitial) setIsLoading(false);
        }
    }, [privateKey, user]);

    useEffect(() => {
        if (user) {
            fetchSnippets(true);
        }
    }, [user, fetchSnippets]);

    useEffect(() => {
        if (!user) return;

        const unsub = wsClient.subscribe((event: WSEvent) => {
            if (event.collection === 'snippets' || event.collection === 'access_control') {
                if (event.type === 'delete' && event.collection === 'snippets') {
                    const payload = event.document as unknown as Snippet;
                    setSnippets(prev => prev.filter(s => s.id !== payload.id));
                    return;
                }
                fetchSnippets(false);
            }
        });

        return () => unsub();
    }, [user, fetchSnippets]);

    const handleCreateOrUpdate = async (data: Partial<Snippet>) => {
        try {
            if (selectedSnippet?.id) {
                const updateData = { ...data };
                if (data.isEncrypted && privateKey && user) {
                    // Get existing key
                    const access = await db.getAccessKey(selectedSnippet.id);
                    if (access) {
                        const snippetKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                        if (data.title) updateData.title = JSON.stringify(await encryptData(data.title, snippetKey));
                        if (data.content) updateData.content = JSON.stringify(await encryptData(data.content, snippetKey));
                        if (data.blocks) updateData.blocks = JSON.stringify(await encryptData(data.blocks, snippetKey));
                        if (data.description) updateData.description = JSON.stringify(await encryptData(data.description, snippetKey));
                    }
                }
                await db.updateSnippet(selectedSnippet.id, updateData);
                
                await db.createVersion({
                    resourceId: selectedSnippet.id,
                    resourceType: 'Snippet',
                    content: updateData.blocks || updateData.content || '',
                    title: updateData.title,
                    isEncrypted: data.isEncrypted,
                    metadata: 'Updated'
                });
                toast.success('Snippet updated');
            } else {
                const createData = { ...data };
                let snippetId = '';
                
                if (data.isEncrypted && userKeys && user) {
                    const snippetKey = await generateDocumentKey();
                    if (data.title) createData.title = JSON.stringify(await encryptData(createData.title!, snippetKey));
                    if (data.content) createData.content = JSON.stringify(await encryptData(createData.content!, snippetKey));
                    if (data.blocks) createData.blocks = JSON.stringify(await encryptData(createData.blocks!, snippetKey));
                    if (data.description) createData.description = JSON.stringify(await encryptData(createData.description!, snippetKey));
                    
                    const res = await db.createSnippet(createData as Omit<Snippet, 'id' | 'createdAt'>);
                    snippetId = res.id;

                    const encryptedKey = await encryptDocumentKey(snippetKey, userKeys.publicKey);
                    await db.grantAccess({
                        resourceId: snippetId,
                        resourceType: 'Snippet',
                        userId: user.id,
                        encryptedKey
                    });
                } else {
                    const res = await db.createSnippet(createData as Omit<Snippet, 'id' | 'createdAt'>);
                    snippetId = res.id;
                }

                await db.createVersion({
                    resourceId: snippetId,
                    resourceType: 'Snippet',
                    content: createData.blocks || createData.content || '',
                    title: createData.title,
                    isEncrypted: data.isEncrypted,
                    metadata: 'Initial version'
                });
                toast.success('Snippet created');
            }
            setIsSnippetModalOpen(false);
            fetchSnippets();
        } catch (error) {
            console.error('Failed to save snippet:', error);
            toast.danger('Failed to save snippet');
        }
    };

    const handleRestore = async (version: ResourceVersion) => {
        if (!selectedSnippet) return;
        
        try {
            const updateData: Partial<Snippet> = {
                title: version.title || 'Restored Snippet',
                content: version.content, 
                isEncrypted: false
            };

            if (version.content.startsWith('[')) {
                updateData.blocks = version.content;
                try {
                    const b = JSON.parse(version.content);
                    updateData.content = b[0]?.content || '';
                } catch {}
            }

            if (selectedSnippet.isEncrypted && user && privateKey) {
                const access = await db.getAccessKey(selectedSnippet.id);
                if (access) {
                    const snippetKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    updateData.title = JSON.stringify(await encryptData(version.title || 'Restored Snippet', snippetKey));
                    updateData.content = JSON.stringify(await encryptData(updateData.content || '', snippetKey));
                    if (updateData.blocks) updateData.blocks = JSON.stringify(await encryptData(updateData.blocks, snippetKey));
                    updateData.isEncrypted = true;
                }
            }

            await db.updateSnippet(selectedSnippet.id, updateData);
            setIsHistoryModalOpen(false);
            fetchSnippets();
            toast.success('Version restored');
        } catch (error) {
            console.error(error);
            toast.danger('Restore failed');
        }
    };

    const handleDelete = async () => {
        if (selectedSnippet) {
            try {
                await db.deleteSnippet(selectedSnippet.id);
                setIsDeleteModalOpen(false);
                fetchSnippets();
                toast.success('Snippet deleted');
            } catch (error) {
                console.error(error);
                toast.danger('Delete failed');
            }
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.info('Copied to clipboard');
    };

    const filteredSnippets = snippets.filter(s => 
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
    }

    return (
        <div className="max-w-[1400px] mx-auto p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Snippets</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Store and reuse your code snippets.</p>
                </div>
                <Button variant="primary" className="rounded-lg h-8 px-3 text-xs font-medium" onPress={() => { setSelectedSnippet(undefined); setIsSnippetModalOpen(true); }}>
                    <Plus size={13} className="mr-1.5" />
                    New Snippet
                </Button>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-border px-3 h-9 bg-background max-w-sm focus-within:border-accent transition-colors">
                <Search size={13} className="text-muted-foreground shrink-0" />
                <input 
                    className="bg-transparent border-none outline-none flex-1 text-sm placeholder:text-muted-foreground" 
                    placeholder="Search snippets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSnippets.map((snippet) => (
                    <div
                        key={snippet.id}
                        className="rounded-xl border border-border bg-surface group relative flex flex-col hover:border-accent/40 transition-colors cursor-pointer"
                        onClick={() => { setSelectedSnippet(snippet); setIsDetailModalOpen(true); }}
                    >
                        <div className="p-4 flex-1 flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground shrink-0">
                                        <Code size={13} />
                                    </div>
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <h3 className="text-sm font-medium text-foreground truncate">{snippet.title}</h3>
                                        {snippet.isEncrypted && <Lock size={11} className="text-warning shrink-0" />}
                                    </div>
                                </div>
                                <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                                    <Button variant="ghost" isIconOnly className="h-6 w-6 rounded-md" onPress={() => { setSelectedSnippet(snippet); setIsSnippetModalOpen(true); }}>
                                        <Edit size={11} />
                                    </Button>
                                    <Button variant="ghost" isIconOnly className="h-6 w-6 rounded-md" onPress={() => { setSelectedSnippet(snippet); setIsHistoryModalOpen(true); }}>
                                        <History size={11} />
                                    </Button>
                                    <Button variant="ghost" isIconOnly className="h-6 w-6 rounded-md text-danger hover:bg-danger-muted" onPress={() => { setSelectedSnippet(snippet); setIsDeleteModalOpen(true); }}>
                                        <Trash2 size={11} />
                                    </Button>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Chip size="sm" variant="soft" color="accent">
                                    <Chip.Label className="text-[10px] font-medium">{snippet.language}</Chip.Label>
                                </Chip>
                            </div>

                            {snippet.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2">{snippet.description}</p>
                            )}

                            <div className="rounded-lg bg-surface-secondary border border-border overflow-hidden">
                                <div className="p-3 font-mono text-xs text-muted-foreground overflow-hidden">
                                    {snippet.blocks ? (
                                        (() => {
                                            try {
                                                const blocks = JSON.parse(snippet.blocks);
                                                return <pre className="line-clamp-5 whitespace-pre-wrap">{blocks[0]?.content || ''}</pre>;
                                            } catch {
                                                return <pre className="line-clamp-5 whitespace-pre-wrap">{snippet.content}</pre>;
                                            }
                                        })()
                                    ) : (
                                        <pre className="line-clamp-5 whitespace-pre-wrap">{snippet.content}</pre>
                                    )}
                                </div>
                            </div>
                        </div>

                        {snippet.tags && snippet.tags.length > 0 && (
                            <div className="px-4 py-2 border-t border-border flex flex-wrap gap-1.5">
                                {snippet.tags.map(tag => (
                                    <span key={tag} className="text-xs text-muted-foreground">#{tag}</span>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {filteredSnippets.length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center gap-3 text-muted-foreground">
                        <Code size={24} />
                        <p className="text-sm">No snippets found</p>
                    </div>
                )}
            </div>

            <SnippetModal 
                isOpen={isSnippetModalOpen} 
                onClose={() => setIsSnippetModalOpen(false)} 
                onSubmit={handleCreateOrUpdate}
                snippet={selectedSnippet}
            />

            <SnippetDetailModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                snippet={selectedSnippet}
            />

            <VersionHistoryModal 
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                resourceId={selectedSnippet?.id || ''}
                resourceType="Snippet"
                onRestore={handleRestore}
            />

            <DeleteModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDelete}
                title="Delete Snippet"
                message={`Are you sure you want to delete "${selectedSnippet?.title}"? This action cannot be undone.`}
            />
        </div>
    );
}
