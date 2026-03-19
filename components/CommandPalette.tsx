'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { Project, Snippet, WikiGuide } from '@/types';
import { Modal, Spinner } from '@heroui/react';
import { Command } from 'cmdk';
import { ArrowRight, BookOpen, Code2, FolderOpen, ListTodo, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [guides, setGuides] = useState<WikiGuide[]>([]);
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const router = useRouter();
    const { user, privateKey } = useAuth();

    useEffect(() => {
        const handleOpen = () => setOpen(true);
        window.addEventListener('open-command-palette', handleOpen);
        return () => window.removeEventListener('open-command-palette', handleOpen);
    }, []);

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

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [projectsRes, guidesRes, snippetsRes] = await Promise.all([
                db.listProjects(),
                db.listGuides(),
                db.listSnippets()
            ]);

            const processedProjects = await Promise.all(projectsRes.documents.map(async (p) => {
                if (p.isEncrypted) {
                    if (privateKey && user) {
                        try {
                            const access = await db.getAccessKey(p.id, user.id);
                            if (access) {
                                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                const nameData = JSON.parse(p.name);
                                return { ...p, name: await decryptData(nameData, docKey) };
                            }
                        } catch (e) { console.error('CP Decrypt Project error:', e); }
                    }
                    return { ...p, name: 'Encrypted Project' };
                }
                return p;
            }));

            const processedGuides = await Promise.all(guidesRes.documents.map(async (g) => {
                if (g.isEncrypted) {
                    if (privateKey && user) {
                        try {
                            const access = await db.getAccessKey(g.id, user.id);
                            if (access) {
                                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                const titleData = JSON.parse(g.title);
                                return { ...g, title: await decryptData(titleData, docKey) };
                            }
                        } catch (e) { console.error('CP Decrypt Guide error:', e); }
                    }
                    return { ...g, title: 'Encrypted Guide' };
                }
                return g;
            }));

            const processedSnippets = await Promise.all(snippetsRes.documents.map(async (s) => {
                if (s.isEncrypted) {
                    if (privateKey && user) {
                        try {
                            const access = await db.getAccessKey(s.id, user.id);
                            if (access) {
                                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                const titleData = JSON.parse(s.title);
                                return { ...s, title: await decryptData(titleData, docKey) };
                            }
                        } catch (e) { console.error('CP Decrypt Snippet error:', e); }
                    }
                    return { ...s, title: 'Encrypted Snippet' };
                }
                return s;
            }));

            setProjects(processedProjects);
            setGuides(processedGuides);
            setSnippets(processedSnippets);
        } catch (error) {
            console.error('Failed to fetch command palette data:', error);
        } finally {
            setLoading(false);
        }
    }, [privateKey, user]);

    useEffect(() => {
        if (open) {
            fetchData();
        }
    }, [open, fetchData]);

    const runCommand = (command: () => void) => {
        setOpen(false);
        command();
    };

    return (
        <Modal>
            <Modal.Backdrop 
                isOpen={open} 
                onOpenChange={setOpen}
                className="bg-black/50"
                variant="blur"
            >
                <Modal.Container>
                    <Modal.Dialog className="max-w-xl w-full p-0 overflow-hidden bg-surface border border-border shadow-lg rounded-xl">
                        <Command className="flex flex-col overflow-hidden bg-surface min-h-[420px]">
                            <div className="flex items-center border-b border-border px-4 py-3" cmdk-input-wrapper="">
                                <Search size={15} className="mr-3 text-muted-foreground/60 shrink-0" />
                                <Command.Input
                                    autoFocus
                                    placeholder="Search snippets, projects & documents..."
                                    className="flex h-8 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground/40 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>
                            <Command.List className="max-h-[420px] overflow-y-auto overflow-x-hidden p-2 no-scrollbar content-visibility-auto">
                                {loading && (
                                    <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-3">
                                        <Spinner size="sm" color="accent" />
                                        <p className="text-xs text-muted-foreground">Searching...</p>
                                    </div>
                                )}
                                <Command.Empty className="py-16 text-center flex flex-col items-center gap-3">
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
                                        <kbd className="ml-auto flex h-5 select-none items-center gap-1 rounded border border-border bg-surface-secondary px-1.5 font-mono text-xs group-aria-selected:border-white/20 group-aria-selected:bg-white/10">
                                            ⌘P
                                        </kbd>
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
                                        <kbd className="ml-auto flex h-5 select-none items-center gap-1 rounded border border-border bg-surface-secondary px-1.5 font-mono text-xs group-aria-selected:border-white/20 group-aria-selected:bg-white/10">
                                            ⌘W
                                        </kbd>
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
                                        <kbd className="ml-auto flex h-5 select-none items-center gap-1 rounded border border-border bg-surface-secondary px-1.5 font-mono text-xs group-aria-selected:border-white/20 group-aria-selected:bg-white/10">
                                            ⌘S
                                        </kbd>
                                    </Command.Item>
                                </Command.Group>
                                
                                {projects.length > 0 && (
                                    <Command.Group heading="Projects" className="px-1 pb-1 text-xs font-medium text-muted-foreground mt-3 mb-1">
                                        {projects.map((project) => (
                                            <Command.Item
                                                key={project.id}
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

                                {snippets.length > 0 && (
                                    <Command.Group heading="Snippets" className="px-1 pb-1 text-xs font-medium text-muted-foreground mt-3 mb-1">
                                        {snippets.map((snippet) => (
                                            <Command.Item
                                                key={snippet.id}
                                                onSelect={() => runCommand(() => router.push(`/snippets`))}
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
                            <div className="border-t border-border px-4 py-2.5 flex items-center gap-4">
                                <div className="flex items-center gap-1.5">
                                    <kbd className="h-5 rounded border border-border bg-surface-secondary px-1.5 font-mono text-[10px]">ESC</kbd>
                                    <span className="text-xs text-muted-foreground">Close</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <kbd className="h-5 rounded border border-border bg-surface-secondary px-1.5 font-mono text-[10px]">↑↓</kbd>
                                    <span className="text-xs text-muted-foreground">Navigate</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <kbd className="h-5 rounded border border-border bg-surface-secondary px-1.5 font-mono text-[10px]">↵</kbd>
                                    <span className="text-xs text-muted-foreground">Select</span>
                                </div>
                            </div>
                        </Command>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
