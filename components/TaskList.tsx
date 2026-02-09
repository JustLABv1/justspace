'use client';

import { db } from '@/lib/db';
import { DEPLOYMENT_TEMPLATES } from '@/lib/templates';
import { Task } from '@/types';
import { closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, Dropdown, Header, Input, Label, Spinner } from "@heroui/react";
import {
    Checklist as ListChecks,
    ChatRoundDots as MessageSquarePlus,
    AddCircle as Plus,
    Magnifer as Search
} from "@solar-icons/react";
import React, { useCallback, useEffect, useState } from 'react';
import { TaskItem } from './TaskItem';

export function TaskList({ projectId, hideHeader = false }: { projectId: string, hideHeader?: boolean }) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
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

    if (isLoading) return (
        <div className="h-64 flex items-center justify-center">
            <Spinner color="accent" />
        </div>
    );

    const filteredMainTasks = tasks.filter(t => 
        !t.parentId && 
        t.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full gap-4">
            {!hideHeader && (
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                            <ListChecks size={20} weight="Bold" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black tracking-tighter text-foreground">Project Roadmap</h2>
                            <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground/60">
                                    {tasks.filter(t => t.completed).length} of {tasks.length} tasks synced
                                </p>
                                <div className="w-0.5 h-0.5 rounded-full bg-muted-foreground/30" />
                                <Dropdown>
                                    <Dropdown.Trigger>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-4 px-1.5 text-[8px] uppercase font-bold tracking-widest text-primary hover:bg-primary/5 border-none"
                                            isPending={isApplyingTemplate}
                                        >
                                            Templates
                                        </Button>
                                    </Dropdown.Trigger>
                                    <Dropdown.Popover>
                                        <Dropdown.Menu className="w-64">
                                            <Dropdown.Section>
                                                <Header className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">Deployment Checklists</Header>
                                                {DEPLOYMENT_TEMPLATES.map((tpl, i) => (
                                                    <Dropdown.Item key={i} id={String(i)} textValue={tpl.name} onPress={() => applyTemplate(i)}>
                                                        <Label className="text-xs font-semibold">{tpl.name}</Label>
                                                    </Dropdown.Item>
                                                ))}
                                            </Dropdown.Section>
                                        </Dropdown.Menu>
                                    </Dropdown.Popover>
                                </Dropdown>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 flex-grow max-w-[300px]">
                        <div className="relative flex-grow group">
                            <Search size={14} weight="Linear" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
                            <Input 
                                placeholder="Filter tasks..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-10 bg-surface border-border/40 hover:border-primary/20 focus:border-primary/40 rounded-xl pl-9 text-xs font-medium transition-all"
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-grow flex flex-col p-0 overflow-hidden">
                <div className="flex-grow overflow-y-auto custom-scrollbar pt-2 pb-5 space-y-4 min-h-[450px]">
                    {filteredMainTasks.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-center p-8 gap-4 border-2 border-dashed border-border/20 rounded-3xl mx-2">
                            <div className="p-4 bg-surface-secondary rounded-2xl text-muted-foreground/30">
                                <MessageSquarePlus size={32} weight="Linear" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-foreground/60">No tasks identified</h3>
                                <p className="text-xs text-muted-foreground font-medium mt-1">Start by adding your first milestone below.</p>
                            </div>
                        </div>
                    ) : (
                        <DndContext 
                            sensors={sensors} 
                            collisionDetection={closestCenter} 
                            onDragEnd={handleDragEnd}
                            modifiers={[restrictToVerticalAxis]}
                        >
                            <SortableContext items={filteredMainTasks.map(t => t.$id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-3">
                                    {filteredMainTasks.map((task) => (
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
                    )}
                </div>

                <div className="p-3 bg-surface-secondary/30 border-t border-border/20">
                    <form onSubmit={handleAddTask} className="relative group">
                        <Input 
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder="Add a new milestone..." 
                            className="h-11 bg-surface border border-border/40 hover:border-primary/30 focus:border-primary rounded-xl pl-5 pr-14 text-sm font-bold transition-all"
                        />
                        <Button 
                            type="submit" 
                            variant="primary" 
                            isIconOnly 
                            className="absolute right-1.5 top-1.5 h-8 w-8 rounded-lg shadow-md"
                        >
                            <Plus size={18} weight="Bold" />
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}

