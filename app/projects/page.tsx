'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { ProjectModal } from '@/components/ProjectModal';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { wsClient, WSEvent } from '@/lib/ws';
import { Project } from '@/types';
import { Button, Chip, Spinner, toast } from "@heroui/react";
import {
    Briefcase,
    Edit,
    LayoutGrid,
    List,
    Lock,
    Plus,
    Trash2
} from "lucide-react";
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type ViewMode = 'grid' | 'kanban';

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('kanban');
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedProject, setSelectedProject] = useState<Project | undefined>(undefined);
    const { user, privateKey } = useAuth();

    const fetchProjects = useCallback(async (isInitial = false) => {
        if (isInitial) setIsLoading(true);
        try {
            const data = await db.listProjects();
            const rawProjects = data.documents;

            const processedProjects = await Promise.all(rawProjects.map(async (project) => {
                if (project.isEncrypted) {
                    if (privateKey && user) {
                        try {
                            const access = await db.getAccessKey(project.id);
                            if (access) {
                                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                
                                const nameData = JSON.parse(project.name);
                                const descData = JSON.parse(project.description);
                                
                                const decryptedName = await decryptData(nameData, docKey);
                                const decryptedDesc = await decryptData(descData, docKey);
                                
                                return { ...project, name: decryptedName, description: decryptedDesc };
                            }
                        } catch (e) {
                            console.error('Failed to decrypt project:', project.id, e);
                            return { ...project, name: 'Decryption Error', description: 'Missing access keys.' };
                        }
                    }
                    return { 
                        ...project, 
                        name: 'Encrypted Project', 
                        description: 'Synchronize vault to access project details.' 
                    };
                }
                return project;
            }));

            setProjects(processedProjects);
        } catch (error) {
            console.error(error);
        } finally {
            if (isInitial) setIsLoading(false);
        }
    }, [privateKey, user]);

    useEffect(() => {
        fetchProjects(true);
    }, [fetchProjects]);

    useEffect(() => {
        if (!user) return;

        const unsub = wsClient.subscribe((event: WSEvent) => {
            if (event.collection === 'projects' || event.collection === 'access_control') {
                if (event.type === 'delete' && event.collection === 'projects') {
                    const payload = event.document as unknown as Project;
                    setProjects(prev => prev.filter(p => p.id !== payload.id));
                    return;
                }
                fetchProjects(false);
            }
        });

        return () => unsub();
    }, [user, fetchProjects]);

    const handleCreateOrUpdate = async (data: Partial<Project> & { shouldEncrypt?: boolean }) => {
        const { isEncrypted: targetEncrypted, ...projectData } = data;
        const finalData = { ...projectData, isEncrypted: targetEncrypted };

        try {
            if (targetEncrypted && user && privateKey) {
                const userKeys = await db.getUserKeys(user.id);
                if (!userKeys) throw new Error('Vault keys not found');

                let docKey: CryptoKey;
                let isNewKey = false;

                // Try to reuse existing key if we're updating an already encrypted project
                const existingAccess = selectedProject?.id ? await db.getAccessKey(selectedProject.id) : null;
                
                if (existingAccess && selectedProject?.isEncrypted) {
                    docKey = await decryptDocumentKey(existingAccess.encryptedKey, privateKey);
                } else {
                    docKey = await generateDocumentKey();
                    isNewKey = true;
                }

                const encryptedName = await encryptData(projectData.name || '', docKey);
                const encryptedDesc = await encryptData(projectData.description || '', docKey);

                finalData.name = JSON.stringify(encryptedName);
                finalData.description = JSON.stringify(encryptedDesc);

                if (selectedProject?.id) {
                    await db.updateProject(selectedProject.id, finalData);
                    if (isNewKey) {
                        const encryptedDocKey = await encryptDocumentKey(docKey, userKeys.publicKey);
                        await db.grantAccess({
                            resourceId: selectedProject.id,
                            userId: user.id,
                            encryptedKey: encryptedDocKey,
                            resourceType: 'Project'
                        });
                    }
                    toast.success('Project updated successfully');
                } else {
                    const newProject = await db.createProject(finalData as Omit<Project, 'id' | 'createdAt'>);
                    const encryptedDocKey = await encryptDocumentKey(docKey, userKeys.publicKey);
                    await db.grantAccess({
                        resourceId: newProject.id,
                        userId: user.id,
                        encryptedKey: encryptedDocKey,
                        resourceType: 'Project'
                    });
                    toast.success('Project created successfully');
                }
            } else if (user) {
                // Not encrypted or missing vault access
                if (selectedProject?.id) {
                    await db.updateProject(selectedProject.id, finalData);
                    toast.success('Project updated successfully');
                } else {
                    await db.createProject(finalData as Omit<Project, 'id' | 'createdAt'>);
                    toast.success('Project created successfully');
                }
            }
        } catch (error) {
            console.error(error);
            toast.danger('Action failed', {
                description: error instanceof Error ? error.message : 'Unknown error occurred'
            });
        }
        
        setIsProjectModalOpen(false);
        fetchProjects(false);
    };

    const handleDelete = async () => {
        if (selectedProject) {
            try {
                await db.deleteProject(selectedProject.id);
                setIsDeleteModalOpen(false);
                fetchProjects(false);
                toast.success('Project deleted successfully');
            } catch (error) {
                console.error(error);
                toast.danger('Failed to delete project');
            }
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
        <div className="max-w-[1200px] mx-auto p-6 md:p-8 space-y-6">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Track and manage your consulting engagements.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-border overflow-hidden">
                        <Button 
                            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} 
                            onPress={() => setViewMode('kanban')}
                            className={`h-8 px-3 rounded-none text-xs font-medium transition-colors ${viewMode === 'kanban' ? 'bg-surface-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <List size={13} className="mr-1.5" />
                            Board
                        </Button>
                        <Button 
                            variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                            onPress={() => setViewMode('grid')}
                            className={`h-8 px-3 rounded-none text-xs font-medium transition-colors ${viewMode === 'grid' ? 'bg-surface-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <LayoutGrid size={13} className="mr-1.5" />
                            Grid
                        </Button>
                    </div>
                    <Button variant="primary" className="rounded-lg h-8 px-3 text-xs font-medium" onPress={() => { setSelectedProject(undefined); setIsProjectModalOpen(true); }}>
                        <Plus size={13} className="mr-1.5" />
                        New Project
                    </Button>
                </div>
            </header>

            {viewMode === 'kanban' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    {columns.map((column) => (
                        <div key={column.status} className="flex flex-col gap-3">
                            <div className="flex items-center justify-between px-1">
                                <span className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${column.status === 'todo' ? 'bg-muted-foreground' : column.status === 'in-progress' ? 'bg-accent' : 'bg-success'}`} />
                                    <h3 className="text-xs font-medium text-muted-foreground">
                                        {column.label}
                                    </h3>
                                </span>
                                <Chip size="sm" variant="soft" color={column.color}>
                                    <Chip.Label className="text-[10px] font-medium">
                                        {projects.filter(p => p.status === column.status).length}
                                    </Chip.Label>
                                </Chip>
                            </div>

                            <div className="space-y-2">
                                {projects
                                    .filter((p) => p.status === column.status)
                                    .map((project) => (
                                        <ProjectCard 
                                            key={project.id} 
                                            project={project} 
                                            onEdit={() => { setSelectedProject(project); setIsProjectModalOpen(true); }}
                                            onDelete={() => { setSelectedProject(project); setIsDeleteModalOpen(true); }}
                                        />
                                    ))}

                                <Button 
                                    variant="ghost"
                                    className="w-full border border-dashed border-border rounded-lg h-9 text-xs text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
                                    onPress={() => { 
                                        setSelectedProject({ status: column.status } as Project); 
                                        setIsProjectModalOpen(true); 
                                    }}
                                >
                                    <Plus size={12} className="mr-1.5" />
                                    Add project
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {projects.map((project) => (
                        <ProjectCard 
                            key={project.id} 
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
        <div className="p-3 rounded-lg border border-border bg-surface group hover:border-accent/40 transition-colors">
            <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                    <Link href={`/projects/${project.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground shrink-0">
                            <Briefcase size={13} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <h3 className="text-sm font-medium text-foreground truncate">{project.name}</h3>
                                {project.isEncrypted && (
                                    <Lock size={11} className="text-warning shrink-0" />
                                )}
                            </div>
                        </div>
                    </Link>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button isIconOnly variant="ghost" size="sm" className="h-6 w-6 rounded-md" onPress={onEdit}>
                            <Edit size={11} />
                        </Button>
                        <button 
                            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-danger-muted hover:text-danger transition-colors" 
                            onClick={(e) => { e.preventDefault(); onDelete(); }}
                        >
                            <Trash2 size={11} />
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${project.status === 'todo' ? 'bg-muted-foreground' : project.status === 'in-progress' ? 'bg-accent' : 'bg-success'}`} />
                        <span className="text-xs text-muted-foreground">{project.status.replace('-', ' ')}</span>
                    </div>

                    {project.daysPerWeek && (
                        <span className="text-xs text-muted-foreground">{project.daysPerWeek}d/w</span>
                    )}
                </div>
            </div>
        </div>
    );
}
