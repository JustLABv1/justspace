'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { KanbanBoard } from '@/components/KanbanBoard';
import { ProjectModal } from '@/components/ProjectModal';
import { TableView } from '@/components/TableView';
import { TaskCalendar } from '@/components/TaskCalendar';
import { TaskList } from '@/components/TaskList';
import { TemplateModal } from '@/components/TemplateModal';
import { TimelineView } from '@/components/TimelineView';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { Project } from '@/types';
import { Button, Chip, Dropdown, Label, Spinner, toast } from "@heroui/react";
import {
    Calendar,
    ChevronDown,
    ChevronUp,
    Clock,
    Edit,
    Filter,
    GanttChart,
    Kanban,
    LayoutList,
    Lock,
    MoreHorizontal,
    Plus,
    Search,
    Sparkles,
    Table2,
    Trash2,
} from "lucide-react";
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const VIEW_TABS = [
    { id: 'list',     label: 'List',     icon: LayoutList },
    { id: 'kanban',   label: 'Board',    icon: Kanban },
    { id: 'table',    label: 'Table',    icon: Table2 },
    { id: 'timeline', label: 'Timeline', icon: GanttChart },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
] as const;

type ViewMode = typeof VIEW_TABS[number]['id'];

export default function ProjectDetailPage() {
    const { id } = useParams() as { id: string };
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('kanban');
    const [searchQuery, setSearchQuery] = useState('');
    const [hideCompleted, setHideCompleted] = useState(false);
    const [showTimeReport, setShowTimeReport] = useState(false);
    const [timeReportTasks, setTimeReportTasks] = useState<import('@/types').Task[]>([]);
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

    useEffect(() => { if (id) fetchProject(); }, [id, fetchProject]);

    useEffect(() => {
        if (!id) return;
        import('@/lib/db').then(({ db: dbMod }) => {
            dbMod.listTasks(id as string).then(res => {
                setTimeReportTasks(res.documents as unknown as import('@/types').Task[]);
            }).catch(() => {});
        });
    }, [id]);

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
                        await db.grantAccess({ resourceId: project.id, userId: user.id, encryptedKey: encryptedDocKey, resourceType: 'Project' });
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
                            const encryptedTitles = await Promise.all(titles.map(async (t) => JSON.stringify(await encryptData(t, docKey))));
                            await db.createTasks(project.id, encryptedTitles, true);
                        } else {
                            await db.createTasks(project.id, titles, false);
                        }
                    } catch {
                        await db.createTasks(project.id, titles, false);
                    }
                } else {
                    await db.createTasks(project.id, titles, false);
                }
                toast.success('Template applied', { description: `Created ${titles.length} tasks` });
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

    const handleAddTask = () => {
        if (viewMode === 'kanban') {
            window.dispatchEvent(new CustomEvent('kanban-add-task', { detail: { column: 'todo' } }));
        } else {
            window.dispatchEvent(new CustomEvent('list-add-task'));
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
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">Unlock your vault to access this encrypted project.</p>
                </div>
            </div>
        );
    }

    const statusConfig: Record<string, { label: string; color: 'default' | 'accent' | 'success' | 'warning' | 'danger' }> = {
        'todo': { label: 'Backlog', color: 'default' },
        'in-progress': { label: 'In Progress', color: 'accent' },
        'completed': { label: 'Completed', color: 'success' },
        'archived': { label: 'Archived', color: 'warning' },
    };
    const status = statusConfig[project.status] || statusConfig['todo'];

    return (
        <div className="w-full px-6 py-6 space-y-6 transition-all">
            {/* Breadcrumb + Actions */}
            <div className="flex items-center justify-between">
                <nav className="flex items-center gap-1.5 text-sm">
                    <Link href="/projects" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
                        Projects
                    </Link>
                    <span className="text-border">›</span>
                    <span className="text-foreground font-medium">{project.name}</span>
                </nav>

                <Dropdown>
                    <Dropdown.Trigger>
                        <Button variant="ghost" isIconOnly className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground">
                            <MoreHorizontal size={16} />
                        </Button>
                    </Dropdown.Trigger>
                    <Dropdown.Popover placement="bottom end" className="min-w-[160px]">
                        <Dropdown.Menu>
                            <Dropdown.Item id="edit" textValue="Edit" onAction={() => setIsProjectModalOpen(true)}>
                                <div className="flex items-center gap-2"><Edit size={13} /><Label className="cursor-pointer text-[13px]">Edit</Label></div>
                            </Dropdown.Item>
                            <Dropdown.Item id="templates" textValue="Templates" onAction={() => setIsTemplateModalOpen(true)}>
                                <div className="flex items-center gap-2"><Sparkles size={13} /><Label className="cursor-pointer text-[13px]">Templates</Label></div>
                            </Dropdown.Item>
                            <Dropdown.Item id="delete" textValue="Delete" variant="danger" onAction={() => setIsDeleteModalOpen(true)}>
                                <div className="flex items-center gap-2"><Trash2 size={13} /><Label className="cursor-pointer text-[13px]">Delete</Label></div>
                            </Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown.Popover>
                </Dropdown>
            </div>

            {/* Project Header */}
            <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                    <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
                    {project.isEncrypted && <Lock size={14} className="text-warning" />}
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <Chip size="sm" variant="soft" color={status.color} className="h-5 rounded-md">
                        <Chip.Label className="text-[10px] font-semibold px-0.5">{status.label}</Chip.Label>
                    </Chip>

                    {project.daysPerWeek && (
                        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                            <Calendar size={13} />
                            <span>{project.daysPerWeek} days/week</span>
                        </div>
                    )}
                    {project.allocatedDays && (
                        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                            <Clock size={13} />
                            <span>{project.allocatedDays} days total</span>
                        </div>
                    )}
                    <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <Calendar size={12} />
                        <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>

                {project.description && (
                    <p className="text-[13px] text-muted-foreground max-w-2xl">{project.description}</p>
                )}
            </div>

            {/* Tabs + Actions */}
            <div>
                <div className="flex items-center justify-between border-b border-border">
                    <div className="flex items-center">
                        {VIEW_TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setViewMode(tab.id)}
                                className={`flex items-center gap-1.5 px-4 h-10 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                                    viewMode === tab.id
                                        ? 'border-accent text-foreground'
                                        : 'border-transparent text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <Button
                        variant="primary"
                        className="rounded-xl h-8 px-3.5 text-[12px] font-semibold mb-1"
                        onPress={handleAddTask}
                    >
                        <Plus size={14} className="mr-1" />
                        Add new task
                    </Button>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-2 py-3">
                    <div className="flex items-center gap-1.5 rounded-xl border border-border px-2.5 h-8 bg-surface">
                        <Search size={12} className="text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search tasks..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-[12px] placeholder:text-muted-foreground w-36 outline-none"
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
                </div>
            </div>

            {/* Task Content */}
            <div>
                {viewMode === 'list' && (
                    <TaskList projectId={project.id} hideHeader searchQuery={searchQuery} hideCompleted={hideCompleted} />
                )}
                {viewMode === 'kanban' && (
                    <KanbanBoard projectId={project.id} searchQuery={searchQuery} hideCompleted={hideCompleted} />
                )}
                {viewMode === 'table' && (
                    <TableView projectId={project.id} searchQuery={searchQuery} hideCompleted={hideCompleted} />
                )}
                {viewMode === 'timeline' && (
                    <TimelineView projectId={project.id} searchQuery={searchQuery} hideCompleted={hideCompleted} />
                )}
                {viewMode === 'calendar' && (
                    <div className="max-w-md mx-auto py-4">
                        <div className="bg-surface rounded-2xl border border-border p-5">
                            <TaskCalendar projectId={project.id} onUpdate={fetchProject} />
                        </div>
                    </div>
                )}
            </div>

            {/* Time Report */}
            {timeReportTasks.some(t => (t.timeSpent || 0) > 0) && (
                <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                    <button
                        onClick={() => setShowTimeReport(v => !v)}
                        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-secondary/40 transition-colors"
                    >
                        <h2 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                            <Clock size={13} className="text-muted-foreground" />
                            Time Report
                        </h2>
                        <div className="flex items-center gap-3">
                            <span className="text-[12px] text-muted-foreground">
                                Total: {(() => {
                                    const total = timeReportTasks.reduce((sum, t) => sum + (t.timeSpent || 0), 0);
                                    return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
                                })()}
                            </span>
                            {showTimeReport ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
                        </div>
                    </button>
                    {showTimeReport && (
                        <div className="border-t border-border divide-y divide-border">
                            {timeReportTasks
                                .filter(t => (t.timeSpent || 0) > 0 && !t.parentId)
                                .sort((a, b) => (b.timeSpent || 0) - (a.timeSpent || 0))
                                .map(task => {
                                    const h = Math.floor((task.timeSpent || 0) / 3600);
                                    const m = Math.floor(((task.timeSpent || 0) % 3600) / 60);
                                    const totalSecs = timeReportTasks.reduce((sum, t) => sum + (t.timeSpent || 0), 0);
                                    const pct = totalSecs > 0 ? Math.round(((task.timeSpent || 0) / totalSecs) * 100) : 0;
                                    return (
                                        <div key={task.id} className="flex items-center gap-3 px-5 py-2.5">
                                            <span className="text-[13px] text-foreground truncate flex-1">{task.title}</span>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <div className="w-20 h-1.5 rounded-full bg-surface-secondary overflow-hidden hidden sm:block">
                                                    <div className="h-full bg-accent/60 rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-[12px] text-muted-foreground tabular-nums w-16 text-right">{h}h {m}m</span>
                                                <span className="text-[11px] text-muted-foreground/60 w-8 text-right">{pct}%</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            <div className="flex items-center gap-3 px-5 py-3 bg-surface-secondary/30">
                                <span className="text-[12px] font-semibold text-foreground flex-1">Total</span>
                                <span className="text-[12px] font-semibold text-foreground tabular-nums">
                                    {(() => {
                                        const total = timeReportTasks.reduce((sum, t) => sum + (t.timeSpent || 0), 0);
                                        return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
                                    })()}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <ProjectModal isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} onSubmit={handleUpdate} project={project} />
            <TemplateModal isOpen={isTemplateModalOpen} onClose={() => setIsTemplateModalOpen(false)} onApply={handleApplyTemplate} />
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
