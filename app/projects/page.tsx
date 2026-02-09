'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { ProjectModal } from '@/components/ProjectModal';
import { db } from '@/lib/db';
import { Project } from '@/types';
import { Button, Chip, Spinner, Surface } from "@heroui/react";
import { ArrowUpRight, Calendar, Edit, LayoutGrid, ListTodo, Plus, Trash } from "lucide-react";
import Link from 'next/link';
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
        <div className="max-w-[1600px] mx-auto p-6 md:p-12 space-y-12">
            <header className="flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-primary font-bold tracking-widest uppercase text-xs">
                        <ListTodo size={14} className="animate-pulse" />
                        Project Management
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Orchestrate & Deliver</h1>
                    <p className="text-muted-foreground font-medium">Track your consulting pipeline, manage tasks, and drive success.</p>
                </div>
                <div className="flex items-center gap-4 bg-surface p-2 rounded-[2rem] border border-border/60 shadow-sm self-stretch md:self-auto">
                    <div className="flex bg-surface-secondary/50 p-1 rounded-2xl border border-border/40">
                        <Button 
                            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} 
                            onPress={() => setViewMode('kanban')}
                            className="h-10 px-5 rounded-xl font-bold italic"
                        >
                            <ListTodo size={16} className="mr-2" />
                            Kanban
                        </Button>
                        <Button 
                            variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                            onPress={() => setViewMode('grid')}
                            className="h-10 px-5 rounded-xl font-bold italic"
                        >
                            <LayoutGrid size={16} className="mr-2" />
                            Grid
                        </Button>
                    </div>
                    <Button variant="primary" className="rounded-2xl h-12 px-8 font-bold shadow-xl shadow-primary/10" onPress={() => { setSelectedProject(undefined); setIsProjectModalOpen(true); }}>
                        <Plus size={18} className="mr-2" />
                        Create
                    </Button>
                </div>
            </header>

            {viewMode === 'kanban' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-start">
                    {columns.map((column) => (
                        <div key={column.status} className="flex flex-col gap-8 min-h-[600px]">
                            <Surface className="flex items-center justify-between px-6 py-4 bg-surface border border-border/40 rounded-[1.5rem] shadow-sm">
                                <span className="flex items-center gap-3">
                                    <div className={`w-2.5 h-2.5 rounded-full ${column.status === 'todo' ? 'bg-muted-foreground' : column.status === 'in-progress' ? 'bg-primary' : 'bg-success'}`} />
                                    <h3 className="font-extrabold uppercase tracking-[0.15em] text-[10px] text-muted-foreground">
                                        {column.label} 
                                    </h3>
                                </span>
                                <Chip size="sm" variant="soft" color={column.color} className="font-bold">{projects.filter(p => p.status === column.status).length}</Chip>
                            </Surface>
                            
                            <div className="space-y-8">
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
                                    className="w-full border border-dashed border-border py-14 rounded-[2.5rem] bg-surface/50 hover:bg-surface hover:border-primary/50 group transition-all duration-300"
                                    onPress={() => { 
                                        setSelectedProject({ status: column.status } as Project); 
                                        setIsProjectModalOpen(true); 
                                    }}
                                >
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-surface-secondary flex items-center justify-center text-muted-foreground group-hover:scale-110 group-hover:text-primary transition-all">
                                            <Plus size={20} />
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground group-hover:text-primary italic">Initiate New Project</span>
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
        <Surface className="p-0 rounded-[2.5rem] border border-border/40 bg-surface group relative overflow-hidden transition-all duration-500 hover:border-primary/20 hover:shadow-2xl hover:shadow-primary/5">
            <article className="p-8 space-y-8">
                <header className="flex justify-between items-start gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                <LayoutGrid size={20} />
                            </div>
                            <h3 className="text-xl font-black tracking-tight leading-tight group-hover:text-primary transition-colors">{project.name}</h3>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground font-bold italic uppercase tracking-widest">
                            <Calendar size={14} className="text-primary/50" />
                            <span>Established {new Date(project.$createdAt).toLocaleDateString()}</span>
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

                <div className="space-y-6">
                    {project.description && (
                        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2 italic">
                           &quot; {project.description} &quot;
                        </p>
                    )}
                    
                    <div className="flex items-center justify-between gap-4 pt-2">
                        <div className="flex items-center gap-2">
                            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                project.status === 'completed' ? 'bg-success/10 text-success border border-success/20' : 
                                project.status === 'in-progress' ? 'bg-primary/10 text-primary border border-primary/20' : 
                                'bg-muted-foreground/10 text-muted-foreground border border-muted-foreground/20'
                            }`}>
                                {project.status}
                            </div>
                        </div>

                        <Link href={`/projects/${project.$id}`} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary hover:gap-3 transition-all">
                            View Roadmap
                            <ArrowUpRight size={14} />
                        </Link>
                    </div>
                </div>
            </article>
        </Surface>
    );
}
