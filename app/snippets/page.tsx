'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { SnippetModal } from '@/components/SnippetModal';
import { db } from '@/lib/db';
import { Snippet } from '@/types';
import { Button, Chip, Spinner, Surface } from "@heroui/react";
import { Code2, Copy, Edit, Plus, Search, Trash } from "lucide-react";
import { useEffect, useState } from 'react';

export default function SnippetsPage() {
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSnippetModalOpen, setIsSnippetModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedSnippet, setSelectedSnippet] = useState<Snippet | undefined>(undefined);

    useEffect(() => {
        fetchSnippets();
    }, []);

    const fetchSnippets = async () => {
        setIsLoading(true);
        try {
            const data = await db.listSnippets();
            setSnippets(data.documents);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateOrUpdate = async (data: Partial<Snippet>) => {
        if (selectedSnippet?.$id) {
            await db.updateSnippet(selectedSnippet.$id, data);
        } else {
            await db.createSnippet(data as Omit<Snippet, '$id' | '$createdAt'>);
        }
        setIsSnippetModalOpen(false);
        fetchSnippets();
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
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-primary font-bold tracking-widest uppercase text-xs">
                        <Code2 size={14} className="animate-pulse" />
                        Code Repository
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Snippet Library</h1>
                    <p className="text-muted-foreground font-medium">Reusable building blocks for efficient delivery.</p>
                </div>
                <Button variant="primary" className="rounded-2xl h-12 px-8 font-bold shadow-xl shadow-primary/10" onPress={() => { setSelectedSnippet(undefined); setIsSnippetModalOpen(true); }}>
                    <Plus size={18} className="mr-2" />
                    New Snippet
                </Button>
            </header>

            <Surface className="flex items-center gap-4 px-6 py-2 bg-surface border border-border/40 rounded-2xl shadow-sm max-w-xl">
                <Search size={18} className="text-muted-foreground" />
                <input 
                    className="bg-transparent border-none outline-none flex-1 h-10 text-sm font-medium" 
                    placeholder="Search snippets by title, tags, or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </Surface>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredSnippets.map((snippet) => (
                    <Surface key={snippet.$id} className="p-0 rounded-[2.5rem] border border-border/40 bg-surface group relative overflow-hidden flex flex-col transition-all duration-500 hover:border-primary/20 hover:shadow-2xl">
                        <div className="p-8 flex-1 space-y-6">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Chip size="sm" variant="soft" color="accent" className="font-black text-[8px] uppercase tracking-widest px-2 h-5">
                                            {snippet.language}
                                        </Chip>
                                    </div>
                                    <h3 className="text-lg font-black tracking-tight">{snippet.title}</h3>
                                </div>
                                <div className="flex gap-1">
                                    <Button variant="ghost" isIconOnly size="sm" className="rounded-full h-8 w-8" onPress={() => copyToClipboard(snippet.content)}>
                                        <Copy size={14} />
                                    </Button>
                                    <Button variant="ghost" isIconOnly size="sm" className="rounded-full h-8 w-8" onPress={() => { setSelectedSnippet(snippet); setIsSnippetModalOpen(true); }}>
                                        <Edit size={14} />
                                    </Button>
                                    <Button variant="ghost" isIconOnly size="sm" className="rounded-full h-8 w-8 text-danger" onPress={() => { setSelectedSnippet(snippet); setIsDeleteModalOpen(true); }}>
                                        <Trash size={14} />
                                    </Button>
                                </div>
                            </div>

                            {snippet.description && (
                                <p className="text-muted-foreground text-xs leading-relaxed italic line-clamp-2">
                                    &quot;{snippet.description}&quot;
                                </p>
                            )}

                            <div className="bg-surface-secondary/50 rounded-xl p-4 font-mono text-[11px] overflow-hidden relative group/code h-32">
                                <pre className="text-foreground/80 overflow-hidden line-clamp-5 whitespace-pre-wrap">
                                    {snippet.content}
                                </pre>
                                <div className="absolute inset-0 bg-gradient-to-t from-surface-secondary/80 to-transparent opacity-0 group-hover/code:opacity-100 transition-opacity flex items-center justify-center">
                                    <Button variant="secondary" size="sm" className="rounded-lg font-bold text-[10px]" onPress={() => copyToClipboard(snippet.content)}>
                                        Copy Code
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="px-8 py-4 bg-surface-secondary/30 border-t border-border/20 flex flex-wrap gap-2">
                            {snippet.tags?.map(tag => (
                                <span key={tag} className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/60">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    </Surface>
                ))}

                {filteredSnippets.length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center gap-4 text-muted-foreground italic">
                        <Code2 size={48} className="opacity-20" />
                        <p>No snippets found matching your search.</p>
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
