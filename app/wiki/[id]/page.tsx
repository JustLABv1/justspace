'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { InstallationModal } from '@/components/InstallationModal';
import { Markdown } from '@/components/Markdown';
import { ProjectSelectorModal } from '@/components/ProjectSelectorModal';
import { WikiExport } from '@/components/WikiExport';
import { db } from '@/lib/db';
import { InstallationTarget, WikiGuide } from '@/types';
import { Button, Card, Spinner, Surface, Tabs, Tooltip } from "@heroui/react";
import { ArrowLeft, ClipboardCheck, Edit, FileText, Github, History, Info, Plus, Trash } from "lucide-react";
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function WikiDetailPage() {
    const { id } = useParams() as { id: string };
    const [guide, setGuide] = useState<(WikiGuide & { installations: InstallationTarget[] }) | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedInst, setSelectedInst] = useState<InstallationTarget | undefined>(undefined);
    const [isInstModalOpen, setIsInstModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchGuide();
    }, [id]);

    const fetchGuide = async () => {
        setIsLoading(true);
        try {
            const data = await db.getGuide(id);
            setGuide(data as any);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateOrUpdateInst = async (data: Partial<InstallationTarget>) => {
        if (selectedInst) {
            await db.updateInstallation(selectedInst.$id, data);
        } else {
            await db.createInstallation(data as Omit<InstallationTarget, '$id' | '$createdAt'>);
        }
        fetchGuide();
    };

    const handleDeleteInst = async () => {
        if (selectedInst) {
            await db.deleteInstallation(selectedInst.$id);
            fetchGuide();
        }
    };

    const handleApplyTasks = async (projectId: string) => {
        if (selectedInst?.tasks && selectedInst.tasks.length > 0) {
            await db.createTasks(projectId, selectedInst.tasks);
        }
    };

    if (isLoading) {
        return <div className="p-8 flex justify-center"><Spinner size="lg" /></div>;
    }

    if (!guide) {
        return <div className="p-8 text-center text-muted-foreground">Guide not found.</div>;
    }

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <Link href="/wiki" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
                <ArrowLeft size={16} className="mr-2" />
                Back to Wiki
            </Link>

            <header className="mb-10 flex justify-between items-start">
                <div>
                    <h1 className="text-4xl font-bold">{guide.title}</h1>
                    <p className="text-muted-foreground mt-2 text-lg">{guide.description}</p>
                </div>
                <Button variant="primary" onPress={() => { setSelectedInst(undefined); setIsInstModalOpen(true); }}>
                    <Plus size={18} className="mr-2" />
                    Add Target
                </Button>
            </header>

            {guide.installations.length > 0 ? (
                <Tabs defaultSelectedKey={guide.installations[0].$id} variant="secondary">
                    <Tabs.ListContainer>
                        <Tabs.List aria-label="Installation targets">
                            {guide.installations.map((inst) => (
                                <Tabs.Tab key={inst.$id} id={inst.$id}>
                                    {inst.target}
                                    <Tabs.Indicator />
                                </Tabs.Tab>
                            ))}
                        </Tabs.List>
                    </Tabs.ListContainer>

                    {guide.installations.map((inst) => (
                        <Tabs.Panel key={inst.$id} id={inst.$id} className="mt-8">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-2 space-y-6">
                                    <Card className="p-6 h-full">
                                        <Card.Header className="flex justify-between items-start">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2 mb-2 text-primary font-medium">
                                                    <Info size={18} />
                                                    <span>Installation Notes</span>
                                                </div>
                                                <Card.Title className="text-xl">Instructions for {inst.target}</Card.Title>
                                            </div>
                                            <div className="flex gap-2">
                                                <Tooltip>
                                                    <Button variant="ghost" isIconOnly size="sm">
                                                        <History size={16} />
                                                    </Button>
                                                    <Tooltip.Content>
                                                        <div className="p-2 text-xs">
                                                            <p className="font-bold mb-1 border-b border-border pb-1">Version History</p>
                                                            <p className="text-muted-foreground italic">Current: {new Date(guide.$createdAt).toLocaleDateString()}</p>
                                                            <p className="mt-1">Initial deployment guide created.</p>
                                                        </div>
                                                    </Tooltip.Content>
                                                </Tooltip>
                                                <WikiExport 
                                                    title={`${guide.title} - ${inst.target}`} 
                                                    content={inst.notes || ''} 
                                                    targetRef={contentRef} 
                                                />
                                                <Button 
                                                    variant="ghost" 
                                                    isIconOnly 
                                                    size="sm"
                                                    onPress={() => { setSelectedInst(inst); setIsInstModalOpen(true); }}
                                                >
                                                    <Edit size={16} />
                                                </Button>
                                                <Button 
                                                    variant="ghost" 
                                                    isIconOnly 
                                                    size="sm"
                                                    className="text-danger"
                                                    onPress={() => { setSelectedInst(inst); setIsDeleteModalOpen(true); }}
                                                >
                                                    <Trash size={16} />
                                                </Button>
                                            </div>
                                        </Card.Header>
                                        <Card.Content className="mt-4" ref={contentRef}>
                                            {inst.notes ? (
                                                <Markdown content={inst.notes} />
                                            ) : (
                                                <p className="text-muted-foreground italic">No specific notes provided.</p>
                                            )}
                                            <div className="mt-6 flex flex-wrap gap-4">
                                                {inst.gitRepo && (
                                                    <Link href={inst.gitRepo} target="_blank">
                                                        <Button variant="primary">
                                                            <Github size={18} className="mr-2" />
                                                            Git Repository
                                                        </Button>
                                                    </Link>
                                                )}
                                                {inst.documentation && (
                                                    <Link href={inst.documentation} target="_blank">
                                                        <Button variant="secondary">
                                                            <FileText size={18} className="mr-2" />
                                                            Official Docs
                                                        </Button>
                                                    </Link>
                                                )}
                                            </div>
                                        </Card.Content>
                                    </Card>
                                </div>

                                <aside className="space-y-6">
                                    {inst.tasks && inst.tasks.length > 0 && (
                                        <Surface variant="secondary" className="p-6 rounded-2xl border border-border h-fit">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="font-bold flex items-center gap-2">
                                                    <ClipboardCheck size={18} className="text-primary" />
                                                    Setup Checklist
                                                </h3>
                                                <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                                    {inst.tasks.length} Tasks
                                                </span>
                                            </div>
                                            <ul className="space-y-3 mb-6">
                                                {inst.tasks.map((task, i) => (
                                                    <li key={i} className="flex items-start gap-3 group">
                                                        <div className="mt-1">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                                                        </div>
                                                        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors leading-tight">
                                                            {task}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <Button 
                                                variant="primary" 
                                                className="w-full shadow-lg shadow-primary/20"
                                                onPress={() => { setSelectedInst(inst); setIsProjectSelectorOpen(true); }}
                                            >
                                                <Plus size={16} className="mr-2" />
                                                Add to Project
                                            </Button>
                                        </Surface>
                                    )}

                                    <Surface variant="tertiary" className="p-6 rounded-2xl border border-border h-fit">
                                        <h3 className="font-bold mb-4">Quick Links</h3>
                                        <ul className="space-y-3">
                                            <li>
                                                <Link href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                    Helm Charts
                                                </Link>
                                            </li>
                                        </ul>
                                    </Surface>
                                </aside>
                            </div>
                        </Tabs.Panel>
                    ))}
                </Tabs>
            ) : (
                <div className="py-20 text-center border-2 border-dashed border-border rounded-xl">
                    <p className="text-muted-foreground">No installation targets found. Add your first one!</p>
                </div>
            )}

            <InstallationModal 
                isOpen={isInstModalOpen}
                onClose={() => setIsInstModalOpen(false)}
                onSubmit={handleCreateOrUpdateInst}
                installation={selectedInst}
                guideId={id}
            />

            <DeleteModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeleteInst}
                title="Delete Target"
                message={`Are you sure you want to delete the "${selectedInst?.target}" installation target?`}
            />

            <ProjectSelectorModal 
                isOpen={isProjectSelectorOpen}
                onClose={() => setIsProjectSelectorOpen(false)}
                onSelect={handleApplyTasks}
            />
        </div>
    );
}
