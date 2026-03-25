import { Task } from '@/services/frontend/types';

function normalizeTag(tag: string) {
    return tag.trim().toLowerCase();
}

export function normalizeTaskTags(tags?: string[] | string | null) {
    const rawTags = Array.isArray(tags)
        ? tags
        : typeof tags === 'string'
            ? tags.split(',')
            : [];

    const uniqueTags = new Set<string>();

    for (const rawTag of rawTags) {
        const normalizedTag = normalizeTag(rawTag);
        if (!normalizedTag) {
            continue;
        }
        uniqueTags.add(normalizedTag);
    }

    return [...uniqueTags];
}

export function taskMatchesFilters(task: Task, searchQuery = '', selectedTags: string[] = []) {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const normalizedSelectedTags = normalizeTaskTags(selectedTags);
    const taskTags = normalizeTaskTags(task.tags);

    const matchesSearch = !normalizedQuery
        || task.title.toLowerCase().includes(normalizedQuery)
        || taskTags.some((tag) => tag.includes(normalizedQuery));

    const matchesTags = normalizedSelectedTags.length === 0
        || normalizedSelectedTags.every((tag) => taskTags.includes(tag));

    return matchesSearch && matchesTags;
}

export function collectTaskTags(tasks: Task[]) {
    return [...new Set(tasks.flatMap((task) => normalizeTaskTags(task.tags)))].sort((left, right) => left.localeCompare(right));
}