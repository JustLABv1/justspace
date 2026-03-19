'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { InstallationModal } from '@/components/InstallationModal';
import { Markdown } from '@/components/Markdown';
import { ProjectSelectorModal } from '@/components/ProjectSelectorModal';
import { VersionHistoryModal } from '@/components/VersionHistoryModal';
import { WikiExport } from '@/components/WikiExport';
import { WikiModal } from '@/components/WikiModal';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { EncryptedData, InstallationTarget, ResourceVersion, WikiGuide } from '@/types';
import { Button, Spinner, Tabs, toast } from "@heroui/react";
import {
    ArrowLeft,
    BookOpen,
    Edit,
    ExternalLink,
    Github,
    History,
    Lock,
    Plus,
    Trash2
} from "lucide-react";
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function WikiDetailPage() {
    const { id } = useParams() as { id: string };
    const [guide, setGuide] = useState<(WikiGuide & { installations: InstallationTarget[] }) | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [selectedInst, setSelectedInst] = useState<InstallationTarget | undefined>(undefined);
    const [isWikiModalOpen, setIsWikiModalOpen] = useState(false);
    const [isInstModalOpen, setIsInstModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isInstHistoryModalOpen, setIsInstHistoryModalOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const { user, privateKey } = useAuth();

    const fetchGuide = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await db.getGuide(id);
            const processedGuide = {
                ...data,
                installations: data.installations || []
            } as (WikiGuide & { installations: InstallationTarget[] });

            if (processedGuide.isEncrypted && privateKey && user) {
                setIsDecrypting(true);
                try {
                    const access = await db.getAccessKey(id);
                    if (access) {
                        const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                        
                        // Decrypt guide title/desc
                        const titleData = JSON.parse(processedGuide.title) as EncryptedData;
                        const descData = JSON.parse(processedGuide.description) as EncryptedData;
                        processedGuide.title = await decryptData(titleData, docKey);
                        processedGuide.description = await decryptData(descData, docKey);

                        // Decrypt installations
                        processedGuide.installations = await Promise.all(processedGuide.installations.map(async (inst) => {
                            const decryptedInst = { ...inst };
                            
                            try {
                                if (inst.target && inst.target.startsWith('{')) {
                                    const targetData = JSON.parse(inst.target) as EncryptedData;
                                    decryptedInst.target = await decryptData(targetData, docKey);
                                }
                                
                                if (inst.notes && inst.notes.startsWith('{')) {
                                    const notesData = JSON.parse(inst.notes) as EncryptedData;
                                    decryptedInst.notes = await decryptData(notesData, docKey);
                                }
                                
                                if (inst.tasks && inst.tasks.length > 0 && inst.tasks[0].startsWith('{')) {
                                    decryptedInst.tasks = await Promise.all(inst.tasks.map(async (t) => {
                                        if (t.startsWith('{')) {
                                            const tData = JSON.parse(t) as EncryptedData;
                                            return await decryptData(tData, docKey);
                                        }
                                        return t;
                                    }));
                                }
                            } catch (e) {
                                console.error('Failed to decrypt installation part:', e);
                            }
                            
                            return decryptedInst;
                        }));
                    }
                } catch (e) {
                    console.error('Decryption error:', e);
                } finally {
                    setIsDecrypting(false);
                }
            }

            setGuide(processedGuide);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [id, privateKey, user]);

    useEffect(() => {
        fetchGuide();
    }, [fetchGuide]);

    const handleUpdateWiki = async (data: Partial<WikiGuide> & { shouldEncrypt?: boolean }) => {
        if (!guide) return;
        const { shouldEncrypt: targetEncrypted, ...guideData } = data;
        const finalData = { ...guideData, isEncrypted: targetEncrypted };

        if (targetEncrypted && user && privateKey) {
            const userKeys = await db.getUserKeys(user.id);
            if (!userKeys) throw new Error('Vault keys not found');

            let docKey: CryptoKey;
            let isNewKey = false;

            const existingAccess = await db.getAccessKey(id);
            if (existingAccess && guide.isEncrypted) {
                docKey = await decryptDocumentKey(existingAccess.encryptedKey, privateKey);
            } else {
                docKey = await generateDocumentKey();
                isNewKey = true;
            }

            const encryptedTitle = await encryptData(guideData.title || '', docKey);
            const encryptedDesc = await encryptData(guideData.description || '', docKey);

            finalData.title = JSON.stringify(encryptedTitle);
            finalData.description = JSON.stringify(encryptedDesc);

            await db.updateGuide(id, finalData);
            
            // Create version snapshot
            await db.createVersion({
                resourceId: id,
                resourceType: 'Wiki',
                content: finalData.description || '',
                title: finalData.title,
                isEncrypted: true,
                metadata: 'Updated'
            });

            if (isNewKey) {
                const encryptedDocKey = await encryptDocumentKey(docKey, userKeys.publicKey);
                await db.grantAccess({
                    resourceId: id,
                    userId: user.id,
                    encryptedKey: encryptedDocKey,
                    resourceType: 'Wiki'
                });
            }
            toast.success('Wiki updated');
        } else {
            await db.updateGuide(id, finalData);
            await db.createVersion({
                resourceId: id,
                resourceType: 'Wiki',
                content: finalData.description || '',
                title: finalData.title,
                isEncrypted: false,
                metadata: 'Updated'
            });
            toast.success('Wiki updated');
        }
        
        setIsWikiModalOpen(false);
        fetchGuide();
    };

    const handleCreateOrUpdateInst = async (data: Partial<InstallationTarget>) => {
        const finalData = { ...data };

        if (guide?.isEncrypted && privateKey && user) {
            try {
                const access = await db.getAccessKey(id);
                if (access) {
                    const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    
                    if (data.target) {
                        const encryptedTarget = await encryptData(data.target, docKey);
                        finalData.target = JSON.stringify(encryptedTarget);
                    }
                    
                    if (data.notes) {
                        const encryptedNotes = await encryptData(data.notes, docKey);
                        finalData.notes = JSON.stringify(encryptedNotes);
                    }
                    
                    if (data.tasks && data.tasks.length > 0) {
                        finalData.tasks = await Promise.all(data.tasks.map(async (t) => {
                            return JSON.stringify(await encryptData(t, docKey));
                        }));
                    }
                    
                    finalData.isEncrypted = true;
                }
            } catch (e) {
                console.error('Failed to encrypt installation parts:', e);
            }
        }

        if (selectedInst?.id) {
            await db.updateInstallation(selectedInst.id, finalData);
            // Create version snapshot
            await db.createVersion({
                resourceId: selectedInst.id,
                resourceType: 'Installation',
                content: finalData.notes || '',
                title: finalData.target,
                isEncrypted: !!finalData.isEncrypted,
                metadata: 'Updated'
            });
            toast.success('Installation updated');
        } else {
            const newInst = await db.createInstallation({
                ...finalData,
                guideId: id
            } as Omit<InstallationTarget, 'id' | 'createdAt'>);
            // Create version snapshot
            await db.createVersion({
                resourceId: newInst.id,
                resourceType: 'Installation',
                content: finalData.notes || '',
                title: finalData.target,
                isEncrypted: !!finalData.isEncrypted,
                metadata: 'Initial version'
            });
            toast.success('Installation created');
        }
        setIsInstModalOpen(false);
        fetchGuide();
    };

    const handleRestore = async (version: ResourceVersion) => {
        if (!guide) return;
        
        const updateData: Partial<WikiGuide> = {
            title: version.title,
            description: version.content,
            isEncrypted: false
        };

        if (guide.isEncrypted && user && privateKey) {
            const access = await db.getAccessKey(id);
            if (access) {
                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                updateData.title = JSON.stringify(await encryptData(version.title || '', docKey));
                updateData.description = JSON.stringify(await encryptData(version.content, docKey));
                updateData.isEncrypted = true;
            }
        }

        await db.updateGuide(id, updateData);
        setIsHistoryModalOpen(false);
        fetchGuide();
        toast.success('Wiki restored');
    };

    const handleRestoreInst = async (version: ResourceVersion) => {
        if (!selectedInst) return;
        
        const updateData: Partial<InstallationTarget> = {
            target: version.title || selectedInst.target,
            notes: version.content,
            isEncrypted: false
        };

        if (guide?.isEncrypted && user && privateKey) {
            const access = await db.getAccessKey(id);
            if (access) {
                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                updateData.notes = JSON.stringify(await encryptData(version.content, docKey));
                updateData.isEncrypted = true;
            }
        }

        await db.updateInstallation(selectedInst.id, updateData);
        setIsInstHistoryModalOpen(false);
        fetchGuide();
        toast.success('Installation restored');
    };

    const handleDeleteInst = async () => {
        if (selectedInst) {
            await db.deleteInstallation(selectedInst.id);
            setIsDeleteModalOpen(false);
            fetchGuide();
            toast.success('Installation deleted');
        }
    };

    const handleApplyTasks = async (projectId: string) => {
        if (selectedInst?.tasks && selectedInst.tasks.length > 0) {
            const project = await db.getProject(projectId);
            const titles = selectedInst.tasks;

            if (project.isEncrypted && user && privateKey) {
                const access = await db.getAccessKey(projectId);
                if (access) {
                    const projectKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    const encryptedTitles = await Promise.all(titles.map(async (t) => {
                        return JSON.stringify(await encryptData(t, projectKey));
                    }));
                    await db.createTasks(projectId, encryptedTitles, true);
                } else {
                    await db.createTasks(projectId, titles, false);
                }
            } else {
                await db.createTasks(projectId, titles, false);
            }
            toast.success('Tasks applied to project');
        }
        setIsProjectSelectorOpen(false);
    };

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
    }

    if (!guide) {
        return <div className="p-8 text-center text-muted-foreground">Guide not found.</div>;
    }

    if (guide.isEncrypted && !privateKey) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <Lock size={32} className="text-muted-foreground" />
                <div className="text-center">
                    <h2 className="text-lg font-semibold text-foreground">Secured Guide</h2>
                    <p className="text-sm text-muted-foreground mt-1">Unlock your vault to access this encrypted guide.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full px-6 py-8 space-y-6">
            <div className="flex items-center justify-between">
                <Link href="/wiki" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft size={13} />
                    Wiki
                </Link>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        isIconOnly
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                        onPress={() => setIsHistoryModalOpen(true)}
                    >
                        <History size={13} />
                    </Button>
                    <Button
                        variant="ghost"
                        isIconOnly
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                        onPress={() => setIsWikiModalOpen(true)}
                    >
                        <Edit size={13} />
                    </Button>
                    <Button
                        variant="primary"
                        className="rounded-xl h-8 px-3 text-[12px] font-medium shadow-sm"
                        onPress={() => { setSelectedInst(undefined); setIsInstModalOpen(true); }}
                    >
                        <Plus size={13} className="mr-1.5" />
                        New Section
                    </Button>
                </div>
            </div>

            <div>
                <div className="flex items-center gap-2">
                    <h1 className="text-lg font-semibold text-foreground">{guide.title}</h1>
                    {guide.isEncrypted && <Lock size={13} className="text-warning" />}
                    {isDecrypting && <Spinner size="sm" color="current" />}
                </div>
                <div className="mt-2 text-sm text-muted-foreground max-w-3xl">
                    <Markdown content={guide.description} />
                </div>
            </div>

            {guide.installations.length > 0 ? (
                <div>
                    <Tabs defaultSelectedKey={guide.installations[0].id} variant="secondary">
                        <Tabs.ListContainer className="p-1 bg-surface-secondary rounded-xl border border-border w-fit">
                            <Tabs.List aria-label="Installation targets" className="gap-0.5">
                                {guide.installations.map((inst) => (
                                    <Tabs.Tab key={inst.id} id={inst.id} className="rounded-lg text-[12px] font-medium px-3 py-1.5 data-[selected=true]:bg-background data-[selected=true]:text-foreground data-[selected=true]:shadow-sm transition-all">
                                        {inst.target}
                                        <Tabs.Indicator className="hidden" />
                                    </Tabs.Tab>
                                ))}
                            </Tabs.List>
                        </Tabs.ListContainer>

                        {guide.installations.map((inst) => (
                            <Tabs.Panel key={inst.id} id={inst.id} className="mt-6">
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                    <div className="lg:col-span-8">
                                        <div className="rounded-2xl border border-border bg-surface">
                                            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <BookOpen size={13} className="text-muted-foreground" />
                                                    <h2 className="text-[13px] font-semibold text-foreground">{inst.target}</h2>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <WikiExport 
                                                        title={`${guide.title} - ${inst.target}`} 
                                                        content={inst.notes || ''} 
                                                        targetRef={contentRef} 
                                                    />
                                                    <Button 
                                                        variant="ghost" 
                                                        isIconOnly 
                                                        className="h-7 w-7 rounded-lg"
                                                        onPress={() => { setSelectedInst(inst); setIsInstHistoryModalOpen(true); }}
                                                    >
                                                        <History size={12} />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        isIconOnly 
                                                        className="h-7 w-7 rounded-lg"
                                                        onPress={() => { setSelectedInst(inst); setIsInstModalOpen(true); }}
                                                    >
                                                        <Edit size={12} />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        isIconOnly 
                                                        className="h-7 w-7 rounded-lg text-danger hover:bg-danger-muted"
                                                        onPress={() => { setSelectedInst(inst); setIsDeleteModalOpen(true); }}
                                                    >
                                                        <Trash2 size={12} />
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="p-6" ref={contentRef}>
                                                {inst.notes ? (
                                                    <Markdown content={inst.notes} />
                                                ) : (
                                                    <div className="py-12 flex flex-col items-center justify-center text-center gap-2">
                                                        <Edit size={20} className="text-muted-foreground" />
                                                        <p className="text-sm text-muted-foreground">No content yet</p>
                                                    </div>
                                                )}
                                            </div>

                                            {(inst.gitRepo || inst.documentation) && (
                                                <div className="px-4 py-3 border-t border-border flex gap-2">
                                                    {inst.gitRepo && (
                                                        <Link href={inst.gitRepo} target="_blank">
                                                            <Button variant="secondary" className="rounded-xl h-8 px-3 text-[12px] font-medium">
                                                                <Github size={12} className="mr-1.5" />
                                                                Source
                                                            </Button>
                                                        </Link>
                                                    )}
                                                    {inst.documentation && (
                                                        <Link href={inst.documentation} target="_blank">
                                                            <Button variant="ghost" className="rounded-xl h-8 px-3 text-[12px] font-medium">
                                                                <ExternalLink size={12} className="mr-1.5" />
                                                                Docs
                                                            </Button>
                                                        </Link>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <aside className="lg:col-span-4 space-y-4">
                                        {inst.tasks && inst.tasks.length > 0 && (
                                            <div className="rounded-2xl border border-border bg-surface p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h3 className="text-[13px] font-semibold text-foreground">Tasks</h3>
                                                    <span className="text-[12px] text-muted-foreground">{inst.tasks.length}</span>
                                                </div>

                                                <ul className="space-y-1.5 mb-4">
                                                    {inst.tasks.map((task, i) => (
                                                        <li key={i} className="flex items-start gap-2">
                                                            <span className="mt-0.5 text-xs text-muted-foreground tabular-nums shrink-0">{i + 1}.</span>
                                                            <span className="text-xs text-muted-foreground">{task}</span>
                                                        </li>
                                                    ))}
                                                </ul>

                                                <Button 
                                                    variant="primary" 
                                                    className="w-full h-8 rounded-xl text-[12px] font-medium shadow-sm"
                                                    onPress={() => { setSelectedInst(inst); setIsProjectSelectorOpen(true); }}
                                                >
                                                    Apply to Project
                                                </Button>
                                            </div>
                                        )}
                                    </aside>
                                </div>
                            </Tabs.Panel>
                        ))}
                    </Tabs>
                </div>
            ) : (
                <div className="py-24 flex flex-col items-center justify-center text-center gap-3">
                    <BookOpen size={24} className="text-muted-foreground" />
                    <div>
                        <h2 className="text-sm font-medium text-foreground">No sections yet</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">Add sections to structure your documentation.</p>
                    </div>
                    <Button variant="primary" className="rounded-xl h-8 px-3 text-[12px] mt-1 shadow-sm" onPress={() => { setSelectedInst(undefined); setIsInstModalOpen(true); }}>
                        <Plus size={13} className="mr-1.5" />
                        Add First Section
                    </Button>
                </div>
            )}

            <InstallationModal 
                isOpen={isInstModalOpen}
                onClose={() => setIsInstModalOpen(false)}
                onSubmit={handleCreateOrUpdateInst}
                installation={selectedInst}
                guideId={id}
            />

            <WikiModal 
                isOpen={isWikiModalOpen}
                onClose={() => setIsWikiModalOpen(false)}
                onSubmit={handleUpdateWiki}
                guide={guide}
            />

            <VersionHistoryModal 
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                resourceId={id}
                resourceType="Wiki"
                onRestore={handleRestore}
            />

            <VersionHistoryModal 
                isOpen={isInstHistoryModalOpen}
                onClose={() => setIsInstHistoryModalOpen(false)}
                resourceId={selectedInst?.id || ''}
                resourceType="Installation"
                accessResourceId={id}
                onRestore={handleRestoreInst}
            />

            <ProjectSelectorModal
                isOpen={isProjectSelectorOpen}
                onClose={() => setIsProjectSelectorOpen(false)}
                onSelect={handleApplyTasks}
            />

            <DeleteModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeleteInst}
                title="Delete Installation Target"
                message={`Are you sure you want to delete the configuration for "${selectedInst?.target}"?`}
            />
        </div>
    );
}
