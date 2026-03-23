'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData } from '@/lib/crypto';
import { db } from '@/lib/db';
import { wsClient, WSEvent } from '@/lib/ws';
import { Task } from '@/types';
import { Button, Dropdown, Label, ScrollShadow, toast } from "@heroui/react";
import dayjs from 'dayjs';
import { Calendar, Check, Clock, Lock, MessageCircle, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TaskDetailModal } from './TaskDetailModal';

const COLUMNS: { id: Task['kanbanStatus']; label: string; dotColor: string; includes?: Task['kanbanStatus'][] }[] = [
    { id: 'todo', label: 'To Do', dotColor: 'bg-accent' },
    { id: 'in-progress', label: 'In Progress', dotColor: 'bg-warning' },
    { id: 'review', label: 'Need Review', dotColor: 'bg-danger', includes: ['waiting'] },
    { id: 'done', label: 'Done', dotColor: 'bg-success' },
];

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
    hideCompleted = false
}: {
    projectId: string,
    searchQuery?: string,
    hideCompleted?: boolean
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

            const filteredTasks = decryptedTasks.filter(t => {
                const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase());
                const matchesCompleted = hideCompleted ? (t.kanbanStatus !== 'done' && !t.completed) : true;
                return matchesSearch && matchesCompleted;
            });

            setTasks(filteredTasks);
        } catch (error) {
            console.error(error);
        } finally {
            if (isInitial) setIsLoading(false);
        }
    }, [projectId, user, privateKey, documentKey, searchQuery, hideCompleted]);

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
            toast.danger('Sync failed, movement reverted');
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
            <div className="w-5 h-5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        </div>
    );

    const mainTasks = tasks.filter(t => !t.parentId);

    // Helper to get column tasks, including merged statuses
    // A task with completed=true is always treated as 'done' regardless of kanbanStatus
    const getColumnTasks = (column: typeof COLUMNS[number]) => {
        const statuses = [column.id, ...(column.includes || [])];
        return mainTasks.filter(t => {
            const effectiveStatus = t.completed ? 'done' : (t.kanbanStatus || 'todo');
            return statuses.includes(effectiveStatus);
        });
    };

    return (
        <ScrollShadow className="pb-6 -mx-6 px-6" orientation="horizontal" hideScrollBar>
            <div className="flex gap-5 min-w-max md:min-w-[1100px]">
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
                            </div>

                            {/* Column Body */}
                            <div
                                className="flex-1 space-y-3 p-2 rounded-2xl bg-surface-secondary/30 min-h-[500px] transition-colors"
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
                                            className="px-3 py-2.5 rounded-xl border border-border/60 bg-surface cursor-grab active:cursor-grabbing hover:border-border transition-all group"
                                        >
                                            {/* Title row with menu */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    {task.isEncrypted && <Lock size={9} className="text-muted-foreground/50 shrink-0 mt-0.5" />}
                                                    <p className="text-[13px] font-medium text-foreground leading-snug">{task.title}</p>
                                                </div>
                                                <Dropdown>
                                                    <Dropdown.Trigger>
                                                        <button
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="p-0.5 rounded text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:text-muted-foreground transition-all shrink-0"
                                                        >
                                                            <MoreHorizontal size={13} />
                                                        </button>
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
                                            {(priorityConfig || task.deadline || (task.timeSpent && task.timeSpent > 0) || (task.notes && task.notes.length > 0)) && (
                                                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                                    {priorityConfig && (
                                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                                                            priorityConfig.color === 'danger' ? 'bg-danger/10 text-danger' :
                                                            priorityConfig.color === 'warning' ? 'bg-warning/10 text-warning' :
                                                            'bg-accent/10 text-accent'
                                                        }`}>
                                                            {priorityConfig.label}
                                                        </span>
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
                                        </div>
                                    );
                                })}

                                {/* Add task inline */}
                                {addingToColumn === column.id ? (
                                    <div className="p-3 rounded-xl border border-accent/40 bg-surface space-y-2">
                                        <input
                                            ref={newTaskInputRef}
                                            value={newTaskTitle}
                                            onChange={e => setNewTaskTitle(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleAddTask(column.id);
                                                if (e.key === 'Escape') cancelAdding();
                                            }}
                                            placeholder="Task title..."
                                            className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none"
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
                                        className="w-full h-8 border border-dashed border-border/60 hover:border-accent/40 text-[12px] text-muted-foreground hover:text-accent rounded-xl transition-all bg-transparent"
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
