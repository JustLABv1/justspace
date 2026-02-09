'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { InstallationModal } from '@/components/InstallationModal';
import { Markdown } from '@/components/Markdown';
import { ProjectSelectorModal } from '@/components/ProjectSelectorModal';
import { WikiExport } from '@/components/WikiExport';
import { db } from '@/lib/db';
import { InstallationTarget, WikiGuide } from '@/types';
import { Button, Chip, Spinner, Surface, Tabs, Tooltip } from "@heroui/react";
import { ArrowLeft, ClipboardCheck, Edit, FileText, Github, History, Info, Plus, Trash } from "lucide-react";
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function WikiDetailPage() {
    const { id } = useParams() as { id: string };
    const [guide, setGuide] = useState<(WikiGuide & { installations: InstallationTarget[] }) | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedInst, setSelectedInst] = useState<InstallationTarget | undefined>(undefined);
    const [isInstModalOpen, setIsInstModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    const fetchGuide = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await db.getGuide(id);
            setGuide(data as (WikiGuide & { installations: InstallationTarget[] }));
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchGuide();
    }, [fetchGuide]);

    const handleCreateOrUpdateInst = async (data: Partial<InstallationTarget>) => {
        if (selectedInst?.$id) {
            await db.updateInstallation(selectedInst.$id, data);
        } else {
            await db.createInstallation({
                ...data,
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
            await db.createTasks(projectId, selectedInst.tasks);
        }
        setIsProjectSelectorOpen(false);
    };

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
    }

    if (!guide) {
        return <div className="p-8 text-center text-muted-foreground">Guide not found.</div>;
    }

    return (
        <div className="max-w-[1400px] mx-auto p-6 md:p-10 space-y-10">
            <nav>
                <Link href="/wiki" className="group inline-flex items-center text-sm font-bold text-muted-foreground hover:text-primary transition-colors bg-surface-lowest px-4 py-2 rounded-full border border-border/50">
                    <ArrowLeft size={16} className="mr-2 group-hover:-translate-x-1 transition-transform" />
                    Knowledge Base
                </Link>
            </nav>

            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Chip variant="soft" size="sm" color="accent">Documentation</Chip>
                        {guide.installations.length > 0 && (
                            <Chip variant="soft" size="sm" color="success">{guide.installations.length} Targets</Chip>
                        )}
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter leading-tight">{guide.title}</h1>
                    <p className="text-xl text-muted-foreground max-w-3xl leading-relaxed">{guide.description}</p>
                </div>
                <div className="flex gap-3 bg-surface-lowest border border-border p-1.5 rounded-2xl shadow-sm self-stretch md:self-auto">
                    <Button variant="primary" className="rounded-xl h-11 px-6 shadow-lg shadow-primary/20" onPress={() => { setSelectedInst(undefined); setIsInstModalOpen(true); }}>
                        <Plus size={18} className="mr-2" />
                        Add Target
                    </Button>
                </div>
            </header>

            {guide.installations.length > 0 ? (
                <div className="space-y-8">
                    <Tabs defaultSelectedKey={guide.installations[0].$id} variant="secondary">
                        <Tabs.ListContainer className="p-1 bg-surface-secondary/50 rounded-2xl border border-border/40 w-fit">
                            <Tabs.List aria-label="Installation targets" className="gap-2">
                                {guide.installations.map((inst) => (
                                    <Tabs.Tab key={inst.$id} id={inst.$id} className="rounded-xl font-bold px-6">
                                        {inst.target}
                                        <Tabs.Indicator className="bg-primary h-0.5 rounded-full" />
                                    </Tabs.Tab>
                                ))}
                            </Tabs.List>
                        </Tabs.ListContainer>

                        {guide.installations.map((inst) => (
                            <Tabs.Panel key={inst.$id} id={inst.$id} className="mt-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                                    <div className="lg:col-span-8">
                                        <Surface variant="secondary" className="p-8 md:p-12 rounded-[2.5rem] border border-border/50 bg-gradient-to-br from-surface to-surface-lowest relative overflow-hidden">
                                            <div className="relative z-10 space-y-10">
                                                <header className="flex justify-between items-center pb-8 border-b border-border/50">
                                                    <div className="space-y-1">
                                                        <h2 className="text-3xl font-black tracking-tight flex items-center gap-3">
                                                            <Info size={28} className="text-primary" />
                                                            {inst.target} Setup
                                                        </h2>
                                                        <p className="text-muted-foreground font-medium">Step-by-step deployment instructions</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Tooltip>
                                                            <Button variant="ghost" isIconOnly className="rounded-full h-10 w-10">
                                                                <History size={18} />
                                                            </Button>
                                                            <Tooltip.Content>
                                                                <div className="p-3 text-xs space-y-2 max-w-[200px]">
                                                                    <p className="font-black uppercase tracking-wider text-primary">History</p>
                                                                    <p className="border-t border-border pt-2 text-muted-foreground italic">Last update: {new Date(guide.$createdAt).toLocaleDateString()}</p>
                                                                </div>
                                                            </Tooltip.Content>
                                                        </Tooltip>
                                                        <WikiExport 
                                                            title={`${guide.title} - ${inst.target}`} 
                                                            content={inst.notes || ''} 
                                                            targetRef={contentRef} 
                                                        />
                                                        <div className="w-[1px] h-6 bg-border mx-2" />
                                                        <Button 
                                                            variant="ghost" 
                                                            isIconOnly 
                                                            className="rounded-full h-10 w-10 hover:bg-primary/10 hover:text-primary"
                                                            onPress={() => { setSelectedInst(inst); setIsInstModalOpen(true); }}
                                                        >
                                                            <Edit size={18} />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            isIconOnly 
                                                            className="rounded-full h-10 w-10 hover:bg-danger/10 hover:text-danger"
                                                            onPress={() => { setSelectedInst(inst); setIsDeleteModalOpen(true); }}
                                                        >
                                                            <Trash size={18} />
                                                        </Button>
                                                    </div>
                                                </header>

                                                <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tighter prose-p:text-muted-foreground prose-p:leading-relaxed" ref={contentRef}>
                                                    {inst.notes ? (
                                                        <Markdown content={inst.notes} />
                                                    ) : (
                                                        <p className="italic py-10 opacity-50">No specific documentation notes available for this target yet.</p>
                                                    )}
                                                </div>

                                                <footer className="pt-10 flex flex-wrap gap-4">
                                                    {inst.gitRepo && (
                                                        <Link href={inst.gitRepo} target="_blank">
                                                            <Button variant="primary" className="rounded-2xl h-14 px-8 font-bold shadow-xl shadow-primary/10">
                                                                <Github size={20} className="mr-3" />
                                                                Access Repository
                                                            </Button>
                                                        </Link>
                                                    )}
                                                    {inst.documentation && (
                                                        <Link href={inst.documentation} target="_blank">
                                                            <Button variant="secondary" className="rounded-2xl h-14 px-8 font-bold border-2 border-border/50">
                                                                <FileText size={20} className="mr-3" />
                                                                External Resources
                                                            </Button>
                                                        </Link>
                                                    )}
                                                </footer>
                                            </div>
                                            <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
                                        </Surface>
                                    </div>

                                    <aside className="lg:col-span-4 space-y-8">
                                        {inst.tasks && inst.tasks.length > 0 && (
                                            <Surface variant="tertiary" className="p-8 rounded-[2rem] border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent h-fit">
                                                <div className="space-y-8">
                                                    <div className="flex items-center justify-between">
                                                        <div className="space-y-1">
                                                            <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
                                                                <ClipboardCheck size={22} className="text-primary" />
                                                                Automation Hub
                                                            </h3>
                                                            <p className="text-xs font-bold uppercase tracking-widest text-primary/60">Deployment Checklist</p>
                                                        </div>
                                                        <Chip size="sm" color="accent" variant="soft" className="font-bold">{inst.tasks.length} Steps</Chip>
                                                    </div>

                                                    <ul className="space-y-4">
                                                        {inst.tasks.map((task, i) => (
                                                            <li key={i} className="flex items-start gap-4 group p-3 rounded-2xl hover:bg-surface-lowest/50 transition-colors">
                                                                <div className="mt-1 flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary text-[10px] font-black italic">
                                                                    0{i + 1}
                                                                </div>
                                                                <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
                                                                    {task}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>

                                                    <Button 
                                                        variant="secondary" 
                                                        className="w-full h-14 rounded-2xl font-black italic tracking-tight"
                                                        onPress={() => { setSelectedInst(inst); setIsProjectSelectorOpen(true); }}
                                                    >
                                                        Deploy to Project
                                                    </Button>
                                                </div>
                                            </Surface>
                                        )}
                                        
                                        <Surface className="p-8 rounded-[2rem] border border-border/40 bg-surface-lowest relative overflow-hidden group hover:border-primary/20 transition-colors">
                                            <div className="relative z-10 space-y-4">
                                                <h4 className="font-bold flex items-center gap-2">
                                                    <Info size={18} className="text-accent" />
                                                    Quick Tip
                                                </h4>
                                                <p className="text-xs text-muted-foreground leading-relaxed">
                                                    Want to export this guide? Use the export button at the top to download it as a high-quality PDF or Markdown file for offline troubleshooting.
                                                </p>
                                            </div>
                                            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-accent/5 blur-3xl rounded-full group-hover:bg-accent/10 transition-colors" />
                                        </Surface>
                                    </aside>
                                </div>
                            </Tabs.Panel>
                        ))}
                    </Tabs>
                </div>
            ) : (
                <Surface variant="tertiary" className="p-20 rounded-[3rem] border border-dashed border-border flex flex-col items-center text-center space-y-6">
                    <div className="w-20 h-20 bg-surface-secondary rounded-[2rem] flex items-center justify-center text-muted-foreground">
                        <Plus size={40} />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black">No installation targets defined</h2>
                        <p className="text-muted-foreground max-w-sm">Every guide needs a target. Add your first deployment target (e.g., Azure VM, Local Docker) to get started.</p>
                    </div>
                    <Button variant="primary" className="rounded-2xl h-12 px-8 font-bold" onPress={() => { setSelectedInst(undefined); setIsInstModalOpen(true); }}>
                        Create First Target
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
