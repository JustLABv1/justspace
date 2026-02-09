'use client';

import { db } from '@/lib/db';
import { Project, Snippet, WikiGuide } from '@/types';
import { Modal, Spinner } from '@heroui/react';
import { Command } from 'cmdk';
import { Book, Code2, Folder, ListTodo, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [guides, setGuides] = useState<WikiGuide[]>([]);
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const router = useRouter();

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
            if (e.key === 'p' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                router.push('/projects');
            }
            if (e.key === 'w' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                router.push('/wiki');
            }
            if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                router.push('/snippets');
            }
        };

        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, [router]);

    useEffect(() => {
        if (open) {
            fetchData();
        }
    }, [open]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [projectsRes, guidesRes, snippetsRes] = await Promise.all([
                db.listProjects(),
                db.listGuides(),
                db.listSnippets()
            ]);
            setProjects(projectsRes.documents);
            setGuides(guidesRes.documents);
            setSnippets(snippetsRes.documents);
        } catch (error) {
            console.error('Failed to fetch command palette data:', error);
        } finally {
            setLoading(false);
        }
    };

    const runCommand = (command: () => void) => {
        setOpen(false);
        command();
    };

    return (
        <Modal isOpen={open} onOpenChange={setOpen}>
            <Modal.Backdrop className="bg-black/60 backdrop-blur-md" />
            <Modal.Container className="max-w-2xl top-[15%]">
                <Modal.Dialog className="overflow-hidden p-0 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] border border-border/50 bg-surface rounded-[2rem] w-full">
                    <Command className="flex flex-col overflow-hidden bg-surface min-h-[450px]">
                        <div className="flex items-center border-b border-border/40 px-6 py-4" cmdk-input-wrapper="">
                            <Search className="mr-3 h-5 w-5 shrink-0 text-muted-foreground" />
                            <Command.Input
                                autoFocus
                                placeholder="Search projects, guides, snippets, or commands..."
                                className="flex h-11 w-full rounded-md bg-transparent py-3 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 font-medium"
                            />
                        </div>
                        <Command.List className="max-h-[500px] overflow-y-auto overflow-x-hidden p-4 space-y-2 no-scrollbar">
                            {loading && (
                                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                                    <Spinner size="sm" className="mr-3" />
                                    Indexing your workspace...
                                </div>
                            )}
                            <Command.Empty className="py-12 text-center text-sm text-muted-foreground italic">
                                No results found for this query.
                            </Command.Empty>

                            <Command.Group heading="Common Actions" className="px-2 pb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                                <Command.Item
                                    onSelect={() => runCommand(() => router.push('/projects'))}
                                    className="flex cursor-pointer select-none items-center rounded-xl px-4 py-3 text-sm font-bold text-foreground outline-none aria-selected:bg-surface-secondary aria-selected:text-primary transition-all gap-3"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-surface-tertiary flex items-center justify-center">
                                        <ListTodo className="h-4 w-4" />
                                    </div>
                                    <span>Go to Kanban Board</span>
                                    <kbd className="ml-auto text-[10px] font-mono opacity-40 bg-surface-tertiary px-1.5 py-0.5 rounded">⌘P</kbd>
                                </Command.Item>
                                <Command.Item
                                    onSelect={() => runCommand(() => router.push('/wiki'))}
                                    className="flex cursor-pointer select-none items-center rounded-xl px-4 py-3 text-sm font-bold text-foreground outline-none aria-selected:bg-surface-secondary aria-selected:text-primary transition-all gap-3"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-surface-tertiary flex items-center justify-center">
                                        <Book className="h-4 w-4" />
                                    </div>
                                    <span>Browse Wiki Guides</span>
                                    <kbd className="ml-auto text-[10px] font-mono opacity-40 bg-surface-tertiary px-1.5 py-0.5 rounded">⌘W</kbd>
                                </Command.Item>
                                <Command.Item
                                    onSelect={() => runCommand(() => router.push('/snippets'))}
                                    className="flex cursor-pointer select-none items-center rounded-xl px-4 py-3 text-sm font-bold text-foreground outline-none aria-selected:bg-surface-secondary aria-selected:text-primary transition-all gap-3"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-surface-tertiary flex items-center justify-center">
                                        <Code2 className="h-4 w-4" />
                                    </div>
                                    <span>Snippet Library</span>
                                    <kbd className="ml-auto text-[10px] font-mono opacity-40 bg-surface-tertiary px-1.5 py-0.5 rounded">⌘S</kbd>
                                </Command.Item>
                            </Command.Group>
                            
                            {projects.length > 0 && (
                                <Command.Group heading="Projects" className="px-2 pb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mt-4">
                                    {projects.map((project) => (
                                        <Command.Item
                                            key={project.$id}
                                            onSelect={() => runCommand(() => router.push(`/projects/${project.$id}`))}
                                            className="flex cursor-pointer select-none items-center rounded-xl px-4 py-3 text-sm font-bold text-foreground outline-none aria-selected:bg-surface-secondary aria-selected:text-primary transition-all gap-3"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center">
                                                <Folder className="h-4 w-4" />
                                            </div>
                                            <span>{project.name}</span>
                                        </Command.Item>
                                    ))}
                                </Command.Group>
                            )}

                            {guides.length > 0 && (
                                <Command.Group heading="Wiki Guides" className="px-2 pb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mt-4">
                                    {guides.map((guide) => (
                                        <Command.Item
                                            key={guide.$id}
                                            onSelect={() => runCommand(() => router.push(`/wiki/${guide.$id}`))}
                                            className="flex cursor-pointer select-none items-center rounded-xl px-4 py-3 text-sm font-bold text-foreground outline-none aria-selected:bg-surface-secondary aria-selected:text-primary transition-all gap-3"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-accent/5 text-accent flex items-center justify-center">
                                                <Book className="h-4 w-4" />
                                            </div>
                                            <span>{guide.title}</span>
                                        </Command.Item>
                                    ))}
                                </Command.Group>
                            )}

                            {snippets.length > 0 && (
                                <Command.Group heading="Snippets" className="px-2 pb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mt-4">
                                    {snippets.map((snippet) => (
                                        <Command.Item
                                            key={snippet.$id}
                                            onSelect={() => runCommand(() => {
                                                navigator.clipboard.writeText(snippet.content);
                                                router.push('/snippets');
                                            })}
                                            className="flex cursor-pointer select-none items-center rounded-xl px-4 py-3 text-sm font-bold text-foreground outline-none aria-selected:bg-surface-secondary aria-selected:text-primary transition-all gap-3"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-success/5 text-success flex items-center justify-center">
                                                <Code2 className="h-4 w-4" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span>{snippet.title}</span>
                                                <span className="text-[10px] opacity-60 font-medium tracking-normal">{snippet.language} • Copy to clipboard</span>
                                            </div>
                                        </Command.Item>
                                    ))}
                                </Command.Group>
                            )}
                        </Command.List>
                    </Command>
                </Modal.Dialog>
            </Modal.Container>
        </Modal>
    );
}
