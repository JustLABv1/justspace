'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData } from '@/lib/crypto';
import { db } from '@/lib/db';
import { wsClient, WSEvent } from '@/lib/ws';
import { Task } from '@/types';
import { Button, Chip, ScrollShadow, toast } from "@heroui/react";
import dayjs from 'dayjs';
import { Calendar, Clock, GripVertical, Lock, MessageCircle, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { TaskDetailModal } from './TaskDetailModal';

const COLUMNS: { id: Task['kanbanStatus']; label: string; color: 'accent' | 'success' | 'warning' | 'default' }[] = [
    { id: 'todo', label: 'Todo', color: 'default' },
    { id: 'in-progress', label: 'In Progress', color: 'accent' },
    { id: 'review', label: 'Review', color: 'warning' },
    { id: 'waiting', label: 'Waiting', color: 'accent' },
    { id: 'done', label: 'Done', color: 'success' },
];

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

    const fetchTasks = useCallback(async (isInitial = false) => {
        if (isInitial) setIsLoading(true);
        try {
            const res = await db.listTasks(projectId);
            const rawTasks = res.documents as unknown as Task[];

            // Get decryption key if project is encrypted
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

            // Filter tasks based on Search and Hide Completed before setting state
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

    const moveTask = async (taskId: string, newStatus: Task['kanbanStatus']) => {
        const previousTasks = [...tasks];
        try {
            const isCompleted = newStatus === 'done';
            // Optimistic update
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, kanbanStatus: newStatus, completed: isCompleted } : t));
            
            await db.updateTask(taskId, { kanbanStatus: newStatus, completed: isCompleted });
            toast.success(`Task moved to ${COLUMNS.find(c => c.id === newStatus)?.label.replace('_', '')}`);
        } catch (error) {
            console.error('Failed to move task, rolling back:', error);
            setTasks(previousTasks);
            toast.danger('Sync failed, movement reverted');
        }
    };

    if (isLoading) return (
        <div className="h-64 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        </div>
    );

    const mainTasks = tasks.filter(t => !t.parentId);

    return (
        <ScrollShadow className="pb-6 -mx-6 px-6" orientation="horizontal" hideScrollBar>
            <div className="flex gap-6 min-w-max md:min-w-[1200px]">
                {COLUMNS.map(column => {
                    const columnTasks = mainTasks.filter(t => (t.kanbanStatus || 'todo') === column.id);
                    return (
                        <div key={column.id} className="flex flex-col gap-2.5 w-[270px] shrink-0">
                            <div className="flex items-center justify-between px-1 py-1">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${
                                        column.color === 'default' ? 'bg-muted-foreground/40' : 
                                        column.color === 'accent' ? 'bg-accent' : 
                                        column.color === 'success' ? 'bg-success' : 
                                        column.color === 'warning' ? 'bg-warning' : 'bg-accent/60'
                                    }`} />
                                    <h3 className="text-[13px] font-medium text-foreground">{column.label}</h3>
                                    <span className="text-[12px] text-muted-foreground">{columnTasks.length}</span>
                                </div>
                            </div>

                            <div 
                                className="flex-1 space-y-2 p-1.5 rounded-2xl bg-surface-secondary/30 min-h-[500px] transition-colors"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    const taskId = e.dataTransfer.getData('taskId');
                                    moveTask(taskId, column.id);
                                }}
                            >
                                {columnTasks.map(task => {
                                    const subtasks = tasks.filter(st => st.parentId === task.id);
                                    const completedSubtasks = subtasks.filter(st => st.completed).length;

                                    const priorityBorder = task.priority === 'urgent' ? 'border-l-danger' :
                                        task.priority === 'high' ? 'border-l-warning' :
                                        task.priority === 'medium' ? 'border-l-accent/60' : 'border-l-transparent';

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
                                            className={`p-3 rounded-xl border border-border border-l-2 ${priorityBorder} bg-surface shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all group`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 space-y-2">
                                                    <div className="flex items-center gap-1.5">
                                                        {task.isEncrypted && <Lock size={10} className="text-muted-foreground shrink-0" />}
                                                        <p className="text-[13px] font-medium text-foreground leading-snug">{task.title}</p>
                                                    </div>
                                                    {subtasks.length > 0 && (
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 h-1 bg-surface-secondary rounded-full overflow-hidden">
                                                                <div 
                                                                    className="h-full bg-accent/50 rounded-full transition-all"
                                                                    style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-[11px] text-muted-foreground tabular-nums">{completedSubtasks}/{subtasks.length}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <GripVertical size={13} className="text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors shrink-0 mt-0.5" />
                                            </div>
                                            
                                            <div className="mt-2 pt-2 border-t border-border/60 flex items-center gap-1.5 flex-wrap">
                                                {task.deadline && (
                                                    <Chip
                                                        size="sm"
                                                        variant="soft"
                                                        color={dayjs(task.deadline).isBefore(dayjs(), 'minute') ? 'danger' : dayjs(task.deadline).isSame(dayjs(), 'day') ? 'warning' : 'default'}
                                                        className="h-5 px-1.5 rounded-full"
                                                    >
                                                        <Calendar size={9} className="mr-0.5" />
                                                        <Chip.Label className="text-[10px] px-0">
                                                            {dayjs(task.deadline).format('MMM D')}
                                                        </Chip.Label>
                                                    </Chip>
                                                )}
                                                {task.priority && (
                                                    <Chip
                                                        size="sm"
                                                        variant="soft"
                                                        color={
                                                            task.priority === 'urgent' ? 'danger' :
                                                            task.priority === 'high' ? 'warning' :
                                                            task.priority === 'medium' ? 'accent' :
                                                            'default'
                                                        }
                                                        className="h-5 px-1.5 rounded-full"
                                                    >
                                                        <Chip.Label className="text-[10px] px-0">
                                                            {task.priority}
                                                        </Chip.Label>
                                                    </Chip>
                                                )}
                                                {task.notes && task.notes.length > 0 && (
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                                        <MessageCircle size={10} />
                                                        {task.notes.length}
                                                    </span>
                                                )}
                                                {task.timeSpent !== undefined && task.timeSpent > 0 && (
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                                        <Clock size={10} />
                                                        {Math.floor(task.timeSpent / 3600)}h {Math.floor((task.timeSpent % 3600) / 60)}m
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            
                            <Button 
                                variant="ghost" 
                                className="w-full h-8 border border-dashed border-border/60 hover:border-accent/40 text-[12px] text-muted-foreground hover:text-accent rounded-xl transition-all bg-transparent"
                                onPress={async () => {
                                    const title = prompt('Enter task title:');
                                    if (title) {
                                        try {
                                            let finalTitle = title;
                                            if (isEncrypted && documentKey) {
                                                const encrypted = await encryptData(title, documentKey);
                                                finalTitle = JSON.stringify(encrypted);
                                            }
                                            await db.createEmptyTask(projectId, finalTitle, mainTasks.length, isEncrypted, undefined, column.id);
                                            fetchTasks();
                                        } catch (error) {
                                            console.error('Failed to create task:', error);
                                            toast.danger('Failed to create task');
                                        }
                                    }
                                }}
                            >
                                <Plus size={14} className="mr-1.5" />
                                New Task
                            </Button>
                        </div>
                    </div>
                )
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
