'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { taskMatchesFilters } from '@/services/frontend/lib/task-filters';
import { Project, ProjectTaskStatus, Task } from '@/services/frontend/types';
import { Button, Calendar } from '@heroui/react';
import type { CalendarDate } from '@internationalized/date';
import { parseDate } from '@internationalized/date';
import dayjs from 'dayjs';
import { CheckCircle2, Clock } from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';

interface TaskCalendarProps {
    tasks?: Task[];
    projectId?: string;
    projects?: Project[];
    searchQuery?: string;
    selectedTags?: string[];
    hideCompleted?: boolean;
    statusOptions?: ProjectTaskStatus[];
    refreshToken?: number;
    onOpenTask?: (task: Task) => void;
    onUpdate?: () => void;
}

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function TaskCalendar({ tasks: propTasks, projectId, projects = [], searchQuery = '', selectedTags = [], hideCompleted = false, refreshToken, onOpenTask, onUpdate: _onUpdate }: TaskCalendarProps) {
    const [fetchedTasks, setFetchedTasks] = useState<Task[]>([]);
    const [selectedDate, setSelectedDate] = useState<CalendarDate | null>(() => {
        try { return parseDate(dayjs().format('YYYY-MM-DD')); } catch { return null; }
    });
    const { privateKey, user } = useAuth();

    const tasks = propTasks ?? fetchedTasks;

    const fetchAndDecryptTasks = useCallback(async () => {
        if (!projectId) return;
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
                    }
                } catch (e) {
                    console.error('Failed to get project key:', e);
                }
            }

            rawTasks = await Promise.all(rawTasks.map(async (task) => {
                if (task.isEncrypted && docKey) {
                    try {
                        const titleData = JSON.parse(task.title);
                        return { ...task, title: await decryptData(titleData, docKey) };
                    } catch {
                        return { ...task, title: 'Decryption Error' };
                    }
                }
                return task;
            }));

            setFetchedTasks(rawTasks);
        } catch (e) {
            console.error(e);
        }
    }, [projectId, privateKey, user]);

    const loadFetchedTasks = useEffectEvent(() => {
        void fetchAndDecryptTasks();
    });

    useEffect(() => {
        if (propTasks || !projectId) return;
        loadFetchedTasks();
    }, [projectId, propTasks, refreshToken]);

    const visibleTasks = useMemo(() => {
        return tasks.filter(task => {
            if (hideCompleted && task.completed) return false;
            return taskMatchesFilters(task, searchQuery, selectedTags);
        });
    }, [hideCompleted, searchQuery, selectedTags, tasks]);

    // Build map: YYYY-MM-DD → tasks sorted by priority
    const tasksByDate = useMemo(() => {
        return visibleTasks.reduce((acc, task) => {
            if (!task.deadline || task.completed) return acc;
            const dateStr = dayjs(task.deadline).format('YYYY-MM-DD');
            if (!acc[dateStr]) acc[dateStr] = [];
            acc[dateStr].push(task);
            return acc;
        }, {} as Record<string, Task[]>);
    }, [visibleTasks]);

    // Sort tasks within each date by priority
    const sortedTasksByDate = useMemo(() => {
        return Object.fromEntries(
            Object.entries(tasksByDate).map(([date, dateTasks]) => [
                date,
                [...dateTasks].sort((a, b) =>
                    (priorityOrder[a.priority ?? 'low'] ?? 4) - (priorityOrder[b.priority ?? 'low'] ?? 4)
                ),
            ])
        );
    }, [tasksByDate]);

    const getDateVariant = (dateStr: string): 'overdue' | 'today' | 'soon' | 'future' | null => {
        if (!sortedTasksByDate[dateStr]?.length) return null;
        const now = dayjs();
        const d = dayjs(dateStr);
        if (d.isBefore(now, 'day')) return 'overdue';
        if (d.isSame(now, 'day')) return 'today';
        if (d.isBefore(now.add(3, 'day'), 'day')) return 'soon';
        return 'future';
    };

    const indicatorClass = (variant: ReturnType<typeof getDateVariant>) => {
        switch (variant) {
            case 'overdue': return 'bg-danger';
            case 'today':   return 'bg-warning';
            case 'soon':    return 'bg-warning/70';
            case 'future':  return 'bg-accent';
            default:        return '';
        }
    };

    const selectedDateStr = selectedDate?.toString() ?? '';
    const selectedTasks = sortedTasksByDate[selectedDateStr] ?? [];

    const handleDateChange = (date: CalendarDate) => {
        setSelectedDate(date);
    };

    const getTaskPriorityColor = (task: Task) => {
        const now = dayjs();
        if (task.deadline && dayjs(task.deadline).isBefore(now, 'day')) return 'bg-danger';
        switch (task.priority) {
            case 'urgent': return 'bg-danger';
            case 'high':   return 'bg-warning';
            case 'medium': return 'bg-accent';
            default:       return 'bg-muted-foreground/40';
        }
    };

    const formatDeadline = (deadline: string) => {
        const d = dayjs(deadline);
        const now = dayjs();
        if (d.isBefore(now, 'day')) return { label: 'Overdue', cls: 'text-danger' };
        if (d.isSame(now, 'day')) return { label: 'Today', cls: 'text-warning font-medium' };
        if (d.isSame(now.add(1, 'day'), 'day')) return { label: 'Tomorrow', cls: 'text-warning' };
        return { label: d.format('MMM D'), cls: 'text-muted-foreground' };
    };

    // Count upcoming tasks in next 7 days for the legend
    const upcomingCount = useMemo(() => {
        const start = dayjs().startOf('day');
        const end = dayjs().add(7, 'day').endOf('day');
        return visibleTasks.filter(t => t.deadline && !t.completed && dayjs(t.deadline).isAfter(start) && dayjs(t.deadline).isBefore(end)).length;
    }, [visibleTasks]);

    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-3 px-0.5">
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-danger inline-block" /> Overdue
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-warning inline-block" /> Due soon
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" /> Scheduled
                    </span>
                    {upcomingCount > 0 && (
                        <span className="ml-auto text-[11px] text-muted-foreground">
                            {upcomingCount} in 7d
                        </span>
                    )}
                </div>

                <Calendar
                    aria-label="Task schedule"
                    value={selectedDate}
                    onChange={handleDateChange}
                    className="w-full max-w-none"
                >
                    <Calendar.Header className="mb-3 flex items-center justify-between">
                        <Calendar.Heading className="text-[13px] font-semibold text-foreground" />
                        <div className="flex gap-1">
                            <Calendar.NavButton
                                slot="previous"
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-secondary text-muted-foreground transition-all hover:bg-accent hover:text-white"
                            />
                            <Calendar.NavButton
                                slot="next"
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-secondary text-muted-foreground transition-all hover:bg-accent hover:text-white"
                            />
                        </div>
                    </Calendar.Header>
                    <Calendar.Grid className="w-full">
                        <Calendar.GridHeader>
                            {(day) => (
                                <Calendar.HeaderCell className="pb-2 text-center text-[11px] font-medium text-muted-foreground/60">
                                    {day.slice(0, 2)}
                                </Calendar.HeaderCell>
                            )}
                        </Calendar.GridHeader>
                        <Calendar.GridBody>
                            {(date) => {
                                const dateStr = date.toString();
                                const variant = getDateVariant(dateStr);
                                return (
                                    <Calendar.Cell
                                        date={date}
                                        className="mx-auto aspect-square w-full max-w-[3.2rem] rounded-xl text-[13px] transition-all hover:bg-accent/10 data-[outside-month=true]:opacity-30 data-[selected=true]:bg-accent data-[selected=true]:text-white data-[today=true]:ring-1 data-[today=true]:ring-accent/40"
                                        aria-label={dateStr}
                                    >
                                        {({ formattedDate }) => (
                                            <>
                                                {formattedDate}
                                                {variant && (
                                                    <Calendar.CellIndicator
                                                        className={indicatorClass(variant)}
                                                    />
                                                )}
                                            </>
                                        )}
                                    </Calendar.Cell>
                                );
                            }}
                        </Calendar.GridBody>
                    </Calendar.Grid>
                </Calendar>
            </div>

            <div className="space-y-3">
                {selectedDate && (
                    selectedTasks.length > 0 ? (
                        <div className="overflow-hidden rounded-xl border border-border bg-surface">
                            <div className="flex items-center gap-2 border-b border-border bg-surface-secondary/50 px-3 py-2">
                                <Clock size={11} className="shrink-0 text-muted-foreground" />
                                <p className="text-[12px] font-semibold text-foreground">
                                    {dayjs(selectedDateStr).format('ddd, MMM D')}
                                </p>
                                <span className="ml-auto text-[11px] text-muted-foreground">
                                    {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <div className="divide-y divide-border">
                                {selectedTasks.map(task => {
                                    const deadline = task.deadline ? formatDeadline(task.deadline) : null;
                                    const project = projects.find(p => p.id === task.projectId);
                                    return (
                                        <Button
                                            key={task.id}
                                            variant="ghost"
                                            className="group h-auto w-full justify-start gap-2.5 rounded-none px-3 py-2.5 text-left"
                                            onPress={() => onOpenTask?.(task)}
                                        >
                                            <div className={`mt-px h-1.5 w-1.5 shrink-0 rounded-full ${getTaskPriorityColor(task)}`} />
                                            <span className="flex-1 truncate text-[12px] text-foreground transition-colors group-hover:text-accent">
                                                {task.title}
                                            </span>
                                            {project && (
                                                <span className="max-w-[80px] shrink-0 truncate text-[11px] text-muted-foreground">
                                                    {project.name}
                                                </span>
                                            )}
                                            {deadline && (
                                                <span className={`shrink-0 text-[11px] ${deadline.cls}`}>
                                                    {deadline.label}
                                                </span>
                                            )}
                                        </Button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-border bg-surface px-3 py-3">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={11} className="shrink-0 text-success/60" />
                                <p className="text-[11px] text-muted-foreground">
                                    No tasks on {dayjs(selectedDateStr).format('MMM D')}
                                </p>
                            </div>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
