'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { WikiModal } from '@/components/WikiModal';
import { db } from '@/lib/db';
import { WikiGuide } from '@/types';
import { Button, Chip, SearchField, Spinner, Surface } from "@heroui/react";
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
        <div className="max-w-7xl mx-auto p-6 md:p-10 space-y-12">
            {/* Hero Section */}
            <section className="relative py-12 px-8 overflow-hidden rounded-[3rem] bg-foreground text-background">
                <div className="relative z-10 max-w-2xl space-y-6">
                    <Chip variant="soft" size="sm" className="bg-white/10 text-white border-white/20">Knowledge Base</Chip>
                    <h1 className="text-5xl font-black tracking-tighter leading-tight">
                        Standardize your <span className="text-primary">deployments.</span>
                    </h1>
                    <p className="text-lg text-white/60 leading-relaxed">
                        Access and contribute to our collection of high-quality deployment guides and infrastructure patterns.
                    </p>
                    <div className="flex gap-4">
                        <Button variant="primary" className="rounded-full px-8 h-12 font-bold" onPress={() => { setSelectedGuide(undefined); setIsWikiModalOpen(true); }}>
                            <Plus size={18} className="mr-2" />
                            Create Guide
                        </Button>
                    </div>
                </div>
                
                {/* Background patterns */}
                <div className="absolute top-0 right-0 h-full w-1/3 opacity-20 pointer-events-none">
                    <div className="absolute -top-10 -right-10 w-64 h-64 bg-primary blur-[100px] rounded-full" />
                    <div className="absolute top-1/2 left-0 w-32 h-32 bg-accent blur-[100px] rounded-full" />
                </div>
                <Book className="absolute -right-8 -bottom-8 w-64 h-64 text-white/5 -rotate-12" />
            </section>

            {/* Search and Controls */}
            <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
                <div className="w-full md:max-w-xl">
                    <SearchField 
                        variant="secondary"
                        className="w-full"
                        value={searchTerm}
                        onChange={setSearchTerm}
                        aria-label="Search guides"
                    >
                        <SearchField.Group className="rounded-2xl border-border/50 h-14 px-5">
                            <Search size={20} className="text-muted-foreground mr-3" />
                            <SearchField.Input placeholder="Search within documentation..." className="text-lg" />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                </div>
                <div className="flex bg-surface-lowest border border-border p-1 rounded-2xl">
                    <Chip variant="soft" color="accent" className="px-4 py-2 font-bold">{filteredGuides.length} Guides Found</Chip>
                </div>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredGuides.length === 0 ? (
                    <div className="col-span-full py-20 text-center space-y-4">
                        <div className="w-16 h-16 bg-surface-secondary rounded-full flex items-center justify-center mx-auto text-muted-foreground">
                            <Search size={24} />
                        </div>
                        <h3 className="text-xl font-bold">No results found</h3>
                        <p className="text-muted-foreground">Try adjusting your search or create a new guide.</p>
                    </div>
                ) : (
                    filteredGuides.map((guide) => (
                        <Surface 
                            key={guide.$id} 
                            variant="secondary"
                            className="p-8 rounded-[2.5rem] border border-border/50 bg-gradient-to-br from-surface to-surface-lowest group transition-all hover:translate-y-[-6px] hover:shadow-2xl hover:shadow-black/5"
                        >
                            <div className="flex flex-col h-full space-y-6">
                                <div className="space-y-3 flex-1">
                                    <h3 className="text-2xl font-black tracking-tight group-hover:text-primary transition-colors">{guide.title}</h3>
                                    <p className="text-muted-foreground leading-relaxed line-clamp-3">
                                        {guide.description}
                                    </p>
                                </div>
                                
                                <div className="pt-6 border-t border-border/30 flex items-center justify-between">
                                    <Link href={`/wiki/${guide.$id}`}>
                                        <Button variant="ghost" className="rounded-xl group/btn font-bold px-0 hover:bg-transparent">
                                            Read Guide
                                            <ExternalLink size={16} className="ml-2 group-hover/btn:translate-x-1 transition-transform" />
                                        </Button>
                                    </Link>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button 
                                            variant="ghost" 
                                            isIconOnly 
                                            size="sm"
                                            className="rounded-full h-8 w-8 hover:bg-primary/10 hover:text-primary"
                                            onPress={() => { setSelectedGuide(guide); setIsWikiModalOpen(true); }}
                                        >
                                            <Edit size={16} />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            isIconOnly 
                                            size="sm"
                                            className="rounded-full h-8 w-8 hover:bg-danger/10 hover:text-danger"
                                            onPress={() => { setSelectedGuide(guide); setIsDeleteModalOpen(true); }}
                                        >
                                            <Trash size={16} />
                                        </Button>
                                    </div>
                                </div>
                            </div>
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
