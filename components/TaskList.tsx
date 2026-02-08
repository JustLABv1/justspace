'use client';

import { db } from '@/lib/db';
import { Task } from '@/types';
import { Button, Checkbox, Input, Spinner, TextField } from "@heroui/react";
import { Plus, Trash } from "lucide-react";
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
            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tasks</h4>
            
            <div className="space-y-2">
                {tasks.map((task) => (
                    <div key={task.$id} className="flex items-center justify-between group">
                        <Checkbox 
                            isSelected={task.completed} 
                            onChange={(val) => toggleTask(task.$id, val)}
                        >
                            <Checkbox.Control>
                                <Checkbox.Indicator />
                            </Checkbox.Control>
                            <Checkbox.Content className="ml-2">
                                <span className={`text-sm ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                                    {task.title}
                                </span>
                            </Checkbox.Content>
                        </Checkbox>
                        <Button 
                            variant="ghost" 
                            isIconOnly 
                            size="sm" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-danger"
                            onPress={() => deleteTask(task.$id)}
                        >
                            <Trash size={14} />
                        </Button>
                    </div>
                ))}
            </div>

            <form onSubmit={handleAddTask} className="flex gap-2">
                <TextField 
                    name="task"
                    value={newTaskTitle}
                    onChange={setNewTaskTitle}
                    className="flex-1"
                >
                    <Input 
                        placeholder="Add a task..." 
                        aria-label="New task title"
                        variant="secondary"
                    />
                </TextField>
                <Button isIconOnly size="sm" variant="secondary" type="submit">
                    <Plus size={16} />
                </Button>
            </form>
        </div>
    );
}
