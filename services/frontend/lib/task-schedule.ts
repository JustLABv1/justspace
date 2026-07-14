'use client';

import { Task } from '@/services/frontend/types';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';

export const UPCOMING_SCHEDULE_DAYS = 7;

export type ScheduleBucket = 'overdue' | 'today' | 'upcoming' | 'future' | 'none';

export type DeadlineDisplay = {
    bucket: Exclude<ScheduleBucket, 'none'>;
    label: string;
    color: 'default' | 'warning' | 'danger';
};

const priorityOrder: Record<NonNullable<Task['priority']>, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
};

function parseDeadline(deadline?: string | null): Dayjs | null {
    if (!deadline) return null;
    const parsed = dayjs(deadline);
    return parsed.isValid() ? parsed : null;
}

export function useScheduleNow() {
    const [now, setNow] = useState(() => dayjs());

    useEffect(() => {
        const interval = window.setInterval(() => setNow(dayjs()), 60_000);
        return () => window.clearInterval(interval);
    }, []);

    return now;
}

export function getScheduleBucket(deadline?: string | null, now = dayjs()): ScheduleBucket {
    const dueAt = parseDeadline(deadline);
    if (!dueAt) return 'none';
    if (dueAt.isBefore(now)) return 'overdue';
    if (dueAt.isSame(now, 'day')) return 'today';
    if (dueAt.isBefore(now.add(UPCOMING_SCHEDULE_DAYS, 'day').endOf('day'))) return 'upcoming';
    return 'future';
}

export function isOverdue(deadline?: string | null, now = dayjs()) {
    return getScheduleBucket(deadline, now) === 'overdue';
}

export function isDueSoon(deadline?: string | null, now = dayjs()) {
    const bucket = getScheduleBucket(deadline, now);
    return bucket === 'today' || bucket === 'upcoming';
}

export function getDeadlineDisplay(deadline?: string | null, now = dayjs()): DeadlineDisplay | null {
    const dueAt = parseDeadline(deadline);
    const bucket = getScheduleBucket(deadline, now);
    if (!dueAt || bucket === 'none') return null;

    if (bucket === 'overdue') {
        return { bucket, label: `Overdue · ${dueAt.format('MMM D, HH:mm')}`, color: 'danger' };
    }
    if (bucket === 'today') {
        return { bucket, label: `Today · ${dueAt.format('HH:mm')}`, color: 'warning' };
    }
    if (dueAt.isSame(now.add(1, 'day'), 'day')) {
        return { bucket, label: `Tomorrow · ${dueAt.format('HH:mm')}`, color: 'warning' };
    }
    if (bucket === 'upcoming') {
        return { bucket, label: dueAt.format('ddd · HH:mm'), color: 'warning' };
    }
    return { bucket, label: dueAt.format('MMM D · HH:mm'), color: 'default' };
}

export function getEarliestOpenDeadline(task: Task, tasks: Task[]): string | null {
    const childrenByParent = new Map<string, Task[]>();
    for (const candidate of tasks) {
        if (!candidate.parentId) continue;
        const children = childrenByParent.get(candidate.parentId) ?? [];
        children.push(candidate);
        childrenByParent.set(candidate.parentId, children);
    }

    const deadlines: Dayjs[] = [];
    const visited = new Set<string>();
    const collect = (candidate: Task) => {
        if (visited.has(candidate.id)) return;
        visited.add(candidate.id);
        if (!candidate.completed) {
            const deadline = parseDeadline(candidate.deadline);
            if (deadline) deadlines.push(deadline);
        }
        for (const child of childrenByParent.get(candidate.id) ?? []) collect(child);
    };

    collect(task);
    if (deadlines.length === 0) return null;
    return deadlines.reduce((earliest, deadline) => deadline.isBefore(earliest) ? deadline : earliest).toISOString();
}

function comparePriority(left: Task, right: Task) {
    const priorityDelta = (priorityOrder[left.priority ?? 'low'] ?? 4) - (priorityOrder[right.priority ?? 'low'] ?? 4);
    if (priorityDelta !== 0) return priorityDelta;

    const orderDelta = (left.order ?? 0) - (right.order ?? 0);
    if (orderDelta !== 0) return orderDelta;

    return left.createdAt.localeCompare(right.createdAt);
}

export function compareTasksBySchedule(left: Task, right: Task, tasks: Task[] = [], _now = dayjs()) {
    if (left.completed !== right.completed) return Number(left.completed) - Number(right.completed);

    const leftDeadline = getEarliestOpenDeadline(left, tasks.length > 0 ? tasks : [left]);
    const rightDeadline = getEarliestOpenDeadline(right, tasks.length > 0 ? tasks : [right]);
    const leftAt = parseDeadline(leftDeadline);
    const rightAt = parseDeadline(rightDeadline);

    if (leftAt && rightAt) {
        const deadlineDelta = leftAt.valueOf() - rightAt.valueOf();
        if (deadlineDelta !== 0) return deadlineDelta;
    } else if (leftAt) {
        return -1;
    } else if (rightAt) {
        return 1;
    }

    return comparePriority(left, right);
}

export function sortTasksBySchedule(tasks: Task[], allTasks: Task[] = tasks, now = dayjs()) {
    return [...tasks].sort((left, right) => compareTasksBySchedule(left, right, allTasks, now));
}
