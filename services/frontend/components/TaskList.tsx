'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { taskMatchesFilters } from '@/services/frontend/lib/task-filters';
import { DEPLOYMENT_TEMPLATES } from '@/services/frontend/lib/templates';
import { wsClient, WSEvent } from '@/services/frontend/lib/ws';
import { ProjectFile, Task, TaskAssignee, TaskComment } from '@/services/frontend/types';
import { Button, Avatar, Checkbox, Chip, Dropdown, Header, Input, Label, ScrollShadow, Spinner, toast } from "@heroui/react";
import { ZonedDateTime } from "@internationalized/date";
import dayjs from 'dayjs';
import { Calendar, CheckCircle2, ChevronRight, Clock, Filter, GitBranch, GripVertical, ListChecks, MessageCircle, MoreHorizontal, Paperclip, Plus, Search, Square, SquareCheck, Trash2, UserCircle } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pagination } from './Pagination';
import { TaskDetailModal } from './TaskDetailModal';

type TaskMeta = {
    assignees: TaskAssignee[];
    files: ProjectFile[];
    comments: TaskComment[];
};

const statusConfig: Record<string, { label: string; color: 'default' | 'accent' | 'success' | 'warning' | 'danger' }> = {
    todo: { label: 'Todo', color: 'default' },
    'in-progress': { label: 'In progress', color: 'accent' },
    review: { label: 'Review', color: 'warning' },
    waiting: { label: 'Blocked', color: 'danger' },
    done: { label: 'Done', color: 'success' },
};

const priorityConfig: Record<string, { label: string; color: 'default' | 'accent' | 'success' | 'warning' | 'danger' }> = {
    low: { label: 'Low', color: 'success' },
    medium: { label: 'Medium', color: 'accent' },
    high: { label: 'High', color: 'warning' },
    urgent: { label: 'Urgent', color: 'danger' },
};

