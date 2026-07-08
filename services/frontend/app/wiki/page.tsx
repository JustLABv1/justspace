'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { EmptyState, EmptyStateAction } from '@/components/EmptyState';
import { VersionHistoryModal } from '@/components/VersionHistoryModal';
import { WikiModal } from '@/components/WikiModal';
import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { wsClient, WSEvent } from '@/services/frontend/lib/ws';
import { ResourceVersion, WikiGuide } from '@/services/frontend/types';
import { Button, Card, Dropdown, Label, SearchField } from "@heroui/react";
import dayjs from 'dayjs';
import {
    BookOpen,
    Edit,
    History,
    Lock,
    MoreHorizontal,
    Plus,
    Trash2
} from "lucide-react";
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

function stripMarkdownPreview(content: string) {
    return content
        .replace(/#{1,6}\s/g, '')
        .replace(/[*_`~]/g, '')
        .replace(/\n+/g, ' ');
}

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
                    await db.createVersion({
                        resourceId: selectedGuide.id,
                        resourceType: 'Wiki',
                        content: finalData.description || '',
                        title: finalData.title,
                        isEncrypted: true,
                        metadata: 'Updated'
                    });
                    const existingAccess = await db.getAccessKey(selectedGuide.id);
                    if (!existingAccess) {
                        await db.grantAccess({
                            resourceId: selectedGuide.id,
                            userId: user.id,
                            encryptedKey: encryptedDocKey,
                            resourceType: 'Wiki'
                        });
                    }
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
                }
            }
        } catch (error) {
            console.error(error);
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
            } catch (error) {
                console.error(error);
            }
        }
    };

    const filteredGuides = guides.filter(guide =>
        guide.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        guide.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isLoading) {
        return (
            <div className="h-64 flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
            </div>
        );
    }

    return (
        <div className="w-full px-6 py-8">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                        <BookOpen size={18} className="text-accent" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-foreground">Knowledge Base</h1>
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                            Documentation and deployment guides
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <SearchField
                        value={searchTerm}
                        onChange={setSearchTerm}
                        variant="secondary"
                        className="hidden sm:flex w-56"
                        aria-label="Search guides"
                    >
                        <SearchField.Group className="h-9 rounded-lg">
                            <SearchField.SearchIcon />
                            <SearchField.Input placeholder="Search guides..." />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                    <Button
                        variant="primary"
                        size="sm"
                        onPress={() => { setSelectedGuide(undefined); setIsWikiModalOpen(true); }}
                    >
                        <Plus size={13} className="mr-1" />
                        New guide
                    </Button>
                </div>
            </div>

            {/* Mobile search */}
            <SearchField
                value={searchTerm}
                onChange={setSearchTerm}
                variant="secondary"
                fullWidth
                className="sm:hidden mb-6"
                aria-label="Search guides"
            >
                <SearchField.Group className="h-10 rounded-lg">
                    <SearchField.SearchIcon />
                    <SearchField.Input placeholder="Search guides..." />
                    <SearchField.ClearButton />
                </SearchField.Group>
            </SearchField>

            {/* Count */}
            {filteredGuides.length > 0 && (
                <p className="text-[12px] text-muted-foreground mb-4">
                    {filteredGuides.length} guide{filteredGuides.length !== 1 ? 's' : ''}
                    {searchTerm && ` matching "${searchTerm}"`}
                </p>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredGuides.length === 0 ? (
                    <EmptyState
                        icon={BookOpen}
                        title={searchTerm ? 'No guides found' : 'Create your first guide'}
                        description={
                            searchTerm
                                ? 'No knowledge base article matches this search. Clear it or try a more specific deployment term.'
                                : 'Capture Markdown notes, deployment steps, and client-specific documentation in one searchable place.'
                        }
                        action={!searchTerm && (
                            <EmptyStateAction onPress={() => { setSelectedGuide(undefined); setIsWikiModalOpen(true); }}>
                                <Plus size={13} className="mr-1" />
                                New guide
                            </EmptyStateAction>
                        )}
                    />
                ) : (
                    filteredGuides.map((guide) => (
                        <Card
                            key={guide.id}
                            role="article"
                            aria-labelledby={`guide-${guide.id}-title`}
                            className="group flex h-full flex-col overflow-hidden p-0 transition-shadow hover:shadow-sm"
                        >
                            <Link
                                href={`/wiki/${guide.id}`}
                                aria-label={`Open guide ${guide.title}`}
                                className="p-5 flex-1 flex flex-col gap-4 rounded-lg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                                        <BookOpen size={16} className="text-accent" />
                                    </div>
                                    {guide.isEncrypted && (
                                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-warning/10 shrink-0">
                                            <Lock size={10} className="text-warning" />
                                            <span className="text-[10px] font-semibold text-warning uppercase tracking-wide">Encrypted</span>
                                        </div>
                                    )}
                                </div>
                                <Card.Header className="p-0 block">
                                    <Card.Title id={`guide-${guide.id}-title`} className="text-sm leading-snug line-clamp-1">
                                        {guide.title}
                                    </Card.Title>
                                    {guide.description && (
                                        <Card.Description className="mt-1.5 line-clamp-2 text-xs leading-relaxed">
                                            {stripMarkdownPreview(guide.description)}
                                        </Card.Description>
                                    )}
                                </Card.Header>
                            </Link>

                            <Card.Footer className="px-5 py-3 border-t border-border/60 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-muted-foreground">
                                        {dayjs(guide.createdAt).format('MMM D, YYYY')}
                                    </span>
                                    {guide.installations && guide.installations.length > 0 && (
                                        <>
                                            <span className="text-muted-foreground/30">·</span>
                                            <span className="text-[11px] text-muted-foreground">
                                                {guide.installations.length} target{guide.installations.length !== 1 ? 's' : ''}
                                            </span>
                                        </>
                                    )}
                                </div>
                                <Dropdown>
                                    <Button
                                        variant="ghost"
                                        isIconOnly
                                        size="sm"
                                        className="md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 transition-opacity"
                                        aria-label={`Actions for ${guide.title}`}
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
                            </Card.Footer>
                        </Card>
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
