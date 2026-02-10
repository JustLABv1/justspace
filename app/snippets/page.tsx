'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { SnippetDetailModal } from '@/components/SnippetDetailModal';
import { SnippetModal } from '@/components/SnippetModal';
import { VersionHistoryModal } from '@/components/VersionHistoryModal';
import { useAuth } from '@/context/AuthContext';
import { client } from '@/lib/appwrite';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { db, DB_ID, SNIPPETS_ID } from '@/lib/db';
import { EncryptedData, ResourceVersion, Snippet } from '@/types';
import { Button, Chip, Spinner, Surface, toast } from "@heroui/react";
import {
    CodeFile,
    Pen2 as Edit,
    Maximize as Expand,
    Restart as History,
    AddCircle as Plus,
    Magnifer as Search,
    ShieldKeyhole as Shield,
    TrashBinTrash as Trash
} from "@solar-icons/react";
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
                            const access = await db.getAccessKey(snippet.$id, user.$id);
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
                            console.error('Failed to decrypt snippet:', snippet.$id, e);
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

        const unsubscribe = client.subscribe([
            `databases.${DB_ID}.collections.${SNIPPETS_ID}.documents`
        ], (response) => {
            if (response.events.some(e => e.includes('.delete'))) {
                const payload = response.payload as Snippet;
                setSnippets(prev => prev.filter(s => s.$id !== payload.$id));
                return;
            }
            fetchSnippets(false);
        });

        return () => unsubscribe();
    }, [user, fetchSnippets]);

    const handleCreateOrUpdate = async (data: Partial<Snippet>) => {
        try {
            if (selectedSnippet?.$id) {
                const updateData = { ...data };
                if (data.isEncrypted && privateKey && user) {
                    // Get existing key
                    const access = await db.getAccessKey(selectedSnippet.$id, user.$id);
                    if (access) {
                        const snippetKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                        if (data.title) updateData.title = JSON.stringify(await encryptData(data.title, snippetKey));
                        if (data.content) updateData.content = JSON.stringify(await encryptData(data.content, snippetKey));
                        if (data.blocks) updateData.blocks = JSON.stringify(await encryptData(data.blocks, snippetKey));
                        if (data.description) updateData.description = JSON.stringify(await encryptData(data.description, snippetKey));
                    }
                }
                await db.updateSnippet(selectedSnippet.$id, updateData);
                
                await db.createVersion({
                    resourceId: selectedSnippet.$id,
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
                    
                    const res = await db.createSnippet(createData as Omit<Snippet, '$id' | '$createdAt'>);
                    snippetId = res.$id;

                    const encryptedKey = await encryptDocumentKey(snippetKey, userKeys.publicKey);
                    await db.grantAccess({
                        resourceId: snippetId,
                        resourceType: 'snippet',
                        userId: user.$id,
                        encryptedKey
                    });
                } else {
                    const res = await db.createSnippet(createData as Omit<Snippet, '$id' | '$createdAt'>);
                    snippetId = res.$id;
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
                const access = await db.getAccessKey(selectedSnippet.$id, user.$id);
                if (access) {
                    const snippetKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    updateData.title = JSON.stringify(await encryptData(version.title || 'Restored Snippet', snippetKey));
                    updateData.content = JSON.stringify(await encryptData(updateData.content || '', snippetKey));
                    if (updateData.blocks) updateData.blocks = JSON.stringify(await encryptData(updateData.blocks, snippetKey));
                    updateData.isEncrypted = true;
                }
            }

            await db.updateSnippet(selectedSnippet.$id, updateData);
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
                await db.deleteSnippet(selectedSnippet.$id);
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
        <div className="max-w-[1400px] mx-auto p-6 md:p-12 space-y-12">
            <header className="flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="space-y-2 text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-2 text-accent font-bold tracking-widest text-[10px] opacity-80 uppercase">
                        <CodeFile size={16} weight="Bold" className="animate-pulse" />
                        Source Code
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground leading-tight">Snippet Library</h1>
                    <p className="text-sm text-muted-foreground font-medium opacity-60">Securely store and reuse your code snippets.</p>
                </div>
                <Button variant="primary" className="rounded-xl h-9 px-6 font-bold tracking-tight shadow-xl shadow-accent/10 text-xs" onPress={() => { setSelectedSnippet(undefined); setIsSnippetModalOpen(true); }}>
                    <Plus size={16} weight="Bold" className="mr-2" />
                    New Snippet
                </Button>
            </header>

            <Surface className="flex items-center gap-4 px-6 py-2 bg-surface border border-border/40 rounded-[2rem] shadow-sm max-w-2xl focus-within:border-accent/40 transition-all duration-500">
                <Search size={20} className="text-muted-foreground/40" />
                <input 
                    className="bg-transparent border-none outline-none flex-1 h-10 text-sm font-bold tracking-tight placeholder:text-muted-foreground/20" 
                    placeholder="Search by title, tags, or language..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </Surface>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredSnippets.map((snippet) => (
                    <Surface 
                        key={snippet.$id} 
                        className="p-0 rounded-[2.5rem] border border-border/40 bg-white/50 dark:bg-surface/50 backdrop-blur-sm group relative overflow-hidden flex flex-col transition-all duration-700 hover:border-accent/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-accent/5 cursor-pointer"
                        onClick={() => { setSelectedSnippet(snippet); setIsDetailModalOpen(true); }}
                    >
                        <div className="p-8 flex-1 space-y-6">
                            <div className="flex justify-between items-start">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-surface-secondary flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-colors duration-500 shadow-sm border border-border/20">
                                            <CodeFile size={20} weight="Bold" />
                                        </div>
                                        <Chip size="sm" variant="soft" color="accent" className="font-bold text-[9px] uppercase tracking-widest px-2.5 h-5 rounded-lg">
                                            {snippet.language}
                                        </Chip>
                                        {snippet.isEncrypted && <Shield size={14} className="text-accent/60" />}
                                    </div>
                                    <h3 className="text-xl font-bold tracking-tight leading-tight group-hover:text-accent transition-colors duration-500">{snippet.title}</h3>
                                </div>
                                <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    <Button variant="ghost" isIconOnly className="h-7 w-7 rounded-lg hover:bg-surface-secondary transition-all" onPress={() => { setSelectedSnippet(snippet); setIsSnippetModalOpen(true); }}>
                                        <Edit size={12} weight="Bold" />
                                    </Button>
                                    <Button variant="ghost" isIconOnly className="h-7 w-7 rounded-lg hover:bg-surface-secondary transition-all" onPress={() => { setSelectedSnippet(snippet); setIsHistoryModalOpen(true); }}>
                                        <History size={12} weight="Bold" />
                                    </Button>
                                    <Button variant="ghost" isIconOnly className="h-7 w-7 rounded-lg text-danger hover:bg-danger/10 transition-all" onPress={() => { setSelectedSnippet(snippet); setIsDeleteModalOpen(true); }}>
                                        <Trash size={12} weight="Bold" />
                                    </Button>
                                </div>
                            </div>

                            {snippet.description && (
                                <p className="text-xs text-muted-foreground leading-relaxed font-medium opacity-80 line-clamp-2 italic">
                                   &ldquo; {snippet.description} &rdquo;
                                </p>
                            )}

                            <div className="bg-surface/80 rounded-[1.5rem] p-5 font-mono text-[11px] border border-border/20 overflow-hidden relative group/code h-44 shadow-inner">
                                <div className="text-foreground/90 overflow-hidden line-clamp-6 whitespace-pre-wrap leading-relaxed">
                                    {snippet.blocks ? (
                                        <div className="space-y-4">
                                            {(() => {
                                                try {
                                                    const blocks = JSON.parse(snippet.blocks);
                                                    return blocks.map((b: { type: string; content: string; language?: string }, i: number) => (
                                                        <div key={i} className="space-y-1">
                                                            <div className="text-[8px] font-black uppercase tracking-[0.2em] text-accent/40 flex items-center gap-2">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-accent/20" />
                                                                {b.type} component {b.language && `| ${b.language}`}
                                                            </div>
                                                            <pre className="line-clamp-3 opacity-60 group-hover/code:opacity-100 transition-opacity">{b.content}</pre>
                                                        </div>
                                                    ));
                                                } catch {
                                                    return <pre className="opacity-60">{snippet.content}</pre>;
                                                }
                                            })()}
                                        </div>
                                    ) : (
                                        <pre className="opacity-60">{snippet.content}</pre>
                                    )}
                                </div>
                                <div className="absolute inset-0 bg-accent/5 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-all duration-700 flex flex-col items-center justify-center gap-3">
                                    <div className="bg-white/80 dark:bg-surface/80 p-3 rounded-2xl shadow-2xl border border-accent/20 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                                        <Expand size={24} className="text-accent" weight="Bold" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-accent animate-pulse">Deep Interaction</span>
                                </div>
                            </div>
                        </div>

                        <div className="px-10 py-6 bg-surface-secondary/20 border-t border-border/10 flex flex-wrap gap-3">
                            {snippet.tags?.map(tag => (
                                <span key={tag} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 hover:text-accent transition-colors cursor-default">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    </Surface>
                ))}

                {filteredSnippets.length === 0 && (
                    <div className="col-span-full py-32 flex flex-col items-center gap-6 text-muted-foreground/30">
                        <CodeFile size={60} weight="Linear" className="opacity-10" />
                        <p className="font-bold tracking-tight text-xl">No snippets found</p>
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
                resourceId={selectedSnippet?.$id || ''}
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
