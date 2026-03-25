'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey, encryptData } from '@/lib/crypto';
import { db } from '@/lib/db';
import { taskMatchesFilters } from '@/lib/task-filters';
import { DEPLOYMENT_TEMPLATES } from '@/lib/templates';
import { wsClient, WSEvent } from '@/lib/ws';
import { Task } from '@/types';
import { closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, Dropdown, Header, Input, Label, Spinner, toast } from "@heroui/react";
import { ZonedDateTime } from "@internationalized/date";
import { CheckCircle2, ChevronRight, Filter, ListChecks, Plus, Search, Square, SquareCheck, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pagination } from './Pagination';
import { TaskDetailModal } from './TaskDetailModal';
import { TaskItem } from './TaskItem';

export function TaskList({ 
    projectId, 
    hideHeader = false,
    searchQuery: externalSearchQuery,
    selectedTags = [],
    hideCompleted: externalHideCompleted
}: { 
    projectId: string, 
    hideHeader?: boolean,
    searchQuery?: string,
    selectedTags?: string[],
    hideCompleted?: boolean
}) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskDeadline, setNewTaskDeadline] = useState<ZonedDateTime | null>(null);
    const addTaskFormRef = useRef<HTMLFormElement>(null);
    const [internalSearchQuery, setInternalSearchQuery] = useState('');
    const [internalHideCompleted, setInternalHideCompleted] = useState(false);
    
    const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
    const hideCompleted = externalHideCompleted !== undefined ? externalHideCompleted : internalHideCompleted;
    
    const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const [showCompleted, setShowCompleted] = useState(false);
    const itemsPerPage = 8;

    const toggleTaskExpansion = (taskId: string) => {
        setExpandedTaskIds(prev => 
            prev.includes(taskId) 
                ? prev.filter(id => id !== taskId) 
                : [...prev, taskId]
        );
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
                    const access = await db.getAccessKey(projectId);
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
        const unsub = wsClient.subscribe(async (event: WSEvent) => {
            if (event.collection === 'tasks') {
                const payload = event.document as unknown as Task;
                if (payload.projectId !== projectId) return;

                // If it's a delete event, we can handle it immediately without decryption
                if (event.type === 'delete') {
                    setTasks(prev => prev.filter(t => t.id === payload.id ? false : true));
                    return;
                }

                // For creates and updates, we trigger a silent fetch to handle decryption correctly
                await fetchTasks(false);
            }
        });

        return () => unsub();
    }, [projectId, fetchTasks]);

    // Focus add-task input when the "Add new task" header button fires the event
    useEffect(() => {
        const handler = () => {
            addTaskFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            addTaskFormRef.current?.querySelector('input')?.focus();
        };
        window.addEventListener('list-add-task', handler);
        return () => window.removeEventListener('list-add-task', handler);
    }, []);

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = tasks.findIndex((t) => t.id === active.id);
            const newIndex = tasks.findIndex((t) => t.id === over.id);
            
            const newTasks = arrayMove(tasks, oldIndex, newIndex);
            setTasks(newTasks);

            try {
                await Promise.all(newTasks.map((task, index) => 
                    db.updateTask(task.id, { order: index })
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
                id: optimisticId,
                createdAt: new Date().toISOString(),
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
            const res = await db.createEmptyTask(projectId, title, tasks.length, isEncrypted, undefined, 'todo');
            
            if (newTaskDeadline) {
                const deadlineStr = newTaskDeadline.toAbsoluteString();
                await db.updateTask(res.id, { deadline: deadlineStr });
            }

            // Replace optimistic task with the real one
            setTasks(prev => prev.map(t => t.id === optimisticId ? (res as unknown as Task) : t));
            setNewTaskDeadline(null);
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
            await db.createEmptyTask(projectId, finalTitle, 0, isEncrypted, parentId, 'todo');
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
                await db.createTasks(projectId, titles, false);
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
            const updatedTaskTitle = data.title || (tasks.find(t => t.id === taskId)?.title) || '';
            
            // Optimistic update
            setTasks(tasks.map(t => t.id === taskId ? { ...t, ...taskData, title: updatedTaskTitle } : t));

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
            setTasks(tasks.filter(t => t.id !== taskId));
            await db.deleteTask(taskId);
            toast.success('Task deleted');
        } catch (error) {
            console.error('Task deletion failed, rolling back:', error);
            setTasks(previousTasks);
            toast.danger('Failed to delete task');
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleBulkComplete = async () => {
        const ids = [...selectedIds];
        try {
            await Promise.all(ids.map(id => db.updateTask(id, { completed: true, kanbanStatus: 'done' })));
            fetchTasks();
            setSelectedIds(new Set());
            setSelectionMode(false);
            toast.success(`${ids.length} task${ids.length !== 1 ? 's' : ''} completed`);
        } catch { toast.danger('Bulk complete failed'); }
    };

    const handleBulkDelete = async () => {
        const ids = [...selectedIds];
        try {
            await Promise.all(ids.map(id => db.deleteTask(id)));
            setTasks(prev => prev.filter(t => !ids.includes(t.id)));
            setSelectedIds(new Set());
            setSelectionMode(false);
            toast.success(`${ids.length} task${ids.length !== 1 ? 's' : ''} deleted`);
        } catch { toast.danger('Bulk delete failed'); }
    };

    if (isLoading) return (
        <div className="h-64 flex items-center justify-center">
            <Spinner color="accent" />
        </div>
    );

    const allMainTasks = tasks.filter(t => !t.parentId);
    const filteredMainTasks = allMainTasks.filter(t => {
        const subtasks = tasks.filter(st => st.parentId === t.id);
        const matchesTask = taskMatchesFilters(t, searchQuery, selectedTags);
        const anySubtaskMatches = subtasks.some(st => taskMatchesFilters(st, searchQuery, selectedTags));
        
        const matchesFilter = hideCompleted ? !t.completed : true;
        
        return (matchesTask || anySubtaskMatches) && matchesFilter;
    });

    const activeTasks = filteredMainTasks.filter(t => !t.completed);
    const completedTasks = filteredMainTasks.filter(t => t.completed);
    const totalPages = Math.ceil(activeTasks.length / itemsPerPage);
    const paginatedTasks = activeTasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {!hideHeader && (
                    <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-lg bg-surface-secondary flex items-center justify-center text-muted-foreground">
                            <ListChecks size={13} />
                        </div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
                            <span className="text-xs text-muted-foreground">
                                {tasks.filter(t => t.completed).length}/{tasks.length} done
                            </span>
                            <Dropdown>
                                <Dropdown.Trigger>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                                        isPending={isApplyingTemplate}
                                    >
                                        Templates
                                    </Button>
                                </Dropdown.Trigger>
                                <Dropdown.Popover>
                                    <Dropdown.Menu className="w-56">
                                        <Dropdown.Section>
                                            <Header className="px-2 py-1 text-xs font-medium text-muted-foreground">Deployment Checklists</Header>
                                            {DEPLOYMENT_TEMPLATES.map((tpl, i) => (
                                                <Dropdown.Item key={i} id={String(i)} textValue={tpl.name} onPress={() => applyTemplate(i)}>
                                                    <Label className="text-xs font-medium">{tpl.name}</Label>
                                                </Dropdown.Item>
                                            ))}
                                        </Dropdown.Section>
                                    </Dropdown.Menu>
                                </Dropdown.Popover>
                            </Dropdown>
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <Button
                        variant={selectionMode ? 'primary' : 'ghost'}
                        size="sm"
                        className="h-8 px-2.5 rounded-xl text-[12px] font-medium"
                        onPress={() => { setSelectionMode(v => !v); setSelectedIds(new Set()); }}
                    >
                        {selectionMode ? <SquareCheck size={12} className="mr-1" /> : <Square size={12} className="mr-1" />}
                        Select
                    </Button>
                </div>
                <div className={`flex items-center gap-2 flex-grow ${!hideHeader ? 'max-w-[400px]' : ''}`}>
                    {!externalSearchQuery && !hideHeader && (
                        <>
                            <div className="relative flex-grow">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input 
                                    placeholder="Filter tasks..." 
                                    value={internalSearchQuery}
                                    onChange={(e) => { setInternalSearchQuery(e.target.value); setCurrentPage(1); }}
                                    className="w-full h-8 bg-background border border-border rounded-xl pl-8 text-xs"
                                />
                            </div>
                            <Button 
                                variant={internalHideCompleted ? 'primary' : 'secondary'} 
                                size="sm" 
                                className="h-8 px-2.5 rounded-xl text-xs border border-border"
                                onPress={() => { setInternalHideCompleted(!internalHideCompleted); setCurrentPage(1); }}
                            >
                                <Filter size={12} className="mr-1" />
                                {internalHideCompleted ? 'Active Only' : 'All'}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {selectionMode && selectedIds.size > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 border border-accent/20">
                    <span className="text-[12px] font-medium text-accent flex-1">{selectedIds.size} selected</span>
                    <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2.5 rounded-lg text-[12px]"
                        onPress={handleBulkComplete}
                    >
                        <CheckCircle2 size={12} className="mr-1 text-success" /> Complete
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2.5 rounded-lg text-[12px] text-danger hover:bg-danger-muted"
                        onPress={handleBulkDelete}
                    >
                        <Trash2 size={12} className="mr-1" /> Delete
                    </Button>
                    <button
                        onClick={() => { setSelectedIds(new Set()); setSelectionMode(false); }}
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-1"
                    >
                        Cancel
                    </button>
                </div>
            )}

            <div className="flex-grow flex flex-col p-0 overflow-hidden">
                <div className="flex-grow overflow-y-auto custom-scrollbar pt-2 pb-5 space-y-4 min-h-[450px]">
                    {activeTasks.length === 0 && completedTasks.length === 0 ? (
                        <div className="h-48 flex flex-col items-center justify-center text-center gap-3 border border-dashed border-border rounded-2xl">
                            <ListChecks size={20} className="text-muted-foreground/40" />
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">No tasks yet</p>
                                <p className="text-xs text-muted-foreground/60 mt-0.5">Add your first task below.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                        <DndContext 
                            sensors={sensors} 
                            collisionDetection={closestCenter} 
                            onDragEnd={handleDragEnd}
                            modifiers={[restrictToVerticalAxis]}
                        >
                            <SortableContext items={paginatedTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-3">
                                    {paginatedTasks.length === 0 && completedTasks.length === 0 ? (
                                        <div className="h-48 flex flex-col items-center justify-center text-center gap-3 border border-dashed border-border rounded-2xl">
                                            <ListChecks size={20} className="text-muted-foreground/40" />
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground">No tasks yet</p>
                                                <p className="text-xs text-muted-foreground/60 mt-0.5">Add your first task below.</p>
                                            </div>
                                        </div>
                                    ) : paginatedTasks.length === 0 ? (
                                        <div className="h-24 flex items-center justify-center">
                                            <p className="text-[13px] text-muted-foreground">All tasks completed — great work!</p>
                                        </div>
                                    ) : (
                                        paginatedTasks.map((task) => (
                                            <div key={task.id} className={`relative ${selectionMode ? 'flex items-start gap-2' : ''}`}>
                                                {selectionMode && (
                                                    <button
                                                        onClick={() => toggleSelect(task.id)}
                                                        className="mt-3 shrink-0 w-4 h-4 rounded border-2 border-border flex items-center justify-center transition-colors hover:border-accent"
                                                        style={{ background: selectedIds.has(task.id) ? 'var(--color-accent)' : 'transparent', borderColor: selectedIds.has(task.id) ? 'var(--color-accent)' : undefined }}
                                                    >
                                                        {selectedIds.has(task.id) && <CheckCircle2 size={10} className="text-white" />}
                                                    </button>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <TaskItem
                                                        task={task}
                                                        onToggle={(id, completed) => updateTask(id, { completed })}
                                                        onDelete={deleteTask}
                                                        onUpdate={updateTask}
                                                        onAddSubtask={handleAddSubtask}
                                                        allTasks={tasks}
                                                        expandedTaskIds={expandedTaskIds}
                                                        onToggleExpanded={toggleTaskExpansion}
                                                        onClick={(t) => {
                                                            if (selectionMode) { toggleSelect(t.id); return; }
                                                            setSelectedTask(t);
                                                            setIsDetailModalOpen(true);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </SortableContext>
                        </DndContext>

                        {/* Completed tasks — collapsible, outside DnD */}
                        {completedTasks.length > 0 && !hideCompleted && (
                            <div className="mt-1">
                                <button
                                    onClick={() => setShowCompleted(v => !v)}
                                    className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors py-1.5 px-1"
                                >
                                    <ChevronRight size={13} className={`transition-transform duration-150 ${showCompleted ? 'rotate-90' : ''}`} />
                                    <CheckCircle2 size={12} className="text-success" />
                                    {completedTasks.length} completed
                                </button>
                                {showCompleted && (
                                    <div className="mt-1 space-y-1">
                                        {completedTasks.map(task => (
                                            <div
                                                key={task.id}
                                                className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border/50 bg-surface/50 opacity-50 hover:opacity-70 transition-opacity cursor-pointer"
                                                onClick={() => { setSelectedTask(task); setIsDetailModalOpen(true); }}
                                            >
                                                <CheckCircle2 size={14} className="text-success shrink-0" />
                                                <span className="text-[13px] text-muted-foreground line-through truncate flex-1">{task.title}</span>
                                                <button
                                                    className="text-muted-foreground/40 hover:text-danger transition-colors shrink-0"
                                                    onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                                                    aria-label="Delete task"
                                                >
                                                    &#x2715;
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        </>
                    )}

                    {totalPages > 1 && (
                        <div className="flex justify-center pt-4 border-t border-border">
                            <Pagination 
                                total={totalPages} 
                                initialPage={1}
                                page={currentPage} 
                                onChange={setCurrentPage}
                                variant="secondary"
                                color="accent"
                                size="sm"
                            />
                        </div>
                    )}
                </div>

                <div className="pt-3 border-t border-border">
                    <form ref={addTaskFormRef} onSubmit={handleAddTask} className="flex items-center gap-2">
                        <div className="relative flex-grow">
                            <Input 
                                value={newTaskTitle}
                                onChange={(e) => setNewTaskTitle(e.target.value)}
                                placeholder="Add a new task..." 
                                className="h-8 bg-background border border-border rounded-xl pl-3 pr-10 text-sm"
                            />
                            <Button 
                                type="submit" 
                                variant="primary" 
                                isIconOnly 
                                className="absolute right-1 top-1 h-6 w-6 rounded-md"
                            >
                                <Plus size={14} />
                            </Button>
                        </div>
                    </form>
                </div>
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
        </div>
    );
}

