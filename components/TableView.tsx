'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { taskMatchesFilters } from '@/lib/task-filters';
import { wsClient, WSEvent } from '@/lib/ws';
import { Task } from '@/types';
import { Avatar, Chip, ScrollShadow } from '@heroui/react';
import dayjs from 'dayjs';
import { Calendar, Clock, Lock, MessageCircle, Minus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { TaskDetailModal } from './TaskDetailModal';

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
    'todo': { label: 'To Do', dot: 'bg-muted-foreground/40' },
    'in-progress': { label: 'In Progress', dot: 'bg-accent' },
    'review': { label: 'Review', dot: 'bg-warning' },
    'waiting': { label: 'Waiting', dot: 'bg-accent/60' },
    'done': { label: 'Done', dot: 'bg-success' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: 'danger' | 'warning' | 'accent' | 'default' }> = {
    'urgent': { label: 'Urgent', color: 'danger' },
    'high': { label: 'High', color: 'danger' },
    'medium': { label: 'Medium', color: 'warning' },
    'low': { label: 'Low', color: 'default' },
};

export function TableView({
    projectId,
    searchQuery = '',
    selectedTags = [],
    hideCompleted = false,
}: {
    projectId: string;
    searchQuery?: string;
    selectedTags?: string[];
    hideCompleted?: boolean;
}) {
    const { user, privateKey } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [documentKey, setDocumentKey] = useState<CryptoKey | null>(null);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const fetchTasks = useCallback(async (isInitial = false) => {
        if (isInitial) setIsLoading(true);
        try {
            const res = await db.listTasks(projectId);
            const rawTasks = res.documents as unknown as Task[];

            const project = await db.getProject(projectId);
            let docKey = documentKey;
            if (project.isEncrypted && privateKey && user && !docKey) {
                const access = await db.getAccessKey(projectId);
                if (access) {
                    docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    setDocumentKey(docKey);
                }
            }

            const decrypted = await Promise.all(rawTasks.map(async (task) => {
                if (task.isEncrypted && docKey) {
                    try {
                        const enc = JSON.parse(task.title);
                        return { ...task, title: await decryptData(enc, docKey) };
                    } catch { return { ...task, title: 'Decryption Error' }; }
                }
                return task;
            }));

            const filtered = decrypted.filter(task => {
                if (task.parentId) return false;

                const subtasks = decrypted.filter(subtask => subtask.parentId === task.id);
                const matchesTask = taskMatchesFilters(task, searchQuery, selectedTags);
                const matchesSubtask = subtasks.some(subtask => taskMatchesFilters(subtask, searchQuery, selectedTags));

                if (!(matchesTask || matchesSubtask)) return false;
                if (hideCompleted && (task.kanbanStatus === 'done' || task.completed)) return false;
                return true;
            });

            setTasks(filtered);
        } catch (err) {
            console.error(err);
        } finally {
            if (isInitial) setIsLoading(false);
        }
    }, [projectId, user, privateKey, documentKey, searchQuery, selectedTags, hideCompleted]);

    useEffect(() => { fetchTasks(true); }, [fetchTasks]);

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

    if (isLoading) return (
        <div className="h-40 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        </div>
    );

    return (
        <>
            <ScrollShadow className="w-full" hideScrollBar>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="pb-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-8"></th>
                            <th className="pb-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Title</th>
                            <th className="pb-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-28 hidden sm:table-cell">Status</th>
                            <th className="pb-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-24 hidden md:table-cell">Priority</th>
                            <th className="pb-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-28 hidden lg:table-cell">Deadline</th>
                            <th className="pb-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-20 hidden lg:table-cell">Time</th>
                            <th className="pb-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-16 hidden xl:table-cell">Notes</th>
                            <th className="pb-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {tasks.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="py-12 text-center text-[13px] text-muted-foreground">
                                    No tasks found
                                </td>
                            </tr>
                        ) : tasks.map(task => {
                            const status = STATUS_CONFIG[task.kanbanStatus || 'todo'];
                            const priority = task.priority ? PRIORITY_CONFIG[task.priority] : null;
                            const isOverdue = task.deadline && dayjs(task.deadline).isBefore(dayjs(), 'day') && !task.completed;
                            const hours = Math.floor((task.timeSpent || 0) / 3600);
                            const mins = Math.floor(((task.timeSpent || 0) % 3600) / 60);

                            return (
                                <tr
                                    key={task.id}
                                    onClick={() => { setSelectedTask(task); setIsDetailModalOpen(true); }}
                                    className={`hover:bg-surface-secondary/40 cursor-pointer transition-colors group ${task.completed ? 'opacity-50' : ''}`}
                                >
                                    {/* Status dot */}
                                    <td className="py-3 px-3">
                                        <div className={`w-2.5 h-2.5 rounded-full ${status.dot}`} />
                                    </td>

                                    {/* Title */}
                                    <td className="py-3 px-3">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                {task.isEncrypted && <Lock size={11} className="text-muted-foreground shrink-0" />}
                                                {task.completed
                                                    ? <span className="text-[13px] text-muted-foreground line-through">{task.title}</span>
                                                    : <span className="text-[13px] font-medium text-foreground">{task.title}</span>
                                                }
                                            </div>
                                            {task.tags && task.tags.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                                                    {task.tags.slice(0, 3).map(tag => (
                                                        <span key={tag}>#{tag}</span>
                                                    ))}
                                                    {task.tags.length > 3 && <span>+{task.tags.length - 3}</span>}
                                                </div>
                                            )}
                                        </div>
                                    </td>

                                    {/* Status */}
                                    <td className="py-3 px-3 hidden sm:table-cell">
                                        <span className="text-[12px] text-muted-foreground">{status.label}</span>
                                    </td>

                                    {/* Priority */}
                                    <td className="py-3 px-3 hidden md:table-cell">
                                        {priority ? (
                                            <Chip size="sm" variant="soft" color={priority.color} className="h-5 rounded-md">
                                                <Chip.Label className="text-[10px] font-semibold px-0.5">{priority.label}</Chip.Label>
                                            </Chip>
                                        ) : (
                                            <span className="text-muted-foreground/30"><Minus size={12} /></span>
                                        )}
                                    </td>

                                    {/* Deadline */}
                                    <td className="py-3 px-3 hidden lg:table-cell">
                                        {task.deadline ? (
                                            <span className={`flex items-center gap-1.5 text-[12px] ${isOverdue ? 'text-danger font-medium' : 'text-muted-foreground'}`}>
                                                <Calendar size={11} />
                                                {dayjs(task.deadline).format('MMM D, YYYY')}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground/30"><Minus size={12} /></span>
                                        )}
                                    </td>

                                    {/* Time */}
                                    <td className="py-3 px-3 hidden lg:table-cell">
                                        {(task.timeSpent || 0) > 0 ? (
                                            <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                                                <Clock size={11} />
                                                {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground/30"><Minus size={12} /></span>
                                        )}
                                    </td>

                                    {/* Notes */}
                                    <td className="py-3 px-3 hidden xl:table-cell">
                                        {task.notes && task.notes.length > 0 ? (
                                            <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                                                <MessageCircle size={11} />
                                                {task.notes.length}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground/30"><Minus size={12} /></span>
                                        )}
                                    </td>

                                    {/* Avatar */}
                                    <td className="py-3 px-3">
                                        <Avatar size="sm" className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Avatar.Fallback className="bg-accent/15 text-accent text-[9px] font-semibold">
                                                {user?.name?.charAt(0).toUpperCase() || '?'}
                                            </Avatar.Fallback>
                                        </Avatar>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </ScrollShadow>

            {selectedTask && (
                <TaskDetailModal
                    isOpen={isDetailModalOpen}
                    onOpenChange={setIsDetailModalOpen}
                    task={tasks.find(t => t.id === selectedTask.id) || selectedTask}
                    projectId={projectId}
                    onUpdate={fetchTasks}
                />
            )}
        </>
    );
}
