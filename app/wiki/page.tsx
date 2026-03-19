'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { VersionHistoryModal } from '@/components/VersionHistoryModal';
import { WikiModal } from '@/components/WikiModal';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { wsClient, WSEvent } from '@/lib/ws';
import { ResourceVersion, WikiGuide } from '@/types';
import { Button, Dropdown, Label, Spinner, toast } from "@heroui/react";
import dayjs from 'dayjs';
import {
    BookOpen,
    Edit,
    History,
    Lock,
    MoreHorizontal,
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
        <div className="w-full px-6 py-8 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-0.5">
                    <h1 className="text-lg font-semibold text-foreground">Wiki</h1>
                    <p className="text-[13px] text-muted-foreground">Documentation and deployment guides for your stack.</p>
                </div>
                <Button variant="primary" className="rounded-xl h-8 px-3.5 text-[13px] font-medium shadow-sm" onPress={() => { setSelectedGuide(undefined); setIsWikiModalOpen(true); }}>
                    <Plus size={13} className="mr-1" />
                    New guide
                </Button>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-border px-3 h-9 bg-background max-w-sm focus-within:border-accent transition-colors">
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
                            className="rounded-2xl border border-border bg-surface group flex flex-col overflow-hidden hover:shadow-sm transition-all"
                        >
                            <Link href={`/wiki/${guide.id}`} className="p-4 flex-1 flex flex-col gap-3">
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-success-muted flex items-center justify-center text-success shrink-0">
                                        <BookOpen size={15} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <h3 className="text-[13px] font-semibold text-foreground truncate leading-snug">{guide.title}</h3>
                                            {guide.isEncrypted && <Lock size={11} className="text-warning shrink-0" />}
                                        </div>
                                        {guide.description && (
                                            <p className="text-[12px] text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                                                {guide.description.replace(/#{1,6}\s/g, '').replace(/[*_`~]/g, '').replace(/\n+/g, ' ')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </Link>

                            <div className="px-4 py-2.5 border-t border-border/60 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-muted-foreground">{dayjs(guide.createdAt).format('MMM D, YYYY')}</span>
                                    {guide.installations && guide.installations.length > 0 && (
                                        <span className="text-[11px] text-muted-foreground">· {guide.installations.length} target{guide.installations.length !== 1 ? 's' : ''}</span>
                                    )}
                                </div>
                                <Dropdown>
                                    <Button
                                        variant="ghost"
                                        isIconOnly
                                        className="h-6 w-6 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                        aria-label="Guide actions"
                                    >
                                        <MoreHorizontal size={13} />
                                    </Button>
                                    <Dropdown.Popover>
                                        <Dropdown.Menu
                                            onAction={(key) => {
                                                if (key === 'edit') { setSelectedGuide(guide); setIsWikiModalOpen(true); }
                                                if (key === 'history') { setSelectedGuide(guide); setIsHistoryModalOpen(true); }
                                                if (key === 'delete') { setSelectedGuide(guide); setIsDeleteModalOpen(true); }
                                            }}
                                        >
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
