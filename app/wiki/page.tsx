'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { Markdown } from '@/components/Markdown';
import { VersionHistoryModal } from '@/components/VersionHistoryModal';
import { WikiModal } from '@/components/WikiModal';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { wsClient, WSEvent } from '@/lib/ws';
import { ResourceVersion, WikiGuide } from '@/types';
import { Button, Spinner, Surface, toast } from "@heroui/react";
import {
    Book,
    Pen2 as Edit,
    ArrowRightUp as ExternalLink,
    History,
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
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [selectedGuide, setSelectedGuide] = useState<WikiGuide | undefined>(undefined);
    const { user, privateKey } = useAuth();

    const fetchGuides = useCallback(async (isInitial = false) => {
        if (isInitial) setIsLoading(true);
        try {
            const data = await db.listGuides();
            const rawGuides = data.documents;

            // Decrypt encrypted guides if private key is available
            const processedGuides = await Promise.all(rawGuides.map(async (guide) => {
                if (guide.isEncrypted) {
                    if (privateKey && user) {
                        try {
                            const access = await db.getAccessKey(guide.id);
                            if (access) {
                                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                
                                let decryptedTitle = guide.title;
                                let decryptedDesc = guide.description;

                                try {
                                    const titleData = JSON.parse(guide.title);
                                    decryptedTitle = await decryptData(titleData, docKey);
                                } catch {}

                                try {
                                    const descData = JSON.parse(guide.description);
                                    decryptedDesc = await decryptData(descData, docKey);
                                } catch {}
                                
                                return { ...guide, title: decryptedTitle, description: decryptedDesc };
                            }
                        } catch (e) {
                            console.error('Failed to decrypt guide:', guide.id, e);
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
            if (isInitial) setIsLoading(false);
        }
    }, [privateKey, user]);

    useEffect(() => {
        fetchGuides(true);
    }, [fetchGuides]);

    useEffect(() => {
        const unsub = wsClient.subscribe((event: WSEvent) => {
            if (event.collection === 'wiki_guides' || event.collection === 'access_control') {
                if (event.type === 'delete' && event.collection === 'wiki_guides') {
                    const payload = event.document as unknown as WikiGuide;
                    setGuides(prev => prev.filter(g => g.id !== payload.id));
                    return;
                }
                fetchGuides(false);
            }
        });

        return () => unsub();
    }, [fetchGuides]);

    const handleRestore = async (version: ResourceVersion) => {
        if (!selectedGuide) return;
        
        const updateData: Partial<WikiGuide> = {
            title: version.title,
            description: version.content,
            isEncrypted: false
        };

        if (selectedGuide.isEncrypted && user && privateKey) {
            const access = await db.getAccessKey(selectedGuide.id);
            if (access) {
                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                updateData.title = JSON.stringify(await encryptData(version.title || '', docKey));
                updateData.description = JSON.stringify(await encryptData(version.content, docKey));
                updateData.isEncrypted = true;
            }
        }

        await db.updateGuide(selectedGuide.id, updateData);
        setIsHistoryModalOpen(false);
        fetchGuides();
    };

    const handleCreateOrUpdate = async (data: Partial<WikiGuide> & { shouldEncrypt?: boolean }) => {
        const { shouldEncrypt, ...guideData } = data;
        const finalData = { ...guideData };

        try {
            if (shouldEncrypt && user) {
                const userKeys = await db.getUserKeys(user.id);
                if (!userKeys) throw new Error('Vault keys not found');

                const docKey = await generateDocumentKey();
                const encryptedTitle = await encryptData(guideData.title || '', docKey);
                const encryptedDesc = await encryptData(guideData.description || '', docKey);

                finalData.title = JSON.stringify(encryptedTitle);
                finalData.description = JSON.stringify(encryptedDesc);
                finalData.isEncrypted = true;

                const encryptedDocKey = await encryptDocumentKey(docKey, userKeys.publicKey);

                if (selectedGuide?.id) {
                    await db.updateGuide(selectedGuide.id, finalData);
                    
                    // Create version snapshot
                    await db.createVersion({
                        resourceId: selectedGuide.id,
                        resourceType: 'Wiki',
                        content: finalData.description || '',
                        title: finalData.title,
                        isEncrypted: true,
                        metadata: 'Updated'
                    });

                    // Also update/add access control if not exists
                    const existingAccess = await db.getAccessKey(selectedGuide.id);
                    if (!existingAccess) {
                        await db.grantAccess({
                            resourceId: selectedGuide.id,
                            userId: user.id,
                            encryptedKey: encryptedDocKey,
                            resourceType: 'Wiki'
                        });
                    }
                    toast.success('Wiki updated');
                } else {
                    const newGuide = await db.createGuide(finalData as Omit<WikiGuide, 'id' | 'createdAt'>);
                    
                    await db.createVersion({
                        resourceId: newGuide.id,
                        resourceType: 'Wiki',
                        content: finalData.description || '',
                        title: finalData.title,
                        isEncrypted: true,
                        metadata: 'Initial version'
                    });

                    await db.grantAccess({
                        resourceId: newGuide.id,
                        userId: user.id,
                        encryptedKey: encryptedDocKey,
                        resourceType: 'Wiki'
                    });
                    toast.success('Wiki created');
                }
            } else {
                if (selectedGuide?.id) {
                    await db.updateGuide(selectedGuide.id, finalData);
                    await db.createVersion({
                        resourceId: selectedGuide.id,
                        resourceType: 'Wiki',
                        content: finalData.description || '',
                        title: finalData.title,
                        isEncrypted: false,
                        metadata: 'Updated'
                    });
                    toast.success('Wiki updated');
                } else {
                    const newGuide = await db.createGuide(finalData as Omit<WikiGuide, 'id' | 'createdAt'>);
                    await db.createVersion({
                        resourceId: newGuide.id,
                        resourceType: 'Wiki',
                        content: finalData.description || '',
                        title: finalData.title,
                        isEncrypted: false,
                        metadata: 'Initial version'
                    });
                    toast.success('Wiki created');
                }
            }
        } catch (error) {
            console.error(error);
            toast.danger('Action failed');
        }
        
        setIsWikiModalOpen(false);
        fetchGuides();
    };

    const handleDelete = async () => {
        if (selectedGuide) {
            try {
                await db.deleteGuide(selectedGuide.id);
                setIsDeleteModalOpen(false);
                fetchGuides();
                toast.success('Wiki deleted');
            } catch (error) {
                console.error(error);
                toast.danger('Delete failed');
            }
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
        <div className="max-w-[1240px] mx-auto p-6 md:p-12 space-y-12">
            <header className="flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="space-y-2 text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-2 text-accent font-bold tracking-widest text-[10px] opacity-80 uppercase">
                        <Book size={16} weight="Bold" className="animate-pulse" />
                        Knowledge Base
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground leading-tight">Wiki Guides</h1>
                    <p className="text-sm text-muted-foreground font-medium opacity-60">Documentation and deployment guides for your stack.</p>
                </div>
                <Button variant="primary" className="rounded-xl h-10 px-6 font-bold tracking-tight shadow-xl shadow-accent/10 text-xs" onPress={() => { setSelectedGuide(undefined); setIsWikiModalOpen(true); }}>
                    <Plus size={18} weight="Bold" className="mr-2" />
                    New Guide
                </Button>
            </header>

            <Surface className="flex items-center gap-4 px-6 py-2 bg-surface border border-border/40 rounded-[2rem] shadow-sm max-w-2xl focus-within:border-accent/40 transition-all duration-500">
                <Search size={20} className="text-muted-foreground/40" />
                <input 
                    className="bg-transparent border-none outline-none flex-1 h-10 text-sm font-bold tracking-tight placeholder:text-muted-foreground/20" 
                    placeholder="Search documentation..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </Surface>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredGuides.length === 0 ? (
                    <div className="col-span-full py-40 text-center space-y-6">
                        <div className="w-24 h-24 mx-auto bg-surface-secondary rounded-[3rem] border border-dashed border-border flex items-center justify-center text-muted-foreground/20">
                            <Search size={40} weight="Linear" />
                        </div>
                        <p className="text-xl font-bold tracking-tight text-muted-foreground/20">No guides found</p>
                    </div>
                ) : (
                    filteredGuides.map((guide) => (
                        <Surface 
                            key={guide.id} 
                            className="p-0 rounded-[2.5rem] border border-border/30 bg-white/50 dark:bg-surface/50 backdrop-blur-sm group relative overflow-hidden flex flex-col transition-all duration-500 hover:border-accent/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-accent/5"
                        >
                            <div className="p-8 flex-1 flex flex-col gap-8">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-[1.2rem] bg-surface-secondary flex items-center justify-center text-muted-foreground border border-border/20 group-hover:bg-accent group-hover:text-white group-hover:border-accent transition-all duration-500 shadow-sm">
                                            <Book size={20} weight="Bold" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-lg font-bold tracking-tight leading-none">{guide.title}</h3>
                                                {guide.isEncrypted && <Shield size={14} className="text-accent/60" />}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex gap-1.5 translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300 relative z-10">
                                        <Button 
                                            variant="ghost" 
                                            isIconOnly 
                                            className="h-8 w-8 rounded-lg hover:bg-surface-secondary"
                                            onPress={(e) => { setSelectedGuide(guide); setIsHistoryModalOpen(true); }}
                                        >
                                            <History size={14} weight="Bold" />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            isIconOnly 
                                            className="h-8 w-8 rounded-lg hover:bg-surface-secondary"
                                            onPress={(e) => { setSelectedGuide(guide); setIsWikiModalOpen(true); }}
                                        >
                                            <Edit size={14} weight="Bold" />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            isIconOnly 
                                            className="h-8 w-8 rounded-lg text-danger hover:bg-danger/5"
                                            onPress={(e) => { setSelectedGuide(guide); setIsDeleteModalOpen(true); }}
                                        >
                                            <Trash size={14} weight="Bold" />
                                        </Button>
                                    </div>
                                </div>

                                <div className="line-clamp-3">
                                    <Markdown content={guide.description} />
                                </div>

                                <div className="mt-auto pt-4 flex items-center justify-between border-t border-border/5">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-surface-secondary border border-border/10 flex items-center justify-center">
                                            <ExternalLink size={12} className="text-muted-foreground/40" />
                                        </div>
                                        <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">View Documentation</span>
                                    </div>
                                    <Link href={`/wiki/${guide.id}`} className="absolute inset-0 z-0" />
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

            <VersionHistoryModal 
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                resourceId={selectedGuide?.id || ''}
                resourceType="Wiki"
                onRestore={handleRestore}
            />
        </div>
    );
}
