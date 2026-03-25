'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { taskMatchesFilters } from '@/lib/task-filters';
import { Project, Task } from '@/types';
import { Calendar } from '@heroui/react';
import type { DateValue } from '@internationalized/date';
import { parseDate } from '@internationalized/date';
import dayjs from 'dayjs';
import { CheckCircle2, Clock } from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { TaskDetailModal } from './TaskDetailModal';

interface TaskCalendarProps {
    tasks?: Task[];
    projectId?: string;
    projects?: Project[];
    searchQuery?: string;
    selectedTags?: string[];
    hideCompleted?: boolean;
    onUpdate?: () => void;
}

const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function TaskCalendar({ tasks: propTasks, projectId, projects = [], searchQuery = '', selectedTags = [], hideCompleted = false, onUpdate }: TaskCalendarProps) {
    const [fetchedTasks, setFetchedTasks] = useState<Task[]>([]);
    const [selectedDate, setSelectedDate] = useState<DateValue | null>(() => {
        try { return parseDate(dayjs().format('YYYY-MM-DD')); } catch { return null; }
    });
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
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
    }, [projectId, propTasks]);

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

    const handleDateChange = (date: DateValue) => {
        setSelectedDate(date);
    };

    const handleTaskUpdated = () => {
        setSelectedTask(null);
        onUpdate?.();
        if (projectId && !propTasks) {
            fetchAndDecryptTasks();
        }
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
        <div className="space-y-3">
            {/* Legend */}
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

            {/* Calendar */}
            <Calendar
                aria-label="Task schedule"
                value={selectedDate}
                onChange={handleDateChange}
                className="w-full"
            >
                <Calendar.Header className="flex items-center justify-between mb-3">
                    <Calendar.Heading className="text-[13px] font-semibold text-foreground" />
                    <div className="flex gap-1">
                        <Calendar.NavButton
                            slot="previous"
                            className="h-7 w-7 rounded-lg bg-surface-secondary hover:bg-accent hover:text-white transition-all flex items-center justify-center text-muted-foreground"
                        />
                        <Calendar.NavButton
                            slot="next"
                            className="h-7 w-7 rounded-lg bg-surface-secondary hover:bg-accent hover:text-white transition-all flex items-center justify-center text-muted-foreground"
                        />
                    </div>
                </Calendar.Header>
                <Calendar.Grid>
                    <Calendar.GridHeader>
                        {(day) => (
                            <Calendar.HeaderCell className="text-[11px] text-muted-foreground/60 pb-2 font-medium text-center">
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
                                    className="max-w-[2.75rem] w-full mx-auto aspect-square rounded-xl cursor-pointer transition-all hover:bg-accent/10 data-[selected=true]:bg-accent data-[selected=true]:text-white data-[today=true]:ring-1 data-[today=true]:ring-accent/40 data-[outside-month=true]:opacity-30 text-[13px]"
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

            {/* Tasks for selected date */}
            {selectedDate && (
                selectedTasks.length > 0 ? (
                    <div className="rounded-xl border border-border bg-surface overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-secondary/50">
                            <Clock size={11} className="text-muted-foreground shrink-0" />
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
                                    <button
                                        key={task.id}
                                        onClick={() => setSelectedTask(task)}
                                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface-secondary/50 transition-colors group"
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-px ${getTaskPriorityColor(task)}`} />
                                        <span className="text-[12px] text-foreground truncate flex-1 group-hover:text-accent transition-colors">
                                            {task.title}
                                        </span>
                                        {project && (
                                            <span className="text-[11px] text-muted-foreground shrink-0 max-w-[80px] truncate">
                                                {project.name}
                                            </span>
                                        )}
                                        {deadline && (
                                            <span className={`text-[11px] shrink-0 ${deadline.cls}`}>
                                                {deadline.label}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 px-1 py-1.5">
                        <CheckCircle2 size={11} className="text-success/60 shrink-0" />
                        <p className="text-[11px] text-muted-foreground">
                            No tasks on {dayjs(selectedDateStr).format('MMM D')}
                        </p>
                    </div>
                )
            )}

            {selectedTask && (
                <TaskDetailModal
                    isOpen={true}
                    onOpenChange={(open) => { if (!open) setSelectedTask(null); }}
                    task={selectedTask}
                    projectId={selectedTask.projectId}
                    onUpdate={handleTaskUpdated}
                />
            )}
        </div>
    );
}
