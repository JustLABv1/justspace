'use client';

import { useAuth } from '@/context/AuthContext';
import { client } from '@/lib/appwrite';
import { decryptData, decryptDocumentKey, encryptData } from '@/lib/crypto';
import { db, DB_ID, TASKS_ID } from '@/lib/db';
import { DEPLOYMENT_TEMPLATES } from '@/lib/templates';
import { Task } from '@/types';
import { closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, Dropdown, Header, Input, Label, Spinner, toast } from "@heroui/react";
import {
    Checklist as ListChecks,
    ChatRoundDots as MessageSquarePlus,
    AddCircle as Plus,
    Magnifer as Search
} from "@solar-icons/react";
import React, { useCallback, useEffect, useState } from 'react';
import { TaskDetailModal } from './TaskDetailModal';
import { TaskItem } from './TaskItem';

export function TaskList({ projectId, hideHeader = false }: { projectId: string, hideHeader?: boolean }) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const toggleTaskExpansion = (taskId: string) => {
        setExpandedTaskIds(prev => 
            prev.includes(taskId) 
                ? prev.filter(id => id !== taskId) 
                : [...prev, taskId]
        );
    };

    const getSubtasks = (parentId: string) => {
        return tasks.filter(t => t.parentId === parentId).sort((a, b) => (a.order || 0) - (b.order || 0));
    };

    const { user, privateKey } = useAuth();
    const [documentKey, setDocumentKey] = useState<CryptoKey | null>(null);

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

    const fetchTasks = useCallback(async (isInitial = false) => {
        if (isInitial) setIsLoading(true);
        try {
            const projectRes = await db.getProject(projectId);
            const res = await db.listTasks(projectId);
            let rawTasks = res.documents as unknown as Task[];
            let docKey: CryptoKey | null = null;

            if (projectRes.isEncrypted && privateKey && user) {
                try {
                    const access = await db.getAccessKey(projectId, user.$id);
                    if (access) {
                        docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                        setDocumentKey(docKey);
                    }
                } catch (e) {
                    console.error('Failed to decrypt tasks:', e);
                }
            }

            rawTasks = await Promise.all(rawTasks.map(async (task) => {
                if (task.isEncrypted) {
                    if (docKey) {
                        try {
                            const titleData = JSON.parse(task.title);
                            const decryptedTitle = await decryptData(titleData, docKey);
                            return { ...task, title: decryptedTitle };
                        } catch {
                            return { ...task, title: 'Decryption Error' };
                        }
                    }
                    return { ...task, title: 'Encrypted Task' };
                }
                return task;
            }));

            setTasks(rawTasks);
        } catch (error) {
            console.error(error instanceof Error ? error.message : error);
        } finally {
            if (isInitial) setIsLoading(false);
        }
    }, [projectId, privateKey, user]);

    useEffect(() => {
        fetchTasks(true);
    }, [fetchTasks]);

    useEffect(() => {
        const unsubscribe = client.subscribe([
            `databases.${DB_ID}.collections.${TASKS_ID}.documents`
        ], async (response) => {
            const payload = response.payload as Task;
            if (payload.projectId !== projectId) return;

            // If it's a delete event, we can handle it immediately without decryption
            if (response.events.some(e => e.includes('.delete'))) {
                setTasks(prev => prev.filter(t => t.$id === payload.$id ? false : true));
                return;
            }

            // For creates and updates, we trigger a silent fetch to handle decryption correctly
            await fetchTasks(false);
        });

        return () => unsubscribe();
    }, [projectId, fetchTasks]);

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

        const optimisticId = `temp-${Date.now()}`;
        const previousTasks = [...tasks];
        
        try {
            const newTask: Task = {
                $id: optimisticId,
                $createdAt: new Date().toISOString(),
                title: newTaskTitle,
                projectId,
                completed: false,
                order: tasks.length,
                isEncrypted: !!documentKey
            } as Task;

            setTasks([...tasks, newTask]);
            setNewTaskTitle('');

            let title = newTaskTitle;
            let isEncrypted = false;
            if (documentKey) {
                const encrypted = await encryptData(title, documentKey);
                title = JSON.stringify(encrypted);
                isEncrypted = true;
            }
            const res = await db.createEmptyTask(projectId, title, tasks.length, isEncrypted);
            
            // Replace optimistic task with the real one
            setTasks(prev => prev.map(t => t.$id === optimisticId ? (res as unknown as Task) : t));
            fetchTasks(); // Refresh to get correct decrypted title if needed
            toast.success('Task added');
        } catch (error) {
            console.error('Failed to add task:', error);
            setTasks(previousTasks);
            toast.danger('Failed to add task');
        }
    };

    const handleAddSubtask = async (parentId: string, title: string) => {
        try {
            let finalTitle = title;
            let isEncrypted = false;
            if (documentKey) {
                const encrypted = await encryptData(title, documentKey);
                finalTitle = JSON.stringify(encrypted);
                isEncrypted = true;
            }
            await db.createEmptyTask(projectId, finalTitle, 0, isEncrypted, parentId);
            fetchTasks();
            toast.success('Subtask added');
        } catch (error) {
            console.error(error);
            toast.danger('Failed to add subtask');
        }
    };

    const applyTemplate = async (templateIndex: number) => {
        setIsApplyingTemplate(true);
        try {
            const template = DEPLOYMENT_TEMPLATES[templateIndex];
            const titles = template.tasks;
            
            if (documentKey) {
                const encryptedTitles = await Promise.all(titles.map(async (t) => {
                    return JSON.stringify(await encryptData(t, documentKey));
                }));
                await db.createTasks(projectId, encryptedTitles, true);
            } else {
                await db.createTasks(projectId, titles);
            }
            fetchTasks();
            toast.success('Template applied', {
                description: `Created ${titles.length} tasks`
            });
        } catch (error) {
            console.error(error);
            toast.danger('Failed to apply template');
        } finally {
            setIsApplyingTemplate(false);
        }
    };

    const updateTask = async (taskId: string, data: Partial<Task> & { workDuration?: string }) => {
        const previousTasks = [...tasks];
        try {
            const taskData: Partial<Task> & { workDuration?: string } = { ...data };
            delete taskData.workDuration;
            const updatedTaskTitle = data.title || (tasks.find(t => t.$id === taskId)?.title) || '';
            
            // Optimistic update
            setTasks(tasks.map(t => t.$id === taskId ? { ...t, ...taskData, title: updatedTaskTitle } : t));

            const updateData = { ...data };
            if (documentKey && data.title) {
                updateData.title = JSON.stringify(await encryptData(data.title, documentKey));
                updateData.isEncrypted = true;
            }
            await db.updateTask(taskId, updateData);
            // We usually don't want a toast for every field update (especially if it's auto-save)
            // But if it's specifically "completed" or something significant, we could.
            if ('completed' in data) {
                toast.success(data.completed ? 'Task completed' : 'Task reopened');
            }
        } catch (error) {
            console.error('Task update failed, rolling back:', error);
            setTasks(previousTasks);
            toast.danger('Sync failed, changes reverted');
        }
    };

    const deleteTask = async (taskId: string) => {
        const previousTasks = [...tasks];
        try {
            setTasks(tasks.filter(t => t.$id !== taskId));
            await db.deleteTask(taskId);
            toast.success('Task deleted');
        } catch (error) {
            console.error('Task deletion failed, rolling back:', error);
            setTasks(previousTasks);
            toast.danger('Failed to delete task');
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
                        <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent shadow-sm border border-accent/20">
                            <ListChecks size={20} weight="Bold" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight text-foreground">Project Roadmap_</h2>
                            <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/40">
                                    {tasks.filter(t => t.completed).length} of {tasks.length} tasks synced
                                </p>
                                <div className="w-0.5 h-0.5 rounded-full bg-muted-foreground/30" />
                                <Dropdown>
                                    <Dropdown.Trigger>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-4 px-1.5 text-[8px] uppercase font-bold tracking-widest text-accent hover:bg-accent/5 border-none"
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
                            <Search size={14} weight="Linear" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-accent transition-colors" />
                            <Input 
                                placeholder="Filter tasks..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-10 bg-surface border-border/40 hover:border-accent/20 focus:border-accent/40 rounded-xl pl-9 text-xs font-medium transition-all"
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
                                <h3 className="text-sm font-bold text-foreground/60">No tasks identified</h3>
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
                                            onDelete={deleteTask}
                                            onUpdate={updateTask}
                                            onAddSubtask={handleAddSubtask}
                                            allTasks={tasks}
                                            isExpanded={expandedTaskIds.includes(task.$id)}
                                            onToggleExpanded={() => toggleTaskExpansion(task.$id)}
                                            onClick={() => {
                                                setSelectedTask(task);
                                                setIsDetailModalOpen(true);
                                            }}
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
                            className="h-11 bg-surface border border-border/40 hover:border-accent/30 focus:border-accent rounded-xl pl-5 pr-14 text-sm font-bold transition-all"
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
            {selectedTask && (
                <TaskDetailModal 
                    isOpen={isDetailModalOpen}
                    onOpenChange={setIsDetailModalOpen}
                    task={tasks.find(t => t.$id === selectedTask.$id) || selectedTask}
                    projectId={projectId}
                    onUpdate={fetchTasks}
                />
            )}
        </div>
    );
}

