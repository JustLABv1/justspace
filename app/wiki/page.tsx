'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { WikiModal } from '@/components/WikiModal';
import { db } from '@/lib/db';
import { WikiGuide } from '@/types';
import { Button, SearchField, Spinner, Surface } from "@heroui/react";
import { Book, Edit, ExternalLink, Plus, Search, Trash } from "lucide-react";
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function WikiPage() {
    const [guides, setGuides] = useState<WikiGuide[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isWikiModalOpen, setIsWikiModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedGuide, setSelectedGuide] = useState<WikiGuide | undefined>(undefined);

    useEffect(() => {
        fetchGuides();
    }, []);

    const fetchGuides = async () => {
        setIsLoading(true);
        try {
            const data = await db.listGuides();
            setGuides(data.documents);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateOrUpdate = async (data: Partial<WikiGuide>) => {
        if (selectedGuide?.$id) {
            await db.updateGuide(selectedGuide.$id, data);
        } else {
            await db.createGuide(data as Omit<WikiGuide, '$id' | '$createdAt'>);
        }
        setIsWikiModalOpen(false);
        fetchGuides();
    };

    const handleDelete = async () => {
        if (selectedGuide) {
            await db.deleteGuide(selectedGuide.$id);
            setIsDeleteModalOpen(false);
            fetchGuides();
        }
    };

    const filteredGuides = guides.filter(guide => 
        guide.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        guide.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
    }

    return (
        <div className="max-w-[1400px] mx-auto p-6 md:p-12 space-y-12">
            {/* Refined Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-primary font-bold tracking-widest uppercase text-xs">
                        <Book size={14} className="animate-pulse" />
                        Knowledge Base
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Standardized Documentation</h1>
                    <p className="text-muted-foreground font-medium">Access high-quality deployment guides and infrastructure patterns.</p>
                </div>
                <div className="flex gap-3 bg-surface-lowest border border-border p-1.5 rounded-2xl shadow-sm self-stretch md:self-auto">
                    <Button variant="primary" className="rounded-xl h-12 px-8 font-bold shadow-xl shadow-primary/10" onPress={() => { setSelectedGuide(undefined); setIsWikiModalOpen(true); }}>
                        <Plus size={18} className="mr-2" />
                        Create Guide
                    </Button>
                </div>
            </header>

            {/* Bento-style Search & Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                <div className="lg:col-span-8">
                    <SearchField 
                        variant="secondary"
                        className="w-full"
                        value={searchTerm}
                        onChange={setSearchTerm}
                        aria-label="Search guides"
                    >
                        <SearchField.Group className="rounded-3xl border-border/40 bg-surface-lowest h-16 px-6 shadow-sm focus-within:border-primary/50 transition-all">
                            <Search size={22} className="text-muted-foreground mr-3" />
                            <SearchField.Input placeholder="Search documentation engine..." className="text-lg font-medium" />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                </div>
                <div className="lg:col-span-4 flex justify-end">
                    <Surface className="px-6 py-4 rounded-3xl border border-border/40 bg-surface-lowest flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-accent/5 flex items-center justify-center text-accent">
                            <Book size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Index</p>
                            <p className="font-bold">{filteredGuides.length} Guides Available</p>
                        </div>
                    </Surface>
                </div>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredGuides.length === 0 ? (
                    <Surface variant="tertiary" className="col-span-full py-24 rounded-[3rem] border border-dashed border-border flex flex-col items-center space-y-6">
                        <div className="w-20 h-20 bg-surface-secondary rounded-[2rem] flex items-center justify-center text-muted-foreground">
                            <Search size={40} />
                        </div>
                        <div className="space-y-2 text-center">
                            <h3 className="text-2xl font-black">No matching entries</h3>
                            <p className="text-muted-foreground max-w-xs">Refine your search parameters or start fresh by creating a new guide.</p>
                        </div>
                        <Button variant="primary" className="rounded-xl font-bold px-8" onPress={() => { setSearchTerm(''); }}>Reset Search</Button>
                    </Surface>
                ) : (
                    filteredGuides.map((guide) => (
                        <Surface 
                            key={guide.$id} 
                            className="p-8 rounded-[2.5rem] border border-border/40 bg-surface-lowest group relative overflow-hidden transition-all duration-500 hover:border-primary/20 hover:shadow-2xl hover:shadow-primary/5"
                        >
                            <div className="relative z-10 flex flex-col h-full space-y-8">
                                <div className="space-y-4 flex-1">
                                    <div className="flex justify-between items-start">
                                        <div className="w-12 h-12 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500">
                                            <Book size={24} />
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                                            <Button 
                                                variant="ghost" 
                                                isIconOnly 
                                                className="rounded-xl h-9 w-9 hover:bg-primary/10 hover:text-primary"
                                                onPress={() => { setSelectedGuide(guide); setIsWikiModalOpen(true); }}
                                            >
                                                <Edit size={16} />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                isIconOnly 
                                                className="rounded-xl h-9 w-9 hover:bg-danger/10 hover:text-danger"
                                                onPress={() => { setSelectedGuide(guide); setIsDeleteModalOpen(true); }}
                                            >
                                                <Trash size={16} />
                                            </Button>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black tracking-tight group-hover:text-primary transition-colors leading-tight">{guide.title}</h3>
                                        <p className="mt-3 text-muted-foreground leading-relaxed line-clamp-3 font-medium opacity-80">
                                            {guide.description}
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="pt-6 border-t border-border/30">
                                    <Link href={`/wiki/${guide.$id}`}>
                                        <Button variant="secondary" className="w-full rounded-2xl font-bold italic h-12 border-border/40 group-hover:bg-primary group-hover:text-white transition-all">
                                            Read Full Guide
                                            <ExternalLink size={16} className="ml-2" />
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                            <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-primary/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Surface>
                    ))
                )}
            </div>

            <WikiModal 
                isOpen={isWikiModalOpen}
                onClose={() => setIsWikiModalOpen(false)}
                onSubmit={handleCreateOrUpdate}
                guide={selectedGuide}
            />

            <DeleteModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDelete}
                title="Delete Wiki Guide"
                message={`Are you sure you want to delete "${selectedGuide?.title}"? All associated installation targets will also be removed.`}
            />
        </div>
    );
}
