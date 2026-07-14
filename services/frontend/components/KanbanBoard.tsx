'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { getDeadlineDisplay, isDueSoon, isOverdue, sortTasksBySchedule, useScheduleNow } from '@/services/frontend/lib/task-schedule';
import { getCompletedStatus, getStatusTokenDotClass } from '@/services/frontend/lib/task-statuses';
import { taskMatchesFilters } from '@/services/frontend/lib/task-filters';
import { wsClient, WSEvent } from '@/services/frontend/lib/ws';
import { ProjectFile, ProjectTaskStatus, Task, TaskAssignee, TaskMessage } from '@/services/frontend/types';
import { Avatar, Button, Chip, Dropdown, Input, Label, ScrollShadow, Spinner, toast } from "@heroui/react";
import { Calendar, Check, Clock, CornerDownRight, GitBranch, Lock, MessageCircle, MoreHorizontal, Paperclip, Plus, Trash2, UserCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type TaskMeta = {
    assignees: TaskAssignee[];
    files: ProjectFile[];
    comments: TaskMessage[];
};

function getPriorityConfig(priority?: string) {
    switch (priority) {
        case 'urgent': return { label: 'Urgent', color: 'danger' as const };
        case 'high': return { label: 'High', color: 'danger' as const };
        case 'medium': return { label: 'Medium', color: 'warning' as const };
        case 'low': return { label: 'Low', color: 'success' as const };
        default: return null;
    }
}

export function KanbanBoard({
    projectId,
    searchQuery = '',
    selectedTags = [],
    hideCompleted = false,
    quickFilter = 'all',
    statusOptions = [],
    refreshToken,
    onOpenTask,
}: {
    projectId: string,
    searchQuery?: string,
    selectedTags?: string[],
    hideCompleted?: boolean,
    quickFilter?: 'all' | 'mine' | 'unassigned' | 'due-soon' | 'overdue' | 'blocked',
    statusOptions?: ProjectTaskStatus[],
    refreshToken?: number,
    onOpenTask?: (task: Task) => void,
}) {
    const { user, privateKey } = useAuth();
    const scheduleNow = useScheduleNow();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEncrypted, setIsEncrypted] = useState(false);
    const [documentKey, setDocumentKey] = useState<CryptoKey | null>(null);
    const [addingToColumn, setAddingToColumn] = useState<string | null>(null);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [taskMeta, setTaskMeta] = useState<Record<string, TaskMeta>>({});
    const newTaskInputRef = useRef<HTMLInputElement>(null);
    const resolvedStatuses = [...statusOptions].sort((a, b) => a.position - b.position);
    const completedStatus = getCompletedStatus(resolvedStatuses);

    const fetchTasks = useCallback(async (isInitial = false) => {
        if (isInitial) setIsLoading(true);
        try {
            const res = await db.listTasks(projectId);
            const rawTasks = res.documents as unknown as Task[];

            const project = await db.getProject(projectId);
            setIsEncrypted(!!project.isEncrypted);

            let docKey = documentKey;
            if (project.isEncrypted && privateKey && user && !docKey) {
                const access = await db.getAccessKey(projectId);
                if (access) {
                    docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    setDocumentKey(docKey);
                }
            }

            const decryptedTasks = await Promise.all(rawTasks.map(async (task) => {
                if (task.isEncrypted) {
                    if (docKey) {
	                        try {
	                            const encryptedData = JSON.parse(task.title);
	                            const decryptedTitle = await decryptData(encryptedData, docKey);
	                            let decryptedDescription = task.description || '';
	                            if (task.description) {
	                                const descriptionData = JSON.parse(task.description);
	                                decryptedDescription = await decryptData(descriptionData, docKey);
	                            }
	                            return { ...task, title: decryptedTitle, description: decryptedDescription };
	                        } catch {
	                            return { ...task, title: 'Decryption Error', description: '' };
	                        }
	                    }
	                    return { ...task, title: 'Encrypted Task', description: '' };
	                }
                return task;
            }));

            setTasks(decryptedTasks);
            const metaTasks = decryptedTasks.slice(0, 100);
            const metaEntries = await Promise.all(metaTasks.map(async (task) => {
                try {
                    const [assigneesRes, filesRes, commentsRes] = await Promise.all([
                        db.listTaskAssignees(task.id),
                        db.listTaskFiles(task.id),
                        db.listTaskMessages(task.id),
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
            console.error(error);
        } finally {
            if (isInitial) setIsLoading(false);
        }
    }, [projectId, user, privateKey, documentKey]);

    useEffect(() => {
        fetchTasks(true);
    }, [fetchTasks]);

    useEffect(() => {
        if (refreshToken === undefined) return;
        void fetchTasks(false);
    }, [fetchTasks, refreshToken]);

    useEffect(() => {
        const unsub = wsClient.subscribe(async (event: WSEvent) => {
            if (event.collection === 'tasks') {
                const payload = event.document as unknown as Task;
                if (payload.projectId !== projectId) return;

                if (event.type === 'delete') {
                    setTasks(prev => prev.filter(t => t.id !== payload.id));
                    return;
                }

                await fetchTasks(false);
            }
        });

        return () => unsub();
    }, [projectId, fetchTasks]);

    // Listen for add-task event from project page header button
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            startAdding(detail?.column || resolvedStatuses[0]?.key || 'todo');
        };
        window.addEventListener('kanban-add-task', handler);
        return () => window.removeEventListener('kanban-add-task', handler);
    }, [resolvedStatuses]);

    const boardTasks = sortTasksBySchedule(tasks, tasks, scheduleNow);

    const getVisibleColumnTasks = useCallback((statusKey: string) => {
        return boardTasks.filter((t) => {
            const effectiveStatus = t.completed ? completedStatus.key : (t.kanbanStatus || resolvedStatuses[0]?.key || 'todo');
            const meta = taskMeta[t.id] || { assignees: [], files: [], comments: [] };
            const matchesQuickFilter =
                quickFilter === 'all' ||
                (quickFilter === 'mine' && !!user && meta.assignees.some((assignee) => assignee.userId === user.id)) ||
                (quickFilter === 'unassigned' && meta.assignees.length === 0) ||
                (quickFilter === 'due-soon' && !t.completed && isDueSoon(t.deadline, scheduleNow)) ||
                (quickFilter === 'overdue' && !t.completed && isOverdue(t.deadline, scheduleNow)) ||
                (quickFilter === 'blocked' && ((t.dependencies || []).length > 0));
            const matchesSearch = taskMatchesFilters(t, searchQuery, selectedTags);
            const matchesCompleted = hideCompleted ? !t.completed : true;
            return effectiveStatus === statusKey && matchesQuickFilter && matchesSearch && matchesCompleted;
        });
    }, [boardTasks, completedStatus.key, hideCompleted, quickFilter, resolvedStatuses, scheduleNow, searchQuery, selectedTags, taskMeta, user]);

    const persistTaskOrder = useCallback(async (nextTasks: Task[]) => {
        await db.reorderTasks(
            projectId,
            nextTasks.map((task, index) => ({
                id: task.id,
                kanbanStatus: task.kanbanStatus,
                completed: task.completed,
                order: index,
            })),
        );
    }, [projectId]);

    const moveTask = async (taskId: string, newStatus: string, beforeTaskId?: string) => {
        const previousTasks = [...tasks];
        const movedTask = boardTasks.find((task) => task.id === taskId);
        if (!movedTask) return;

        const nextStatus = resolvedStatuses.find((status) => status.key === newStatus);
        const columnMap = new Map<string, Task[]>();
        resolvedStatuses.forEach((status) => columnMap.set(status.key, []));

        const normalizedTasks = boardTasks.map((task) => task.id === taskId
            ? { ...task, kanbanStatus: newStatus, completed: nextStatus?.isCompletedState ?? false }
            : task,
        );

        for (const task of normalizedTasks) {
            const statusKey = task.completed ? completedStatus.key : (task.kanbanStatus || resolvedStatuses[0]?.key || 'todo');
            const bucket = columnMap.get(statusKey) || [];
            if (task.id !== taskId) {
                bucket.push(task);
                columnMap.set(statusKey, bucket);
            }
        }

        const targetColumn = [...(columnMap.get(newStatus) || [])];
        if (beforeTaskId) {
            const insertIndex = targetColumn.findIndex((task) => task.id === beforeTaskId);
            if (insertIndex >= 0) {
                targetColumn.splice(insertIndex, 0, { ...movedTask, kanbanStatus: newStatus, completed: nextStatus?.isCompletedState ?? false });
            } else {
                targetColumn.push({ ...movedTask, kanbanStatus: newStatus, completed: nextStatus?.isCompletedState ?? false });
            }
        } else {
            targetColumn.push({ ...movedTask, kanbanStatus: newStatus, completed: nextStatus?.isCompletedState ?? false });
        }
        columnMap.set(newStatus, targetColumn);

        const reorderedTasks = resolvedStatuses.flatMap((status) => columnMap.get(status.key) || []).map((task, index) => ({
            ...task,
            order: index,
        }));

        const reorderedMap = new Map(reorderedTasks.map((task) => [task.id, task]));
        setTasks((current) => current.map((task) => reorderedMap.get(task.id) || task));

        try {
            await persistTaskOrder(reorderedTasks);
            toast.success(`Task moved to ${nextStatus?.label || newStatus}`);
        } catch (error) {
            console.error('Failed to move task, rolling back:', error);
            setTasks(previousTasks);
            toast.danger(error instanceof Error ? error.message : 'Sync failed, movement reverted');
        }
    };

    const deleteTask = async (taskId: string) => {
        const previousTasks = [...tasks];
        try {
            setTasks(prev => prev.filter(t => t.id !== taskId));
            await db.deleteTask(taskId);
            toast.success('Task deleted');
        } catch (error) {
            console.error('Failed to delete task:', error);
            setTasks(previousTasks);
            toast.danger('Failed to delete task');
        }
    };

    const startAdding = (columnId: string) => {
        setAddingToColumn(columnId);
        setNewTaskTitle('');
        setTimeout(() => newTaskInputRef.current?.focus(), 0);
    };

    const cancelAdding = () => {
        setAddingToColumn(null);
        setNewTaskTitle('');
    };

    const handleAddTask = async (columnId: string) => {
        if (!newTaskTitle.trim()) { cancelAdding(); return; }
        setIsCreating(true);
        try {
            let finalTitle = newTaskTitle.trim();
            if (isEncrypted && documentKey) {
                const encrypted = await encryptData(finalTitle, documentKey);
                finalTitle = JSON.stringify(encrypted);
            }
            await db.createEmptyTask(projectId, finalTitle, boardTasks.length, isEncrypted, undefined, columnId);
            fetchTasks();
            setNewTaskTitle('');
            setAddingToColumn(null);
        } catch (error) {
            console.error('Failed to create task:', error);
            toast.danger('Failed to create task');
        } finally {
            setIsCreating(false);
        }
    };

    if (isLoading) return (
            <div className="h-64 flex items-center justify-center">
            <Spinner size="sm" color="accent" />
        </div>
    );

    return (
        <ScrollShadow className="pb-6 -mx-6 px-6" orientation="horizontal" hideScrollBar>
            <div className="flex gap-4 min-w-max md:min-w-[1100px]">
                {resolvedStatuses.map((column) => {
                    const columnTasks = getVisibleColumnTasks(column.key);
                    return (
                        <div key={column.id} className="flex flex-col gap-3 w-[280px] shrink-0">
                            {/* Column Header */}
                            <div className="flex items-center justify-between px-1 py-1.5">
                                <div className="flex items-center gap-2.5">
                                    <div className={`w-2.5 h-2.5 rounded-full ${getStatusTokenDotClass(column.colorToken)}`} />
                                    <h3 className="text-sm font-semibold text-foreground">{column.label}</h3>
                                </div>
                                <Chip size="sm" variant="soft" color="default" className="h-5 rounded-md">
                                    <Chip.Label className="text-[11px] tabular-nums">{columnTasks.length}</Chip.Label>
                                </Chip>
                            </div>

                            {/* Column Body */}
                            <div
                                className="flex-1 space-y-2 p-2 rounded-xl bg-surface-secondary/35 min-h-[520px] transition-colors"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    const taskId = e.dataTransfer.getData('taskId');
                                    void moveTask(taskId, column.key);
                                }}
                            >
                                {columnTasks.map(task => {
                                    const subtasks = tasks.filter((candidate) => candidate.parentId === task.id);
                                    const completedSubtasks = subtasks.filter((subtask) => subtask.completed).length;
                                    const parentTask = task.parentId ? tasks.find((candidate) => candidate.id === task.parentId) : undefined;
                                    const priorityConfig = getPriorityConfig(task.priority);
                                    const meta = taskMeta[task.id] || { assignees: [], files: [], comments: [] };
                                    const deadlineDisplay = !task.completed ? getDeadlineDisplay(task.deadline, scheduleNow) : null;

                                    return (
                                        <div
                                            key={task.id}
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData('taskId', task.id);
                                            }}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const taskId = e.dataTransfer.getData('taskId');
                                                void moveTask(taskId, column.key, task.id);
                                            }}
                                            onClick={() => {
                                                onOpenTask?.(task);
                                            }}
                                            className={`rounded-lg border border-border/70 bg-surface px-3 py-2.5 cursor-grab active:cursor-grabbing hover:border-accent/40 hover:bg-surface-secondary/20 transition-all group ${task.parentId ? 'border-l-2 border-l-accent/50' : ''}`}
                                        >
                                            {/* Title row with menu */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    {task.isEncrypted && <Lock size={9} className="text-muted-foreground/50 shrink-0 mt-0.5" />}
                                                    <p className="text-[13px] font-medium text-foreground leading-snug line-clamp-2">{task.title}</p>
                                                </div>
                                                <Dropdown>
                                                    <Button
                                                            aria-label={`Actions for ${task.title}`}
                                                            variant="ghost"
                                                            isIconOnly
                                                            className="h-6 w-6 rounded-md text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:text-muted-foreground shrink-0"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <MoreHorizontal size={13} />
                                                        </Button>
                                                    <Dropdown.Popover placement="bottom end" className="min-w-[140px]">
                                                        <Dropdown.Menu>
                                                            <Dropdown.Item
                                                                id={`edit-${task.id}`}
                                                                textValue="Edit"
                                                                onAction={() => onOpenTask?.(task)}
                                                            >
                                                                <div className="flex items-center gap-2 text-[12px]">
                                                                    <MessageCircle size={12} />
                                                                    <Label className="cursor-pointer">Open</Label>
                                                                </div>
                                                            </Dropdown.Item>
                                                            <Dropdown.Item
                                                                id={`delete-${task.id}`}
                                                                textValue="Delete"
                                                                variant="danger"
                                                                onAction={() => deleteTask(task.id)}
                                                            >
                                                                <div className="flex items-center gap-2 text-[12px]">
                                                                    <Trash2 size={12} />
                                                                    <Label className="cursor-pointer">Delete</Label>
                                                                </div>
                                                            </Dropdown.Item>
                                                        </Dropdown.Menu>
                                                    </Dropdown.Popover>
                                                </Dropdown>
                                            </div>

                                            <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                                {task.taskKey}
                                            </div>

                                            {task.parentId ? (
                                                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                                    <CornerDownRight size={12} className="text-accent" />
                                                    <span>Subtask of {parentTask?.taskKey || 'parent task'}</span>
                                                </div>
                                            ) : subtasks.length > 0 ? (
                                                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                                                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-secondary">
                                                        <div
                                                            className="h-full rounded-full bg-accent/60 transition-all"
                                                            style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
                                                        />
                                                    </div>
                                                    <span className="shrink-0 tabular-nums">{completedSubtasks}/{subtasks.length} subtasks</span>
                                                </div>
                                            ) : null}

                                            {/* Footer: priority + metadata chips */}
                                            {(priorityConfig || (task.tags && task.tags.length > 0) || deadlineDisplay || (task.timeSpent && task.timeSpent > 0)) && (
                                                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                                    {priorityConfig && (
                                                        <Chip size="sm" variant="soft" color={priorityConfig.color} className="h-5 rounded-md">
                                                            <Chip.Label className="text-[10px]">{priorityConfig.label}</Chip.Label>
                                                        </Chip>
                                                    )}
                                                    {task.tags && task.tags.length > 0 && task.tags.slice(0, 2).map(tag => (
                                                        <span key={tag} className="text-[10px] text-muted-foreground/70">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                    {task.tags && task.tags.length > 2 && (
                                                        <span className="text-[10px] text-muted-foreground/50">+{task.tags.length - 2}</span>
                                                    )}
                                                    {deadlineDisplay && (
                                                        <span className={`flex items-center gap-1 text-[10px] ${
                                                            deadlineDisplay.color === 'danger' ? 'text-danger font-medium' :
                                                            deadlineDisplay.color === 'warning' ? 'text-warning font-medium' : 'text-muted-foreground/60'
                                                        }`}>
                                                            <Calendar size={10} />
                                                            {deadlineDisplay.label}
                                                        </span>
                                                    )}
                                                    {task.timeSpent !== undefined && task.timeSpent > 0 && (
                                                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                                                            <Clock size={10} />
                                                            {Math.floor(task.timeSpent / 3600)}h
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-2">
                                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                                    {meta.assignees.length > 0 ? (
                                                        <div className="flex -space-x-2">
                                                            {meta.assignees.slice(0, 3).map((assignee) => (
                                                                <Avatar key={assignee.userId} size="sm" color="accent" variant="soft" className="border border-surface">
                                                                    <Avatar.Fallback>{assignee.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                                                </Avatar>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1"><UserCircle size={13} />Unassigned</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                                    {(task.dependencies || []).length > 0 && <span className="inline-flex items-center gap-1"><GitBranch size={11} />{task.dependencies?.length}</span>}
                                                    {meta.comments.length > 0 && <span className="inline-flex items-center gap-1"><MessageCircle size={11} />{meta.comments.length}</span>}
                                                    {meta.files.length > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={11} />{meta.files.length}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Add task inline */}
                                {addingToColumn === column.key ? (
                                    <div className="p-3 rounded-lg border border-accent/40 bg-surface space-y-2">
                                        <Input
                                            ref={newTaskInputRef}
                                            value={newTaskTitle}
                                            onChange={e => setNewTaskTitle(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleAddTask(column.key);
                                                if (e.key === 'Escape') cancelAdding();
                                            }}
                                            placeholder="Task title..."
                                            variant="secondary"
                                            className="w-full rounded-xl text-[13px]"
                                        />
                                        <div className="flex items-center gap-1.5">
                                            <Button
                                                size="sm"
                                                variant="primary"
                                                className="h-6 px-2.5 rounded-lg text-[11px]"
                                                onPress={() => handleAddTask(column.key)}
                                                isPending={isCreating}
                                            >
                                                <Check size={11} className="mr-0.5" /> Add
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 w-6 p-0 rounded-lg text-muted-foreground"
                                                onPress={cancelAdding}
                                            >
                                                <X size={11} />
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        className="w-full h-8 border border-dashed border-border/60 hover:border-accent/40 text-[12px] text-muted-foreground hover:text-accent rounded-lg transition-all bg-transparent"
                                        onPress={() => startAdding(column.key)}
                                    >
                                        <Plus size={14} className="mr-1.5" />
                                        New Task
                                    </Button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </ScrollShadow>
    );
}
