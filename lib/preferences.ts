export type SavedViewMode = 'list' | 'kanban' | 'table' | 'timeline' | 'calendar';

export interface ReminderPreferences {
	enabled: boolean;
	minutesBefore: number;
}

export interface SavedProjectView {
	id: string;
	projectId: string;
	name: string;
	viewMode: SavedViewMode;
	searchQuery: string;
	selectedTags: string[];
	hideCompleted: boolean;
	createdAt: string;
}

export interface WorkspacePreferences {
	workspaceName: string;
	reminders: ReminderPreferences;
	savedViews: SavedProjectView[];
}

const DEFAULT_PREFERENCES: WorkspacePreferences = {
	workspaceName: 'justspace',
	reminders: {
		enabled: false,
		minutesBefore: 15,
	},
	savedViews: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseUserPreferences(preferences?: Record<string, unknown> | null): WorkspacePreferences {
	const source = isRecord(preferences) ? preferences : {};
	const remindersSource = isRecord(source.reminders) ? source.reminders : {};
	const savedViewsSource = Array.isArray(source.savedViews) ? source.savedViews : [];

	return {
		workspaceName: typeof source.workspaceName === 'string' && source.workspaceName.trim()
			? source.workspaceName
			: DEFAULT_PREFERENCES.workspaceName,
		reminders: {
			enabled: remindersSource.enabled === true,
			minutesBefore: typeof remindersSource.minutesBefore === 'number' && Number.isFinite(remindersSource.minutesBefore)
				? Math.max(1, Math.min(120, Math.round(remindersSource.minutesBefore)))
				: DEFAULT_PREFERENCES.reminders.minutesBefore,
		},
		savedViews: savedViewsSource
			.filter(isRecord)
			.map((view) => ({
				id: typeof view.id === 'string' ? view.id : crypto.randomUUID(),
				projectId: typeof view.projectId === 'string' ? view.projectId : '',
				name: typeof view.name === 'string' ? view.name : 'Saved view',
				viewMode: isSavedViewMode(view.viewMode) ? view.viewMode : 'kanban',
				searchQuery: typeof view.searchQuery === 'string' ? view.searchQuery : '',
				selectedTags: Array.isArray(view.selectedTags)
					? view.selectedTags.filter((tag): tag is string => typeof tag === 'string')
					: [],
				hideCompleted: view.hideCompleted === true,
				createdAt: typeof view.createdAt === 'string' ? view.createdAt : new Date().toISOString(),
			}))
			.filter((view) => view.projectId),
	};
}

export function mergeUserPreferences(
	current: Record<string, unknown> | undefined,
	patch: Partial<WorkspacePreferences>,
): Record<string, unknown> {
	const parsed = parseUserPreferences(current);
	return {
		...(current || {}),
		workspaceName: patch.workspaceName ?? parsed.workspaceName,
		reminders: {
			...parsed.reminders,
			...(patch.reminders || {}),
		},
		savedViews: patch.savedViews ?? parsed.savedViews,
	};
}

export function buildProjectViewHref(view: SavedProjectView) {
	const params = new URLSearchParams();
	params.set('view', view.viewMode);
	if (view.searchQuery.trim()) {
		params.set('q', view.searchQuery.trim());
	}
	if (view.selectedTags.length > 0) {
		params.set('tags', view.selectedTags.join(','));
	}
	if (view.hideCompleted) {
		params.set('hideCompleted', '1');
	}
	params.set('savedView', view.id);
	return `/projects/${view.projectId}?${params.toString()}`;
}

export function isSavedViewMode(value: unknown): value is SavedViewMode {
	return value === 'list' || value === 'kanban' || value === 'table' || value === 'timeline' || value === 'calendar';
}