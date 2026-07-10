import dayjs from 'dayjs';

export type DeadlineWarning = 'overdue' | 'urgent' | 'soon' | null;

export function getDeadlineWarning(deadline?: string | null, completed = false): DeadlineWarning {
    if (!deadline || completed) return null;
    const minutes = dayjs(deadline).diff(dayjs(), 'minute', true);
    if (minutes < 0) return 'overdue';
    if (minutes <= 4 * 60) return 'urgent';
    if (minutes <= 24 * 60) return 'soon';
    return null;
}

export function deadlineWarningColor(warning: DeadlineWarning): 'default' | 'warning' | 'danger' {
    return warning === 'overdue' || warning === 'urgent' ? 'danger' : warning === 'soon' ? 'warning' : 'default';
}