export function TaskList({ 
    projectId, 
    hideHeader = false,
    searchQuery: externalSearchQuery,
    selectedTags = [],
    hideCompleted: externalHideCompleted,
    quickFilter = 'all'
}: { 
    projectId: string, 
    hideHeader?: boolean,
    searchQuery?: string,
    selectedTags?: string[],
    hideCompleted?: boolean,
    quickFilter?: 'all' | 'mine' | 'unassigned' | 'due-soon' | 'blocked'
}) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskDeadline, setNewTaskDeadline] = useState<ZonedDateTime | null>(null);
    const addTaskFormRef = useRef<HTMLFormElement>(null);
    const [internalSearchQuery, setInternalSearchQuery] = useState('');
    const [internalHideCompleted, setInternalHideCompleted] = useState(false);
    
    const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
    const hideCompleted = externalHideCompleted !== undefined ? externalHideCompleted : internalHideCompleted;
    
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const [showCompleted, setShowCompleted] = useState(false);
    const [taskMeta, setTaskMeta] = useState<Record<string, TaskMeta>>({});
    const itemsPerPage = 8;

    const { user, privateKey } = useAuth();
    const [documentKey, setDocumentKey] = useState<CryptoKey | null>(null);

    const fetchTasks = useCallback(async (isInitial = false) => {
        if (isInitial) setIsLoading(true);
        try {
            const projectRes = await db.getProject(projectId);
            const res = await db.listTasks(projectId);
            let rawTasks = res.documents as unknown as Task[];
            let docKey: CryptoKey | null = null;

            if (projectRes.isEncrypted && privateKey && user) {
                try {
                    const access = await db.getAccessKey(projectId);
                    if (access) {
                        docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                        setDocumentKey(docKey);
                    }
                } catch (e) {
                    console.error('Failed to decrypt tasks:', e);
                }
            }

            rawTasks = await Promise.all(rawTasks.map(async (task) => {
                if (task.isEncrypted) {
                    if (docKey) {
                        try {
                            const titleData = JSON.parse(task.title);
                            const decryptedTitle = await decryptData(titleData, docKey);
                            return { ...task, title: decryptedTitle };
                        } catch {
                            return { ...task, title: 'Decryption Error' };
                        }
                    }
                    return { ...task, title: 'Encrypted Task' };
                }
                return task;
            }));

            setTasks(rawTasks);
            const parentTasks = rawTasks.filter((task) => !task.parentId).slice(0, 50);
            const metaEntries = await Promise.all(parentTasks.map(async (task) => {
                try {
                    const [assigneesRes, filesRes, commentsRes] = await Promise.all([
                        db.listTaskAssignees(task.id),
                        db.listTaskFiles(task.id),
                        db.listTaskComments(task.id),
                    ]);
                    return [task.id, {
                        assignees: assigneesRes.documents,
                        files: filesRes.documents,
                        comments: commentsRes.documents,
                    }] as const;
                } catch {
                    return [task.id, { assignees: [], files: [], comments: [] }] as const;
                }
            }));
            setTaskMeta(Object.fromEntries(metaEntries));
        } catch (error) {
            console.error(error instanceof Error ? error.message : error);
        } finally {
            if (isInitial) setIsLoading(false);
        }
    }, [projectId, privateKey, user]);

    useEffect(() => {
        fetchTasks(true);
    }, [fetchTasks]);

    useEffect(() => {
        const unsub = wsClient.subscribe(async (event: WSEvent) => {
            if (event.collection === 'tasks') {
                const payload = event.document as unknown as Task;
                if (payload.projectId !== projectId) return;

                // If it's a delete event, we can handle it immediately without decryption
                if (event.type === 'delete') {
                    setTasks(prev => prev.filter(t => t.id === payload.id ? false : true));
                    return;
                }

                // For creates and updates, we trigger a silent fetch to handle decryption correctly
                await fetchTasks(false);
            }
        });

        return () => unsub();
    }, [projectId, fetchTasks]);

    // Focus add-task input when the "Add new task" header button fires the event
    useEffect(() => {
        const handler = () => {
            addTaskFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            addTaskFormRef.current?.querySelector('input')?.focus();
        };
        window.addEventListener('list-add-task', handler);
        return () => window.removeEventListener('list-add-task', handler);
    }, []);

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskTitle.trim()) return;

        const optimisticId = `temp-${Date.now()}`;
        const previousTasks = [...tasks];
        
        try {
            const newTask: Task = {
                id: optimisticId,
                createdAt: new Date().toISOString(),
                title: newTaskTitle,
                projectId,
                completed: false,
                order: tasks.length,
                isEncrypted: !!documentKey
            } as Task;

            setTasks([...tasks, newTask]);
            setNewTaskTitle('');

            let title = newTaskTitle;
            let isEncrypted = false;
            if (documentKey) {
                const encrypted = await encryptData(title, documentKey);
                title = JSON.stringify(encrypted);
                isEncrypted = true;
            }
            const res = await db.createEmptyTask(projectId, title, tasks.length, isEncrypted, undefined, 'todo');
            
            if (newTaskDeadline) {
                const deadlineStr = newTaskDeadline.toAbsoluteString();
                await db.updateTask(res.id, { deadline: deadlineStr });
            }

            // Replace optimistic task with the real one
            setTasks(prev => prev.map(t => t.id === optimisticId ? (res as unknown as Task) : t));
            setNewTaskDeadline(null);
            fetchTasks(); // Refresh to get correct decrypted title if needed
            toast.success('Task added');
        } catch (error) {
            console.error('Failed to add task:', error);
            setTasks(previousTasks);
            toast.danger('Failed to add task');
        }
    };

    const applyTemplate = async (templateIndex: number) => {
        setIsApplyingTemplate(true);
        try {
            const template = DEPLOYMENT_TEMPLATES[templateIndex];
            const titles = template.tasks;
            
            if (documentKey) {
                const encryptedTitles = await Promise.all(titles.map(async (t) => {
                    return JSON.stringify(await encryptData(t, documentKey));
                }));
                await db.createTasks(projectId, encryptedTitles, true);
            } else {
                await db.createTasks(projectId, titles, false);
            }
            fetchTasks();
            toast.success('Template applied', {
                description: `Created ${titles.length} tasks`
            });
        } catch (error) {
            console.error(error);
            toast.danger('Failed to apply template');
        } finally {
            setIsApplyingTemplate(false);
        }
    };

    const deleteTask = async (taskId: string) => {
        const previousTasks = [...tasks];
        try {
            setTasks(tasks.filter(t => t.id !== taskId));
            await db.deleteTask(taskId);
            toast.success('Task deleted');
        } catch (error) {
            console.error('Task deletion failed, rolling back:', error);
            setTasks(previousTasks);
            toast.danger('Failed to delete task');
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleBulkComplete = async () => {
        const ids = [...selectedIds];
        try {
            await Promise.all(ids.map(id => db.updateTask(id, { completed: true, kanbanStatus: 'done' })));
            fetchTasks();
            setSelectedIds(new Set());
            setSelectionMode(false);
            toast.success(`${ids.length} task${ids.length !== 1 ? 's' : ''} completed`);
        } catch (error) { toast.danger(error instanceof Error ? error.message : 'Bulk complete failed'); }
    };

    const handleBulkDelete = async () => {
        const ids = [...selectedIds];
        try {
            await Promise.all(ids.map(id => db.deleteTask(id)));
            setTasks(prev => prev.filter(t => !ids.includes(t.id)));
            setSelectedIds(new Set());
            setSelectionMode(false);
            toast.success(`${ids.length} task${ids.length !== 1 ? 's' : ''} deleted`);
        } catch { toast.danger('Bulk delete failed'); }
    };

    if (isLoading) return (
        <div className="h-64 flex items-center justify-center">
            <Spinner color="accent" />
        </div>
    );

    const allMainTasks = tasks.filter(t => !t.parentId);
    const filteredMainTasks = allMainTasks.filter(t => {
        const subtasks = tasks.filter(st => st.parentId === t.id);
        const matchesTask = taskMatchesFilters(t, searchQuery, selectedTags);
        const anySubtaskMatches = subtasks.some(st => taskMatchesFilters(st, searchQuery, selectedTags));
        const meta = taskMeta[t.id] || { assignees: [], files: [], comments: [] };
        const matchesFilter = hideCompleted ? !t.completed : true;
        const matchesQuickFilter =
            quickFilter === 'all' ||
            (quickFilter === 'mine' && !!user && meta.assignees.some((assignee) => assignee.userId === user.id)) ||
            (quickFilter === 'unassigned' && meta.assignees.length === 0) ||
            (quickFilter === 'due-soon' && !!t.deadline && !t.completed && dayjs(t.deadline).diff(dayjs(), 'day') <= 7) ||
            (quickFilter === 'blocked' && ((t.dependencies || []).length > 0 || t.kanbanStatus === 'waiting'));
        
        return (matchesTask || anySubtaskMatches) && matchesFilter && matchesQuickFilter;
    });

    const activeTasks = filteredMainTasks.filter(t => !t.completed);
    const completedTasks = filteredMainTasks.filter(t => t.completed);
    const totalPages = Math.ceil(activeTasks.length / itemsPerPage);
    const paginatedTasks = activeTasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const allVisibleSelected = paginatedTasks.length > 0 && paginatedTasks.every((task) => selectedIds.has(task.id));
    const togglePageSelection = () => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (allVisibleSelected) {
                paginatedTasks.forEach((task) => next.delete(task.id));
            } else {
                paginatedTasks.forEach((task) => next.add(task.id));
            }
            return next;
        });
        setSelectionMode(true);
    };

    const renderAssignees = (task: Task) => {
        const assignees = taskMeta[task.id]?.assignees || [];
        if (assignees.length === 0) {
            return (
                <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <UserCircle size={15} />
                    <span className="hidden lg:inline">Unassigned</span>
                </div>
            );
        }
        return (
            <div className="flex -space-x-2">
                {assignees.slice(0, 3).map((assignee) => (
                    <Avatar key={assignee.userId} size="sm" color="accent" variant="soft" className="border border-surface">
                        <Avatar.Fallback>{assignee.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                    </Avatar>
                ))}
            </div>
        );
    };

    const renderIssueRow = (task: Task, isCompleted = false) => {
        const subtasks = tasks.filter(st => st.parentId === task.id);
        const completedSubtasks = subtasks.filter(st => st.completed).length;
        const status = statusConfig[task.completed ? 'done' : (task.kanbanStatus || 'todo')];
        const priority = task.priority ? priorityConfig[task.priority] : undefined;
        const meta = taskMeta[task.id] || { assignees: [], files: [], comments: [] };

        return (
            <div
                key={task.id}
                className={`grid min-w-[880px] grid-cols-[40px_minmax(260px,1fr)_120px_112px_120px_120px_120px_36px] items-center gap-3 border-b border-border px-3 py-2.5 text-sm transition-colors hover:bg-surface-secondary/40 ${isCompleted ? 'opacity-60' : ''}`}
                onClick={() => { if (selectionMode) { toggleSelect(task.id); return; } setSelectedTask(task); setIsDetailModalOpen(true); }}
            >
                <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                        aria-label={`Select ${task.title}`}
                        isSelected={selectedIds.has(task.id)}
                        onChange={() => { setSelectionMode(true); toggleSelect(task.id); }}
                    >
                        <Checkbox.Control className="size-4 rounded-md">
                            <Checkbox.Indicator />
                        </Checkbox.Control>
                    </Checkbox>
                    <GripVertical size={13} className="hidden text-muted-foreground/40 lg:block" />
                </div>

                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`truncate font-medium ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{task.title}</span>
                        {task.isEncrypted && <span className="text-[10px] text-warning">secure</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>JS-{task.id.slice(0, 4).toUpperCase()}</span>
                        {task.tags?.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}
                        {(task.dependencies || []).length > 0 && <span className="inline-flex items-center gap-1"><GitBranch size={10} />{task.dependencies?.length}</span>}
                    </div>
                </div>

                <Chip size="sm" variant="soft" color={status.color} className="w-fit rounded-md">
                    <Chip.Label className="text-[11px]">{status.label}</Chip.Label>
                </Chip>

                {priority ? (
                    <Chip size="sm" variant="soft" color={priority.color} className="w-fit rounded-md">
                        <Chip.Label className="text-[11px]">{priority.label}</Chip.Label>
                    </Chip>
                ) : (
                    <span className="text-[12px] text-muted-foreground">No priority</span>
                )}

                {renderAssignees(task)}

                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-secondary">
                        <div className="h-full rounded-full bg-accent" style={{ width: subtasks.length ? `${(completedSubtasks / subtasks.length) * 100}%` : '0%' }} />
                    </div>
                    <span>{completedSubtasks}/{subtasks.length}</span>
                </div>

                <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                    {task.deadline && <span className={`inline-flex items-center gap-1 ${dayjs(task.deadline).isBefore(dayjs(), 'minute') && !task.completed ? 'text-danger' : ''}`}><Calendar size={12} />{dayjs(task.deadline).format('MMM D')}</span>}
                    {task.timeSpent ? <span className="inline-flex items-center gap-1"><Clock size={12} />{Math.floor(task.timeSpent / 3600)}h</span> : null}
                    {meta.comments.length > 0 && <span className="inline-flex items-center gap-1"><MessageCircle size={12} />{meta.comments.length}</span>}
                    {meta.files.length > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={12} />{meta.files.length}</span>}
                </div>

                <Dropdown>
                    <Dropdown.Trigger>
                        <Button variant="ghost" isIconOnly className="h-7 w-7 rounded-lg text-muted-foreground" onClick={(event) => event.stopPropagation()}>
                            <MoreHorizontal size={14} />
                        </Button>
                    </Dropdown.Trigger>
                    <Dropdown.Popover placement="bottom end">
                        <Dropdown.Menu>
                            <Dropdown.Item id={`open-${task.id}`} textValue="Open" onAction={() => { setSelectedTask(task); setIsDetailModalOpen(true); }}>
                                <Label className="cursor-pointer text-sm">Open</Label>
                            </Dropdown.Item>
                            <Dropdown.Item id={`delete-${task.id}`} textValue="Delete" variant="danger" onAction={() => deleteTask(task.id)}>
                                <div className="flex items-center gap-2 text-sm"><Trash2 size={13} />Delete</div>
                            </Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown.Popover>
                </Dropdown>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {!hideHeader && (
                    <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-lg bg-surface-secondary flex items-center justify-center text-muted-foreground">
                            <ListChecks size={13} />
                        </div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
                            <span className="text-xs text-muted-foreground">
                                {tasks.filter(t => t.completed).length}/{tasks.length} done
                            </span>
                            <Dropdown>
                                <Dropdown.Trigger>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                                        isPending={isApplyingTemplate}
                                    >
                                        Templates
                                    </Button>
                                </Dropdown.Trigger>
                                <Dropdown.Popover>
                                    <Dropdown.Menu className="w-56">
                                        <Dropdown.Section>
                                            <Header className="px-2 py-1 text-xs font-medium text-muted-foreground">Deployment Checklists</Header>
                                            {DEPLOYMENT_TEMPLATES.map((tpl, i) => (
                                                <Dropdown.Item key={i} id={String(i)} textValue={tpl.name} onPress={() => applyTemplate(i)}>
                                                    <Label className="text-xs font-medium">{tpl.name}</Label>
                                                </Dropdown.Item>
                                            ))}
                                        </Dropdown.Section>
                                    </Dropdown.Menu>
                                </Dropdown.Popover>
                            </Dropdown>
                        </div>
                    </div>
                )}
                <div className={`flex items-center gap-2 md:justify-end ${!hideHeader ? 'md:flex-1' : 'flex-grow'}`}>
                    {!externalSearchQuery && !hideHeader && (
                        <>
                            <div className="relative flex-grow md:max-w-[320px]">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input 
                                    placeholder="Filter tasks..." 
                                    value={internalSearchQuery}
                                    onChange={(e) => { setInternalSearchQuery(e.target.value); setCurrentPage(1); }}
                                    variant="secondary"
                                    className="w-full h-8 rounded-xl pl-8 text-xs"
                                />
                            </div>
                            <Button 
                                variant={internalHideCompleted ? 'primary' : 'secondary'} 
                                size="sm" 
                                className="h-8 px-2.5 rounded-xl text-xs"
                                onPress={() => { setInternalHideCompleted(!internalHideCompleted); setCurrentPage(1); }}
                            >
                                <Filter size={12} className="mr-1" />
                                {internalHideCompleted ? 'Active Only' : 'All'}
                            </Button>
                        </>
                    )}
                    <Button
                        variant={selectionMode ? 'primary' : 'secondary'}
                        size="sm"
                        className="h-8 px-2.5 rounded-xl text-[12px] font-medium"
                        onPress={() => { setSelectionMode(v => !v); setSelectedIds(new Set()); }}
                    >
                        {selectionMode ? <SquareCheck size={12} className="mr-1" /> : <Square size={12} className="mr-1" />}
                        Select
                    </Button>
                </div>
            </div>

            {selectionMode && selectedIds.size > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 border border-accent/20">
                    <span className="text-[12px] font-medium text-accent flex-1">{selectedIds.size} selected</span>
                    <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2.5 rounded-lg text-[12px]"
                        onPress={handleBulkComplete}
                    >
                        <CheckCircle2 size={12} className="mr-1 text-success" /> Complete
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2.5 rounded-lg text-[12px] text-danger hover:bg-danger-muted"
                        onPress={handleBulkDelete}
                    >
                        <Trash2 size={12} className="mr-1" /> Delete
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 rounded-lg text-[12px] text-muted-foreground"
                        onPress={() => { setSelectedIds(new Set()); setSelectionMode(false); }}
                    >
                        Cancel
                    </Button>
                </div>
            )}

            <div className="flex-grow flex flex-col p-0 overflow-hidden">
                <ScrollShadow className="flex-grow min-h-[520px]" orientation="horizontal">
                    {activeTasks.length === 0 && completedTasks.length === 0 ? (
                        <div className="h-48 flex flex-col items-center justify-center text-center gap-3 border border-dashed border-border rounded-xl">
                            <ListChecks size={20} className="text-muted-foreground/40" />
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">No tasks yet</p>
                                <p className="text-xs text-muted-foreground/60 mt-0.5">Add your first task below.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-border bg-surface">
                            <div className="grid min-w-[880px] grid-cols-[40px_minmax(260px,1fr)_120px_112px_120px_120px_120px_36px] items-center gap-3 border-b border-border bg-surface-secondary/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                <div onClick={(event) => event.stopPropagation()}>
                                    <Checkbox aria-label="Select visible tasks" isSelected={allVisibleSelected} onChange={togglePageSelection}>
                                        <Checkbox.Control className="size-4 rounded-md">
                                            <Checkbox.Indicator />
                                        </Checkbox.Control>
                                    </Checkbox>
                                </div>
                                <span>Issue</span>
                                <span>Status</span>
                                <span>Priority</span>
                                <span>Assignee</span>
                                <span>Subtasks</span>
                                <span>Activity</span>
                                <span />
                            </div>
                                    {paginatedTasks.length === 0 && completedTasks.length === 0 ? (
                                        <div className="h-48 flex flex-col items-center justify-center text-center gap-3 border border-dashed border-border rounded-xl">
                                            <ListChecks size={20} className="text-muted-foreground/40" />
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground">No tasks yet</p>
                                                <p className="text-xs text-muted-foreground/60 mt-0.5">Add your first task below.</p>
                                            </div>
                                        </div>
                                    ) : paginatedTasks.length === 0 ? (
                                        <div className="h-24 flex items-center justify-center">
                                            <p className="text-[13px] text-muted-foreground">All tasks completed — great work!</p>
                                        </div>
                                    ) : (
                                        paginatedTasks.map((task) => renderIssueRow(task))
                                    )}

                        {/* Completed tasks — collapsible, outside DnD */}
                        {completedTasks.length > 0 && !hideCompleted && (
                            <div className="border-t border-border">
                                <Button
                                    variant="ghost"
                                    className="h-9 justify-start gap-1.5 px-3 text-[12px] text-muted-foreground"
                                    onPress={() => setShowCompleted(v => !v)}
                                >
                                    <ChevronRight size={13} className={`transition-transform duration-150 ${showCompleted ? 'rotate-90' : ''}`} />
                                    <CheckCircle2 size={12} className="text-success" />
                                    {completedTasks.length} completed
                                </Button>
                                {showCompleted && (
                                    <div>
                                        {completedTasks.map(task => renderIssueRow(task, true))}
                                    </div>
                                )}
                            </div>
                        )}
                        </div>
                    )}

                    {totalPages > 1 && (
                        <div className="flex justify-center pt-4 border-t border-border">
                            <Pagination 
                                total={totalPages} 
                                initialPage={1}
                                page={currentPage} 
                                onChange={setCurrentPage}
                                variant="secondary"
                                color="accent"
                                size="sm"
                            />
                        </div>
                    )}
                </ScrollShadow>

                <div className="pt-3 border-t border-border">
                    <form ref={addTaskFormRef} onSubmit={handleAddTask} className="flex items-center gap-2">
                        <div className="relative flex-grow">
                            <Input 
                                value={newTaskTitle}
                                onChange={(e) => setNewTaskTitle(e.target.value)}
                                placeholder="Add a new task..." 
                                variant="secondary"
                                className="h-8 rounded-xl pl-3 pr-10 text-sm"
                            />
                            <Button 
                                type="submit" 
                                variant="primary" 
                                isIconOnly 
                                className="absolute right-1 top-1 h-6 w-6 rounded-md"
                            >
                                <Plus size={14} />
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
            {selectedTask && (
                <TaskDetailModal 
                    isOpen={isDetailModalOpen}
                    onOpenChange={setIsDetailModalOpen}
                    task={tasks.find(t => t.id === selectedTask.id) || selectedTask}
                    projectId={projectId}
                    onUpdate={fetchTasks}
                />
            )}
        </div>
    );
}
