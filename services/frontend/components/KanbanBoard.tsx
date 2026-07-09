'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { taskMatchesFilters } from '@/services/frontend/lib/task-filters';
import { wsClient, WSEvent } from '@/services/frontend/lib/ws';
import { ProjectFile, Task, TaskAssignee, TaskComment } from '@/services/frontend/types';
import { Avatar, Button, Chip, Dropdown, Input, Label, ScrollShadow, Spinner, toast } from "@heroui/react";
import dayjs from 'dayjs';
import { Calendar, Check, Clock, GitBranch, Lock, MessageCircle, MoreHorizontal, Paperclip, Plus, Trash2, UserCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TaskDetailModal } from './TaskDetailModal';

const COLUMNS: { id: Task['kanbanStatus']; label: string; dotColor: string; includes?: Task['kanbanStatus'][] }[] = [
    { id: 'todo', label: 'To Do', dotColor: 'bg-accent' },
    { id: 'in-progress', label: 'In Progress', dotColor: 'bg-warning' },
    { id: 'review', label: 'Need Review', dotColor: 'bg-danger', includes: ['waiting'] },
    { id: 'done', label: 'Done', dotColor: 'bg-success' },
];

type TaskMeta = {
    assignees: TaskAssignee[];
    files: ProjectFile[];
    comments: TaskComment[];
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
    quickFilter = 'all'
}: {
    projectId: string,
    searchQuery?: string,
    selectedTags?: string[],
    hideCompleted?: boolean,
    quickFilter?: 'all' | 'mine' | 'unassigned' | 'due-soon' | 'blocked'
}) {
    const { user, privateKey } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isEncrypted, setIsEncrypted] = useState(false);
    const [documentKey, setDocumentKey] = useState<CryptoKey | null>(null);
    const [addingToColumn, setAddingToColumn] = useState<Task['kanbanStatus'] | null>(null);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [taskMeta, setTaskMeta] = useState<Record<string, TaskMeta>>({});
    const newTaskInputRef = useRef<HTMLInputElement>(null);

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
                            return { ...task, title: decryptedTitle };
                        } catch {
                            return { ...task, title: 'Decryption Error' };
                        }
                    }
                    return { ...task, title: 'Encrypted Task' };
                }
                return task;
            }));

            const visibleParentIds = new Set(
                decryptedTasks
                    .filter(task => !task.parentId)
                    .filter(task => {
                        const subtasks = decryptedTasks.filter(subtask => subtask.parentId === task.id);
                        const matchesTask = taskMatchesFilters(task, searchQuery, selectedTags);
                        const matchesSubtask = subtasks.some(subtask => taskMatchesFilters(subtask, searchQuery, selectedTags));
                        const matchesCompleted = hideCompleted ? (task.kanbanStatus !== 'done' && !task.completed) : true;
                        return (matchesTask || matchesSubtask) && matchesCompleted;
                    })
                    .map(task => task.id)
            );

            const filteredTasks = decryptedTasks.filter(task => {
                if (!task.parentId) {
                    return visibleParentIds.has(task.id);
                }
                return visibleParentIds.has(task.parentId);
            });

            setTasks(filteredTasks);
            const parentTasks = filteredTasks.filter((task) => !task.parentId).slice(0, 50);
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
            console.error(error);
        } finally {
            if (isInitial) setIsLoading(false);
        }
    }, [projectId, user, privateKey, documentKey, searchQuery, selectedTags, hideCompleted]);

    useEffect(() => {
        fetchTasks(true);
    }, [fetchTasks]);

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
            startAdding(detail?.column || 'todo');
        };
        window.addEventListener('kanban-add-task', handler);
        return () => window.removeEventListener('kanban-add-task', handler);
    }, []);

    const moveTask = async (taskId: string, newStatus: Task['kanbanStatus']) => {
        const previousTasks = [...tasks];
        try {
            const isCompleted = newStatus === 'done';
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, kanbanStatus: newStatus, completed: isCompleted } : t));

            await db.updateTask(taskId, { kanbanStatus: newStatus, completed: isCompleted });
            toast.success(`Task moved to ${COLUMNS.find(c => c.id === newStatus)?.label}`);
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

    const startAdding = (columnId: Task['kanbanStatus']) => {
        setAddingToColumn(columnId);
        setNewTaskTitle('');
        setTimeout(() => newTaskInputRef.current?.focus(), 0);
    };

    const cancelAdding = () => {
        setAddingToColumn(null);
        setNewTaskTitle('');
    };

    const handleAddTask = async (columnId: Task['kanbanStatus']) => {
        if (!newTaskTitle.trim()) { cancelAdding(); return; }
        setIsCreating(true);
        try {
            let finalTitle = newTaskTitle.trim();
            if (isEncrypted && documentKey) {
                const encrypted = await encryptData(finalTitle, documentKey);
                finalTitle = JSON.stringify(encrypted);
            }
            await db.createEmptyTask(projectId, finalTitle, mainTasks.length, isEncrypted, undefined, columnId);
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

    const mainTasks = tasks.filter(t => !t.parentId);

    // Helper to get column tasks, including merged statuses
    // A task with completed=true is always treated as 'done' regardless of kanbanStatus
    const getColumnTasks = (column: typeof COLUMNS[number]) => {
        const statuses = [column.id, ...(column.includes || [])];
        return mainTasks.filter(t => {
            const effectiveStatus = t.completed ? 'done' : (t.kanbanStatus || 'todo');
            const meta = taskMeta[t.id] || { assignees: [], files: [], comments: [] };
            const matchesQuickFilter =
                quickFilter === 'all' ||
                (quickFilter === 'mine' && !!user && meta.assignees.some((assignee) => assignee.userId === user.id)) ||
                (quickFilter === 'unassigned' && meta.assignees.length === 0) ||
                (quickFilter === 'due-soon' && !!t.deadline && !t.completed && dayjs(t.deadline).diff(dayjs(), 'day') <= 7) ||
                (quickFilter === 'blocked' && ((t.dependencies || []).length > 0 || t.kanbanStatus === 'waiting'));
            return statuses.includes(effectiveStatus) && matchesQuickFilter;
        });
    };

    return (
        <ScrollShadow className="pb-6 -mx-6 px-6" orientation="horizontal" hideScrollBar>
            <div className="flex gap-4 min-w-max md:min-w-[1100px]">
                {COLUMNS.map(column => {
                    const columnTasks = getColumnTasks(column);
                    return (
                        <div key={column.id} className="flex flex-col gap-3 w-[280px] shrink-0">
                            {/* Column Header */}
                            <div className="flex items-center justify-between px-1 py-1.5">
                                <div className="flex items-center gap-2.5">
                                    <div className={`w-2.5 h-2.5 rounded-full ${column.dotColor}`} />
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
                                    moveTask(taskId, column.id);
                                }}
                            >
                                {columnTasks.map(task => {
                                    const subtasks = tasks.filter(st => st.parentId === task.id);
                                    const completedSubtasks = subtasks.filter(st => st.completed).length;
                                    const priorityConfig = getPriorityConfig(task.priority);
                                    const meta = taskMeta[task.id] || { assignees: [], files: [], comments: [] };

                                    return (
                                        <div
                                            key={task.id}
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData('taskId', task.id);
                                            }}
                                            onClick={() => {
                                                setSelectedTask(task);
                                                setIsDetailModalOpen(true);
                                            }}
                                            className="rounded-lg border border-border/70 bg-surface px-3 py-2.5 cursor-grab active:cursor-grabbing hover:border-accent/40 hover:bg-surface-secondary/20 transition-all group"
                                        >
                                            {/* Title row with menu */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    {task.isEncrypted && <Lock size={9} className="text-muted-foreground/50 shrink-0 mt-0.5" />}
                                                    <p className="text-[13px] font-medium text-foreground leading-snug line-clamp-2">{task.title}</p>
                                                </div>
                                                <Dropdown>
                                                    <Dropdown.Trigger>
                                                        <Button
                                                            variant="ghost"
                                                            isIconOnly
                                                            className="h-6 w-6 rounded-md text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:text-muted-foreground shrink-0"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <MoreHorizontal size={13} />
                                                        </Button>
                                                    </Dropdown.Trigger>
                                                    <Dropdown.Popover placement="bottom end" className="min-w-[140px]">
                                                        <Dropdown.Menu>
                                                            <Dropdown.Item
                                                                id={`edit-${task.id}`}
                                                                textValue="Edit"
                                                                onAction={() => { setSelectedTask(task); setIsDetailModalOpen(true); }}
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

                                            {/* Subtask progress */}
                                            {subtasks.length > 0 && (
                                                <div className="flex items-center gap-2 mt-2">
                                                    <div className="flex-1 h-0.5 bg-surface-secondary rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-accent/40 rounded-full transition-all"
                                                            style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] text-muted-foreground/60 tabular-nums">{completedSubtasks}/{subtasks.length}</span>
                                                </div>
                                            )}

                                            {/* Footer: priority + metadata chips */}
                                            {(priorityConfig || (task.tags && task.tags.length > 0) || task.deadline || (task.timeSpent && task.timeSpent > 0) || (task.notes && task.notes.length > 0)) && (
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
                                                    {task.deadline && (
                                                        <span className={`flex items-center gap-1 text-[10px] ${
                                                            dayjs(task.deadline).isBefore(dayjs(), 'minute') ? 'text-danger' :
                                                            dayjs(task.deadline).isSame(dayjs(), 'day') ? 'text-warning' :
                                                            'text-muted-foreground/60'
                                                        }`}>
                                                            <Calendar size={10} />
                                                            {dayjs(task.deadline).format('MMM D')}
                                                        </span>
                                                    )}
                                                    {task.timeSpent !== undefined && task.timeSpent > 0 && (
                                                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                                                            <Clock size={10} />
                                                            {Math.floor(task.timeSpent / 3600)}h
                                                        </span>
                                                    )}
                                                    {task.notes && task.notes.length > 0 && (
                                                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                                                            <MessageCircle size={10} />
                                                            {task.notes.length}
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
                                {addingToColumn === column.id ? (
                                    <div className="p-3 rounded-lg border border-accent/40 bg-surface space-y-2">
                                        <Input
                                            ref={newTaskInputRef}
                                            value={newTaskTitle}
                                            onChange={e => setNewTaskTitle(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleAddTask(column.id);
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
                                                onPress={() => handleAddTask(column.id)}
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
                                        onPress={() => startAdding(column.id)}
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
            {selectedTask && (
                <TaskDetailModal
                    isOpen={isDetailModalOpen}
                    onOpenChange={setIsDetailModalOpen}
                    task={tasks.find(t => t.id === selectedTask.id) || selectedTask}
                    projectId={projectId}
                    onUpdate={fetchTasks}
                />
            )}
        </ScrollShadow>
    );
}
