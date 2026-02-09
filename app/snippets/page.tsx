'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { SnippetModal } from '@/components/SnippetModal';
import { db } from '@/lib/db';
import { Snippet } from '@/types';
import { Button, Chip, Spinner, Surface } from "@heroui/react";
import {
  CodeFile,
  Copy,
  Pen2 as Edit,
  AddCircle as Plus,
  Magnifier as Search,
  TrashBinTrash as Trash
} from "@solar-icons/react";
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
                    <div className="flex items-center gap-2 text-primary font-bold tracking-widest uppercase text-[10px]">
                        <CodeFile size={16} weight="Bold" className="animate-pulse" />
                        Code Repository
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-foreground italic">Snippet Library</h1>
                    <p className="text-muted-foreground font-medium">Reusable building blocks for high-velocity output.</p>
                </div>
                <Button variant="primary" className="rounded-[1.5rem] h-14 px-10 font-black italic shadow-2xl shadow-primary/20" onPress={() => { setSelectedSnippet(undefined); setIsSnippetModalOpen(true); }}>
                    <Plus size={20} weight="Bold" className="mr-2" />
                    New Snippet
                </Button>
            </header>

            <Surface className="flex items-center gap-4 px-8 py-3 bg-surface border border-border/40 rounded-[2rem] shadow-sm max-w-2xl focus-within:border-primary/40 transition-all duration-500">
                <Search size={22} className="text-muted-foreground" />
                <input 
                    className="bg-transparent border-none outline-none flex-1 h-10 text-base font-bold placeholder:text-muted-foreground/30 placeholder:font-medium" 
                    placeholder="Search by title, tags, or engine..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </Surface>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredSnippets.map((snippet) => (
                    <Surface key={snippet.$id} className="p-0 rounded-[3rem] border border-border/40 bg-surface/50 backdrop-blur-sm group relative overflow-hidden flex flex-col transition-all duration-700 hover:border-primary/40 hover:-translate-y-2 hover:shadow-[0_40px_80px_-20px_rgba(var(--color-primary-rgb),0.15)]">
                        <div className="p-10 flex-1 space-y-8">
                            <div className="flex justify-between items-start">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-surface-secondary flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-500">
                                            <CodeFile size={20} weight="Bold" />
                                        </div>
                                        <Chip size="sm" variant="soft" color="accent" className="font-black text-[9px] uppercase tracking-widest px-3 h-6 rounded-lg">
                                            {snippet.language}
                                        </Chip>
                                    </div>
                                    <h3 className="text-2xl font-black tracking-tighter leading-tight italic">{snippet.title}</h3>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="ghost" isIconOnly size="sm" className="rounded-xl h-10 w-10 hover:bg-surface-secondary transition-all" onPress={() => { setSelectedSnippet(snippet); setIsSnippetModalOpen(true); }}>
                                        <Edit size={18} weight="Bold" />
                                    </Button>
                                    <Button variant="ghost" isIconOnly size="sm" className="rounded-xl h-10 w-10 text-danger hover:bg-danger/10 transition-all" onPress={() => { setSelectedSnippet(snippet); setIsDeleteModalOpen(true); }}>
                                        <Trash size={18} weight="Bold" />
                                    </Button>
                                </div>
                            </div>

                            {snippet.description && (
                                <p className="text-muted-foreground text-[13px] leading-relaxed font-medium italic opacity-80 line-clamp-2">
                                   &quot; {snippet.description} &quot;
                                </p>
                            )}

                            <div className="bg-surface/80 rounded-3xl p-6 font-mono text-[12px] border border-border/20 overflow-hidden relative group/code h-44 shadow-inner">
                                <pre className="text-foreground/90 overflow-hidden line-clamp-6 whitespace-pre-wrap leading-relaxed">
                                    {snippet.content}
                                </pre>
                                <div className="absolute inset-0 bg-primary/10 backdrop-blur-[2px] opacity-0 group-hover/code:opacity-100 transition-all duration-500 flex items-center justify-center">
                                    <Button 
                                        variant="primary" 
                                        size="md" 
                                        className="rounded-2xl font-black italic px-8 h-12 shadow-xl shadow-primary/20" 
                                        onPress={() => copyToClipboard(snippet.content)}
                                    >
                                        <Copy size={18} weight="Bold" className="mr-2" />
                                        Copy Block
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="px-10 py-6 bg-surface-secondary/20 border-t border-border/10 flex flex-wrap gap-3">
                            {snippet.tags?.map(tag => (
                                <span key={tag} className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 hover:text-primary transition-colors cursor-default">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    </Surface>
                ))}

                {filteredSnippets.length === 0 && (
                    <div className="col-span-full py-32 flex flex-col items-center gap-6 text-muted-foreground/50">
                        <CodeFile size={80} weight="Linear" className="opacity-10" />
                        <p className="font-bold italic tracking-tight text-xl">No fragments match the query.</p>
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
