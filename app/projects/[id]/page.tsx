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
import { Button, InputGroup, Spinner, Surface, toast } from "@heroui/react";
import {
    AltArrowLeft as ArrowLeft,
    Calendar,
    Pen2 as Edit,
    Filter as FilterIcon,
    Widget as LayoutGrid,
    Checklist as ListTodo,
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

            try {
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
                        const access = await db.getAccessKey(project.$id, user.$id);
                        if (access) {
                            const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                            const encryptedTitles = await Promise.all(titles.map(async (t) => {
                                return JSON.stringify(await encryptData(t, docKey));
                            }));
                            await db.createTasks(project.$id, encryptedTitles, true, user.$id);
                        } else {
                            await db.createTasks(project.$id, titles, false, user.$id);
                        }
                    } catch (e) {
                        console.error('Failed to encrypt tasks from template:', e);
                        await db.createTasks(project.$id, titles, false, user.$id);
                    }
                } else {
                    await db.createTasks(project.$id, titles, false, user?.$id);
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
                await db.deleteProject(project.$id);
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
                    <h2 className="text-3xl font-black tracking-tighter uppercase italic text-foreground">Secured Project</h2>
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
                <Link href="/projects" className="inline-flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors font-bold text-xs tracking-widest group uppercase">
                    <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
                    Back to Matrix
                </Link>
                
                <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                    <div className="space-y-6 flex-1">
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-[1.5rem] bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-2xl shadow-accent/5">
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
                                    <Calendar size={14} className="text-accent/50" />
                                    <span>Initialized Phase: {new Date(project.$createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Metadata & Allocation Strip */}
                        <div className="flex flex-wrap gap-3">
                            <div className="px-4 py-2 rounded-2xl bg-surface border border-border/40 flex items-center gap-4 shadow-sm">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 leading-none">Operational Status</span>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${project.status === 'todo' ? 'bg-muted-foreground' : project.status === 'in-progress' ? 'bg-accent' : 'bg-success'}`} />
                                    <span className="text-xs font-bold uppercase tracking-widest">{project.status.replace('-', ' ')}</span>
                                </div>
                            </div>
                            
                            {project.daysPerWeek && (
                                <div className="px-4 py-2 rounded-2xl bg-surface border border-border/40 flex items-center gap-4 shadow-sm">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 leading-none">Resource Allocation</span>
                                    <span className="text-xs font-bold uppercase tracking-widest text-accent">{project.daysPerWeek}D / Weekly</span>
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

            <Surface className="p-0 rounded-[2rem] border border-border/40 bg-surface shadow-2xl shadow-accent/5 relative overflow-hidden">
                <div className="relative z-10">
                    <div className="p-6 border-b border-border/20 bg-surface-secondary/30">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-1">
                                <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-3">
                                    <ListTodo size={20} className="text-accent" />
                                    Project Roadmap
                                </h2>
                                <p className="text-muted-foreground text-[11px] font-bold uppercase tracking-widest opacity-40">Define milestones and track technical execution.</p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <InputGroup className="w-full md:w-64 h-9 bg-surface border border-border/40 hover:border-accent/20 focus-within:!border-accent/40 rounded-xl transition-all shadow-none overflow-hidden">
                                    <InputGroup.Prefix className="pl-3.5 pr-1">
                                        <Search size={14} weight="Linear" className="text-muted-foreground/40" />
                                    </InputGroup.Prefix>
                                    <InputGroup.Input 
                                        placeholder="Search tasks..." 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="text-xs font-medium bg-transparent border-none focus:ring-0 h-full w-full"
                                    />
                                </InputGroup>

                                <Button 
                                    variant={hideCompleted ? 'primary' : 'secondary'} 
                                    size="sm" 
                                    className={`h-9 px-4 rounded-xl font-bold text-[9px] uppercase tracking-widest border border-border/40 transition-all ${hideCompleted ? 'shadow-lg shadow-accent/20' : 'bg-surface hover:bg-surface-secondary'}`}
                                    onPress={() => setHideCompleted(!hideCompleted)}
                                >
                                    <FilterIcon size={14} weight="Bold" className={`mr-2 ${hideCompleted ? 'text-white' : 'text-accent'}`} />
                                    {hideCompleted ? 'Pending Only' : 'Show All'}
                                </Button>

                                <div className="h-4 w-px bg-border/40 mx-1 hidden lg:block" />

                                <div className="flex bg-surface/50 p-1 rounded-xl border border-border/40 shadow-sm">
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
                                <Button variant="primary" size="sm" className="rounded-xl h-9 px-4 font-bold text-[10px] uppercase tracking-widest shadow-xl shadow-accent/10" onPress={() => setIsTemplateModalOpen(true)}>
                                    <Sparkles size={14} className="mr-2" />
                                    Templates
                                </Button>
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-6">
                        {viewMode === 'list' ? (
                            <TaskList 
                                projectId={project.$id} 
                                hideHeader 
                                searchQuery={searchQuery}
                                hideCompleted={hideCompleted}
                            />
                        ) : (
                            <KanbanBoard 
                                projectId={project.$id} 
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
