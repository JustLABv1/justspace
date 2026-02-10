'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { InstallationModal } from '@/components/InstallationModal';
import { Markdown } from '@/components/Markdown';
import { ProjectSelectorModal } from '@/components/ProjectSelectorModal';
import { ShareModal } from '@/components/ShareModal';
import { WikiExport } from '@/components/WikiExport';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { EncryptedData, InstallationTarget, WikiGuide } from '@/types';
import { Button, Spinner, Surface, Tabs, Tooltip } from "@heroui/react";
import {
    AltArrowLeft as ArrowLeft,
    CheckCircle as ClipboardCheck,
    Pen2 as Edit,
    Restart as History,
    InfoCircle as Info,
    AddCircle as Plus,
    ShareCircle as Share,
    ShieldKeyhole as Shield,
    TrashBinTrash as Trash
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
        } else {
            await db.createInstallation({
                ...finalData,
                guideId: id
            } as Omit<InstallationTarget, '$id' | '$createdAt'>);
        }
        setIsInstModalOpen(false);
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
        <div className="max-w-[1200px] mx-auto p-6 md:p-8 space-y-12">
            <nav>
                <Link href="/wiki">
                    <Button variant="secondary" className="rounded-2xl h-12 px-6 font-bold border-border/40 group bg-surface shadow-sm hover:border-primary/30 uppercase text-xs tracking-widest">
                        <ArrowLeft size={18} weight="Bold" className="mr-2 group-hover:-translate-x-1 transition-transform" />
                        Wiki Library_
                    </Button>
                </Link>
            </nav>

            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="px-4 py-1.5 rounded-full bg-accent/5 border border-accent/10 text-xs font-bold uppercase tracking-widest text-accent">
                            Infrastructure Frequency
                        </div>
                        {guide.installations.length > 0 && (
                            <div className="px-4 py-1.5 rounded-full bg-success/5 border border-success/10 text-xs font-bold uppercase tracking-widest text-success">
                                {guide.installations.length} Active Targets
                            </div>
                        )}
                        {guide.isEncrypted && (
                            <div className="px-4 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-xs font-bold uppercase tracking-widest text-orange-500 flex items-center gap-2">
                                <Shield size={14} weight="Bold" />
                                Secured Guide
                            </div>
                        )}
                        {isDecrypting && <Spinner size="sm" />}
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight leading-[1] uppercase italic">{guide.title}_</h1>
                    <p className="text-lg text-muted-foreground max-w-4xl leading-relaxed opacity-70 font-medium">{guide.description}</p>
                </div>
                <div className="flex gap-4 self-stretch md:self-auto">
                    {guide.isEncrypted && (
                        <Button 
                            variant="secondary" 
                            className="rounded-xl h-10 px-6 font-bold uppercase tracking-widest border-orange-500/20 text-orange-500 hover:bg-orange-500/5 shadow-sm text-xs"
                            onPress={() => setIsShareModalOpen(true)}
                        >
                            <Share size={16} weight="Bold" className="mr-3" />
                            Secure Share
                        </Button>
                    )}
                    <Button variant="primary" className="rounded-xl h-10 px-6 font-bold uppercase tracking-widest shadow-xl shadow-primary/10 flex-1 md:flex-none text-xs" onPress={() => { setSelectedInst(undefined); setIsInstModalOpen(true); }}>
                        <Plus size={16} weight="Bold" className="mr-3" />
                        Init Target
                    </Button>
                </div>
            </header>

            {guide.installations.length > 0 ? (
                <div className="space-y-12">
                    <Tabs defaultSelectedKey={guide.installations[0].$id} variant="secondary">
                        <Tabs.ListContainer className="p-2 bg-surface rounded-[2rem] border border-border/40 w-fit shadow-sm">
                            <Tabs.List aria-label="Installation targets" className="gap-3">
                                {guide.installations.map((inst) => (
                                    <Tabs.Tab key={inst.$id} id={inst.$id} className="rounded-[1.5rem] font-bold px-8 py-3 tracking-tight text-sm data-[selected=true]:bg-foreground data-[selected=true]:text-background transition-all uppercase">
                                        {inst.target}
                                        <Tabs.Indicator className="hidden" />
                                    </Tabs.Tab>
                                ))}
                            </Tabs.List>
                        </Tabs.ListContainer>

                        {guide.installations.map((inst) => (
                            <Tabs.Panel key={inst.$id} id={inst.$id} className="mt-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                                    <div className="lg:col-span-8">
                                        <Surface variant="secondary" className="p-6 md:p-8 rounded-[2rem] border border-border/50 bg-surface relative overflow-hidden shadow-sm">
                                            <div className="relative z-10 space-y-10">
                                                <header className="flex justify-between items-center pb-8 border-b border-border/20">
                                                    <div className="space-y-2">
                                                        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary border border-primary/10">
                                                                <Info size={24} weight="Linear" />
                                                            </div>
                                                            {inst.target} Setup_
                                                        </h2>
                                                        <p className="text-muted-foreground font-bold tracking-widest opacity-30 uppercase text-xs">Infrastructure Deployment Guide</p>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <Tooltip>
                                                            <Button variant="secondary" isIconOnly className="rounded-xl h-10 w-10 border-border/40 bg-surface">
                                                                <History size={18} weight="Bold" />
                                                            </Button>
                                                            <Tooltip.Content className="bg-surface rounded-xl border border-border/50 p-4 shadow-2xl">
                                                                <div className="space-y-2">
                                                                    <p className="font-bold uppercase tracking-widest text-primary text-xs">Registry Logs</p>
                                                                    <p className="text-xs text-muted-foreground font-bold uppercase opacity-60">Last entry: {new Date(guide.$createdAt).toLocaleDateString()}</p>
                                                                </div>
                                                            </Tooltip.Content>
                                                        </Tooltip>
                                                        <WikiExport 
                                                            title={`${guide.title} - ${inst.target}`} 
                                                            content={inst.notes || ''} 
                                                            targetRef={contentRef} 
                                                        />
                                                        <div className="w-[1px] h-6 bg-border/20 mx-2" />
                                                        <Button 
                                                            variant="secondary" 
                                                            isIconOnly 
                                                            className="rounded-xl h-10 w-10 border-border/40 bg-surface hover:text-primary transition-all"
                                                            onPress={() => { setSelectedInst(inst); setIsInstModalOpen(true); }}
                                                        >
                                                            <Edit size={18} weight="Bold" />
                                                        </Button>
                                                        <Button 
                                                            variant="secondary" 
                                                            isIconOnly 
                                                            className="rounded-xl h-10 w-10 border-border/40 bg-surface hover:text-danger transition-all"
                                                            onPress={() => { setSelectedInst(inst); setIsDeleteModalOpen(true); }}
                                                        >
                                                            <Trash size={18} weight="Bold" />
                                                        </Button>
                                                    </div>
                                                </header>

                                                <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tighter prose-headings:uppercase prose-p:text-muted-foreground/80 prose-p:leading-relaxed prose-p:font-medium" ref={contentRef}>
                                                    {inst.notes ? (
                                                        <Markdown content={inst.notes} />
                                                    ) : (
                                                        <p className="py-12 opacity-30 text-center font-black uppercase tracking-[0.3em] text-sm">Deployment registry is empty.</p>
                                                    )}
                                                </div>

                                                <footer className="pt-8 flex flex-wrap gap-4 border-t border-border/10">
                                                    {inst.gitRepo && (
                                                        <Link href={inst.gitRepo} target="_blank" className="flex-1 md:flex-none">
                                                            <Button variant="primary" className="w-full rounded-xl h-12 px-8 font-black uppercase tracking-tight shadow-lg shadow-primary/10 text-xs">
                                                                Access Source Registry
                                                            </Button>
                                                        </Link>
                                                    )}
                                                    {inst.documentation && (
                                                        <Link href={inst.documentation} target="_blank" className="flex-1 md:flex-none">
                                                            <Button variant="secondary" className="w-full rounded-xl h-12 px-8 font-black tracking-tight border border-border/40 text-xs uppercase">
                                                                External Reference
                                                            </Button>
                                                        </Link>
                                                    )}
                                                </footer>
                                            </div>
                                            {/* Design elements */}
                                            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/2 blur-[80px] rounded-full pointer-events-none -mr-40 -mt-40" />
                                            <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-accent/2 blur-[60px] rounded-full pointer-events-none -ml-24 -mb-24" />
                                        </Surface>
                                    </div>

                                    <aside className="lg:col-span-4 space-y-8">
                                        {inst.tasks && inst.tasks.length > 0 && (
                                            <Surface variant="secondary" className="p-6 rounded-[2rem] border border-border/40 bg-surface shadow-sm">
                                                <div className="space-y-8">
                                                    <div className="flex items-center justify-between">
                                                        <div className="space-y-1">
                                                            <h3 className="text-xl font-bold tracking-tight flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary border border-primary/10">
                                                                    <ClipboardCheck size={18} weight="Bold" />
                                                                </div>
                                                                Automation Hub_
                                                            </h3>
                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-40">Frequency Checklist</p>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-full bg-accent/5 border border-accent/10 flex items-center justify-center text-accent font-bold text-xs">
                                                            {inst.tasks.length}
                                                        </div>
                                                    </div>

                                                    <ul className="space-y-4">
                                                        {inst.tasks.map((task, i) => (
                                                            <li key={i} className="flex items-start gap-4 group">
                                                                <div className="mt-1 flex items-center justify-center w-5 h-5 rounded bg-primary/5 border border-primary/10 text-primary text-[8px] font-bold flex-shrink-0 group-hover:bg-primary group-hover:text-white transition-all">
                                                                    {i + 1}
                                                                </div>
                                                                <span className="text-sm font-bold text-muted-foreground/70 group-hover:text-foreground transition-colors leading-snug tracking-tight">
                                                                    {task}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>

                                                    <Button 
                                                        variant="secondary" 
                                                        className="w-full h-12 rounded-xl font-bold uppercase tracking-widest text-xs border border-border/40 hover:bg-foreground hover:text-background transition-all"
                                                        onPress={() => { setSelectedInst(inst); setIsProjectSelectorOpen(true); }}
                                                    >
                                                        Execute Deployment
                                                    </Button>
                                                </div>
                                            </Surface>
                                        )}
                                        
                                        <Surface className="p-6 rounded-[2rem] border border-border/40 bg-surface relative overflow-hidden group hover:border-primary/20 transition-all shadow-sm">
                                            <div className="relative z-10 space-y-4">
                                                <h4 className="font-bold tracking-tight flex items-center gap-3 text-base">
                                                    <Info size={18} weight="Bold" className="text-accent" />
                                                    Pro Tip
                                                </h4>
                                                <p className="text-xs text-muted-foreground font-medium leading-relaxed opacity-60">
                                                    Documentation can be exported as markdown files. Use the export feature to save documentation locally.
                                                </p>
                                            </div>
                                            <div className="absolute bottom-0 right-0 w-24 h-24 bg-accent/5 blur-2xl rounded-full group-hover:bg-accent/10 transition-colors -mr-12 -mb-12" />
                                        </Surface>
                                    </aside>
                                </div>
                            </Tabs.Panel>
                        ))}
                    </Tabs>
                </div>
            ) : (
                <Surface variant="tertiary" className="p-20 rounded-[2rem] border border-dashed border-border/40 flex flex-col items-center text-center space-y-6 bg-surface/30 shadow-inner">
                    <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center text-muted-foreground/20 border border-border/40 shadow-sm">
                        <Plus size={32} weight="Linear" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black tracking-tighter uppercase">No targets defined</h2>
                        <p className="text-muted-foreground max-w-md text-sm opacity-60 font-medium">Guide documents can be linked to setup targets. Initialize your first setup to begin profiling.</p>
                    </div>
                    <Button variant="primary" className="rounded-xl h-12 px-8 font-black uppercase text-sm shadow-xl shadow-primary/10 tracking-tight" onPress={() => { setSelectedInst(undefined); setIsInstModalOpen(true); }}>
                        New Setup Target
                    </Button>
                </Surface>
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
