'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { ProjectModal } from '@/components/ProjectModal';
import { TaskList } from '@/components/TaskList';
import { db } from '@/lib/db';
import { Project } from '@/types';
import { Button, Chip, Spinner, Surface } from "@heroui/react";
import { Calendar, Edit, LayoutGrid, ListTodo, Plus, Trash } from "lucide-react";
import { useEffect, useState } from 'react';

type ViewMode = 'grid' | 'kanban';

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('kanban');
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedProject, setSelectedProject] = useState<Project | undefined>(undefined);

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        setIsLoading(true);
        try {
            const data = await db.listProjects();
            setProjects(data.documents);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateOrUpdate = async (data: Partial<Project>) => {
        if (selectedProject?.$id) {
            await db.updateProject(selectedProject.$id, data);
        } else {
            await db.createProject(data as Omit<Project, '$id' | '$createdAt'>);
        }
        setIsProjectModalOpen(false);
        fetchProjects();
    };

    const handleDelete = async () => {
        if (selectedProject) {
            await db.deleteProject(selectedProject.$id);
            setIsDeleteModalOpen(false);
            fetchProjects();
        }
    };

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
    }

    const columns: { label: string; status: Project['status']; color: 'default' | 'accent' | 'success' }[] = [
        { label: 'Backlog', status: 'todo', color: 'default' },
        { label: 'In Progress', status: 'in-progress', color: 'accent' },
        { label: 'Completed', status: 'completed', color: 'success' },
    ];

    return (
        <div className="max-w-[1600px] mx-auto p-6 md:p-10 space-y-10">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Chip variant="soft" color="accent">Active Pipeline</Chip>
                        <Chip variant="soft" size="sm" className="bg-surface-secondary">{projects.length} Projects</Chip>
                    </div>
                    <h1 className="text-4xl font-black tracking-tighter">Projects Hub</h1>
                    <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
                        Orchestrate your consulting projects with ease. Track tasks, manage timelines, and deliver results.
                    </p>
                </div>
                <div className="flex items-center gap-3 bg-surface-lowest p-1.5 rounded-2xl border border-border shadow-sm self-stretch md:self-auto">
                    <div className="flex bg-surface p-1 rounded-xl border border-border/50">
                        <Button 
                            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} 
                            size="sm"
                            onPress={() => setViewMode('kanban')}
                            className="h-9 px-4 rounded-lg"
                        >
                            <ListTodo size={16} className="mr-2" />
                            Kanban
                        </Button>
                        <Button 
                            variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                            size="sm"
                            onPress={() => setViewMode('grid')}
                            className="h-9 px-4 rounded-lg"
                        >
                            <LayoutGrid size={16} className="mr-2" />
                            Grid
                        </Button>
                    </div>
                    <Button variant="primary" className="rounded-xl h-11 px-6 shadow-lg shadow-primary/20" onPress={() => { setSelectedProject(undefined); setIsProjectModalOpen(true); }}>
                        <Plus size={18} className="mr-2" />
                        Create
                    </Button>
                </div>
            </header>

            {viewMode === 'kanban' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
                    {columns.map((column) => (
                        <div key={column.status} className="flex flex-col gap-6 min-h-[600px]">
                            <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary/50 rounded-2xl border border-border/50">
                                <span className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${column.status === 'todo' ? 'bg-muted-foreground' : column.status === 'in-progress' ? 'bg-primary' : 'bg-success'}`} />
                                    <h3 className="font-bold uppercase tracking-widest text-xs text-foreground/80">
                                        {column.label} 
                                    </h3>
                                </span>
                                <Chip size="sm" variant="soft" color={column.color}>{projects.filter(p => p.status === column.status).length}</Chip>
                            </div>
                            
                            <div className="space-y-6">
                                {projects
                                    .filter((p) => p.status === column.status)
                                    .map((project) => (
                                        <ProjectCard 
                                            key={project.$id} 
                                            project={project} 
                                            onEdit={() => { setSelectedProject(project); setIsProjectModalOpen(true); }}
                                            onDelete={() => { setSelectedProject(project); setIsDeleteModalOpen(true); }}
                                        />
                                    ))}
                                
                                <Button 
                                    variant="secondary" 
                                    className="w-full border-2 border-dashed border-border/50 py-10 rounded-[2rem] hover:bg-surface-secondary hover:border-primary group transition-all"
                                    onPress={() => { 
                                        setSelectedProject({ status: column.status } as Project); 
                                        setIsProjectModalOpen(true); 
                                    }}
                                >
                                    <div className="flex flex-col items-center gap-2">
                                        <Plus size={24} className="text-muted-foreground group-hover:text-primary transition-colors" />
                                        <span className="text-xs font-bold text-muted-foreground group-hover:text-primary">New Project</span>
                                    </div>
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    {projects.map((project) => (
                        <ProjectCard 
                            key={project.$id} 
                            project={project} 
                            onEdit={() => { setSelectedProject(project); setIsProjectModalOpen(true); }}
                            onDelete={() => { setSelectedProject(project); setIsDeleteModalOpen(true); }}
                            isFull
                        />
                    ))}
                </div>
            )}

            <ProjectModal 
                isOpen={isProjectModalOpen} 
                onClose={() => setIsProjectModalOpen(false)} 
                onSubmit={handleCreateOrUpdate}
                project={selectedProject}
            />

            <DeleteModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDelete}
                title="Delete Project"
                message={`Are you sure you want to delete "${selectedProject?.name}"? This action cannot be undone.`}
            />
        </div>
    );
}

interface ProjectCardProps {
    project: Project;
    onEdit: () => void;
    onDelete: () => void;
    isFull?: boolean;
}

function ProjectCard({ project, onEdit, onDelete, isFull }: ProjectCardProps) {
    return (
        <Surface variant="secondary" className="p-0 rounded-[2rem] border border-border/50 bg-gradient-to-br from-surface to-surface-lowest group shadow-xl shadow-black/[0.02] hover:shadow-2xl hover:shadow-black/[0.05] transition-all hover:translate-y-[-4px]">
            <article className="p-6 md:p-8 space-y-6">
                <header className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                        <h3 className="text-xl font-black tracking-tight leading-tight group-hover:text-primary transition-colors">{project.name}</h3>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                            <Calendar size={14} />
                            <span>{new Date(project.$createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                    </div>
                    <div className="flex gap-1">
                        <Button variant="ghost" isIconOnly size="sm" className="rounded-full h-8 w-8 hover:bg-primary/10 hover:text-primary" onPress={onEdit}>
                            <Edit size={16} />
                        </Button>
                        <Button variant="ghost" isIconOnly size="sm" className="rounded-full h-8 w-8 hover:bg-danger/10 hover:text-danger" onPress={onDelete}>
                            <Trash size={16} />
                        </Button>
                    </div>
                </header>

                <div className="space-y-4">
                    {isFull && project.description && (
                        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3 italic">
                           &quot; {project.description} &quot;
                        </p>
                    )}
                    
                    <div className="bg-surface-lowest/50 rounded-2xl p-4 border border-border/30">
                        <TaskList projectId={project.$id} />
                    </div>
                </div>
            </article>
        </Surface>
    );
}
