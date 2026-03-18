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
import { Button, Spinner, toast } from "@heroui/react";
import {
    BookOpen,
    Edit,
    History,
    Lock,
    Plus,
    Search,
    Trash2
} from "lucide-react";
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
        <div className="max-w-[1240px] mx-auto p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Wiki</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Documentation and deployment guides for your stack.</p>
                </div>
                <Button variant="primary" className="rounded-lg h-8 px-3 text-xs font-medium" onPress={() => { setSelectedGuide(undefined); setIsWikiModalOpen(true); }}>
                    <Plus size={13} className="mr-1.5" />
                    New Guide
                </Button>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-border px-3 h-9 bg-background max-w-sm focus-within:border-accent transition-colors">
                <Search size={13} className="text-muted-foreground shrink-0" />
                <input 
                    className="bg-transparent border-none outline-none flex-1 text-sm placeholder:text-muted-foreground" 
                    placeholder="Search guides..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredGuides.length === 0 ? (
                    <div className="col-span-full py-20 text-center flex flex-col items-center gap-3">
                        <BookOpen size={24} className="text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">No guides found</p>
                    </div>
                ) : (
                    filteredGuides.map((guide) => (
                        <div
                            key={guide.id}
                            className="rounded-xl border border-border bg-surface group relative flex flex-col hover:border-accent/40 transition-colors"
                        >
                            <div className="p-4 flex-1 flex flex-col gap-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground shrink-0">
                                            <BookOpen size={13} />
                                        </div>
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <h3 className="text-sm font-medium text-foreground truncate">{guide.title}</h3>
                                            {guide.isEncrypted && <Lock size={11} className="text-warning shrink-0" />}
                                        </div>
                                    </div>

                                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <Button 
                                            variant="ghost" 
                                            isIconOnly 
                                            className="h-6 w-6 rounded-md"
                                            onPress={() => { setSelectedGuide(guide); setIsHistoryModalOpen(true); }}
                                        >
                                            <History size={11} />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            isIconOnly 
                                            className="h-6 w-6 rounded-md"
                                            onPress={() => { setSelectedGuide(guide); setIsWikiModalOpen(true); }}
                                        >
                                            <Edit size={11} />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            isIconOnly 
                                            className="h-6 w-6 rounded-md text-danger hover:bg-danger-muted"
                                            onPress={() => { setSelectedGuide(guide); setIsDeleteModalOpen(true); }}
                                        >
                                            <Trash2 size={11} />
                                        </Button>
                                    </div>
                                </div>

                                <div className="text-sm text-muted-foreground line-clamp-3">
                                    <Markdown content={guide.description} />
                                </div>

                                <Link href={`/wiki/${guide.id}`} className="absolute inset-0 z-0" />
                            </div>
                        </div>
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
