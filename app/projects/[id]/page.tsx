'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { KanbanBoard } from '@/components/KanbanBoard';
import { ProjectModal } from '@/components/ProjectModal';
import { TaskList } from '@/components/TaskList';
import { TemplateModal } from '@/components/TemplateModal';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { Project } from '@/types';
import { Button, Spinner, Surface, toast } from "@heroui/react";
import {
    AltArrowLeft as ArrowLeft,
    Calendar,
    Pen2 as Edit,
    Filter as FilterIcon,
    Widget as LayoutGrid,
    Checklist as ListTodo,
    HamburgerMenu as Rows,
    Magnifer as Search,
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
    const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [hideCompleted, setHideCompleted] = useState(false);
    const { user, privateKey } = useAuth();

    const fetchProject = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await db.getProject(id as string);
            const processedProject = data;

            if (processedProject.isEncrypted && privateKey && user) {
                try {
                    const access = await db.getAccessKey(id as string);
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
        if (project && user && privateKey) {
            const { shouldEncrypt: targetEncrypted, ...projectData } = data;
            const finalData = { ...projectData, isEncrypted: targetEncrypted };

            try {
                const userKeys = await db.getUserKeys(user.id);
                if (!userKeys) throw new Error('Vault keys not found');

                if (targetEncrypted) {
                    let docKey: CryptoKey;
                    let isNewKey = false;

                    const existingAccess = await db.getAccessKey(project.id);
                    if (existingAccess && project.isEncrypted) {
                        docKey = await decryptDocumentKey(existingAccess.encryptedKey, privateKey);
                    } else {
                        docKey = await generateDocumentKey();
                        isNewKey = true;
                    }

                    if (projectData.name || project.name) {
                        finalData.name = JSON.stringify(await encryptData(projectData.name || project.name, docKey));
                    }
                    if (projectData.description || project.description) {
                        finalData.description = JSON.stringify(await encryptData(projectData.description || project.description, docKey));
                    }

                    if (isNewKey) {
                        const encryptedDocKey = await encryptDocumentKey(docKey, userKeys.publicKey);
                        await db.grantAccess({
                            resourceId: project.id,
                            userId: user.id,
                            encryptedKey: encryptedDocKey,
                            resourceType: 'Project'
                        });
                    }
                }

                await db.updateProject(project.id, finalData);
                fetchProject();
                setIsProjectModalOpen(false);
                toast.success('Project updated');
            } catch (error) {
                console.error(error);
                toast.danger('Update failed');
            }
        }
    };

    const handleApplyTemplate = async (titles: string[]) => {
        if (project) {
            try {
                if (project.isEncrypted && privateKey && user) {
                    try {
                        const access = await db.getAccessKey(project.id);
                        if (access) {
                            const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                            const encryptedTitles = await Promise.all(titles.map(async (t) => {
                                return JSON.stringify(await encryptData(t, docKey));
                            }));
                            await db.createTasks(project.id, encryptedTitles, true);
                        } else {
                            await db.createTasks(project.id, titles, false);
                        }
                    } catch (e) {
                        console.error('Failed to encrypt tasks from template:', e);
                        await db.createTasks(project.id, titles, false);
                    }
                } else {
                    await db.createTasks(project.id, titles, false);
                }
                
                toast.success('Template applied', {
                    description: `Created ${titles.length} tasks`
                });

                // Trigger refresh by updating a local state if needed
                window.dispatchEvent(new CustomEvent('refresh-tasks'));
            } catch (error) {
                console.error(error);
                toast.danger('Failed to apply template');
            }
        }
    };

    const handleDelete = async () => {
        if (project) {
            try {
                await db.deleteProject(project.id);
                toast.success('Project deleted');
                router.push('/projects');
            } catch (error) {
                console.error(error);
                toast.danger('Delete failed');
            }
        }
    };

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
    }

    if (!project) return null;

    if (project.isEncrypted && !privateKey) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 rounded-[2rem] bg-accent/10 flex items-center justify-center text-accent border border-accent/20 shadow-2xl shadow-accent/5">
                    <Shield size={48} weight="Bold" className="animate-pulse" />
                </div>
                <div className="text-center space-y-3">
                    <h2 className="text-3xl font-bold tracking-tight uppercase italic text-foreground">Secured Project</h2>
                    <p className="text-sm text-muted-foreground font-medium opacity-60 max-w-sm mx-auto leading-relaxed">
                        This project is protected by end-to-end encryption. <br/>
                        Unlock your vault to access project details.
                    </p>
                </div>
                <div className="w-px h-12 bg-gradient-to-b from-accent/40 to-transparent" />
            </div>
        );
    }

    return (
        <div className={`mx-auto p-6 md:p-8 space-y-8 transition-all duration-500 ${viewMode === 'kanban' ? 'max-w-full' : 'max-w-[1200px]'}`}>
            <header className="flex flex-col gap-6">
                <Link href="/projects" className="inline-flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors font-bold text-xs tracking-wider group uppercase">
                    <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
                    Back to Matrix
                </Link>
                
                <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                    <div className="space-y-6 flex-1">
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-[1.5rem] bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-2xl shadow-accent/5">
                                <LayoutGrid size={28} weight="Bold" />
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
                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground font-bold uppercase tracking-wider opacity-60">
                                    <Calendar size={14} weight="Bold" className="text-accent/50" />
                                    <span>Initialized Phase: {new Date(project.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Metadata & Allocation Strip */}
                        <div className="flex flex-wrap gap-3">
                            <div className="px-4 py-2 rounded-2xl bg-surface border border-border/40 flex items-center gap-4 shadow-sm">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40 leading-none">Operational Status</span>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${project.status === 'todo' ? 'bg-muted-foreground' : project.status === 'in-progress' ? 'bg-accent' : 'bg-success'}`} />
                                    <span className="text-xs font-bold uppercase tracking-wider">{project.status.replace('-', ' ')}</span>
                                </div>
                            </div>
                            
                            {project.daysPerWeek && (
                                <div className="px-4 py-2 rounded-2xl bg-surface border border-border/40 flex items-center gap-4 shadow-sm">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40 leading-none">Resource Allocation</span>
                                    <span className="text-xs font-bold uppercase tracking-wider text-accent">{project.daysPerWeek}D / Weekly</span>
                                </div>
                            )}

                            {project.allocatedDays && (
                                <div className="px-4 py-2 rounded-2xl bg-surface border border-border/40 flex items-center gap-4 shadow-sm">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40 leading-none">Allocated Cycle</span>
                                    <span className="text-xs font-bold uppercase tracking-wider">{project.allocatedDays} Days Total</span>
                                </div>
                            )}
                        </div>
                        
                        {project.description && (
                            <p className="text-muted-foreground text-base leading-relaxed max-w-2xl font-medium opacity-80 border-l-2 border-accent/20 pl-6 py-2">
                               {project.description}
                            </p>
                        )}
                    </div>
                    
                    <div className="flex gap-2 shrink-0">
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

            <Surface className="p-0 rounded-[2.5rem] border border-border/40 bg-surface shadow-2xl shadow-accent/5 relative overflow-hidden">
                <div className="relative z-10">
                    <div className="px-8 py-6 border-b border-border/20 bg-surface-secondary/20 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-accent/10 text-accent shadow-inner shadow-accent/20">
                                <ListTodo size={24} weight="Bold" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold tracking-tight text-foreground leading-none mb-1">Roadmap</h2>
                                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider opacity-30">Execution Pipeline</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-3 bg-surface/50 p-1.5 px-3 rounded-[1.25rem] border border-border/40 shadow-inner">
                                <div className="flex items-center gap-2">
                                    <Search size={18} weight="Bold" className="text-muted-foreground/30" />
                                    <input 
                                        type="text"
                                        placeholder="SEARCH TASKS..." 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="bg-transparent border-none focus:ring-0 text-[10px] font-bold uppercase tracking-wider placeholder:text-muted-foreground/20 w-32 md:w-64"
                                    />
                                </div>
                                <div className="w-px h-4 bg-border/40 mx-2" />
                                <Button 
                                    variant={hideCompleted ? 'primary' : 'secondary'} 
                                    size="sm" 
                                    className={`h-7 px-4 rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all ${hideCompleted ? 'shadow-lg shadow-accent/40 bg-accent text-white border-transparent' : 'bg-transparent text-muted-foreground hover:bg-surface-secondary'}`}
                                    onPress={() => setHideCompleted(!hideCompleted)}
                                >
                                    <FilterIcon size={14} weight="Bold" className="mr-2" />
                                    {hideCompleted ? 'PENDING' : 'ALL'}
                                </Button>
                            </div>

                            <div className="flex items-center gap-2 bg-surface/50 p-1 rounded-[1.25rem] border border-border/40 shadow-inner">
                                <Button 
                                    variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                                    size="sm" 
                                    className={`h-8 w-12 p-0 rounded-xl flex items-center justify-center transition-all ${viewMode === 'list' ? 'bg-accent/10 text-accent shadow-sm' : 'text-muted-foreground/40 hover:text-accent'}`}
                                    onPress={() => setViewMode('list')}
                                >
                                    <Rows size={18} weight={viewMode === 'list' ? 'Bold' : 'Linear'} />
                                </Button>
                                <Button 
                                    variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} 
                                    size="sm" 
                                    className={`h-8 w-12 p-0 rounded-xl flex items-center justify-center transition-all ${viewMode === 'kanban' ? 'bg-accent/10 text-accent shadow-sm' : 'text-muted-foreground/40 hover:text-accent'}`}
                                    onPress={() => setViewMode('kanban')}
                                >
                                    <LayoutGrid size={18} weight={viewMode === 'kanban' ? 'Bold' : 'Linear'} />
                                </Button>
                            </div>

                            <Button 
                                variant="primary" 
                                size="sm" 
                                className="h-10 px-6 rounded-2xl font-bold text-[10px] uppercase tracking-wider shadow-xl shadow-accent/30 bg-accent text-white border-none" 
                                onPress={() => setIsTemplateModalOpen(true)}
                            >
                                <Sparkles size={18} weight="Bold" className="mr-2" />
                                Templates
                            </Button>
                        </div>
                    </div>
                    
                    <div className="p-6">
                        {viewMode === 'list' ? (
                            <TaskList 
                                projectId={project.id} 
                                hideHeader 
                                searchQuery={searchQuery}
                                hideCompleted={hideCompleted}
                            />
                        ) : (
                            <KanbanBoard 
                                projectId={project.id} 
                                searchQuery={searchQuery}
                                hideCompleted={hideCompleted}
                            />
                        )}
                    </div>
                </div>
                
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
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
        </div>
    );
}
