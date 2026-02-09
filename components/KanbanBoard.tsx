'use client';

import { db } from '@/lib/db';
import { Task } from '@/types';
import { Button, Chip, Surface } from "@heroui/react";
import { GripVertical, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from 'react';

const COLUMNS: { id: Task['kanbanStatus']; label: string; color: 'accent' | 'success' | 'warning' | 'default' }[] = [
    { id: 'todo', label: 'To Do', color: 'default' },
    { id: 'in-progress', label: 'In Progress', color: 'accent' },
    { id: 'review', label: 'Review', color: 'warning' },
    { id: 'done', label: 'Done', color: 'success' },
];

export function KanbanBoard({ projectId }: { projectId: string }) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchTasks = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await db.listTasks(projectId);
            setTasks(res.documents as unknown as Task[]);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    const moveTask = async (taskId: string, newStatus: Task['kanbanStatus']) => {
        try {
            const isCompleted = newStatus === 'done';
            await db.updateTask(taskId, { kanbanStatus: newStatus, completed: isCompleted });
            setTasks(prev => prev.map(t => t.$id === taskId ? { ...t, kanbanStatus: newStatus, completed: isCompleted } : t));
        } catch (error) {
            console.error(error);
        }
    };

    if (isLoading) return <div className="h-64 flex items-center justify-center">Loading Board...</div>;

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 min-h-[500px]">
            {COLUMNS.map(column => {
                const columnTasks = tasks.filter(t => (t.kanbanStatus || 'todo') === column.id);
                return (
                    <div key={column.id} className="flex flex-col gap-4">
                        <Surface className="flex items-center justify-between px-4 py-3 bg-surface-secondary/50 border border-border/40 rounded-xl">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${column.color === 'default' ? 'bg-muted-foreground' : column.color === 'accent' ? 'bg-primary' : column.color === 'success' ? 'bg-success' : 'bg-warning'}`} />
                                <h3 className="font-black uppercase tracking-widest text-[10px] text-muted-foreground">{column.label}</h3>
                            </div>
                            <Chip size="sm" variant="soft" color={column.color} className="font-bold text-[10px]">{columnTasks.length}</Chip>
                        </Surface>

                        <div 
                            className="flex-1 space-y-3 p-2 rounded-2xl bg-surface-tertiary/20 border border-dashed border-border/40 min-h-[400px]"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                const taskId = e.dataTransfer.getData('taskId');
                                moveTask(taskId, column.id);
                            }}
                        >
                            {columnTasks.map(task => (
                                <Surface 
                                    key={task.$id} 
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('taskId', task.$id);
                                    }}
                                    className="p-4 rounded-xl border border-border/40 bg-surface shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all group"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-bold text-foreground leading-tight">{task.title}</p>
                                        <GripVertical size={14} className="text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
                                    </div>
                                    {task.timeSpent && task.timeSpent > 0 && (
                                        <div className="mt-3 pt-3 border-t border-border/10 flex items-center justify-between">
                                            <span className="text-[9px] font-black uppercase text-muted-foreground/60 tracking-wider">
                                                {Math.floor(task.timeSpent / 3600)}h {Math.floor((task.timeSpent % 3600) / 60)}m
                                            </span>
                                        </div>
                                    )}
                                </Surface>
                            ))}
                            
                            <Button 
                                variant="ghost" 
                                className="w-full h-10 border border-dashed border-border/40 hover:border-primary/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 hover:text-primary rounded-xl"
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
                                <Plus size={14} className="mr-2" />
                                Add Task
                            </Button>
                        </div>
                    </div>
                )
            })}
        </div>
    );
}
