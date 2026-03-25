'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { SnippetDetailModal } from '@/components/SnippetDetailModal';
import { SnippetModal } from '@/components/SnippetModal';
import { VersionHistoryModal } from '@/components/VersionHistoryModal';
import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { wsClient, WSEvent } from '@/services/frontend/lib/ws';
import { EncryptedData, ResourceVersion, Snippet } from '@/services/frontend/types';
import { Button, Chip, Dropdown, Label, Spinner, toast } from "@heroui/react";
import {
    Code,
    Edit,
    Eye,
    Folder,
    FolderOpen,
    History,
    Lock,
    MoreHorizontal,
    Plus,
    Search,
    Tag,
    Trash2
} from "lucide-react";
import { useCallback, useEffect, useState } from 'react';

export default function SnippetsPage() {
    const { user, userKeys, privateKey } = useAuth();
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCollection, setActiveCollection] = useState<string | null>(null);
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

    // Derive collections from tags (use all unique tags as collection names)
    const allTags = Array.from(new Set(snippets.flatMap(s => s.tags || []))).sort();

    const filteredSnippets = snippets.filter(s => {
        const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesCollection = activeCollection === null || (s.tags || []).includes(activeCollection);
        return matchesSearch && matchesCollection;
    });

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
    }

    return (
        <div className="w-full px-6 py-8 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-0.5">
                    <h1 className="text-lg font-semibold text-foreground">Snippets</h1>
                    <p className="text-[13px] text-muted-foreground">Store and reuse your code snippets.</p>
                </div>
                <Button variant="primary" className="rounded-xl h-8 px-3.5 text-[13px] font-medium shadow-sm" onPress={() => { setSelectedSnippet(undefined); setIsSnippetModalOpen(true); }}>
                    <Plus size={13} className="mr-1" />
                    New snippet
                </Button>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-border px-3 h-9 bg-background max-w-sm focus-within:border-accent transition-colors">
                <Search size={13} className="text-muted-foreground shrink-0" />
                <input
                    className="bg-transparent border-none outline-none flex-1 text-sm placeholder:text-muted-foreground"
                    placeholder="Search snippets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <div className="flex gap-6">
                {/* Collections sidebar */}
                {allTags.length > 0 && (
                    <aside className="hidden lg:flex flex-col gap-0.5 w-44 shrink-0">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-2 mb-1 flex items-center gap-1.5">
                            <Tag size={10} /> Collections
                        </p>
                        <button
                            onClick={() => setActiveCollection(null)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-xl text-[13px] transition-colors text-left ${
                                activeCollection === null
                                    ? 'bg-surface-secondary text-foreground font-medium'
                                    : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                            }`}
                        >
                            <FolderOpen size={13} className="shrink-0" />
                            <span>All snippets</span>
                            <span className="ml-auto text-[11px] text-muted-foreground">{snippets.length}</span>
                        </button>
                        {allTags.map(tag => {
                            const count = snippets.filter(s => (s.tags || []).includes(tag)).length;
                            return (
                                <button
                                    key={tag}
                                    onClick={() => setActiveCollection(activeCollection === tag ? null : tag)}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded-xl text-[13px] transition-colors text-left ${
                                        activeCollection === tag
                                            ? 'bg-surface-secondary text-foreground font-medium'
                                            : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                                    }`}
                                >
                                    <Folder size={13} className="shrink-0" />
                                    <span className="truncate flex-1">{tag}</span>
                                    <span className="ml-auto text-[11px] text-muted-foreground">{count}</span>
                                </button>
                            );
                        })}
                    </aside>
                )}

                {/* Snippets grid */}
                <div className="flex-1 min-w-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSnippets.map((snippet) => (
                    <div
                        key={snippet.id}
                        className="rounded-2xl border border-border bg-surface group flex flex-col overflow-hidden hover:shadow-sm transition-all"
                    >
                        {/* Clickable content area */}
                        <div
                            className="p-4 flex-1 flex flex-col gap-3 cursor-pointer"
                            onClick={() => { setSelectedSnippet(snippet); setIsDetailModalOpen(true); }}
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-xl bg-warning-muted flex items-center justify-center text-warning shrink-0">
                                    <Code size={15} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <h3 className="text-[13px] font-semibold text-foreground truncate leading-snug flex-1">{snippet.title}</h3>
                                        {snippet.isEncrypted && <Lock size={11} className="text-warning shrink-0" />}
                                    </div>
                                    {snippet.description && (
                                        <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{snippet.description}</p>
                                    )}
                                </div>
                                <Chip size="sm" variant="soft" color="accent" className="shrink-0">
                                    <Chip.Label className="text-[10px] font-mono px-0.5">{snippet.language}</Chip.Label>
                                </Chip>
                            </div>

                            <div className="rounded-xl bg-surface-secondary border border-border/60 overflow-hidden">
                                <div className="p-3 font-mono text-[11px] text-muted-foreground overflow-hidden">
                                    {snippet.blocks ? (
                                        (() => {
                                            try {
                                                const blocks = JSON.parse(snippet.blocks);
                                                return <pre className="line-clamp-4 whitespace-pre-wrap">{blocks[0]?.content || ''}</pre>;
                                            } catch {
                                                return <pre className="line-clamp-4 whitespace-pre-wrap">{snippet.content}</pre>;
                                            }
                                        })()
                                    ) : (
                                        <pre className="line-clamp-4 whitespace-pre-wrap">{snippet.content}</pre>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer - separate from clickable area */}
                        <div className="px-4 py-2.5 border-t border-border/60 flex items-center justify-between">
                            <div className="flex flex-wrap gap-1.5 min-w-0 flex-1">
                                {snippet.tags && snippet.tags.length > 0 ? (
                                    snippet.tags.slice(0, 3).map(tag => (
                                        <span key={tag} className="text-[11px] text-muted-foreground">#{tag}</span>
                                    ))
                                ) : (
                                    <span className="text-[11px] text-muted-foreground/50">No tags</span>
                                )}
                            </div>
                            <Dropdown>
                                <Button
                                    variant="ghost"
                                    isIconOnly
                                    className="h-6 w-6 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                    aria-label="Snippet actions"
                                >
                                    <MoreHorizontal size={13} />
                                </Button>
                                <Dropdown.Popover>
                                    <Dropdown.Menu
                                        onAction={(key) => {
                                            if (key === 'view') { setSelectedSnippet(snippet); setIsDetailModalOpen(true); }
                                            if (key === 'edit') { setSelectedSnippet(snippet); setIsSnippetModalOpen(true); }
                                            if (key === 'history') { setSelectedSnippet(snippet); setIsHistoryModalOpen(true); }
                                            if (key === 'delete') { setSelectedSnippet(snippet); setIsDeleteModalOpen(true); }
                                        }}
                                    >
                                        <Dropdown.Item id="view" textValue="View">
                                            <Eye size={13} />
                                            <Label>View</Label>
                                        </Dropdown.Item>
                                        <Dropdown.Item id="edit" textValue="Edit">
                                            <Edit size={13} />
                                            <Label>Edit</Label>
                                        </Dropdown.Item>
                                        <Dropdown.Item id="history" textValue="History">
                                            <History size={13} />
                                            <Label>History</Label>
                                        </Dropdown.Item>
                                        <Dropdown.Item id="delete" textValue="Delete" variant="danger">
                                            <Trash2 size={13} className="text-danger" />
                                            <Label>Delete</Label>
                                        </Dropdown.Item>
                                    </Dropdown.Menu>
                                </Dropdown.Popover>
                            </Dropdown>
                        </div>
                    </div>
                ))}

                {filteredSnippets.length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center gap-3 text-muted-foreground">
                        <Code size={24} />
                        <p className="text-sm">No snippets found</p>
                    </div>
                )}
            </div>
                </div>
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
