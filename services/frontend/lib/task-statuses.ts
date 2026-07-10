import { ProjectTaskStatus, Task } from '@/services/frontend/types';

export function getDefaultProjectTaskStatuses(): ProjectTaskStatus[] {
	return [
		{
			id: 'todo',
			projectId: '',
			key: 'todo',
			label: 'Todo',
			colorToken: 'default',
			position: 0,
			isCompletedState: false,
			isBuiltin: true,
			createdAt: '',
			updatedAt: '',
		},
		{
			id: 'in-progress',
			projectId: '',
			key: 'in-progress',
			label: 'In progress',
			colorToken: 'accent',
			position: 1,
			isCompletedState: false,
			isBuiltin: true,
			createdAt: '',
			updatedAt: '',
		},
		{
			id: 'review',
			projectId: '',
			key: 'review',
			label: 'Review',
			colorToken: 'warning',
			position: 2,
			isCompletedState: false,
			isBuiltin: true,
			createdAt: '',
			updatedAt: '',
		},
		{
			id: 'waiting',
			projectId: '',
			key: 'waiting',
			label: 'Blocked',
			colorToken: 'danger',
			position: 3,
			isCompletedState: false,
			isBuiltin: true,
			createdAt: '',
			updatedAt: '',
		},
		{
			id: 'done',
			projectId: '',
			key: 'done',
			label: 'Done',
			colorToken: 'success',
			position: 4,
			isCompletedState: true,
			isBuiltin: true,
			createdAt: '',
			updatedAt: '',
		},
	];
}

export function buildTaskStatusMap(statuses: ProjectTaskStatus[]) {
	const source = statuses.length > 0 ? statuses : getDefaultProjectTaskStatuses();
	return Object.fromEntries(source.map((status) => [status.key, status])) as Record<string, ProjectTaskStatus>;
}

export function getTaskStatusForTask(task: Task, statuses: ProjectTaskStatus[]) {
	const source = statuses.length > 0 ? statuses : getDefaultProjectTaskStatuses();
	const statusKey = task.kanbanStatus || 'todo';
	return source.find((status) => status.key === statusKey) || source[0];
}

export function getStatusTokenDotClass(colorToken: ProjectTaskStatus['colorToken']) {
	switch (colorToken) {
		case 'accent':
			return 'bg-accent';
		case 'warning':
			return 'bg-warning';
		case 'danger':
			return 'bg-danger';
		case 'success':
			return 'bg-success';
		default:
			return 'bg-muted-foreground/40';
	}
}

export function getStatusTokenChipColor(colorToken: ProjectTaskStatus['colorToken']): 'default' | 'accent' | 'success' | 'warning' | 'danger' {
	return colorToken;
}

export function getCompletedStatus(statuses: ProjectTaskStatus[]) {
	return (statuses.length > 0 ? statuses : getDefaultProjectTaskStatuses()).find((status) => status.isCompletedState) || getDefaultProjectTaskStatuses()[4];
}

export function getOpenStatus(statuses: ProjectTaskStatus[]) {
	return (statuses.length > 0 ? statuses : getDefaultProjectTaskStatuses()).find((status) => !status.isCompletedState) || getDefaultProjectTaskStatuses()[0];
}
