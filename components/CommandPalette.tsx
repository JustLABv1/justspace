'use client';

import { db } from '@/lib/db';
import { Project, WikiGuide } from '@/types';
import { Modal, Spinner } from '@heroui/react';
import { Command } from 'cmdk';
import { Book, Folder, ListTodo, Search, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [guides, setGuides] = useState<WikiGuide[]>([]);
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
            const [projectsRes, guidesRes] = await Promise.all([
                db.listProjects(),
                db.listGuides()
            ]);
            setProjects(projectsRes.documents);
            setGuides(guidesRes.documents);
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
            <Modal.Backdrop className="bg-black/20 backdrop-blur-sm" />
            <Modal.Container className="max-w-2xl top-[10%]">
                <Modal.Dialog className="overflow-hidden p-0 shadow-2xl border border-border">
                    <Command className="flex h-full w-full flex-col overflow-hidden bg-surface">
                        <div className="flex items-center border-b border-border px-4 py-3" cmdk-input-wrapper="">
                            <Search className="mr-3 h-5 w-5 shrink-0 text-muted-foreground" />
                            <Command.Input
                                placeholder="Search projects, guides, or commands..."
                                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                        <Command.List className="max-h-[400px] overflow-y-auto overflow-x-hidden p-2">
                            {loading && (
                                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                                    <Spinner size="sm" className="mr-2" />
                                    Indexing workspace...
                                </div>
                            )}
                            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                                No results found.
                            </Command.Empty>

                            <Command.Group heading="Common Actions" className="px-2 pb-2 text-xs font-medium text-muted-foreground">
                                <Command.Item
                                    onSelect={() => runCommand(() => router.push('/projects'))}
                                    className="flex cursor-pointer select-none items-center rounded-lg px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-accent-foreground"
                                >
                                    <ListTodo className="mr-3 h-4 w-4" />
                                    <span>Go to Kanban Board</span>
                                    <kbd className="ml-auto text-[10px] font-mono opacity-60">⌘P</kbd>
                                </Command.Item>
                                <Command.Item
                                    onSelect={() => runCommand(() => router.push('/wiki'))}
                                    className="flex cursor-pointer select-none items-center rounded-lg px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-accent-foreground"
                                >
                                    <Book className="mr-3 h-4 w-4" />
                                    <span>Browse Wiki Guides</span>
                                    <kbd className="ml-auto text-[10px] font-mono opacity-60">⌘W</kbd>
                                </Command.Item>
                                <Command.Item
                                    onSelect={() => runCommand(() => {})}
                                    className="flex cursor-pointer select-none items-center rounded-lg px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-accent-foreground"
                                >
                                    <Settings className="mr-3 h-4 w-4" />
                                    <span>Settings</span>
                                </Command.Item>
                            </Command.Group>
                            
                            {projects.length > 0 && (
                                <Command.Group heading="Projects" className="px-2 pb-2 text-xs font-medium text-muted-foreground">
                                    {projects.map((project) => (
                                        <Command.Item
                                            key={project.$id}
                                            onSelect={() => runCommand(() => router.push(`/projects`))}
                                            className="flex cursor-pointer select-none items-center rounded-lg px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                                        >
                                            <Folder className="mr-3 h-4 w-4" />
                                            <span>{project.name}</span>
                                        </Command.Item>
                                    ))}
                                </Command.Group>
                            )}

                            {guides.length > 0 && (
                                <Command.Group heading="Wiki Guides" className="px-2 pb-2 text-xs font-medium text-muted-foreground mt-2">
                                    {guides.map((guide) => (
                                        <Command.Item
                                            key={guide.$id}
                                            onSelect={() => runCommand(() => router.push(`/wiki/${guide.$id}`))}
                                            className="flex cursor-pointer select-none items-center rounded-lg px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                                        >
                                            <Book className="mr-3 h-4 w-4" />
                                            <span>{guide.title}</span>
                                        </Command.Item>
                                    ))}
                                </Command.Group>
                            )}

                            <Command.Group heading="Navigation" className="px-2 pb-2 text-xs font-medium text-muted-foreground mt-2">
                                <Command.Item
                                    onSelect={() => runCommand(() => router.push('/'))}
                                    className="flex cursor-pointer select-none items-center rounded-lg px-3 py-2 text-sm text-foreground outline-none aria-selected:bg-accent aria-selected:text-accent-foreground"
                                >
                                    <Search className="mr-3 h-4 w-4" />
                                    <span>Go to Dashboard</span>
                                </Command.Item>
                            </Command.Group>
                        </Command.List>
                    </Command>
                </Modal.Dialog>
            </Modal.Container>
        </Modal>
    );
}
