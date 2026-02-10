'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { InstallationModal } from '@/components/InstallationModal';
import { Markdown } from '@/components/Markdown';
import { ProjectSelectorModal } from '@/components/ProjectSelectorModal';
import { ShareModal } from '@/components/ShareModal';
import { VersionHistoryModal } from '@/components/VersionHistoryModal';
import { WikiExport } from '@/components/WikiExport';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { EncryptedData, InstallationTarget, ResourceVersion, WikiGuide } from '@/types';
import { Button, Spinner, Surface, Tabs } from "@heroui/react";
import {
    AltArrowLeft as ArrowLeft,
    Pen2 as Edit,
    ArrowRightUp as ExternalLink,
    CodeCircle as Github,
    Restart as History,
    InfoCircle as Info,
    AddCircle as Plus,
    ShareCircle as Share,
    ShieldKeyhole as Shield,
    Target,
    TrashBinTrash as Trash,
    Widget
} from "@solar-icons/react";
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function WikiDetailPage() {
    const { id } = useParams() as { id: string };
    const [guide, setGuide] = useState<(WikiGuide & { installations: InstallationTarget[] }) | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [selectedInst, setSelectedInst] = useState<InstallationTarget | undefined>(undefined);
    const [isInstModalOpen, setIsInstModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isInstHistoryModalOpen, setIsInstHistoryModalOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const { user, privateKey } = useAuth();

    const fetchGuide = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await db.getGuide(id);
            const processedGuide = data as (WikiGuide & { installations: InstallationTarget[] });

            if (processedGuide.isEncrypted && privateKey && user) {
                setIsDecrypting(true);
                try {
                    const access = await db.getAccessKey(id, user.$id);
                    if (access) {
                        const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                        
                        // Decrypt guide title/desc
                        const titleData = JSON.parse(processedGuide.title) as EncryptedData;
                        const descData = JSON.parse(processedGuide.description) as EncryptedData;
                        processedGuide.title = await decryptData(titleData, docKey);
                        processedGuide.description = await decryptData(descData, docKey);

                        // Decrypt installations notes
                        processedGuide.installations = await Promise.all(processedGuide.installations.map(async (inst) => {
                            if (inst.notes && inst.notes.startsWith('{')) {
                                try {
                                    const notesData = JSON.parse(inst.notes) as EncryptedData;
                                    const decryptedNotes = await decryptData(notesData, docKey);
                                    return { ...inst, notes: decryptedNotes };
                                } catch {
                                    return inst;
                                }
                            }
                            return inst;
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

    const handleCreateOrUpdateInst = async (data: Partial<InstallationTarget>) => {
        const finalData = { ...data };

        if (guide?.isEncrypted && privateKey && user) {
            try {
                const access = await db.getAccessKey(id, user.$id);
                if (access) {
                    const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    const encryptedNotes = await encryptData(data.notes || '', docKey);
                    finalData.notes = JSON.stringify(encryptedNotes);
                    finalData.isEncrypted = true;
                }
            } catch (e) {
                console.error('Failed to encrypt installation notes:', e);
            }
        }

        if (selectedInst?.$id) {
            await db.updateInstallation(selectedInst.$id, finalData);
            // Create version snapshot
            await db.createVersion({
                resourceId: selectedInst.$id,
                resourceType: 'Installation',
                content: finalData.notes || '',
                title: finalData.target,
                isEncrypted: !!finalData.isEncrypted,
                metadata: 'Updated'
            });
        } else {
            const newInst = await db.createInstallation({
                ...finalData,
                guideId: id
            } as Omit<InstallationTarget, '$id' | '$createdAt'>);
            // Create version snapshot
            await db.createVersion({
                resourceId: newInst.$id,
                resourceType: 'Installation',
                content: finalData.notes || '',
                title: finalData.target,
                isEncrypted: !!finalData.isEncrypted,
                metadata: 'Initial version'
            });
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
            const access = await db.getAccessKey(id, user.$id);
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
    };

    const handleRestoreInst = async (version: ResourceVersion) => {
        if (!selectedInst) return;
        
        const updateData: Partial<InstallationTarget> = {
            target: version.title || selectedInst.target,
            notes: version.content,
            isEncrypted: false
        };

        if (guide?.isEncrypted && user && privateKey) {
            const access = await db.getAccessKey(id, user.$id);
            if (access) {
                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                updateData.notes = JSON.stringify(await encryptData(version.content, docKey));
                updateData.isEncrypted = true;
            }
        }

        await db.updateInstallation(selectedInst.$id, updateData);
        setIsInstHistoryModalOpen(false);
        fetchGuide();
    };

    const handleDeleteInst = async () => {
        if (selectedInst) {
            await db.deleteInstallation(selectedInst.$id);
            setIsDeleteModalOpen(false);
            fetchGuide();
        }
    };

    const handleApplyTasks = async (projectId: string) => {
        if (selectedInst?.tasks && selectedInst.tasks.length > 0) {
            const project = await db.getProject(projectId);
            const titles = selectedInst.tasks;

            if (project.isEncrypted && user && privateKey) {
                const access = await db.getAccessKey(projectId, user.$id);
                if (access) {
                    const projectKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    const encryptedTitles = await Promise.all(titles.map(async (t) => {
                        return JSON.stringify(await encryptData(t, projectKey));
                    }));
                    await db.createTasks(projectId, encryptedTitles, true);
                } else {
                    await db.createTasks(projectId, titles);
                }
            } else {
                await db.createTasks(projectId, titles);
            }
        }
        setIsProjectSelectorOpen(false);
    };

    const handleShare = async (email: string) => {
        if (!guide || !privateKey || !user) return;

        // 1. Find recipient's public key
        const recipientKeys = await db.findUserKeysByEmail(email);
        if (!recipientKeys) throw new Error('Recipient has no vault setup');

        // 2. Decrypt doc key for ourselves first
        const access = await db.getAccessKey(id, user.$id);
        if (!access) throw new Error('You do not have access to this document');
        const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);

        // 3. Encrypt doc key with recipient's public key
        const encryptedForRecipient = await encryptDocumentKey(docKey, recipientKeys.publicKey);

        // 4. Create access control record
        await db.grantAccess({
            resourceId: id,
            userId: recipientKeys.userId,
            encryptedKey: encryptedForRecipient,
            resourceType: 'Wiki'
        });
    };

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
    }

    if (!guide) {
        return <div className="p-8 text-center text-muted-foreground">Guide not found.</div>;
    }

    if (guide.isEncrypted && !privateKey) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 rounded-[2rem] bg-orange-500/10 flex items-center justify-center text-orange-500 border border-orange-500/20 shadow-2xl shadow-orange-500/5">
                    <Shield size={48} weight="Bold" className="animate-pulse" />
                </div>
                <div className="text-center space-y-3">
                    <h2 className="text-3xl font-black tracking-tighter uppercase italic">Secured Guide_</h2>
                    <p className="text-sm text-muted-foreground font-medium opacity-60 max-w-sm mx-auto leading-relaxed">
                        This guide is protected by end-to-end encryption. <br/>
                        Please synchronize your vault to gain access.
                    </p>
                </div>
                <div className="w-px h-12 bg-gradient-to-b from-orange-500/40 to-transparent" />
            </div>
        );
    }

    return (
        <div className="max-w-[1240px] mx-auto p-6 md:p-8 space-y-12">
            <nav className="flex items-center justify-between">
                <Link href="/wiki">
                    <Button variant="secondary" className="rounded-xl h-9 px-4 font-bold border border-border/40 group bg-surface/5 backdrop-blur-sm hover:border-primary/30 uppercase text-[10px] tracking-widest transition-all">
                        <ArrowLeft size={16} weight="Bold" className="mr-2 group-hover:-translate-x-1 transition-transform" />
                        Back to Wiki
                    </Button>
                </Link>
                <div className="flex items-center gap-3">
                     <Button 
                        variant="ghost" 
                        isIconOnly 
                        className="rounded-xl h-9 w-9 border border-border/20 bg-surface/5 backdrop-blur-sm hover:text-primary transition-all"
                        onPress={() => setIsHistoryModalOpen(true)}
                    >
                        <History size={18} weight="Bold" />
                    </Button>
                    {guide.isEncrypted && (
                        <Button 
                            variant="ghost" 
                            isIconOnly
                            className="rounded-xl h-9 w-9 border border-border/20 bg-surface/5 backdrop-blur-sm text-orange-500 hover:bg-orange-500/5 transition-all"
                            onPress={() => setIsShareModalOpen(true)}
                        >
                            <Share size={18} weight="Bold" />
                        </Button>
                    )}
                    <Button 
                        variant="primary" 
                        className="rounded-xl h-9 px-6 font-bold tracking-tight shadow-xl shadow-primary/10 text-xs" 
                        onPress={() => { setSelectedInst(undefined); setIsInstModalOpen(true); }}
                    >
                        <Plus size={16} weight="Bold" className="mr-2" />
                        New Section
                    </Button>
                </div>
            </nav>

            <header className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-border/10">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                             <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                <Info size={14} weight="Bold" />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60">Documentation Guide</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <h1 className="text-3xl font-bold tracking-tight text-foreground">
                                {guide.title}
                            </h1>
                            {isDecrypting && <Spinner size="sm" color="current" />}
                        </div>
                        <div className="max-w-4xl opacity-70">
                            <Markdown content={guide.description} />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 p-1.5 rounded-xl border border-border/20 bg-surface shadow-sm">
                        <div className="px-3 py-1.5 rounded-lg bg-surface-secondary text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                            {guide.installations.length} Segments
                        </div>
                        {guide.isEncrypted && (
                            <div className="px-3 py-1.5 rounded-lg bg-orange-500/5 text-[9px] font-bold uppercase tracking-widest text-orange-500 flex items-center gap-1.5">
                                <Shield size={12} weight="Bold" />
                                Encrypted
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {guide.installations.length > 0 ? (
                <div className="space-y-12">
                    <Tabs defaultSelectedKey={guide.installations[0].$id} variant="secondary">
                        <Tabs.ListContainer className="p-1 bg-surface-secondary/50 backdrop-blur-md rounded-2xl border border-border/30 w-fit">
                            <Tabs.List aria-label="Installation targets" className="gap-1">
                                {guide.installations.map((inst) => (
                                    <Tabs.Tab key={inst.$id} id={inst.$id} className="rounded-xl font-bold px-6 py-2.5 tracking-tight text-[11px] data-[selected=true]:bg-foreground data-[selected=true]:text-background transition-all uppercase">
                                        {inst.target}
                                        <Tabs.Indicator className="hidden" />
                                    </Tabs.Tab>
                                ))}
                            </Tabs.List>
                        </Tabs.ListContainer>

                        {guide.installations.map((inst) => (
                            <Tabs.Panel key={inst.$id} id={inst.$id} className="mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                    <div className="lg:col-span-8">
                                        <Surface className="p-0 rounded-[2rem] border border-border/30 bg-white/40 dark:bg-surface/40 backdrop-blur-xl relative overflow-hidden shadow-sm">
                                            <div className="relative z-10 flex flex-col h-full">
                                                <header className="p-8 flex justify-between items-center border-b border-border/10">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-xl bg-foreground text-background flex items-center justify-center">
                                                            <Target size={20} weight="Bold" />
                                                        </div>
                                                        <div>
                                                            <h2 className="text-xl font-bold tracking-tight leading-none">{inst.target}</h2>
                                                            <p className="text-[9px] font-bold tracking-widest text-muted-foreground/40 uppercase mt-1.5">Module Documentation</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <WikiExport 
                                                            title={`${guide.title} - ${inst.target}`} 
                                                            content={inst.notes || ''} 
                                                            targetRef={contentRef} 
                                                        />
                                                        <div className="w-px h-6 bg-border/10 mx-1" />
                                                        <Button 
                                                            variant="ghost" 
                                                            isIconOnly 
                                                            className="h-8 w-8 rounded-lg hover:bg-surface-secondary"
                                                            onPress={() => { setSelectedInst(inst); setIsInstHistoryModalOpen(true); }}
                                                        >
                                                            <History size={16} weight="Bold" />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            isIconOnly 
                                                            className="h-8 w-8 rounded-lg hover:bg-surface-secondary"
                                                            onPress={() => { setSelectedInst(inst); setIsInstModalOpen(true); }}
                                                        >
                                                            <Edit size={16} weight="Bold" />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            isIconOnly 
                                                            className="h-8 w-8 rounded-lg text-danger hover:bg-danger/5"
                                                            onPress={() => { setSelectedInst(inst); setIsDeleteModalOpen(true); }}
                                                        >
                                                            <Trash size={16} weight="Bold" />
                                                        </Button>
                                                    </div>
                                                </header>

                                                <div className="p-8 md:p-12" ref={contentRef}>
                                                    {inst.notes ? (
                                                        <Markdown content={inst.notes} />
                                                    ) : (
                                                        <div className="py-20 flex flex-col items-center justify-center space-y-3 opacity-20">
                                                            <Edit size={32} weight="Linear" />
                                                            <p className="font-bold uppercase tracking-widest text-[10px]">Registry is empty</p>
                                                        </div>
                                                    )}
                                                </div>

                                                <footer className="mt-auto p-8 flex flex-wrap gap-4 border-t border-border/5 bg-black/[0.01] dark:bg-white/[0.01]">
                                                    {inst.gitRepo && (
                                                        <Link href={inst.gitRepo} target="_blank" className="flex-1">
                                                            <Button variant="primary" className="w-full rounded-xl h-12 px-6 font-bold tracking-tight text-xs">
                                                                <Github size={16} weight="Bold" className="mr-2" />
                                                                Source Code
                                                            </Button>
                                                        </Link>
                                                    )}
                                                    {inst.documentation && (
                                                        <Link href={inst.documentation} target="_blank" className="flex-1">
                                                            <Button variant="secondary" className="w-full rounded-xl h-12 px-6 font-bold tracking-tight border border-border/40 text-xs">
                                                                <ExternalLink size={16} weight="Bold" className="mr-2" />
                                                                Reference
                                                            </Button>
                                                        </Link>
                                                    )}
                                                </footer>
                                            </div>
                                        </Surface>
                                    </div>

                                    <aside className="lg:col-span-4 space-y-8">
                                        {inst.tasks && inst.tasks.length > 0 && (
                                            <Surface className="p-8 rounded-[2rem] border border-border/30 bg-white/40 dark:bg-surface/40 backdrop-blur-xl shadow-sm">
                                                <div className="space-y-6">
                                                    <div className="flex items-center justify-between">
                                                        <div className="space-y-1">
                                                            <h3 className="text-lg font-bold tracking-tight">Tasks Pipeline</h3>
                                                            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Sync to Projects</p>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                                            {inst.tasks.length}
                                                        </div>
                                                    </div>

                                                    <ul className="space-y-4">
                                                        {inst.tasks.map((task, i) => (
                                                            <li key={i} className="flex items-start gap-3 group">
                                                                <div className="mt-1 flex items-center justify-center w-5 h-5 rounded-md bg-surface-secondary border border-border/20 text-muted-foreground/40 text-[9px] font-bold group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">
                                                                    {i + 1}
                                                                </div>
                                                                <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
                                                                    {task}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>

                                                    <Button 
                                                        variant="primary" 
                                                        className="w-full h-11 rounded-xl font-bold tracking-tight text-[11px] shadow-sm"
                                                        onPress={() => { setSelectedInst(inst); setIsProjectSelectorOpen(true); }}
                                                    >
                                                        <Widget size={16} weight="Bold" className="mr-2" />
                                                        Provision to Project
                                                    </Button>
                                                </div>
                                            </Surface>
                                        )}
                                        
                                        <div className="p-6 rounded-2xl border border-border/20 bg-black/[0.02] dark:bg-white/[0.02] space-y-4">
                                            <div className="flex items-center gap-3">
                                                <Shield size={18} weight="Bold" className="text-muted-foreground/40" />
                                                <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-widest">Version Auditing</h4>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground/60 leading-relaxed font-medium">
                                                All segments are snapshots. Use the history icon to audit changes or revert to a stable state.
                                            </p>
                                        </div>
                                    </aside>
                                </div>
                            </Tabs.Panel>
                        ))}
                    </Tabs>
                </div>
            ) : (
                <div className="py-40 flex flex-col items-center justify-center text-center space-y-6">
                    <div className="w-20 h-20 bg-surface-secondary rounded-[2.5rem] flex items-center justify-center text-muted-foreground/20 border-2 border-dashed border-border/40">
                        <Plus size={32} weight="Bold" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xl font-bold">No documentation segments</h2>
                        <p className="text-muted-foreground max-w-xs text-sm opacity-60">Initializing sections creates targets for your deployment strategy.</p>
                    </div>
                    <Button variant="primary" className="rounded-xl h-10 px-8 font-bold text-xs" onPress={() => { setSelectedInst(undefined); setIsInstModalOpen(true); }}>
                        Create First Section
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

            <ShareModal 
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                onShare={handleShare}
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
                resourceId={selectedInst?.$id || ''}
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
