'use client';

import { db } from '@/lib/db';
import { DEPLOYMENT_TEMPLATES } from '@/lib/templates';
import { Task } from '@/types';
import { closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, Dropdown, Header, Input, Label, Spinner, TextField } from "@heroui/react";
import { ClipboardCheck, Plus } from "lucide-react";
import React, { useCallback, useEffect, useState } from 'react';
import { TaskItem } from './TaskItem';

export function TaskList({ projectId }: { projectId: string }) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

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

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = tasks.findIndex((t) => t.$id === active.id);
            const newIndex = tasks.findIndex((t) => t.$id === over.id);
            
            const newTasks = arrayMove(tasks, oldIndex, newIndex);
            setTasks(newTasks);

            try {
                await Promise.all(newTasks.map((task, index) => 
                    db.updateTask(task.$id, { order: index })
                ));
            } catch (error) {
                console.error('Failed to update task order:', error);
            }
        }
    };

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskTitle.trim()) return;

        try {
            await db.createEmptyTask(projectId, newTaskTitle, tasks.length);
            setNewTaskTitle('');
            fetchTasks();
        } catch (error) {
            console.error(error);
        }
    };

    const handleAddSubtask = async (parentId: string, title: string) => {
        try {
            // Using direct database call as we don't have a specific db helper for subtasks yet
            await db.createEmptyTask(projectId, title, 0); 
            const res = await db.listTasks(projectId);
            const latest = res.documents[res.documents.length - 1];
            await db.updateTask(latest.$id, { parentId });
            fetchTasks();
        } catch (error) {
            console.error(error);
        }
    };

    const applyTemplate = async (templateIndex: number) => {
        setIsApplyingTemplate(true);
        try {
            const template = DEPLOYMENT_TEMPLATES[templateIndex];
            await db.createTasks(projectId, template.tasks);
            fetchTasks();
        } catch (error) {
            console.error(error);
        } finally {
            setIsApplyingTemplate(false);
        }
    };

    const updateTask = async (taskId: string, data: Partial<Task>) => {
        try {
            await db.updateTask(taskId, data);
            setTasks(tasks.map(t => t.$id === taskId ? { ...t, ...data } : t));
        } catch (error) {
            console.error(error);
            fetchTasks(); 
        }
    };

    if (isLoading) return <Spinner size="sm" />;

    const mainTasks = tasks.filter(t => !t.parentId);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Project Tasks</h4>
                    <Dropdown>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            isIconOnly 
                            className="h-6 w-6 text-muted-foreground hover:text-accent"
                            isPending={isApplyingTemplate}
                        >
                            <ClipboardCheck size={14} />
                        </Button>
                        <Dropdown.Popover>
                            <Dropdown.Menu className="w-64">
                                <Dropdown.Section>
                                    <Header className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">Deployment Checklists</Header>
                                    {DEPLOYMENT_TEMPLATES.map((tpl, i) => (
                                        <Dropdown.Item key={i} id={String(i)} textValue={tpl.name} onPress={() => applyTemplate(i)}>
                                            <Label>{tpl.name}</Label>
                                        </Dropdown.Item>
                                    ))}
                                </Dropdown.Section>
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                    {tasks.filter(t => t.completed).length}/{tasks.length} Done
                </span>
            </div>

            <DndContext 
                sensors={sensors} 
                collisionDetection={closestCenter} 
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis]}
            >
                <SortableContext items={mainTasks.map(t => t.$id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                        {mainTasks.map((task) => (
                            <TaskItem 
                                key={task.$id} 
                                task={task} 
                                onToggle={(id, completed) => updateTask(id, { completed })}
                                onDelete={(id) => db.deleteTask(id).then(fetchTasks)}
                                onUpdate={updateTask}
                                onAddSubtask={(title) => handleAddSubtask(task.$id, title)}
                                subtasks={tasks.filter(t => t.parentId === task.$id)}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

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
                        className="bg-surface-secondary border-none h-11"
                    />
                </TextField>
                <Button isIconOnly size="md" variant="primary" type="submit" className="rounded-xl shadow-lg shadow-primary/20 h-11 w-11">
                    <Plus size={18} />
                </Button>
            </form>
        </div>
    );
}
