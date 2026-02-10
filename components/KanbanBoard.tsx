'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { Task } from '@/types';
import { Button, ScrollShadow, Surface, toast } from "@heroui/react";
import { MenuDots as GripVertical, ChatRoundDots as MessageCircle, AddSquare as Plus, ShieldKeyhole as Shield } from "@solar-icons/react";
import { useCallback, useEffect, useState } from 'react';
import { TaskDetailModal } from './TaskDetailModal';

const COLUMNS: { id: Task['kanbanStatus']; label: string; color: 'accent' | 'success' | 'warning' | 'default' | 'primary' }[] = [
    { id: 'todo', label: 'Backlog_', color: 'default' },
    { id: 'in-progress', label: 'Active Sync_', color: 'accent' },
    { id: 'review', label: 'Analysis_', color: 'warning' },
    { id: 'waiting', label: 'Awaiting Response_', color: 'primary' },
    { id: 'done', label: 'Archived_', color: 'success' },
];

export function KanbanBoard({ projectId }: { projectId: string }) {
    const { user, privateKey } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const fetchTasks = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await db.listTasks(projectId);
            const rawTasks = res.documents as unknown as Task[];

            // Get decryption key if project is encrypted
            const project = await db.getProject(projectId);
            let documentKey: CryptoKey | null = null;
            if (project.isEncrypted && privateKey && user) {
                const access = await db.getAccessKey(projectId, user.$id);
                if (access) {
                    documentKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                }
            }

            const decryptedTasks = await Promise.all(rawTasks.map(async (task) => {
                if (task.isEncrypted) {
                    if (documentKey) {
                        try {
                            const encryptedData = JSON.parse(task.title);
                            const decryptedTitle = await decryptData(encryptedData, documentKey);
                            return { ...task, title: decryptedTitle };
                        } catch (e) {
                            return { ...task, title: 'Decryption Error' };
                        }
                    }
                    return { ...task, title: 'Encrypted Task' };
                }
                return task;
            }));

            setTasks(decryptedTasks);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [projectId, user, privateKey]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    const moveTask = async (taskId: string, newStatus: Task['kanbanStatus']) => {
        const previousTasks = [...tasks];
        try {
            const isCompleted = newStatus === 'done';
            // Optimistic update
            setTasks(prev => prev.map(t => t.$id === taskId ? { ...t, kanbanStatus: newStatus, completed: isCompleted } : t));
            
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
                                <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest ml-2">{columnTasks.length}</span>
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
                                    const subtasks = tasks.filter(st => st.parentId === task.$id);
                                    const completedSubtasks = subtasks.filter(st => st.completed).length;

                                    return (
                                        <Surface 
                                            key={task.$id} 
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData('taskId', task.$id);
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
                                                            <span className="text-[9px] font-bold text-muted-foreground/40 tracking-widest">{completedSubtasks}/{subtasks.length}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <GripVertical size={16} weight="Bold" className="text-muted-foreground/20 group-hover:text-accent transition-colors shrink-0 mt-0.5" />
                                            </div>
                                            
                                            <div className="mt-4 pt-4 border-t border-border/10 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-accent/40" />
                                                    <span className="text-[9px] font-bold uppercase text-muted-foreground/40 tracking-widest">Task_{task.$id.slice(-4)}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {task.notes && task.notes.length > 0 && (
                                                        <div className="flex items-center gap-1 bg-warning/10 px-1.5 py-0.5 rounded-md border border-warning/20">
                                                            <MessageCircle size={10} className="text-warning" />
                                                            <span className="text-[9px] font-bold text-warning">{task.notes.length}</span>
                                                        </div>
                                                    )}
                                                    {task.timeSpent && task.timeSpent > 0 && (
                                                        <span className="text-[9px] font-bold uppercase text-accent/60 tracking-wider bg-accent/5 px-2 py-0.5 rounded-md">
                                                            {Math.floor(task.timeSpent / 3600)}H {Math.floor((task.timeSpent % 3600) / 60)}M
                                                        </span>
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
                                        await db.createEmptyTask(projectId, title, tasks.length);
                                        const res = await db.listTasks(projectId);
                                        const last = res.documents[res.documents.length - 1];
                                        await db.updateTask(last.$id, { kanbanStatus: column.id });
                                        fetchTasks();
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
                    task={tasks.find(t => t.$id === selectedTask.$id) || selectedTask}
                    projectId={projectId}
                    onUpdate={fetchTasks}
                />
            )}
        </ScrollShadow>
    );
}
