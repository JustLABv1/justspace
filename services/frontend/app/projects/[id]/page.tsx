'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { KanbanBoard } from '@/components/KanbanBoard';
import { ProjectCollaborationPanel } from '@/components/ProjectCollaborationPanel';
import { ProjectModal } from '@/components/ProjectModal';
import { TaskCalendar } from '@/components/TaskCalendar';
import { TaskList } from '@/components/TaskList';
import { TemplateModal } from '@/components/TemplateModal';
import { TimelineView } from '@/components/TimelineView';
import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData, encryptDocumentKey, generateDocumentKey } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { buildProjectViewHref, isSavedViewMode, mergeUserPreferences, parseUserPreferences, SavedProjectView } from '@/services/frontend/lib/preferences';
import { collectTaskTags } from '@/services/frontend/lib/task-filters';
import { wsClient, WSEvent } from '@/services/frontend/lib/ws';
import { Project, Task } from '@/services/frontend/types';
import { Avatar, Button, Card, Chip, Dropdown, Input, Label, Spinner, Tabs, toast } from "@heroui/react";
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
    ShieldCheck,
    Sparkles,
    Trash2,
} from "lucide-react";
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const VIEW_TABS = [
    { id: 'list',     label: 'List',     icon: LayoutList },
    { id: 'kanban',   label: 'Board',    icon: Kanban },
    { id: 'timeline', label: 'Timeline', icon: GanttChart },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
] as const;

type ViewMode = typeof VIEW_TABS[number]['id'];
type QuickFilter = 'all' | 'mine' | 'unassigned' | 'due-soon' | 'blocked';

