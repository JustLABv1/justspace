'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { taskMatchesFilters } from '@/services/frontend/lib/task-filters';
import { wsClient, WSEvent } from '@/services/frontend/lib/ws';
import { Task } from '@/services/frontend/types';
import dayjs from 'dayjs';
import { Lock } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TaskDetailModal } from './TaskDetailModal';

const PRIORITY_COLORS: Record<string, string> = {
    urgent: 'bg-danger/80',
    high: 'bg-danger/60',
    medium: 'bg-warning/70',
    low: 'bg-accent/50',
    default: 'bg-accent/40',
};

const ROW_HEIGHT = 40;
const LEFT_WIDTH = 200;
const DAY_WIDTH = 40;

export function TimelineView({
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
    const scrollRef = useRef<HTMLDivElement>(null);

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

    // Scroll to today on load
    useEffect(() => {
        if (!isLoading && scrollRef.current) {
            const today = dayjs();
            const todayOffset = today.diff(timelineStart, 'day') * DAY_WIDTH;
            scrollRef.current.scrollLeft = Math.max(0, todayOffset - 120);
        }
    }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

    if (isLoading) return (
        <div className="h-40 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        </div>
    );

    if (tasks.length === 0) {
        return (
            <div className="h-40 flex items-center justify-center text-[13px] text-muted-foreground">
                No tasks found
            </div>
        );
    }

    // Compute timeline bounds
    const today = dayjs();
    const taskDates = tasks.flatMap(t => {
        const dates = [dayjs(t.createdAt)];
        if (t.deadline) dates.push(dayjs(t.deadline));
        return dates;
    });
    const allDates = [...taskDates, today.add(14, 'day')];
    const minTimestamp = Math.min(...allDates.map(d => d.valueOf()));
    const maxTimestamp = Math.max(...allDates.map(d => d.valueOf()));
    const minDate = dayjs(minTimestamp).subtract(3, 'day').startOf('day');
    const maxDate = dayjs(maxTimestamp).add(7, 'day').startOf('day');
    const totalDays = maxDate.diff(minDate, 'day');
    const timelineStart = minDate;
    const todayOffset = today.diff(minDate, 'day');

    // Generate month labels
    const months: { label: string; x: number; days: number }[] = [];
    let cur = minDate.startOf('month');
    while (cur.isBefore(maxDate)) {
        const start = cur.diff(minDate, 'day');
        const end = Math.min(cur.endOf('month').diff(minDate, 'day') + 1, totalDays);
        months.push({ label: cur.format('MMMM YYYY'), x: Math.max(0, start) * DAY_WIDTH, days: end - Math.max(0, start) });
        cur = cur.add(1, 'month');
    }

    // Generate day labels (only show Mon/every 7th to avoid clutter)
    const dayLabels: { label: string; x: number; isToday: boolean }[] = [];
    for (let i = 0; i <= totalDays; i++) {
        const d = minDate.add(i, 'day');
        if (d.day() === 1 || i === 0 || d.isSame(today, 'day')) {
            dayLabels.push({
                label: d.format('D'),
                x: i * DAY_WIDTH,
                isToday: d.isSame(today, 'day'),
            });
        }
    }

    return (
        <>
            <div className="flex border border-border rounded-xl overflow-hidden bg-surface" style={{ minHeight: `${(tasks.length + 1) * ROW_HEIGHT + 56}px` }}>
                {/* Left sidebar - task names */}
                <div className="shrink-0 bg-surface border-r border-border z-10" style={{ width: LEFT_WIDTH }}>
                    {/* Header */}
                    <div className="h-14 flex items-end px-4 pb-2 border-b border-border">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Task</span>
                    </div>
                    {tasks.map((task, i) => (
                        <div
                            key={task.id}
                            onClick={() => { setSelectedTask(task); setIsDetailModalOpen(true); }}
                            className={`flex items-center gap-2 px-4 cursor-pointer hover:bg-surface-secondary/60 transition-colors ${i % 2 === 0 ? '' : 'bg-surface-secondary/20'}`}
                            style={{ height: ROW_HEIGHT }}
                        >
                            {task.isEncrypted && <Lock size={10} className="text-muted-foreground shrink-0" />}
                            <span className="text-[12px] text-foreground truncate" title={task.title}>{task.title}</span>
                        </div>
                    ))}
                </div>

                {/* Scrollable timeline area */}
                <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden no-scrollbar relative">
                    <div style={{ width: totalDays * DAY_WIDTH, position: 'relative' }}>
                        {/* Header: months + days */}
                        <div className="h-14 border-b border-border sticky top-0 bg-surface z-10">
                            {/* Month labels */}
                            <div className="h-7 flex items-center relative">
                                {months.map((m, i) => (
                                    <div
                                        key={i}
                                        className="absolute h-full flex items-center px-2 text-[11px] font-semibold text-muted-foreground border-r border-border/40"
                                        style={{ left: m.x, width: m.days * DAY_WIDTH }}
                                    >
                                        {m.label}
                                    </div>
                                ))}
                            </div>
                            {/* Day labels */}
                            <div className="h-7 flex items-center relative">
                                {dayLabels.map((d, i) => (
                                    <div
                                        key={i}
                                        className={`absolute flex items-center justify-center text-[10px] font-medium w-[40px] ${d.isToday ? 'text-accent font-bold' : 'text-muted-foreground/60'}`}
                                        style={{ left: d.x }}
                                    >
                                        {d.label}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Grid rows */}
                        <div className="relative">
                            {/* Vertical grid lines (weekly) */}
                            {Array.from({ length: Math.ceil(totalDays / 7) }, (_, i) => (
                                <div
                                    key={i}
                                    className="absolute top-0 bottom-0 border-l border-border/30"
                                    style={{ left: i * 7 * DAY_WIDTH }}
                                />
                            ))}

                            {/* Today vertical line */}
                            {todayOffset >= 0 && todayOffset <= totalDays && (
                                <div
                                    className="absolute top-0 bottom-0 border-l-2 border-accent/70 z-20"
                                    style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
                                />
                            )}

                            {/* Task rows with bars */}
                            {tasks.map((task, i) => {
                                const barColor = PRIORITY_COLORS[task.priority || 'default'];
                                const startDay = dayjs(task.createdAt).diff(minDate, 'day');
                                const endDay = task.deadline
                                    ? dayjs(task.deadline).diff(minDate, 'day') + 1
                                    : todayOffset + 1;
                                const barLeft = Math.max(0, startDay) * DAY_WIDTH;
                                const barWidth = Math.max(DAY_WIDTH, (endDay - Math.max(0, startDay)) * DAY_WIDTH);
                                const isOverdue = task.deadline && dayjs(task.deadline).isBefore(today, 'day') && !task.completed;

                                return (
                                    <div
                                        key={task.id}
                                        className={`flex items-center ${i % 2 === 0 ? '' : 'bg-surface-secondary/10'}`}
                                        style={{ height: ROW_HEIGHT }}
                                    >
                                        <div
                                            onClick={() => { setSelectedTask(task); setIsDetailModalOpen(true); }}
                                            className={`absolute h-6 rounded-md cursor-pointer flex items-center px-2 transition-opacity hover:opacity-90 ${barColor} ${task.completed ? 'opacity-40' : ''} ${isOverdue ? 'ring-1 ring-danger/50' : ''}`}
                                            style={{ left: barLeft, width: barWidth }}
                                            title={task.title}
                                        >
                                            <span className="text-[10px] font-medium text-white truncate leading-none">{task.title}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
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
        </>
    );
}
