'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { SnippetModal } from '@/components/SnippetModal';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { EncryptedData, Snippet } from '@/types';
import { Button, Chip, Spinner, Surface } from "@heroui/react";
import {
    CodeFile,
    Copy,
    Pen2 as Edit,
    AddCircle as Plus,
    Magnifier as Search,
    ShieldKeyhole as Shield,
    TrashBinTrash as Trash
} from "@solar-icons/react";
import { useEffect, useState } from 'react';

export default function SnippetsPage() {
    const { user, userKeys, privateKey } = useAuth();
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSnippetModalOpen, setIsSnippetModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedSnippet, setSelectedSnippet] = useState<Snippet | undefined>(undefined);

    useEffect(() => {
        if (user) {
            fetchSnippets();
        }
    }, [user]);

    const fetchSnippets = async () => {
        setIsLoading(true);
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
                                const descRaw = snippet.description ? (JSON.parse(snippet.description) as EncryptedData) : null;

                                return {
                                    ...snippet,
                                    title: await decryptData(titleRaw, snippetKey),
                                    content: await decryptData(contentRaw, snippetKey),
                                    description: descRaw ? await decryptData(descRaw, snippetKey) : snippet.description
                                };
                            }
                        } catch (e) {
                            console.error('Failed to decrypt snippet:', snippet.$id, e);
                            return { ...snippet, title: 'Encrypted Fragment', content: '// Access Denied' };
                        }
                    }
                    // If vault is locked or no access
                    return { 
                        ...snippet, 
                        title: "Encrypted Snippet", 
                        content: "// Unlock vault to view content",
                        description: "Synchronize vault to access fragment details."
                    };
                }
                return snippet;
            }));

            setSnippets(decryptedSnippets);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

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
                        if (data.description) updateData.description = JSON.stringify(await encryptData(data.description, snippetKey));
                    }
                }
                await db.updateSnippet(selectedSnippet.$id, updateData);
            } else {
                const createData = { ...data };
                let snippetId = '';
                
                if (data.isEncrypted && userKeys && user) {
                    const snippetKey = await generateDocumentKey();
                    if (data.title) createData.title = JSON.stringify(await encryptData(createData.title!, snippetKey));
                    if (data.content) createData.content = JSON.stringify(await encryptData(createData.content!, snippetKey));
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
                    await db.createSnippet(createData as Omit<Snippet, '$id' | '$createdAt'>);
                }
            }
            setIsSnippetModalOpen(false);
            fetchSnippets();
        } catch (error) {
            console.error('Failed to save snippet:', error);
        }
    };

    const handleDelete = async () => {
        if (selectedSnippet) {
            await db.deleteSnippet(selectedSnippet.$id);
            setIsDeleteModalOpen(false);
            fetchSnippets();
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // Could add a toast here
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
                    <div className="flex items-center justify-center md:justify-start gap-2 text-primary font-bold tracking-widest text-[10px] opacity-80 uppercase">
                        <CodeFile size={16} weight="Bold" className="animate-pulse" />
                        Code Repository
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground leading-tight">Snippet Library_</h1>
                    <p className="text-sm text-muted-foreground font-medium opacity-60">Reusable building blocks for high-velocity output.</p>
                </div>
                <Button variant="primary" className="rounded-xl h-12 px-8 font-bold shadow-xl shadow-primary/10 text-sm uppercase tracking-widest" onPress={() => { setSelectedSnippet(undefined); setIsSnippetModalOpen(true); }}>
                    <Plus size={18} weight="Bold" className="mr-2" />
                    New Snippet
                </Button>
            </header>

            <Surface className="flex items-center gap-4 px-6 py-2 bg-surface border border-border/40 rounded-[2rem] shadow-sm max-w-2xl focus-within:border-primary/40 transition-all duration-500">
                <Search size={20} className="text-muted-foreground/40" />
                <input 
                    className="bg-transparent border-none outline-none flex-1 h-10 text-sm font-bold tracking-tight placeholder:text-muted-foreground/20" 
                    placeholder="Search by title, tags, or engine..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </Surface>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredSnippets.map((snippet) => (
                    <Surface key={snippet.$id} className="p-0 rounded-[2.5rem] border border-border/40 bg-white/50 dark:bg-surface/50 backdrop-blur-sm group relative overflow-hidden flex flex-col transition-all duration-700 hover:border-primary/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/5">
                        <div className="p-8 flex-1 space-y-6">
                            <div className="flex justify-between items-start">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-surface-secondary flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-500 shadow-sm border border-border/20">
                                            <CodeFile size={20} weight="Bold" />
                                        </div>
                                        <Chip size="sm" variant="soft" color="accent" className="font-bold text-[9px] uppercase tracking-widest px-2.5 h-5 rounded-lg">
                                            {snippet.language}
                                        </Chip>
                                        {snippet.isEncrypted && <Shield size={14} className="text-primary/60" />}
                                    </div>
                                    <h3 className="text-xl font-bold tracking-tight leading-tight">{snippet.title}</h3>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="ghost" isIconOnly size="sm" className="rounded-lg h-8 w-8 hover:bg-surface-secondary transition-all" onPress={() => { setSelectedSnippet(snippet); setIsSnippetModalOpen(true); }}>
                                        <Edit size={16} weight="Bold" />
                                    </Button>
                                    <Button variant="ghost" isIconOnly size="sm" className="rounded-lg h-8 w-8 text-danger hover:bg-danger/10 transition-all" onPress={() => { setSelectedSnippet(snippet); setIsDeleteModalOpen(true); }}>
                                        <Trash size={16} weight="Bold" />
                                    </Button>
                                </div>
                            </div>

                            {snippet.description && (
                                <p className="text-xs text-muted-foreground leading-relaxed font-medium opacity-80 line-clamp-2">
                                   &quot; {snippet.description} &quot;
                                </p>
                            )}

                            <div className="bg-surface/80 rounded-[1.5rem] p-5 font-mono text-[11px] border border-border/20 overflow-hidden relative group/code h-40 shadow-inner">
                                <pre className="text-foreground/90 overflow-hidden line-clamp-6 whitespace-pre-wrap leading-relaxed">
                                    {snippet.content}
                                </pre>
                                <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px] opacity-0 group-hover/code:opacity-100 transition-all duration-500 flex items-center justify-center">
                                    <Button 
                                        variant="primary" 
                                        size="md" 
                                        className="rounded-xl font-bold px-6 h-10 shadow-xl shadow-primary/20 text-[10px] uppercase tracking-widest" 
                                        onPress={() => copyToClipboard(snippet.content)}
                                    >
                                        <Copy size={16} weight="Bold" className="mr-2" />
                                        Copy Block
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="px-10 py-6 bg-surface-secondary/20 border-t border-border/10 flex flex-wrap gap-3">
                            {snippet.tags?.map(tag => (
                                <span key={tag} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 hover:text-primary transition-colors cursor-default">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    </Surface>
                ))}

                {filteredSnippets.length === 0 && (
                    <div className="col-span-full py-32 flex flex-col items-center gap-6 text-muted-foreground/30">
                        <CodeFile size={60} weight="Linear" className="opacity-10" />
                        <p className="font-bold tracking-tight text-xl">No fragments match the query_</p>
                    </div>
                )}
            </div>

            <SnippetModal 
                isOpen={isSnippetModalOpen} 
                onClose={() => setIsSnippetModalOpen(false)} 
                onSubmit={handleCreateOrUpdate}
                snippet={selectedSnippet}
            />

            <DeleteModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDelete}
                title="Delete Snippet"
                message={`Are you sure you want to delete "${selectedSnippet?.title}"?`}
            />
        </div>
    );
}