export default function ProjectDetailPage() {
    const { id } = useParams() as { id: string };
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
	const searchParamsKey = searchParams.toString();
    const [project, setProject] = useState<Project | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
		const requestedView = searchParams.get('view');
        if (requestedView === 'table') return 'list';
		return isSavedViewMode(requestedView) ? requestedView : 'kanban';
	});
    const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
    const [selectedTags, setSelectedTags] = useState<string[]>(() => {
		const tags = searchParams.get('tags');
		return tags ? tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
	});
    const [hideCompleted, setHideCompleted] = useState(() => searchParams.get('hideCompleted') === '1');
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
    const [showTimeReport, setShowTimeReport] = useState(false);
    const [timeReportTasks, setTimeReportTasks] = useState<Task[]>([]);
    const { user, privateKey, updateProfile } = useAuth();
	const savedViews = parseUserPreferences(user?.preferences).savedViews.filter((view) => view.projectId === id);

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

    const fetchProjectTasks = useCallback(async () => {
        if (!id) return;
        try {
            const res = await db.listTasks(id as string);
            setTimeReportTasks(res.documents as unknown as Task[]);
        } catch {
            // Ignore background refresh failures for the reporting/filter toolbar.
        }
    }, [id]);

    useEffect(() => {
        void fetchProjectTasks();
    }, [fetchProjectTasks]);

    useEffect(() => {
                const params = new URLSearchParams(searchParamsKey);
		const nextView = params.get('view');
		const nextSearchQuery = params.get('q') || '';
		const nextSelectedTags = (params.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean);
		const nextHideCompleted = params.get('hideCompleted') === '1';

        setViewMode(nextView === 'table' ? 'list' : isSavedViewMode(nextView) ? nextView : 'kanban');
        setSearchQuery(nextSearchQuery);
        setSelectedTags(nextSelectedTags);
        setHideCompleted(nextHideCompleted);
        }, [searchParamsKey]);

    useEffect(() => {
		const params = new URLSearchParams(searchParamsKey);
        params.set('view', viewMode);
        if (searchQuery.trim()) {
            params.set('q', searchQuery.trim());
        } else {
            params.delete('q');
        }
        if (selectedTags.length > 0) {
            params.set('tags', selectedTags.join(','));
        } else {
            params.delete('tags');
        }
        if (hideCompleted) {
            params.set('hideCompleted', '1');
        } else {
            params.delete('hideCompleted');
        }

        const nextHref = params.toString() ? `${pathname}?${params.toString()}` : pathname;
        const currentHref = searchParamsKey ? `${pathname}?${searchParamsKey}` : pathname;
        if (nextHref !== currentHref) {
            router.replace(nextHref, { scroll: false });
        }
    }, [hideCompleted, pathname, router, searchParamsKey, searchQuery, selectedTags, viewMode]);

    useEffect(() => {
        if (!id) return;

        const handleRefresh = () => {
            void fetchProjectTasks();
        };

        window.addEventListener('refresh-tasks', handleRefresh);

        const unsubscribe = wsClient.subscribe((event: WSEvent) => {
            if (event.collection !== 'tasks') {
                return;
            }

            const payload = event.document as unknown as Task;
            if (payload.projectId !== id) {
                return;
            }

            void fetchProjectTasks();
        });

        return () => {
            window.removeEventListener('refresh-tasks', handleRefresh);
            unsubscribe();
        };
    }, [fetchProjectTasks, id]);

    const availableTags = collectTaskTags(timeReportTasks);
    const mainTasks = timeReportTasks.filter((task) => !task.parentId);
    const taskStats = {
        total: mainTasks.length,
        open: mainTasks.filter((task) => !task.completed && (task.kanbanStatus || 'todo') !== 'done').length,
        progress: mainTasks.filter((task) => task.kanbanStatus === 'in-progress').length,
        done: mainTasks.filter((task) => task.completed || task.kanbanStatus === 'done').length,
        dueSoon: mainTasks.filter((task) => task.deadline && !task.completed && new Date(task.deadline).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 7).length,
    };

    const handleSaveCurrentView = async () => {
        if (!user) {
            return;
        }

        const name = window.prompt('Name this view');
        if (!name || !name.trim()) {
            return;
        }

        const preferences = parseUserPreferences(user.preferences);
        const nextView: SavedProjectView = {
            id: crypto.randomUUID(),
            projectId: id,
            name: name.trim(),
            viewMode,
            searchQuery,
            selectedTags,
            hideCompleted,
            createdAt: new Date().toISOString(),
        };

        try {
            await updateProfile({
                preferences: mergeUserPreferences(user.preferences, {
                    savedViews: [nextView, ...preferences.savedViews.filter((view) => view.id !== nextView.id)],
                }),
            });
            toast.success('View saved');
        } catch (error) {
            console.error(error);
            toast.danger('Failed to save view');
        }
    };

    const handleDeleteSavedView = async (viewId: string) => {
        if (!user) {
            return;
        }

        const preferences = parseUserPreferences(user.preferences);
        try {
            await updateProfile({
                preferences: mergeUserPreferences(user.preferences, {
                    savedViews: preferences.savedViews.filter((view) => view.id !== viewId),
                }),
            });
            toast.success('Saved view removed');
        } catch (error) {
            console.error(error);
            toast.danger('Failed to remove saved view');
        }
    };

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
        <div className="w-full px-5 py-5 transition-all">
            <div className="grid min-h-[calc(100vh-6.5rem)] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <main className="min-w-0 space-y-4">
                    <Card variant="default" className="rounded-xl border border-border bg-surface">
                        <Card.Header className="border-b border-border px-5 py-4">
                            <div className="flex w-full flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                <div className="min-w-0 space-y-3">
                                    <nav className="flex items-center gap-1.5 text-sm">
                                    <Link href="/projects" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
                                        Projects
                                    </Link>
                                    <span className="text-border">›</span>
                                    <span className="text-foreground font-medium">{project.name}</span>
                                    </nav>

                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <Card.Title className="text-2xl font-semibold text-foreground">{project.name}</Card.Title>
                                            {project.isEncrypted && <Lock size={14} className="text-warning" />}
                                            <Chip size="sm" variant="soft" color={status.color} className="h-5 rounded-md">
                                                <Chip.Label className="text-[10px] font-semibold px-0.5">{status.label}</Chip.Label>
                                            </Chip>
                                            {project.role && (
                                                <Chip size="sm" variant="soft" color="accent" className="h-5 rounded-md">
                                                    <Chip.Label className="text-[10px] font-semibold px-0.5">{project.role}</Chip.Label>
                                                </Chip>
                                            )}
                                        </div>

                                        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                                            {project.description || 'No project summary yet. Add context so your team knows what this workspace is for.'}
                                        </p>

                                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                                            {project.daysPerWeek && (
                                                <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                                                    <Calendar size={13} />
                                                    <span>{project.daysPerWeek} days/week</span>
                                                </div>
                                            )}
                                            {project.allocatedDays && (
                                                <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                                                    <Clock size={13} />
                                                    <span>{project.allocatedDays} days allocated</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                                                <ShieldCheck size={13} />
                                                <span>{project.isEncrypted ? 'Vault protected' : 'Standard security'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    <div className="hidden items-center -space-x-2 pr-2 md:flex">
                                        <Avatar size="sm" color="accent" variant="soft" className="border border-surface">
                                            <Avatar.Fallback>{(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                        </Avatar>
                                        {project.role && (
                                            <span className="pl-3 text-xs text-muted-foreground">You are {project.role}</span>
                                        )}
                                    </div>
                                    <Dropdown>
                                        <Dropdown.Trigger>
                                            <Button variant="ghost" isIconOnly className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground shrink-0">
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
                            </div>
                        </Card.Header>
                        <Card.Content className="grid grid-cols-2 gap-px bg-border p-0 sm:grid-cols-5">
                            {[
                                ['Open', taskStats.open],
                                ['In progress', taskStats.progress],
                                ['Done', taskStats.done],
                                ['Due soon', taskStats.dueSoon],
                                ['Total', taskStats.total],
                            ].map(([label, value]) => (
                                <div key={label} className="bg-surface px-5 py-3">
                                    <div className="text-lg font-semibold text-foreground tabular-nums">{value}</div>
                                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
                                </div>
                            ))}
                        </Card.Content>
                    </Card>

                    <Card variant="default" className="rounded-xl border border-border bg-surface">
                        <Card.Header className="border-b border-border px-5 py-3">
                            <div className="flex w-full flex-col gap-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <Tabs selectedKey={viewMode} onSelectionChange={(key) => setViewMode(key as ViewMode)} variant="secondary" className="w-full">
                                <Tabs.ListContainer className="overflow-x-auto">
                                            <Tabs.List aria-label="Task views" className="h-9 w-max gap-1 *:rounded-lg *:px-3 *:text-[13px] *:font-medium">
                                        {VIEW_TABS.map((tab) => (
                                            <Tabs.Tab key={tab.id} id={tab.id} className="gap-1.5 whitespace-nowrap">
                                                <tab.icon size={14} />
                                                {tab.label}
                                                <Tabs.Indicator />
                                            </Tabs.Tab>
                                        ))}
                                    </Tabs.List>
                                </Tabs.ListContainer>
                            </Tabs>

                                    <Button
                                        variant="primary"
                                        className="h-8 rounded-lg px-3 text-[12px] font-semibold shrink-0"
                                        onPress={handleAddTask}
                                    >
                                        <Plus size={14} />
                                        Add task
                                    </Button>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="relative w-full sm:w-72">
                                        <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search tasks, tags, assignees..."
                                            variant="secondary"
                                            className="h-8 w-full rounded-lg pl-8 text-[12px]"
                                        />
                                    </div>
                                    <Button
                                        variant={hideCompleted ? 'primary' : 'ghost'}
                                        size="sm"
                                        className={`h-8 px-2.5 rounded-lg text-[12px] font-medium ${hideCompleted ? '' : 'text-muted-foreground'}`}
                                        onPress={() => setHideCompleted(!hideCompleted)}
                                    >
                                        <Filter size={12} />
                                        {hideCompleted ? 'Pending' : 'All'}
                                    </Button>
                                    {[
                                        { id: 'mine', label: 'My tasks' },
                                        { id: 'unassigned', label: 'Unassigned' },
                                        { id: 'due-soon', label: 'Due soon' },
                                        { id: 'blocked', label: 'Blocked' },
                                    ].map((filter) => (
                                        <Button
                                            key={filter.id}
                                            variant={quickFilter === filter.id ? 'secondary' : 'ghost'}
                                            size="sm"
                                            className={`h-8 rounded-lg px-2.5 text-[12px] ${quickFilter === filter.id ? '' : 'text-muted-foreground'}`}
                                            onPress={() => setQuickFilter((current) => current === filter.id ? 'all' : filter.id as QuickFilter)}
                                        >
                                            {filter.label}
                                        </Button>
                                    ))}
                                    <Dropdown>
                                        <Dropdown.Trigger>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 px-2.5 rounded-lg text-[12px] font-medium text-muted-foreground"
                                            >
                                                <ChevronDown size={12} />
                                                Views
                                            </Button>
                                        </Dropdown.Trigger>
                                        <Dropdown.Popover placement="bottom start" className="min-w-[220px]">
                                            <Dropdown.Menu>
                                                <Dropdown.Item id="save-current-view" textValue="Save current view" onAction={handleSaveCurrentView}>
                                                    <div className="flex items-center gap-2 text-[13px]">
                                                        <Plus size={13} />
                                                        <Label className="cursor-pointer text-[13px]">Save current view</Label>
                                                    </div>
                                                </Dropdown.Item>
                                                {savedViews.map((savedView) => (
                                                    <Dropdown.Item
                                                        key={savedView.id}
                                                        id={`view-${savedView.id}`}
                                                        textValue={savedView.name}
                                                        onAction={() => router.push(buildProjectViewHref(savedView))}
                                                    >
                                                        <div className="flex items-center justify-between gap-3 text-[13px] w-full">
                                                            <div className="truncate">
                                                                <div className="font-medium truncate">{savedView.name}</div>
                                                                <div className="text-[11px] text-muted-foreground truncate">
                                                                    {savedView.viewMode}{savedView.searchQuery ? ` · ${savedView.searchQuery}` : ''}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </Dropdown.Item>
                                                ))}
                                                {savedViews.map((savedView) => (
                                                    <Dropdown.Item
                                                        key={`delete-${savedView.id}`}
                                                        id={`delete-${savedView.id}`}
                                                        textValue={`Delete ${savedView.name}`}
                                                        variant="danger"
                                                        onAction={() => {
                                                            void handleDeleteSavedView(savedView.id);
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-2 text-[13px]">
                                                            <Trash2 size={13} />
                                                            <Label className="cursor-pointer text-[13px]">Delete {savedView.name}</Label>
                                                        </div>
                                                    </Dropdown.Item>
                                                ))}
                                            </Dropdown.Menu>
                                        </Dropdown.Popover>
                                    </Dropdown>
                                    {selectedTags.length > 0 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 px-2.5 rounded-lg text-[12px] font-medium text-muted-foreground"
                                            onPress={() => setSelectedTags([])}
                                        >
                                            Clear tags
                                        </Button>
                                    )}
                                </div>

                                {availableTags.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">Tags</span>
                                        {availableTags.map((tag) => {
                                            const isSelected = selectedTags.includes(tag);
                                            return (
                                                <button
                                                    key={tag}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedTags((currentTags) => currentTags.includes(tag)
                                                            ? currentTags.filter((currentTag) => currentTag !== tag)
                                                            : [...currentTags, tag]
                                                        );
                                                    }}
                                                    className={`h-7 px-2.5 rounded-lg border text-[12px] font-medium transition-colors ${
                                                        isSelected
                                                            ? 'border-accent bg-accent text-accent-foreground'
                                                            : 'border-border bg-surface text-muted-foreground hover:text-foreground hover:border-accent/30'
                                                    }`}
                                                >
                                                    #{tag}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </Card.Header>

                        <Card.Content className="px-4 py-4">
                    {viewMode === 'list' && (
                        <TaskList projectId={project.id} hideHeader searchQuery={searchQuery} selectedTags={selectedTags} hideCompleted={hideCompleted} quickFilter={quickFilter} />
                    )}
                    {viewMode === 'kanban' && (
                        <KanbanBoard projectId={project.id} searchQuery={searchQuery} selectedTags={selectedTags} hideCompleted={hideCompleted} quickFilter={quickFilter} />
                    )}
                    {viewMode === 'timeline' && (
                        <TimelineView projectId={project.id} searchQuery={searchQuery} selectedTags={selectedTags} hideCompleted={hideCompleted} />
                    )}
                    {viewMode === 'calendar' && (
                                <div className="mx-auto max-w-md py-4">
                                    <div className="rounded-xl border border-border bg-surface-secondary/40 p-5">
                                <TaskCalendar projectId={project.id} searchQuery={searchQuery} selectedTags={selectedTags} hideCompleted={hideCompleted} onUpdate={() => { fetchProject(); void fetchProjectTasks(); }} />
                            </div>
                        </div>
                    )}
                        </Card.Content>
                    </Card>
                </main>

                <aside className="min-w-0 self-start">
                    <ProjectCollaborationPanel project={project} compact />
                </aside>
            </div>

            {/* Time Report */}
            {timeReportTasks.some(t => (t.timeSpent || 0) > 0) && (
                <Card variant="default" className="mt-4 rounded-xl border border-border bg-surface overflow-hidden">
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
                </Card>
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
