'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { KanbanBoard } from '@/components/KanbanBoard';
import { ProjectModal } from '@/components/ProjectModal';
import { ShareModal } from '@/components/ShareModal';
import { TaskList } from '@/components/TaskList';
import { TemplateModal } from '@/components/TemplateModal';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { Project } from '@/types';
import { Button, Spinner, Surface } from "@heroui/react";
import {
    AltArrowLeft as ArrowLeft,
    Calendar,
    Pen2 as Edit,
    Widget as LayoutGrid,
    Checklist as ListTodo,
    ShareCircle as Share,
    ShieldKeyhole as Shield,
    MagicStick as Sparkles,
    TrashBinMinimalistic as Trash
} from "@solar-icons/react";
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function ProjectDetailPage() {
    const { id } = useParams() as { id: string };
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
    const { user, privateKey } = useAuth();

    const fetchProject = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await db.getProject(id as string);
            const processedProject = data;

            if (processedProject.isEncrypted && privateKey && user) {
                try {
                    const access = await db.getAccessKey(id as string, user.$id);
                    if (access) {
                        const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                        
                        const nameData = JSON.parse(processedProject.name);
                        const descData = JSON.parse(processedProject.description);
                        
                        processedProject.name = await decryptData(nameData, docKey);
                        processedProject.description = await decryptData(descData, docKey);
                    }
                } catch (e) {
                    console.error('Failed to decrypt project:', e);
                }
            }
            setProject(processedProject);
        } catch (error) {
            console.error(error);
            router.push('/projects');
        } finally {
            setIsLoading(false);
        }
    }, [id, privateKey, user, router]);

    useEffect(() => {
        if (id) {
            fetchProject();
        }
    }, [id, fetchProject]);

    const handleUpdate = async (data: Partial<Project> & { shouldEncrypt?: boolean }) => {
        if (project) {
            const { shouldEncrypt, ...projectData } = data;
            const finalData = { ...projectData };

            if (shouldEncrypt && user) {
                // If turning on encryption for existing project
                // (Note: This is simplified, usually we'd need to re-encrypt old data if it wasn't encrypted)
                const userKeys = await db.getUserKeys(user.$id);
                if (userKeys) {
                    const docKey = await generateDocumentKey();
                    const encryptedName = await encryptData(projectData.name || project.name, docKey);
                    const encryptedDesc = await encryptData(projectData.description || project.description, docKey);

                    finalData.name = JSON.stringify(encryptedName);
                    finalData.description = JSON.stringify(encryptedDesc);
                    finalData.isEncrypted = true;

                    const encryptedDocKey = await encryptDocumentKey(docKey, userKeys.publicKey);
                    await db.grantAccess({
                        resourceId: project.$id,
                        userId: user.$id,
                        encryptedKey: encryptedDocKey,
                        resourceType: 'Project'
                    });
                }
            } else if (project.isEncrypted && privateKey && user) {
                // Keep encrypted if it already was
                const access = await db.getAccessKey(project.$id, user.$id);
                if (access) {
                    const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    if (projectData.name) {
                        finalData.name = JSON.stringify(await encryptData(projectData.name, docKey));
                    }
                    if (projectData.description) {
                        finalData.description = JSON.stringify(await encryptData(projectData.description, docKey));
                    }
                }
            }

            await db.updateProject(project.$id, finalData);
            fetchProject();
            setIsProjectModalOpen(false);
        }
    };

    const handleApplyTemplate = async (tasks: string[]) => {
        if (project) {
            await db.createTasks(project.$id, tasks);
            // TaskList should refresh if it has its own state or we can force a re-render
            // For now, let's just refresh the project data if needed, or assume TaskList handles it.
            // Since TaskList handles its own fetching based on projectId, we might need a way to trigger it.
        }
    };

    const handleDelete = async () => {
        if (project) {
            await db.deleteProject(project.$id);
            router.push('/projects');
        }
    };

    const handleShare = async (email: string) => {
        if (!project || !privateKey || !user) return;

        try {
            const recipientKeys = await db.findUserKeysByEmail(email);
            if (!recipientKeys) throw new Error('Recipient has no vault setup');

            const access = await db.getAccessKey(id, user.$id);
            if (!access) throw new Error('You do not have keys for this project');

            const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
            const wrappedKeyForRecipient = await encryptDocumentKey(docKey, recipientKeys.publicKey);

            await db.grantAccess({
                resourceId: id,
                resourceType: 'Project',
                userId: recipientKeys.userId,
                encryptedKey: wrappedKeyForRecipient
            });
        } catch (error) {
            console.error('Sharing failed:', error);
            throw error;
        }
    };

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
    }

    if (!project) return null;

    if (project.isEncrypted && !privateKey) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 rounded-[2rem] bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-2xl shadow-primary/5">
                    <Shield size={48} weight="Bold" className="animate-pulse" />
                </div>
                <div className="text-center space-y-3">
                    <h2 className="text-3xl font-black tracking-tighter uppercase italic text-foreground">Mission Data Locked_</h2>
                    <p className="text-sm text-muted-foreground font-medium opacity-60 max-w-sm mx-auto leading-relaxed">
                        This environment is secured with mission-critical encryption. <br/>
                        Authorize your vault to access operational archives.
                    </p>
                </div>
                <div className="w-px h-12 bg-gradient-to-b from-primary/40 to-transparent" />
            </div>
        );
    }

    return (
        <div className="max-w-[1200px] mx-auto p-6 md:p-8 space-y-8">
            <header className="flex flex-col gap-6">
                <Link href="/projects" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-bold text-xs tracking-widest group uppercase">
                    <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
                    Back to Matrix
                </Link>
                
                <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                    <div className="space-y-6 flex-1">
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-[1.5rem] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-2xl shadow-primary/5">
                                <LayoutGrid size={28} />
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-4xl font-bold tracking-tight text-foreground leading-none">{project.name}</h1>
                                    {project.isEncrypted && (
                                        <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 border border-orange-500/20" title="End-to-End Encrypted">
                                            <Shield size={18} weight="Bold" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground font-bold uppercase tracking-widest opacity-60">
                                    <Calendar size={14} className="text-primary/50" />
                                    <span>Initialized Phase: {new Date(project.$createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Metadata & Allocation Strip */}
                        <div className="flex flex-wrap gap-3">
                            <div className="px-4 py-2 rounded-2xl bg-surface border border-border/40 flex items-center gap-4 shadow-sm">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 leading-none">Operational Status</span>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${project.status === 'todo' ? 'bg-muted-foreground' : project.status === 'in-progress' ? 'bg-primary' : 'bg-success'}`} />
                                    <span className="text-xs font-bold uppercase tracking-widest">{project.status.replace('-', ' ')}</span>
                                </div>
                            </div>
                            
                            {project.daysPerWeek && (
                                <div className="px-4 py-2 rounded-2xl bg-surface border border-border/40 flex items-center gap-4 shadow-sm">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 leading-none">Resource Allocation</span>
                                    <span className="text-xs font-bold uppercase tracking-widest text-primary">{project.daysPerWeek}D / Weekly</span>
                                </div>
                            )}

                            {project.allocatedDays && (
                                <div className="px-4 py-2 rounded-2xl bg-surface border border-border/40 flex items-center gap-4 shadow-sm">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 leading-none">Allocated Cycle</span>
                                    <span className="text-xs font-bold uppercase tracking-widest">{project.allocatedDays} Days Total</span>
                                </div>
                            )}
                        </div>
                        
                        {project.description && (
                            <p className="text-muted-foreground text-base leading-relaxed max-w-2xl font-medium opacity-80 border-l-2 border-primary/20 pl-6 py-2">
                               {project.description}
                            </p>
                        )}
                    </div>
                    
                    <div className="flex gap-2 shrink-0">
                        {project.isEncrypted && (
                            <Button variant="primary" className="rounded-xl h-10 px-6 font-bold text-xs uppercase" onPress={() => setIsShareModalOpen(true)}>
                                <Share size={16} className="mr-2" />
                                Share
                            </Button>
                        )}
                        <Button variant="secondary" className="rounded-xl h-10 px-6 font-bold text-xs uppercase border border-border/40" onPress={() => setIsProjectModalOpen(true)}>
                            <Edit size={16} className="mr-2" />
                            Modify
                        </Button>
                        <Button variant="ghost" className="rounded-xl h-10 px-6 font-bold text-xs uppercase text-danger hover:bg-danger/10" onPress={() => setIsDeleteModalOpen(true)}>
                            <Trash size={16} className="mr-2" />
                            Purge
                        </Button>
                    </div>
                </div>
            </header>

            <Surface className="p-0 rounded-[2rem] border border-border/40 bg-surface shadow-2xl shadow-primary/5 relative overflow-hidden">
                <div className="relative z-10">
                    <div className="p-6 border-b border-border/20 bg-surface-secondary/30">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-3">
                                    <ListTodo size={20} className="text-primary" />
                                    Project Roadmap
                                </h2>
                                <p className="text-muted-foreground text-[11px] font-bold uppercase tracking-widest opacity-40">Define milestones and track technical execution.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex bg-surface p-1 rounded-xl border border-border/40 mr-2">
                                    <Button 
                                        variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                                        size="sm" 
                                        className="h-7 rounded-lg font-bold text-[9px] uppercase tracking-wider"
                                        onPress={() => setViewMode('list')}
                                    >
                                        List
                                    </Button>
                                    <Button 
                                        variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} 
                                        size="sm" 
                                        className="h-7 rounded-lg font-bold text-[9px] uppercase tracking-wider"
                                        onPress={() => setViewMode('kanban')}
                                    >
                                        Kanban
                                    </Button>
                                </div>
                                <Button variant="primary" size="sm" className="rounded-xl font-bold text-[10px] uppercase tracking-widest" onPress={() => setIsTemplateModalOpen(true)}>
                                    <Sparkles size={14} className="mr-2" />
                                    Apply Template
                                </Button>
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-6">
                        {viewMode === 'list' ? (
                            <TaskList projectId={project.$id} hideHeader />
                        ) : (
                            <KanbanBoard projectId={project.$id} />
                        )}
                    </div>
                </div>
                
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            </Surface>

            <ProjectModal 
                isOpen={isProjectModalOpen} 
                onClose={() => setIsProjectModalOpen(false)} 
                onSubmit={handleUpdate}
                project={project}
            />

            <TemplateModal 
                isOpen={isTemplateModalOpen}
                onClose={() => setIsTemplateModalOpen(false)}
                onApply={handleApplyTemplate}
            />

            <DeleteModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDelete}
                title="Archive Project"
                message={`Are you sure you want to archive "${project.name}"? This will move it from the active pipeline.`}
            />
            <ShareModal 
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                onShare={handleShare}
            />        </div>
    );
}
