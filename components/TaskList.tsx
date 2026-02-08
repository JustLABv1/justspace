'use client';

import { db } from '@/lib/db';
import { Task } from '@/types';
import { Button, Checkbox, Input, Spinner, Surface, TextField } from "@heroui/react";
import { CheckCircle2, Plus, Trash } from "lucide-react";
import React, { useCallback, useEffect, useState } from 'react';

export function TaskList({ projectId }: { projectId: string }) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newTaskTitle, setNewTaskTitle] = useState('');

    const fetchTasks = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await db.listTasks(projectId);
            setTasks(res.documents as unknown as Task[]);
        } catch (error) {
            console.error(error instanceof Error ? error.message : error);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskTitle.trim()) return;

        try {
            await db.createEmptyTask(projectId, newTaskTitle);
            setNewTaskTitle('');
            fetchTasks();
        } catch (error) {
            console.error(error);
        }
    };

    const toggleTask = async (taskId: string, completed: boolean) => {
        try {
            await db.updateTask(taskId, completed);
            fetchTasks();
        } catch (error) {
            console.error(error);
        }
    };

    const deleteTask = async (taskId: string) => {
        try {
            await db.deleteTask(taskId);
            fetchTasks();
        } catch (error) {
            console.error(error);
        }
    };

    if (isLoading) return <Spinner size="sm" />;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Project Tasks</h4>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                    {tasks.filter(t => t.completed).length}/{tasks.length} Done
                </span>
            </div>
            
            <div className="flex flex-col gap-2">
                {tasks.length === 0 && !isLoading && (
                    <p className="text-xs text-muted-foreground italic py-2">No tasks added yet.</p>
                )}
                {tasks.map((task) => (
                    <Surface 
                        key={task.$id} 
                        variant={task.completed ? "transparent" : "secondary"}
                        className={`group flex items-center justify-between p-3 rounded-xl border border-border transition-all hover:ring-1 hover:ring-accent/20 ${task.completed ? 'opacity-60 grayscale' : 'shadow-sm'}`}
                    >
                        <Checkbox 
                            isSelected={task.completed} 
                            onChange={(val) => toggleTask(task.$id, val)}
                            className="flex-1"
                        >
                            <Checkbox.Control>
                                <Checkbox.Indicator />
                            </Checkbox.Control>
                            <Checkbox.Content className="ml-3 flex items-center gap-2">
                                <span className={`text-sm font-medium transition-colors ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                    {task.title}
                                </span>
                                {task.completed && <CheckCircle2 size={12} className="text-success" />}
                            </Checkbox.Content>
                        </Checkbox>
                        <Button 
                            variant="ghost" 
                            isIconOnly 
                            size="sm" 
                            className="opacity-0 group-hover:opacity-100 transition-all hover:bg-danger/10 hover:text-danger -mr-1"
                            onPress={() => deleteTask(task.$id)}
                        >
                            <Trash size={14} />
                        </Button>
                    </Surface>
                ))}
            </div>

            <form onSubmit={handleAddTask} className="flex gap-2 pt-2">
                <TextField 
                    name="task"
                    value={newTaskTitle}
                    onChange={setNewTaskTitle}
                    className="flex-1"
                >
                    <Input 
                        placeholder="Add a priority task..." 
                        aria-label="New task title"
                        className="bg-surface-secondary border-none"
                    />
                </TextField>
                <Button isIconOnly size="md" variant="primary" type="submit" className="rounded-xl shadow-lg shadow-primary/20">
                    <Plus size={18} />
                </Button>
            </form>
        </div>
    );
}
