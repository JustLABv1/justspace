'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { ProjectModal } from '@/components/ProjectModal';
import { TaskList } from '@/components/TaskList';
import { db } from '@/lib/db';
import { Project } from '@/types';
import { Button, Card, Spinner } from "@heroui/react";
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

    const handleUpdateStatus = async (projectId: string, status: Project['status']) => {
        try {
            await db.updateProject(projectId, { status });
            setProjects(projects.map(p => p.$id === projectId ? { ...p, status } : p));
        } catch (error) {
            console.error(error);
        }
    };

    const handleCreateOrUpdate = async (data: Partial<Project>) => {
        if (selectedProject) {
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
        return <div className="p-8 flex justify-center"><Spinner size="lg" /></div>;
    }

    const columns: { label: string; status: Project['status'] }[] = [
        { label: 'Backlog', status: 'todo' },
        { label: 'In Progress', status: 'in-progress' },
        { label: 'Completed', status: 'completed' },
    ];

    return (
        <div className="p-8 max-w-full">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
                <div>
                    <h1 className="text-3xl font-bold">Projects</h1>
                    <p className="text-muted-foreground mt-1">Manage your consulting engagements and tasks.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-surface-secondary p-1 rounded-lg border border-border">
                        <Button 
                            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} 
                            size="sm"
                            onPress={() => setViewMode('kanban')}
                            className="h-8 px-3"
                        >
                            <ListTodo size={14} className="mr-2" />
                            Kanban
                        </Button>
                        <Button 
                            variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                            size="sm"
                            onPress={() => setViewMode('grid')}
                            className="h-8 px-3"
                        >
                            <LayoutGrid size={14} className="mr-2" />
                            Grid
                        </Button>
                    </div>
                    <Button variant="primary" onPress={() => { setSelectedProject(undefined); setIsProjectModalOpen(true); }}>
                        <Plus size={18} className="mr-2" />
                        New Project
                    </Button>
                </div>
            </div>

            {viewMode === 'kanban' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start overflow-x-auto pb-4">
                    {columns.map((column) => (
                        <div key={column.status} className="flex flex-col gap-4 min-w-[320px]">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="font-bold uppercase tracking-wider text-xs text-muted-foreground">
                                    {column.label} 
                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-surface-tertiary text-[10px]">
                                        {projects.filter(p => p.status === column.status).length}
                                    </span>
                                </h3>
                            </div>
                            
                            <div className="space-y-4">
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
                                    variant="ghost" 
                                    className="w-full border-2 border-dashed border-border py-8 hover:bg-surface-secondary hover:border-accent group"
                                    onPress={() => { 
                                        setSelectedProject({ status: column.status } as any); 
                                        setIsProjectModalOpen(true); 
                                    }}
                                >
                                    <Plus size={20} className="text-muted-foreground group-hover:text-accent transition-colors" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
        <Card className="p-5 group">
            <Card.Header className="flex flex-row justify-between items-start">
                <div className="flex-1 min-w-0">
                    <Card.Title className="text-lg font-bold truncate">{project.name}</Card.Title>
                    {!isFull && <Card.Description className="mt-1 line-clamp-2 text-xs">{project.description}</Card.Description>}
                </div>
            </Card.Header>
            
            <Card.Content className="mt-4 space-y-4">
                {isFull && (
                    <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Description</h4>
                        <p className="text-sm line-clamp-3">{project.description}</p>
                    </div>
                )}
                
                <TaskList projectId={project.$id} />
            </Card.Content>

            <Card.Footer className="mt-6 pt-4 border-t border-border flex justify-between items-center">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
                    <Calendar size={12} />
                    <span>{new Date(project.$createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" isIconOnly size="sm" className="h-7 w-7" onPress={onEdit}>
                        <Edit size={14} />
                    </Button>
                    <Button variant="ghost" isIconOnly size="sm" className="h-7 w-7 text-danger" onPress={onDelete}>
                        <Trash size={14} />
                    </Button>
                </div>
            </Card.Footer>
        </Card>
    );
}
