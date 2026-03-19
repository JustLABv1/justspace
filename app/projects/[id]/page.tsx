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
import { Button, Spinner, toast } from "@heroui/react";
import {
    ArrowLeft,
    Calendar,
    Edit,
    Filter,
    Kanban,
    LayoutList,
    Lock,
    Search,
    Sparkles,
    Trash2
} from "lucide-react";
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
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <Lock size={32} className="text-muted-foreground" />
                <div className="text-center">
                    <h2 className="text-lg font-semibold text-foreground">Secured Project</h2>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                        Unlock your vault to access this encrypted project.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full px-6 py-8 space-y-6 transition-all">
            <div className="flex items-center justify-between">
                <Link href="/projects" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft size={13} />
                    Projects
                </Link>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" className="rounded-xl h-8 px-3 text-[12px] font-medium" onPress={() => setIsProjectModalOpen(true)}>
                        <Edit size={12} className="mr-1" />
                        Edit
                    </Button>
                    <Button variant="ghost" className="rounded-xl h-8 px-3 text-[12px] font-medium text-danger hover:bg-danger-muted" onPress={() => setIsDeleteModalOpen(true)}>
                        <Trash2 size={12} className="mr-1" />
                        Delete
                    </Button>
                </div>
            </div>

            <div>
                <div className="flex items-center gap-2">
                    <h1 className="text-lg font-semibold text-foreground">{project.name}</h1>
                    {project.isEncrypted && <Lock size={13} className="text-warning" />}
                </div>
                <div className="flex items-center gap-4 mt-1">
                    <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${project.status === 'todo' ? 'bg-muted-foreground/40' : project.status === 'in-progress' ? 'bg-accent' : 'bg-success'}`} />
                        <span className="text-[12px] text-muted-foreground">{project.status.replace('-', ' ')}</span>
                    </div>
                    {project.daysPerWeek && (
                        <span className="text-[12px] text-muted-foreground">{project.daysPerWeek} days/week</span>
                    )}
                    {project.allocatedDays && (
                        <span className="text-[12px] text-muted-foreground">{project.allocatedDays} days total</span>
                    )}
                    <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
                        <Calendar size={11} />
                        <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
                {project.description && (
                    <p className="text-[13px] text-muted-foreground mt-2 max-w-2xl">{project.description}</p>
                )}
            </div>

            <div className="rounded-2xl border border-border bg-surface">
                <div className="px-5 py-3.5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h2 className="text-[13px] font-semibold text-foreground">Tasks</h2>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 rounded-xl border border-border px-2.5 h-8 bg-background">
                            <Search size={12} className="text-muted-foreground" />
                            <input 
                                type="text"
                                placeholder="Search tasks..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-transparent border-none focus:ring-0 text-[12px] placeholder:text-muted-foreground w-36"
                            />
                        </div>
                        <Button 
                            variant={hideCompleted ? 'primary' : 'ghost'} 
                            size="sm"
                            className={`h-8 px-2.5 rounded-xl text-[12px] font-medium ${hideCompleted ? '' : 'text-muted-foreground'}`}
                            onPress={() => setHideCompleted(!hideCompleted)}
                        >
                            <Filter size={12} className="mr-1" />
                            {hideCompleted ? 'Pending' : 'All'}
                        </Button>
                        <div className="flex rounded-xl border border-border overflow-hidden">
                            <Button 
                                variant="ghost"
                                size="sm"
                                className={`h-8 w-8 p-0 rounded-none transition-colors ${viewMode === 'list' ? 'bg-surface-secondary text-foreground' : 'text-muted-foreground'}`}
                                onPress={() => setViewMode('list')}
                            >
                                <LayoutList size={13} />
                            </Button>
                            <Button 
                                variant="ghost"
                                size="sm"
                                className={`h-8 w-8 p-0 rounded-none transition-colors ${viewMode === 'kanban' ? 'bg-surface-secondary text-foreground' : 'text-muted-foreground'}`}
                                onPress={() => setViewMode('kanban')}
                            >
                                <Kanban size={13} />
                            </Button>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 px-2.5 rounded-xl text-[12px] font-medium text-muted-foreground hover:text-foreground"
                            onPress={() => setIsTemplateModalOpen(true)}
                        >
                            <Sparkles size={12} className="mr-1" />
                            Templates
                        </Button>
                    </div>
                </div>

                <div className="p-4">
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
