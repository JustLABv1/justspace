'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { Project, Snippet, WikiGuide } from '@/types';
import { Modal, Spinner } from '@heroui/react';
import {
    AltArrowRight as ArrowRight,
    Book,
    CodeCircle as Code2,
    Folder2 as Folder,
    Checklist as ListTodo,
    Magnifer as Search
} from '@solar-icons/react';
import { Command } from 'cmdk';
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
                className="bg-black/40 backdrop-blur-xl"
                variant="blur"
            >
                <Modal.Container>
                    <Modal.Dialog className="max-w-2xl w-full p-0 overflow-hidden bg-surface border border-border/50 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] rounded-[3rem]">
                        <Command className="flex flex-col overflow-hidden bg-surface min-h-[520px]">
                            <div className="flex items-center border-b border-border/40 px-8 py-7" cmdk-input-wrapper="">
                                <Search size={26} weight="Linear" className="mr-5 text-muted-foreground/60" />
                                <Command.Input
                                    autoFocus
                                    placeholder="Search snippets, projects & documents..."
                                    className="flex h-12 w-full rounded-md bg-transparent text-2xl outline-none placeholder:text-muted-foreground/30 disabled:cursor-not-allowed disabled:opacity-50 font-black tracking-tighter"
                                />
                            </div>
                            <Command.List className="max-h-[600px] overflow-y-auto overflow-x-hidden p-6 space-y-3 no-scrollbar content-visibility-auto">
                                {loading && (
                                    <div className="flex flex-col items-center justify-center py-20 text-sm text-muted-foreground gap-4">
                                        <Spinner size="lg" color="accent" />
                                        <p className="font-bold uppercase tracking-[0.3em] text-[10px] opacity-40">Searching...</p>
                                    </div>
                                )}
                                <Command.Empty className="py-24 text-center flex flex-col items-center gap-6">
                                    <div className="w-20 h-20 rounded-[2rem] bg-surface-secondary flex items-center justify-center text-muted-foreground/20 border border-border/40 scale-110">
                                        <Search size={40} weight="Linear" />
                                    </div>
                                    <p className="text-muted-foreground font-black tracking-tight text-lg">No results found.</p>
                                </Command.Empty>

                                <Command.Group heading="QUICK NAV" className="px-3 pb-3 text-[10px] font-black tracking-[0.4em] text-muted-foreground/20 mb-2 uppercase">
                                    <Command.Item
                                        onSelect={() => runCommand(() => router.push('/projects'))}
                                        className="flex cursor-pointer select-none items-center rounded-3xl px-6 py-5 text-base font-bold tracking-tight text-foreground outline-none aria-selected:bg-accent aria-selected:text-white transition-all gap-5 group"
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-accent/5 text-accent flex items-center justify-center group-aria-selected:bg-white/20 group-aria-selected:text-white transition-all scale-100 group-hover:scale-105">
                                            <ListTodo size={24} weight="Linear" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="flex-1 font-black">Consultant Kanban</span>
                                            <span className="text-[10px] opacity-40 font-bold tracking-widest text-white group-aria-selected:opacity-60 group-aria-selected:text-white uppercase">Management HUB</span>
                                        </div>
                                        <kbd className="ml-auto flex h-7 select-none items-center gap-1 rounded-xl border border-border/40 bg-surface-secondary px-3 font-mono text-[10px] font-black tracking-widest opacity-100 group-aria-selected:border-white/20 group-aria-selected:bg-white/10">
                                            ⌘P
                                        </kbd>
                                    </Command.Item>
                                    <Command.Item
                                        onSelect={() => runCommand(() => router.push('/wiki'))}
                                        className="flex cursor-pointer select-none items-center rounded-3xl px-6 py-5 text-base font-bold tracking-tight text-foreground outline-none aria-selected:bg-accent aria-selected:text-white transition-all gap-5 group"
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-accent/5 text-accent flex items-center justify-center group-aria-selected:bg-white/20 group-aria-selected:text-white transition-all scale-100 group-hover:scale-105">
                                            <Book size={24} weight="Linear" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="flex-1 font-black">Wiki Engine</span>
                                            <span className="text-[10px] opacity-40 font-bold tracking-widest text-white group-aria-selected:opacity-60 group-aria-selected:text-white uppercase">Knowledge Base</span>
                                        </div>
                                        <kbd className="ml-auto flex h-7 select-none items-center gap-1 rounded-xl border border-border/40 bg-surface-secondary px-3 font-mono text-[10px] font-black tracking-widest opacity-100 group-aria-selected:border-white/20 group-aria-selected:bg-white/10">
                                            ⌘W
                                        </kbd>
                                    </Command.Item>
                                    <Command.Item
                                        onSelect={() => runCommand(() => router.push('/snippets'))}
                                        className="flex cursor-pointer select-none items-center rounded-3xl px-6 py-5 text-base font-black tracking-tight text-foreground outline-none aria-selected:bg-success aria-selected:text-white transition-all gap-5 group"
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-success/5 text-success flex items-center justify-center group-aria-selected:bg-white/20 group-aria-selected:text-white transition-all scale-100 group-hover:scale-105">
                                            <Code2 size={24} weight="Linear" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="flex-1">Snippet Library</span>
                                            <span className="text-[10px] opacity-40 font-bold tracking-widest uppercase group-aria-selected:opacity-60 group-aria-selected:text-white">Code Snippets</span>
                                        </div>
                                        <kbd className="ml-auto flex h-7 select-none items-center gap-1 rounded-xl border border-border/40 bg-surface-secondary px-3 font-mono text-[10px] font-black tracking-widest opacity-100 group-aria-selected:border-white/20 group-aria-selected:bg-white/10">
                                            ⌘S
                                        </kbd>
                                    </Command.Item>
                                </Command.Group>
                                
                                {projects.length > 0 && (
                                    <Command.Group heading="Workspace Projects" className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.4em] text-muted-foreground/20 mt-8 mb-2">
                                        {projects.map((project) => (
                                            <Command.Item
                                                key={project.id}
                                                onSelect={() => runCommand(() => router.push(`/projects/${project.id}`))}
                                                className="flex cursor-pointer select-none items-center rounded-3xl px-6 py-5 text-base font-bold tracking-tight text-foreground outline-none aria-selected:bg-accent aria-selected:text-white transition-all gap-5 group"
                                            >
                                                <div className="w-12 h-12 rounded-2xl bg-accent/5 text-accent flex items-center justify-center group-aria-selected:bg-white/20 group-aria-selected:text-white transition-all">
                                                    <Folder size={24} weight="Linear" />
                                                </div>
                                                <div className="flex flex-col flex-1 truncate">
                                                    <span className="truncate font-bold">{project.name}</span>
                                                    <span className="text-[10px] opacity-40 font-bold tracking-widest uppercase group-aria-selected:opacity-60 group-aria-selected:text-white">Project Instance</span>
                                                </div>
                                                <ArrowRight size={20} weight="Bold" className="opacity-0 group-aria-selected:opacity-100 transition-all translate-x-[-10px] group-aria-selected:translate-x-0" />
                                            </Command.Item>
                                        ))}
                                    </Command.Group>
                                )}

                                {guides.length > 0 && (
                                    <Command.Group heading="Knowledge Base" className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.4em] text-muted-foreground/20 mt-8 mb-2">
                                        {guides.map((guide) => (
                                            <Command.Item
                                                key={guide.id}
                                                onSelect={() => runCommand(() => router.push(`/wiki/${guide.id}`))}
                                                className="flex cursor-pointer select-none items-center rounded-3xl px-6 py-5 text-base font-bold tracking-tight text-foreground outline-none aria-selected:bg-accent aria-selected:text-white transition-all gap-5 group"
                                            >
                                                <div className="w-12 h-12 rounded-2xl bg-accent/5 text-accent flex items-center justify-center group-aria-selected:bg-white/20 group-aria-selected:text-white transition-all">
                                                    <Book size={24} weight="Linear" />
                                                </div>
                                                <div className="flex flex-col flex-1 truncate">
                                                    <span className="truncate font-bold">{guide.title}</span>
                                                    <span className="text-[10px] opacity-40 font-bold tracking-widest uppercase group-aria-selected:opacity-60 group-aria-selected:text-white">Wiki Guide</span>
                                                </div>
                                                <ArrowRight size={20} weight="Bold" className="opacity-0 group-aria-selected:opacity-100 transition-all translate-x-[-10px] group-aria-selected:translate-x-0" />
                                            </Command.Item>
                                        ))}
                                    </Command.Group>
                                )}

                                {snippets.length > 0 && (
                                    <Command.Group heading="Code Snippets" className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.4em] text-muted-foreground/20 mt-8 mb-2">
                                        {snippets.map((snippet) => (
                                            <Command.Item
                                                key={snippet.id}
                                                onSelect={() => runCommand(() => router.push(`/snippets`))}
                                                className="flex cursor-pointer select-none items-center rounded-3xl px-6 py-5 text-base font-bold tracking-tight text-foreground outline-none aria-selected:bg-success aria-selected:text-white transition-all gap-5 group"
                                            >
                                                <div className="w-12 h-12 rounded-2xl bg-success/5 text-success flex items-center justify-center group-aria-selected:bg-white/20 group-aria-selected:text-white transition-all">
                                                    <Code2 size={24} weight="Linear" />
                                                </div>
                                                <div className="flex flex-col flex-1 truncate">
                                                    <span className="truncate font-bold">{snippet.title}</span>
                                                    <span className="text-[10px] opacity-40 font-bold tracking-widest uppercase group-aria-selected:opacity-60 group-aria-selected:text-white">{snippet.language} Snippet</span>
                                                </div>
                                                <ArrowRight size={20} weight="Bold" className="opacity-0 group-aria-selected:opacity-100 transition-all translate-x-[-10px] group-aria-selected:translate-x-0" />
                                            </Command.Item>
                                        ))}
                                    </Command.Group>
                                )}
                            </Command.List>
                            <div className="border-t border-border/40 p-5 flex items-center justify-center gap-6">
                                <div className="flex items-center gap-2">
                                    <kbd className="h-5 rounded border border-border/40 bg-surface-secondary px-1.5 font-mono text-[9px] font-bold">ESC</kbd>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Close Palette</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="h-5 rounded border border-border/40 bg-surface-secondary px-1.5 font-mono text-[9px] font-bold">↑↓</kbd>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Navigate</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <kbd className="h-5 rounded border border-border/40 bg-surface-secondary px-1.5 font-mono text-[9px] font-bold">ENTER</kbd>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Execute</span>
                                </div>
                            </div>
                        </Command>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
