'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { WikiModal } from '@/components/WikiModal';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { WikiGuide } from '@/types';
import { Button, SearchField, Spinner, Surface } from "@heroui/react";
import {
    Book,
    Pen2 as Edit,
    ArrowRightUp as ExternalLink,
    AddCircle as Plus,
    Magnifer as Search,
    ShieldKeyhole as Shield,
    TrashBinTrash as Trash
} from "@solar-icons/react";
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

export default function WikiPage() {
    const [guides, setGuides] = useState<WikiGuide[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isWikiModalOpen, setIsWikiModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedGuide, setSelectedGuide] = useState<WikiGuide | undefined>(undefined);
    const { user, privateKey } = useAuth();

    const fetchGuides = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await db.listGuides();
            const rawGuides = data.documents;

            // Decrypt encrypted guides if private key is available
            const processedGuides = await Promise.all(rawGuides.map(async (guide) => {
                if (guide.isEncrypted) {
                    if (privateKey && user) {
                        try {
                            const access = await db.getAccessKey(guide.$id, user.$id);
                            if (access) {
                                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                
                                const titleData = JSON.parse(guide.title);
                                const descData = JSON.parse(guide.description);
                                
                                const decryptedTitle = await decryptData(titleData, docKey);
                                const decryptedDesc = await decryptData(descData, docKey);
                                
                                return { ...guide, title: decryptedTitle, description: decryptedDesc };
                            }
                        } catch (e) {
                            console.error('Failed to decrypt guide:', guide.$id, e);
                            return { ...guide, title: 'Decryption Error', description: 'Missing access keys.' };
                        }
                    }
                    return { 
                        ...guide, 
                        title: 'Encrypted Guide', 
                        description: 'Synchronize vault to access guide details.' 
                    };
                }
                return guide;
            }));

            setGuides(processedGuides);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [privateKey, user]);

    useEffect(() => {
        fetchGuides();
    }, [fetchGuides]);

    const handleCreateOrUpdate = async (data: Partial<WikiGuide> & { shouldEncrypt?: boolean }) => {
        const { shouldEncrypt, ...guideData } = data;
        const finalData = { ...guideData };

        if (shouldEncrypt && user) {
            const userKeys = await db.getUserKeys(user.$id);
            if (!userKeys) throw new Error('Vault keys not found');

            const docKey = await generateDocumentKey();
            const encryptedTitle = await encryptData(guideData.title || '', docKey);
            const encryptedDesc = await encryptData(guideData.description || '', docKey);

            finalData.title = JSON.stringify(encryptedTitle);
            finalData.description = JSON.stringify(encryptedDesc);
            finalData.isEncrypted = true;

            const encryptedDocKey = await encryptDocumentKey(docKey, userKeys.publicKey);

            if (selectedGuide?.$id) {
                await db.updateGuide(selectedGuide.$id, finalData);
                // Also update/add access control if not exists
                const existingAccess = await db.getAccessKey(selectedGuide.$id, user.$id);
                if (!existingAccess) {
                    await db.grantAccess({
                        resourceId: selectedGuide.$id,
                        userId: user.$id,
                        encryptedKey: encryptedDocKey,
                        resourceType: 'Wiki'
                    });
                }
            } else {
                const newGuide = await db.createGuide(finalData as Omit<WikiGuide, '$id' | '$createdAt'>);
                await db.grantAccess({
                    resourceId: newGuide.$id,
                    userId: user.$id,
                    encryptedKey: encryptedDocKey,
                    resourceType: 'Wiki'
                });
            }
        } else {
            if (selectedGuide?.$id) {
                await db.updateGuide(selectedGuide.$id, finalData);
            } else {
                await db.createGuide(finalData as Omit<WikiGuide, '$id' | '$createdAt'>);
            }
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
        <div className="max-w-[1200px] mx-auto p-6 md:p-8 space-y-12">
            {/* Refined Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-primary font-black tracking-[0.2em] text-xs uppercase opacity-80">
                        <Book size={14} weight="Bold" className="animate-pulse" />
                        Knowledge Base
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter text-foreground leading-none">Wiki documentation_</h1>
                    <p className="text-muted-foreground font-medium opacity-70 text-sm">Standardized procedures, deployment guides, and implementation standards.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="primary" className="rounded-xl h-12 px-6 font-bold shadow-xl shadow-primary/10" onPress={() => { setSelectedGuide(undefined); setIsWikiModalOpen(true); }}>
                        <Plus size={18} weight="Bold" className="mr-2" />
                        New Guide
                    </Button>
                </div>
            </header>

            {/* Bento-style Search & Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-8">
                    <SearchField 
                        variant="secondary"
                        className="w-full"
                        value={searchTerm}
                        onChange={setSearchTerm}
                        aria-label="Search guides"
                    >
                        <SearchField.Group className="rounded-3xl border-border/40 bg-surface h-16 px-6 shadow-sm focus-within:border-primary/50 transition-all border">
                            <Search size={22} weight="Linear" className="text-muted-foreground/40 mr-4" />
                            <SearchField.Input placeholder="Search knowledge base..." className="text-lg font-black tracking-tighter placeholder:text-muted-foreground/20 uppercase" />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                </div>
                <div className="lg:col-span-4 flex justify-end">
                    <Surface className="px-6 py-4 rounded-2xl border border-border/40 bg-surface flex items-center gap-5 shadow-sm">
                        <div className="w-10 h-10 rounded-xl bg-accent/5 flex items-center justify-center text-accent border border-accent/10">
                            <Book size={20} weight="Linear" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground opacity-40">Guide Index</p>
                            <p className="font-extrabold text-base tracking-tighter uppercase">{filteredGuides.length} Guides Found</p>
                        </div>
                    </Surface>
                </div>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                {filteredGuides.length === 0 ? (
                    <Surface variant="tertiary" className="col-span-full py-32 rounded-[2rem] border border-dashed border-border flex flex-col items-center space-y-8 bg-surface/30">
                        <div className="w-24 h-24 bg-surface-secondary rounded-[2.5rem] flex items-center justify-center text-muted-foreground/20 border border-border/40">
                            <Search size={48} weight="Linear" />
                        </div>
                        <div className="space-y-3 text-center">
                            <h3 className="text-3xl font-black tracking-tighter uppercase">No matching guides</h3>
                            <p className="text-muted-foreground max-w-sm font-medium opacity-60">Your query did not intersect with any documentation in the current index.</p>
                        </div>
                        <Button variant="secondary" className="rounded-2xl font-black uppercase px-10 h-14 border-border/40" onPress={() => { setSearchTerm(''); }}>Reset Filter</Button>
                    </Surface>
                ) : (
                    filteredGuides.map((guide) => (
                        <Surface 
                            key={guide.$id} 
                            className="p-8 rounded-[2rem] border border-border/40 bg-surface group relative overflow-hidden transition-all duration-500 hover:border-primary/30 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.15)] flex flex-col justify-between min-h-[320px]"
                        >
                            <div className="relative z-10 space-y-8">
                                <div className="flex justify-between items-start">
                                    <div className="w-16 h-16 rounded-[1.5rem] bg-primary/5 border border-primary/10 flex items-center justify-center text-primary group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-500 shadow-sm">
                                        <Book size={32} weight="Linear" />
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-2 group-hover:translate-y-0">
                                        <Button 
                                            variant="secondary" 
                                            isIconOnly 
                                            className="rounded-2xl h-11 w-11 border-border/40 hover:bg-primary/10 hover:text-primary transition-all"
                                            onPress={() => { setSelectedGuide(guide); setIsWikiModalOpen(true); }}
                                        >
                                            <Edit size={18} weight="Bold" />
                                        </Button>
                                        <Button 
                                            variant="secondary" 
                                            isIconOnly 
                                            className="rounded-2xl h-11 w-11 border-border/40 hover:bg-danger/10 hover:text-danger transition-all"
                                            onPress={() => { setSelectedGuide(guide); setIsDeleteModalOpen(true); }}
                                        >
                                            <Trash size={18} weight="Bold" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-2xl font-black tracking-tight leading-[1.1] transition-colors uppercase">{guide.title}</h3>
                                        {guide.isEncrypted && (
                                            <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 border border-orange-500/20" title="End-to-End Encrypted">
                                                <Shield size={16} weight="Bold" />
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-muted-foreground leading-relaxed line-clamp-3 font-medium opacity-60 text-sm">
                                        {guide.description}
                                    </p>
                                </div>
                            </div>
                            
                            <div className="pt-8 relative z-10">
                                <Link href={`/wiki/${guide.$id}`}>
                                    <Button variant="secondary" className="w-full rounded-[1.5rem] font-black h-14 border-border/40 group-hover:bg-foreground group-hover:text-background transition-all tracking-tight text-base shadow-sm uppercase">
                                        Access Information
                                        <ExternalLink size={20} weight="Bold" className="ml-2" />
                                    </Button>
                                </Link>
                            </div>

                            {/* Decorative background element */}
                            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-[80px] -mr-24 -mt-24 group-hover:bg-primary/10 transition-colors" />
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
