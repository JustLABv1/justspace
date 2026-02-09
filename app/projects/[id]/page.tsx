'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { KanbanBoard } from '@/components/KanbanBoard';
import { ProjectModal } from '@/components/ProjectModal';
import { TaskList } from '@/components/TaskList';
import { TemplateModal } from '@/components/TemplateModal';
import { db } from '@/lib/db';
import { Project } from '@/types';
import { Button, Spinner, Surface } from "@heroui/react";
import {
  AltArrowLeft as ArrowLeft,
  Calendar,
  Pen2 as Edit,
  Widget as LayoutGrid,
  Checklist as ListTodo,
  MagicStick as Sparkles,
  TrashBinMinimalistic as Trash
} from "@solar-icons/react";
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ProjectDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

    useEffect(() => {
        if (id) {
            fetchProject();
        }
    }, [id]);

    const fetchProject = async () => {
        setIsLoading(true);
        try {
            const data = await db.getProject(id as string);
            setProject(data);
        } catch (error) {
            console.error(error);
            router.push('/projects');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdate = async (data: Partial<Project>) => {
        if (project) {
            await db.updateProject(project.$id, data);
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

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
    }

    if (!project) return null;

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
                                <h1 className="text-4xl font-bold tracking-tight text-foreground leading-none">{project.name}</h1>
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
        </div>
    );
}
