'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { ProjectModal } from '@/components/ProjectModal';
import { TaskList } from '@/components/TaskList';
import { db } from '@/lib/db';
import { Project } from '@/types';
import { Button, Card, Chip, Spinner } from "@heroui/react";
import { Calendar, Edit, Plus, Trash } from "lucide-react";
import { useEffect, useState } from 'react';

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
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
        if (selectedProject) {
            await db.updateProject(selectedProject.$id, data);
        } else {
            await db.createProject(data as Omit<Project, '$id' | '$createdAt'>);
        }
        fetchProjects();
    };

    const handleDelete = async () => {
        if (selectedProject) {
            await db.deleteProject(selectedProject.$id);
            fetchProjects();
        }
    };

    if (isLoading) {
        return <div className="p-8 flex justify-center"><Spinner size="lg" /></div>;
    }

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-3xl font-bold">Projects</h1>
                    <p className="text-muted-foreground mt-1">Manage your consulting engagements and tasks.</p>
                </div>
                <Button variant="primary" onPress={() => { setSelectedProject(undefined); setIsProjectModalOpen(true); }}>
                    <Plus size={18} className="mr-2" />
                    New Project
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {projects.map((project) => (
                    <Card key={project.$id} className="p-6">
                        <Card.Header className="flex flex-row justify-between items-start">
                            <div className="flex-1">
                                <Card.Title className="text-xl font-bold">{project.name}</Card.Title>
                                <Card.Description className="mt-1 line-clamp-2">{project.description}</Card.Description>
                            </div>
                            <Chip 
                                color={project.status === 'in-progress' ? 'accent' : project.status === 'completed' ? 'success' : 'default'}
                                size="sm"
                                className="ml-2"
                            >
                                {project.status.replace('-', ' ')}
                            </Chip>
                        </Card.Header>
                        
                        <Card.Content className="mt-6 space-y-6">
                            <div>
                                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Description</h4>
                                <p className="text-sm text-balance">{project.description}</p>
                            </div>
                            
                            <TaskList projectId={project.$id} />
                        </Card.Content>

                        <Card.Footer className="mt-8 pt-4 border-t border-border flex justify-between items-center">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar size={14} />
                                <span>Created {new Date(project.$createdAt).toLocaleDateString()}</span>
                            </div>
                            <div className="flex gap-1">
                                <Button 
                                    variant="ghost" 
                                    isIconOnly 
                                    size="sm"
                                    onPress={() => { setSelectedProject(project); setIsProjectModalOpen(true); }}
                                >
                                    <Edit size={16} />
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    isIconOnly 
                                    size="sm"
                                    className="text-danger"
                                    onPress={() => { setSelectedProject(project); setIsDeleteModalOpen(true); }}
                                >
                                    <Trash size={16} />
                                </Button>
                            </div>
                        </Card.Footer>
                    </Card>
                ))}
            </div>

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
