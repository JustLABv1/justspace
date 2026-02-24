'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData } from '@/lib/crypto';
import { db } from '@/lib/db';
import { wsClient, WSEvent } from '@/lib/ws';
import { Task } from '@/types';
import { Button, Chip, ScrollShadow, Surface, toast } from "@heroui/react";
import { Calendar, MenuDots as GripVertical, History as HistoryIcon, ChatRoundDots as MessageCircle, AddSquare as Plus, ShieldKeyhole as Shield } from "@solar-icons/react";
import dayjs from 'dayjs';
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
        <div className="h-64 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent/40">Syncing board frequency...</p>
        </div>
    );

    const mainTasks = tasks.filter(t => !t.parentId);

    return (
        <ScrollShadow className="pb-6 -mx-6 px-6" orientation="horizontal" hideScrollBar>
            <div className="flex gap-6 min-w-max md:min-w-[1200px]">
                {COLUMNS.map(column => {
                    const columnTasks = mainTasks.filter(t => (t.kanbanStatus || 'todo') === column.id);
                    return (
                        <div key={column.id} className="flex flex-col gap-6 w-[300px] shrink-0">
                            <Surface className="flex items-center justify-between px-6 py-5 bg-surface-secondary/30 border border-border/40 rounded-[2rem] shadow-sm backdrop-blur-md">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full shadow-sm animate-pulse ${
                                        column.color === 'default' ? 'bg-muted-foreground/40' : 
                                        column.color === 'accent' ? 'bg-accent' : 
                                        column.color === 'success' ? 'bg-success' : 
                                        column.color === 'warning' ? 'bg-warning' : 'bg-accent/60'
                                    }`} />
                                    <h3 className="font-bold tracking-tight text-sm text-foreground whitespace-nowrap">{column.label}</h3>
                                </div>
                                <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider ml-2">{columnTasks.length}</span>
                            </Surface>

                            <div 
                                className="flex-1 space-y-4 p-4 rounded-[2.5rem] bg-foreground/[0.02] border border-dashed border-border/20 min-h-[500px] transition-colors hover:bg-foreground/[0.03]"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    const taskId = e.dataTransfer.getData('taskId');
                                    moveTask(taskId, column.id);
                                }}
                            >
                                {columnTasks.map(task => {
                                    const subtasks = tasks.filter(st => st.parentId === task.id);
                                    const completedSubtasks = subtasks.filter(st => st.completed).length;

                                    return (
                                        <Surface 
                                            key={task.id} 
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData('taskId', task.id);
                                            }}
                                            onClick={() => {
                                                setSelectedTask(task);
                                                setIsDetailModalOpen(true);
                                            }}
                                            className="p-6 rounded-[2rem] border border-border/40 bg-surface shadow-sm cursor-grab active:cursor-grabbing hover:border-accent/40 hover:shadow-xl hover:shadow-accent/5 transition-all group relative overflow-hidden active:scale-[0.98]"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        {task.isEncrypted && <Shield size={12} className="text-accent/60" />}
                                                        <p className="text-sm font-bold text-foreground leading-tight tracking-tight">{task.title}</p>
                                                    </div>
                                                    {subtasks.length > 0 && (
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 h-1 bg-foreground/5 rounded-full overflow-hidden">
                                                                <div 
                                                                    className="h-full bg-accent/40 rounded-full transition-all duration-500"
                                                                    style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-[9px] font-bold text-muted-foreground/40 tracking-wider">{completedSubtasks}/{subtasks.length}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <GripVertical size={16} weight="Bold" className="text-muted-foreground/20 group-hover:text-accent transition-colors shrink-0 mt-0.5" />
                                            </div>
                                            
                                            <div className="mt-4 pt-4 border-t border-border/10 flex items-center justify-between">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {task.deadline && (
                                                        <Chip
                                                            size="sm"
                                                            variant="soft"
                                                            color={dayjs(task.deadline).isBefore(dayjs(), 'minute') ? 'danger' : dayjs(task.deadline).isSame(dayjs(), 'day') ? 'warning' : 'default'}
                                                            className="h-5 px-2 border border-border/10"
                                                        >
                                                            <Calendar size={10} weight="Bold" className="mr-1" />
                                                            <Chip.Label className="text-[9px] font-bold uppercase tracking-wider px-0">
                                                                {dayjs(task.deadline).format('MMM D, HH:mm')}
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
                                                            className="h-5 min-w-0 px-2 border border-border/10"
                                                        >
                                                            <Chip.Label className="text-[9px] font-bold uppercase tracking-wider px-0">
                                                                {task.priority}
                                                            </Chip.Label>
                                                        </Chip>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    {task.notes && task.notes.length > 0 && (
                                                        <Chip
                                                            size="sm"
                                                            variant="soft"
                                                            color="warning"
                                                            className="h-5 min-w-0 px-2 border border-warning/10"
                                                        >
                                                            <MessageCircle size={10} weight="Bold" className="text-warning" />
                                                            <Chip.Label className="text-[9px] font-bold px-0">
                                                                {task.notes.length}
                                                            </Chip.Label>
                                                        </Chip>
                                                    )}
                                                    {task.timeSpent && task.timeSpent > 0 && (
                                                        <Chip
                                                            size="sm"
                                                            variant="soft"
                                                            color="accent"
                                                            className="h-5 min-w-0 px-2 border border-accent/10"
                                                        >
                                                            <HistoryIcon size={10} weight="Bold" className="text-accent" />
                                                            <Chip.Label className="text-[9px] font-bold uppercase tracking-wider px-0">
                                                                {Math.floor(task.timeSpent / 3600)}H {Math.floor((task.timeSpent % 3600) / 60)}M
                                                            </Chip.Label>
                                                        </Chip>
                                                    )}
                                                </div>
                                            </div>
                                        </Surface>
                                    );
                                })}
                            
                            <Button 
                                variant="ghost" 
                                className="w-full h-16 border-2 border-dashed border-border/30 hover:border-accent/40 text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground/30 hover:text-accent rounded-[2rem] transition-all bg-transparent hover:bg-accent/5"
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
                                <Plus size={20} weight="Bold" className="mr-3 opacity-40 group-hover:opacity-100" />
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
