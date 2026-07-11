'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { useWorkspace } from '@/services/frontend/context/WorkspaceContext';
import { decryptData, decryptDocumentKey } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { wsClient, WSEvent } from '@/services/frontend/lib/ws';
import { Project } from '@/services/frontend/types';
import { Avatar, Button, Dropdown, Label, Tooltip } from '@heroui/react';
import { useBranding } from '@/services/frontend/context/BrandingContext';
import {
    BookOpen,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Code,
    FolderKanban,
    Home,
    Plus,
    Settings,
    ShieldCheck,
    UsersRound
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import pkg from '../package.json';

interface SidebarProps {
    isCollapsed: boolean;
    setIsCollapsed: (value: boolean) => void;
    isMobileOpen?: boolean;
    setIsMobileOpen?: (value: boolean) => void;
}

const PROJECT_COLORS = [
    'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-pink-500',
];

function getProjectColor(index: number) {
    return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

const Sidebar = ({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }: SidebarProps) => {
    const pathname = usePathname();
    const router = useRouter();
    const { user, privateKey } = useAuth();
    const { workspace, workspaces, workspaceId, setActiveWorkspace } = useWorkspace();
    const { branding, logoUrl } = useBranding();
    const [isProjectsExpanded, setIsProjectsExpanded] = useState(true);
    const [sidebarProjects, setSidebarProjects] = useState<Project[]>([]);

    const fetchProjects = useCallback(async () => {
        if (!user) return;
        try {
            const res = await db.listProjects(workspaceId);
            const projects = res.documents as unknown as Project[];

            const decrypted = await Promise.all(projects.map(async (p) => {
                if (p.isEncrypted && privateKey) {
                    try {
                        const access = await db.getAccessKey(p.id);
                        if (access) {
                            const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                            const nameData = JSON.parse(p.name);
                            return { ...p, name: await decryptData(nameData, docKey) };
                        }
                    } catch { /* keep encrypted name */ }
                }
                return p;
            }));

            // Filter out archived and completed, sort by name
            setSidebarProjects(decrypted.filter(p => p.status !== 'archived' && p.status !== 'completed').sort((a, b) => a.name.localeCompare(b.name)));
        } catch { /* ignore */ }
    }, [user, privateKey, workspaceId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchProjects();
    }, [fetchProjects]);

    useEffect(() => {
        const unsub = wsClient.subscribe((event: WSEvent) => {
            if (event.collection === 'projects') {
                fetchProjects();
            }
        });
        return () => unsub();
    }, [fetchProjects]);

    const topNavItems = [
        { name: 'Home', href: '/', icon: Home },
    ];

    const bottomNavItems = [
        { name: 'Wiki', href: '/wiki', icon: BookOpen },
        { name: 'Snippets', href: '/snippets', icon: Code },
    ];

    const footerNavItems = [
        { name: 'Workspace', href: '/workspace', icon: UsersRound },
        { name: 'Settings', href: '/settings', icon: Settings },
        ...(user?.isPlatformAdmin ? [{ name: 'Admin', href: '/admin', icon: ShieldCheck }] : [])
    ];

    const renderNavLink = (item: { name: string; href: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }) => {
        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        const Icon = item.icon;

        const navLink = (
            <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsMobileOpen?.(false)}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] transition-colors ${
                    isCollapsed ? 'justify-center' : ''
                } ${
                    isActive
                        ? 'bg-surface-secondary text-foreground font-medium'
                        : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                }`}
            >
                <Icon size={16} strokeWidth={isActive ? 2 : 1.75} />
                {!isCollapsed && <span className="flex-1">{item.name}</span>}
            </Link>
        );

        if (isCollapsed) {
            return (
                <Tooltip key={item.name} delay={0}>
                    <Tooltip.Trigger>
                        {navLink}
                    </Tooltip.Trigger>
                    <Tooltip.Content placement="right" showArrow>
                        <Tooltip.Arrow />
                        {item.name}
                    </Tooltip.Content>
                </Tooltip>
            );
        }

        return navLink;
    };

    const isProjectsActive = pathname === '/projects' || pathname.startsWith('/projects/');

    return (
        <aside
            className={`fixed md:relative z-50 md:z-auto h-full flex flex-col bg-surface border-r border-border transition-all duration-300 ease-in-out overflow-x-hidden overflow-y-auto no-scrollbar ${
                isCollapsed ? 'w-[52px]' : 'w-60'
            } ${
                isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
            }`}
        >
            {/* Workspace header */}
            <div className={`flex items-center h-14 shrink-0 border-b border-border ${
                isCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'
            }`}>
                {!isCollapsed ? (
                    <Dropdown>
                        <Dropdown.Trigger className="min-w-0 max-w-[170px] rounded-xl px-1.5 py-1 hover:bg-surface-secondary">
                            <span className="flex min-w-0 items-center gap-2.5">
                                <Avatar size="sm" className="size-7 shrink-0 rounded-lg">
                                    <Avatar.Image src={logoUrl ?? undefined} alt="" />
                                    <Avatar.Fallback className="rounded-lg bg-accent text-accent-foreground text-xs font-bold">{(workspace?.name || branding.name).charAt(0).toUpperCase()}</Avatar.Fallback>
                                </Avatar>
                                <span className="truncate text-[14px] font-bold tracking-tight text-foreground">{workspace?.name || branding.name}</span>
                            </span>
                        </Dropdown.Trigger>
                        <Dropdown.Popover placement="bottom start" className="min-w-[220px]">
                            <Dropdown.Menu aria-label="Workspaces" onAction={(key) => {
                                const action = String(key);
                                if (action === 'create-workspace') {
                                    router.push('/workspace');
                                    return;
                                }
                                if (action === 'manage-workspace') {
                                    router.push('/workspace');
                                    return;
                                }
                                setActiveWorkspace(action);
                            }}>
                                <Dropdown.Section>
                                    <Label className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Workspaces</Label>
                                    {workspaces.map((item) => (
                                        <Dropdown.Item key={item.id} id={item.id} textValue={item.name}>
                                            <div className="flex w-full items-center justify-between gap-3">
                                                <Label className="truncate text-[13px]">{item.name}</Label>
                                                {item.id === workspaceId && <span className="text-[10px] text-accent">Active</span>}
                                            </div>
                                        </Dropdown.Item>
                                    ))}
                                </Dropdown.Section>
                                <Dropdown.Section>
                                    <Dropdown.Item id="create-workspace" textValue="New workspace">
                                        <Plus size={14} />
                                        <Label>New workspace</Label>
                                    </Dropdown.Item>
                                    {workspace && <Dropdown.Item id="manage-workspace" textValue="Manage workspace">
                                        <UsersRound size={14} />
                                        <Label>Manage workspace</Label>
                                    </Dropdown.Item>}
                                </Dropdown.Section>
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                ) : (
                    <Avatar size="sm" className="size-7 rounded-lg">
                        <Avatar.Image src={logoUrl ?? undefined} alt="" />
                        <Avatar.Fallback className="rounded-lg bg-accent text-accent-foreground text-xs font-bold">{branding.name.charAt(0).toUpperCase()}</Avatar.Fallback>
                    </Avatar>
                )}
                {!isCollapsed && (
                    <Button
                        variant="ghost"
                        isIconOnly
                        size="sm"
                        onPress={() => setIsCollapsed(true)}
                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                        aria-label="Collapse sidebar"
                    >
                        <ChevronLeft size={14} />
                    </Button>
                )}
            </div>

            {/* Expand button when collapsed */}
            {isCollapsed && (
                <div className="flex justify-center py-2 shrink-0">
                    <Button
                        variant="ghost"
                        isIconOnly
                        size="sm"
                        onPress={() => setIsCollapsed(false)}
                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                        aria-label="Expand sidebar"
                    >
                        <ChevronRight size={14} />
                    </Button>
                </div>
            )}


            {/* Navigation */}
            <nav className="flex-1 px-2.5 py-1 space-y-0.5 overflow-y-auto no-scrollbar">
                {/* Home */}
                {topNavItems.map(renderNavLink)}

                {/* Projects section */}
                <div className="mt-1">
                    {!isCollapsed ? (
                        <>
                            <Button
                                variant="ghost"
                                onPress={() => setIsProjectsExpanded(!isProjectsExpanded)}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] transition-colors ${
                                    isProjectsActive
                                        ? 'bg-surface-secondary text-foreground font-medium'
                                        : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                                }`}
                            >
                                <FolderKanban size={16} strokeWidth={isProjectsActive ? 2 : 1.75} />
                                <span className="flex-1 text-left">Projects</span>
                                {isProjectsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </Button>

                            {isProjectsExpanded && (
                                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border/60 pl-2.5">
                                    {sidebarProjects.map((project, idx) => {
                                        const isActive = pathname === `/projects/${project.id}`;
                                        return (
                                            <Link
                                                key={project.id}
                                                href={`/projects/${project.id}`}
                                                onClick={() => setIsMobileOpen?.(false)}
                                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] transition-colors ${
                                                    isActive
                                                        ? 'bg-surface-secondary text-foreground font-medium'
                                                        : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                                                }`}
                                            >
                                                <div className={`w-4 h-4 rounded ${getProjectColor(idx)} flex items-center justify-center shrink-0`}>
                                                    <span className="text-white text-[8px] font-bold leading-none">
                                                        {project.name.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                                <span className="truncate">{project.name}</span>
                                            </Link>
                                        );
                                    })}
                                    <Link
                                        href="/projects"
                                        onClick={() => setIsMobileOpen?.(false)}
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] transition-colors ${
                                            pathname === '/projects'
                                                ? 'bg-surface-secondary text-foreground font-medium'
                                                : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                                        }`}
                                    >
                                        <span className="text-muted-foreground/60">All Projects</span>
                                    </Link>
                                </div>
                            )}
                        </>
                    ) : (
                        <Tooltip delay={0}>
                            <Tooltip.Trigger>
                                <Link
                                    href="/projects"
                                    onClick={() => setIsMobileOpen?.(false)}
                                    className={`flex items-center justify-center px-2.5 py-2 rounded-xl text-[13px] transition-colors ${
                                        isProjectsActive
                                            ? 'bg-surface-secondary text-foreground font-medium'
                                            : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                                    }`}
                                >
                                    <FolderKanban size={16} strokeWidth={isProjectsActive ? 2 : 1.75} />
                                </Link>
                            </Tooltip.Trigger>
                            <Tooltip.Content placement="right" showArrow>
                                <Tooltip.Arrow />
                                Projects
                            </Tooltip.Content>
                        </Tooltip>
                    )}
                </div>

                {/* Wiki, Snippets */}
                <div className="mt-1 space-y-0.5">
                    {bottomNavItems.map(renderNavLink)}
                </div>
            </nav>

            {/* Footer */}
            <div className="p-2.5 space-y-0.5 shrink-0 border-t border-border">
                {footerNavItems.map(renderNavLink)}

                {!isCollapsed && (
                    <div className="px-2.5 pt-3 pb-1">
                        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                            v{pkg.version} &nbsp;·&nbsp; © {new Date().getFullYear()} JustLAB
                        </p>
                    </div>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
