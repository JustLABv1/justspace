'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { buildProjectViewHref, parseUserPreferences, SavedProjectView } from '@/lib/preferences';
import { Project, Snippet, Task, WikiGuide } from '@/types';
import { Command } from 'cmdk';
import { ArrowRight, BookOpen, CheckCircle2, Code2, FolderOpen, ListTodo, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface CommandPaletteProps {
    onClose: () => void;
}

export function CommandPalette({ onClose }: CommandPaletteProps) {
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [guides, setGuides] = useState<WikiGuide[]>([]);
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [savedViews, setSavedViews] = useState<SavedProjectView[]>([]);
    const router = useRouter();
    const { user, privateKey } = useAuth();

    // ESC to close
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, [onClose]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [projectsRes, guidesRes, snippetsRes, tasksRes] = await Promise.all([
                db.listProjects(),
                db.listGuides(),
                db.listSnippets(),
                db.listAllTasks(200),
            ]);

            const processedProjects = await Promise.all(projectsRes.documents.map(async (p) => {
                if (p.isEncrypted && privateKey && user) {
                    try {
                        const access = await db.getAccessKey(p.id, user.id);
                        if (access) {
                            const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                            const nameData = JSON.parse(p.name);
                            return { ...p, name: await decryptData(nameData, docKey) };
                        }
                    } catch { /* noop */ }
                    return { ...p, name: 'Encrypted Project' };
                }
                return p;
            }));

            const processedGuides = await Promise.all(guidesRes.documents.map(async (g) => {
                if (g.isEncrypted && privateKey && user) {
                    try {
                        const access = await db.getAccessKey(g.id, user.id);
                        if (access) {
                            const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                            const titleData = JSON.parse(g.title);
                            return { ...g, title: await decryptData(titleData, docKey) };
                        }
                    } catch { /* noop */ }
                    return { ...g, title: 'Encrypted Guide' };
                }
                return g;
            }));

            const processedSnippets = await Promise.all(snippetsRes.documents.map(async (s) => {
                if (s.isEncrypted && privateKey && user) {
                    try {
                        const access = await db.getAccessKey(s.id, user.id);
                        if (access) {
                            const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                            const titleData = JSON.parse(s.title);
                            return { ...s, title: await decryptData(titleData, docKey) };
                        }
                    } catch { /* noop */ }
                    return { ...s, title: 'Encrypted Snippet' };
                }
                return s;
            }));

            const processedTasks = await Promise.all(
                tasksRes.documents.filter(t => !t.parentId && !t.completed).map(async (t) => {
                    if (t.isEncrypted && privateKey && user) {
                        try {
                            const access = await db.getAccessKey(t.projectId, user.id);
                            if (access) {
                                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                const titleData = JSON.parse(t.title);
                                return { ...t, title: await decryptData(titleData, docKey) };
                            }
                        } catch { /* noop */ }
                        return { ...t, title: 'Encrypted Task' };
                    }
                    return t;
                })
            );

            setProjects(processedProjects);
            setGuides(processedGuides);
            setSnippets(processedSnippets);
            setTasks(processedTasks);
			setSavedViews(user ? parseUserPreferences(user.preferences).savedViews : []);
        } catch (error) {
            console.error('Failed to fetch command palette data:', error);
        } finally {
            setLoading(false);
        }
    }, [privateKey, user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const runCommand = (command: () => void) => {
        onClose();
        command();
    };

	const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[90] bg-black/20 backdrop-blur-[1px]"
                onClick={onClose}
            />

            {/* Panel — positioned below the 56px header */}
            <div className="fixed top-14 left-1/2 -translate-x-1/2 w-[min(calc(100vw-32px),580px)] z-[100] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
                <Command className="flex flex-col">
                    {/* Search input */}
                    <div className="flex items-center border-b border-border px-4 py-3" cmdk-input-wrapper="">
                        <Search size={15} className="mr-3 text-muted-foreground/60 shrink-0" />
                        <Command.Input
                            autoFocus
                            placeholder="Search snippets, projects & documents..."
                            className="flex h-8 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground/40 disabled:cursor-not-allowed"
                        />
                        <kbd
                            onClick={onClose}
                            className="ml-3 h-5 cursor-pointer select-none rounded border border-border bg-surface-secondary px-1.5 font-mono text-[10px] text-muted-foreground hover:bg-surface-secondary/80 transition-colors"
                        >
                            ESC
                        </kbd>
                    </div>

                    {/* Results */}
                    <Command.List className="max-h-[400px] overflow-y-auto overflow-x-hidden p-2 no-scrollbar">
                        {loading && (
                            <div className="flex flex-col items-center justify-center py-10 gap-3">
                                <div className="w-4 h-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                                <p className="text-xs text-muted-foreground">Searching...</p>
                            </div>
                        )}

                        <Command.Empty className="py-14 text-center flex flex-col items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-surface-secondary flex items-center justify-center text-muted-foreground/40 border border-border">
                                <Search size={18} />
                            </div>
                            <p className="text-sm text-muted-foreground">No results found.</p>
                        </Command.Empty>

                        <Command.Group heading="Navigation" className="px-1 pb-1 text-xs font-medium text-muted-foreground mb-1">
                            <Command.Item
                                onSelect={() => runCommand(() => router.push('/projects'))}
                                className="flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-white transition-colors gap-3 group"
                            >
                                <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground group-aria-selected:bg-white/20 group-aria-selected:text-white">
                                    <ListTodo size={14} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium">Projects</span>
                                    <span className="text-xs text-muted-foreground group-aria-selected:text-white/70">Kanban board</span>
                                </div>
                                <kbd className="ml-auto flex h-5 select-none items-center gap-1 rounded border border-border bg-surface-secondary px-1.5 font-mono text-xs group-aria-selected:border-white/20 group-aria-selected:bg-white/10">⌘P</kbd>
                            </Command.Item>
                            <Command.Item
                                onSelect={() => runCommand(() => router.push('/wiki'))}
                                className="flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-white transition-colors gap-3 group"
                            >
                                <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground group-aria-selected:bg-white/20 group-aria-selected:text-white">
                                    <BookOpen size={14} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium">Wiki</span>
                                    <span className="text-xs text-muted-foreground group-aria-selected:text-white/70">Knowledge base</span>
                                </div>
                                <kbd className="ml-auto flex h-5 select-none items-center gap-1 rounded border border-border bg-surface-secondary px-1.5 font-mono text-xs group-aria-selected:border-white/20 group-aria-selected:bg-white/10">⌘W</kbd>
                            </Command.Item>
                            <Command.Item
                                onSelect={() => runCommand(() => router.push('/snippets'))}
                                className="flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-white transition-colors gap-3 group"
                            >
                                <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground group-aria-selected:bg-white/20 group-aria-selected:text-white">
                                    <Code2 size={14} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium">Snippets</span>
                                    <span className="text-xs text-muted-foreground group-aria-selected:text-white/70">Code library</span>
                                </div>
                                <kbd className="ml-auto flex h-5 select-none items-center gap-1 rounded border border-border bg-surface-secondary px-1.5 font-mono text-xs group-aria-selected:border-white/20 group-aria-selected:bg-white/10">⌘S</kbd>
                            </Command.Item>
                        </Command.Group>

                        {projects.length > 0 && (
                            <Command.Group heading="Projects" className="px-1 pb-1 text-xs font-medium text-muted-foreground mt-3 mb-1">
                                {projects.map((project) => (
                                    <Command.Item
                                        key={project.id}
                                        value={`project ${project.name} ${project.description || ''} ${project.status}`}
                                        onSelect={() => runCommand(() => router.push(`/projects/${project.id}`))}
                                        className="flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-white transition-colors gap-3 group"
                                    >
                                        <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground group-aria-selected:bg-white/20 group-aria-selected:text-white">
                                            <FolderOpen size={14} />
                                        </div>
                                        <span className="truncate text-sm font-medium flex-1">{project.name}</span>
                                        <ArrowRight size={14} className="opacity-0 group-aria-selected:opacity-100 transition-all" />
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {guides.length > 0 && (
                            <Command.Group heading="Wiki" className="px-1 pb-1 text-xs font-medium text-muted-foreground mt-3 mb-1">
                                {guides.map((guide) => (
                                    <Command.Item
                                        key={guide.id}
                                        value={`guide ${guide.title} ${guide.description || ''}`}
                                        onSelect={() => runCommand(() => router.push(`/wiki/${guide.id}`))}
                                        className="flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-white transition-colors gap-3 group"
                                    >
                                        <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground group-aria-selected:bg-white/20 group-aria-selected:text-white">
                                            <BookOpen size={14} />
                                        </div>
                                        <span className="truncate text-sm font-medium flex-1">{guide.title}</span>
                                        <ArrowRight size={14} className="opacity-0 group-aria-selected:opacity-100 transition-all" />
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {tasks.length > 0 && (
                            <Command.Group heading="Tasks" className="px-1 pb-1 text-xs font-medium text-muted-foreground mt-3 mb-1">
                                {tasks.slice(0, 8).map((task) => {
                                    const priorityColor = task.priority === 'urgent' ? 'text-danger' : task.priority === 'high' ? 'text-warning' : task.priority === 'medium' ? 'text-accent' : 'text-muted-foreground';
                                    const projectName = projectNameById.get(task.projectId) || 'Project';
                                    return (
                                        <Command.Item
                                            key={task.id}
                                            value={`task ${task.title} ${projectName} ${task.priority || ''} ${(task.tags || []).join(' ')} ${(task.dependencies || []).join(' ')}`}
                                            onSelect={() => runCommand(() => router.push(`/projects/${task.projectId}`))}
                                            className="flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-white transition-colors gap-3 group"
                                        >
                                            <div className={`w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center group-aria-selected:bg-white/20 group-aria-selected:text-white ${priorityColor}`}>
                                                <CheckCircle2 size={14} />
                                            </div>
                                            <div className="flex flex-col flex-1 truncate">
                                                <span className="truncate text-sm font-medium">{task.title}</span>
												<span className={`text-xs group-aria-selected:text-white/70 ${priorityColor}`}>
													{task.priority ? `${task.priority} · ${projectName}` : projectName}
												</span>
                                            </div>
                                            <ArrowRight size={14} className="opacity-0 group-aria-selected:opacity-100 transition-all" />
                                        </Command.Item>
                                    );
                                })}
                            </Command.Group>
                        )}

                        {savedViews.length > 0 && (
                            <Command.Group heading="Saved Views" className="px-1 pb-1 text-xs font-medium text-muted-foreground mt-3 mb-1">
                                {savedViews.map((view) => (
                                    <Command.Item
                                        key={view.id}
                                        value={`view ${view.name} ${view.viewMode} ${view.searchQuery} ${view.selectedTags.join(' ')} ${projectNameById.get(view.projectId) || ''}`}
                                        onSelect={() => runCommand(() => router.push(buildProjectViewHref(view)))}
                                        className="flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-white transition-colors gap-3 group"
                                    >
                                        <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground group-aria-selected:bg-white/20 group-aria-selected:text-white">
                                            <ListTodo size={14} />
                                        </div>
                                        <div className="flex flex-col flex-1 truncate">
                                            <span className="truncate text-sm font-medium">{view.name}</span>
                                            <span className="text-xs text-muted-foreground group-aria-selected:text-white/70">
                                                {projectNameById.get(view.projectId) || 'Project'} · {view.viewMode}
                                            </span>
                                        </div>
                                        <ArrowRight size={14} className="opacity-0 group-aria-selected:opacity-100 transition-all" />
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {snippets.length > 0 && (
                            <Command.Group heading="Snippets" className="px-1 pb-1 text-xs font-medium text-muted-foreground mt-3 mb-1">
                                {snippets.map((snippet) => (
                                    <Command.Item
                                        key={snippet.id}
                                        value={`snippet ${snippet.title} ${snippet.description || ''} ${snippet.language} ${(snippet.tags || []).join(' ')}`}
                                        onSelect={() => runCommand(() => router.push('/snippets'))}
                                        className="flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-white transition-colors gap-3 group"
                                    >
                                        <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground group-aria-selected:bg-white/20 group-aria-selected:text-white">
                                            <Code2 size={14} />
                                        </div>
                                        <div className="flex flex-col flex-1 truncate">
                                            <span className="truncate text-sm font-medium">{snippet.title}</span>
                                            <span className="text-xs text-muted-foreground group-aria-selected:text-white/70">{snippet.language}</span>
                                        </div>
                                        <ArrowRight size={14} className="opacity-0 group-aria-selected:opacity-100 transition-all" />
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}
                    </Command.List>

                    {/* Keyboard hints */}
                    <div className="border-t border-border px-4 py-2.5 flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <kbd className="h-5 rounded border border-border bg-surface-secondary px-1.5 font-mono text-[10px]">↑↓</kbd>
                            <span className="text-xs text-muted-foreground">Navigate</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <kbd className="h-5 rounded border border-border bg-surface-secondary px-1.5 font-mono text-[10px]">↵</kbd>
                            <span className="text-xs text-muted-foreground">Select</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <kbd className="h-5 rounded border border-border bg-surface-secondary px-1.5 font-mono text-[10px]">ESC</kbd>
                            <span className="text-xs text-muted-foreground">Close</span>
                        </div>
                    </div>
                </Command>
            </div>
        </>
    );
}
