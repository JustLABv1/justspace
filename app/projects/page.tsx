'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { ProjectModal } from '@/components/ProjectModal';
import { useAuth } from '@/context/AuthContext';
import { client } from '@/lib/appwrite';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { ACCESS_CONTROL_ID, db, DB_ID, PROJECTS_ID } from '@/lib/db';
import { Project } from '@/types';
import { Button, Chip, Spinner, Surface, toast } from "@heroui/react";
import {
    Pen2 as Edit,
    Widget as LayoutGrid,
    Checklist as ListTodo,
    AddCircle as Plus,
    ShieldKeyhole as Shield,
    TrashBinMinimalistic as Trash,
    Widget
} from "@solar-icons/react";
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
                            const access = await db.getAccessKey(project.$id, user.$id);
                            if (access) {
                                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                
                                const nameData = JSON.parse(project.name);
                                const descData = JSON.parse(project.description);
                                
                                const decryptedName = await decryptData(nameData, docKey);
                                const decryptedDesc = await decryptData(descData, docKey);
                                
                                return { ...project, name: decryptedName, description: decryptedDesc };
                            }
                        } catch (e) {
                            console.error('Failed to decrypt project:', project.$id, e);
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

        const unsubscribe = client.subscribe([
            `databases.${DB_ID}.collections.${PROJECTS_ID}.documents`,
            `databases.${DB_ID}.collections.${ACCESS_CONTROL_ID}.documents`
        ], (response) => {
            if (response.events.some(e => e.includes('.delete'))) {
                if (response.events.some(e => e.includes(PROJECTS_ID))) {
                    const payload = response.payload as Project;
                    setProjects(prev => prev.filter(p => p.$id !== payload.$id));
                    return;
                }
            }
            fetchProjects(false);
        });

        return () => unsubscribe();
    }, [user, fetchProjects]);

    const handleCreateOrUpdate = async (data: Partial<Project> & { shouldEncrypt?: boolean }) => {
        const { shouldEncrypt, ...projectData } = data;
        const finalData = { ...projectData };

        try {
            if (shouldEncrypt && user) {
                const userKeys = await db.getUserKeys(user.$id);
                if (!userKeys) throw new Error('Vault keys not found');

                const docKey = await generateDocumentKey();
                const encryptedName = await encryptData(projectData.name || '', docKey);
                const encryptedDesc = await encryptData(projectData.description || '', docKey);

                finalData.name = JSON.stringify(encryptedName);
                finalData.description = JSON.stringify(encryptedDesc);
                finalData.isEncrypted = true;

                const encryptedDocKey = await encryptDocumentKey(docKey, userKeys.publicKey);

                if (selectedProject?.$id) {
                    await db.updateProject(selectedProject.$id, finalData);
                    const existingAccess = await db.getAccessKey(selectedProject.$id, user.$id);
                    if (!existingAccess) {
                        await db.grantAccess({
                            resourceId: selectedProject.$id,
                            userId: user.$id,
                            encryptedKey: encryptedDocKey,
                            resourceType: 'Project'
                        });
                    }
                    toast.success('Project updated successfully');
                } else {
                    const newProject = await db.createProject(finalData as Omit<Project, '$id' | '$createdAt'>, user.$id);
                    await db.grantAccess({
                        resourceId: newProject.$id,
                        userId: user.$id,
                        encryptedKey: encryptedDocKey,
                        resourceType: 'Project'
                    });
                    toast.success('Project created successfully');
                }
            } else if (user) {
                if (selectedProject?.$id) {
                    await db.updateProject(selectedProject.$id, finalData);
                    toast.success('Project updated successfully');
                } else {
                    await db.createProject(finalData as Omit<Project, '$id' | '$createdAt'>, user.$id);
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
                await db.deleteProject(selectedProject.$id);
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
        <div className="max-w-[1200px] mx-auto p-6 md:p-8 space-y-8">
            <header className="flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-accent font-black tracking-[0.2em] uppercase text-xs opacity-80">
                        <ListTodo size={14} weight="Bold" className="animate-pulse" />
                        Project Operations
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter text-foreground leading-none">Manage your projects_</h1>
                    <p className="text-sm text-muted-foreground font-medium opacity-60">High-density tracking of consulting engagements and project lifecycle.</p>
                </div>
                <div className="flex items-center gap-3 bg-surface p-1.5 rounded-2xl border border-border/40 shadow-sm self-stretch md:self-auto">
                    <div className="flex bg-surface-secondary/40 p-1 rounded-xl border border-border/20 shadow-inner">
                        <Button 
                            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} 
                            onPress={() => setViewMode('kanban')}
                            className={`h-9 px-4 rounded-lg font-bold tracking-tight transition-all text-xs ${viewMode === 'kanban' ? 'bg-foreground text-background shadow-lg' : 'text-muted-foreground opacity-50 hover:opacity-100'}`}
                        >
                            <ListTodo size={14} weight="Bold" className="mr-2" />
                            Board View
                        </Button>
                        <Button 
                            variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                            onPress={() => setViewMode('grid')}
                            className={`h-9 px-4 rounded-lg font-bold tracking-tight transition-all text-xs ${viewMode === 'grid' ? 'bg-foreground text-background shadow-lg' : 'text-muted-foreground opacity-50 hover:opacity-100'}`}
                        >
                            <LayoutGrid size={14} weight="Bold" className="mr-2" />
                            Grid View
                        </Button>
                    </div>
                    <Button variant="primary" className="rounded-xl h-9 px-6 font-bold tracking-tight shadow-xl shadow-accent/10 text-xs" onPress={() => { setSelectedProject(undefined); setIsProjectModalOpen(true); }}>
                        <Plus size={16} weight="Bold" className="mr-2" />
                        New Project
                    </Button>
                </div>
            </header>

            {viewMode === 'kanban' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    {columns.map((column) => (
                        <div key={column.status} className="flex flex-col gap-4 min-h-[500px]">
                            <Surface className="flex items-center justify-between px-4 py-2 bg-surface border border-border/40 rounded-xl shadow-sm">
                                <span className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${column.status === 'todo' ? 'bg-muted-foreground' : column.status === 'in-progress' ? 'bg-accent' : 'bg-success'}`} />
                                    <h3 className="font-bold tracking-tight text-xs text-muted-foreground">
                                        {column.label} 
                                    </h3>
                                </span>
                                <Chip size="sm" variant="soft" color={column.color} className="h-4 border border-current/10">
                                    <Chip.Label className="font-bold text-[10px]">
                                        {projects.filter(p => p.status === column.status).length}
                                    </Chip.Label>
                                </Chip>
                            </Surface>
                            
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
                                    variant="secondary" 
                                    className="w-full border border-dashed border-border py-6 rounded-xl bg-surface/50 hover:bg-surface hover:border-accent/50 group transition-all duration-300"
                                    onPress={() => { 
                                        setSelectedProject({ status: column.status } as Project); 
                                        setIsProjectModalOpen(true); 
                                    }}
                                >
                                    <div className="flex flex-cols items-center gap-2">
                                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground group-hover:scale-110 group-hover:text-accent transition-all">
                                            <Plus size={14} weight="Linear" />
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground group-hover:text-accent">Initiate New Project</span>
                                    </div>
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        <Surface className="p-4 rounded-[1.25rem] border border-border/40 bg-surface/40 backdrop-blur-xl group relative overflow-hidden transition-all duration-300 hover:border-accent/50 hover:bg-surface/60">
            <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                <div className="flex items-start justify-between gap-3">
                    <Link href={`/projects/${project.$id}`} className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-foreground/5 border border-border/50 flex items-center justify-center text-foreground/80 shadow-inner group-hover:scale-105 transition-transform duration-500 shrink-0">
                            <Widget size={16} weight="Linear" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className={`font-black tracking-tighter uppercase leading-tight truncate ${isFull ? 'text-xl' : 'text-base'}`}>{project.name}</h3>
                                {project.isEncrypted && (
                                    <div className="p-1 rounded-md bg-orange-500/10 text-orange-500 border border-orange-500/20" title="End-to-End Encrypted">
                                        <Shield size={12} weight="Bold" />
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-widest mt-0.5">Project ID: {project.$id.slice(-4).toUpperCase()}</p>
                        </div>
                    </Link>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button isIconOnly variant="ghost" size="sm" className="h-7 w-7 rounded-lg hover:bg-foreground/5" onPress={onEdit}>
                            <Edit size={12} weight="Linear" />
                        </Button>
                        <button 
                            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-danger/10 hover:text-danger transition-colors text-muted-foreground/40 hover:text-danger" 
                            onClick={(e) => { e.preventDefault(); onDelete(); }}
                        >
                            <Trash size={12} weight="Linear" />
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                         <div className={`w-1.5 h-1.5 rounded-full ${project.status === 'todo' ? 'bg-muted-foreground' : project.status === 'in-progress' ? 'bg-accent' : 'bg-success'}`} />
                         <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{project.status.replace('-', ' ')}</span>
                    </div>

                    {project.daysPerWeek && (
                         <div className="px-2 py-0.5 rounded-md bg-foreground/5 border border-border/50 text-xs font-black uppercase tracking-tighter">
                             {project.daysPerWeek}D/W
                         </div>
                    )}
                </div>
            </div>
            
            {/* Corner gradient for depth */}
            <div className="absolute -right-16 -bottom-16 w-32 h-32 bg-accent/5 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
        </Surface>
    );
}
