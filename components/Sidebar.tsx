'use client';

import { useAuth } from '@/context/AuthContext';
import { Avatar, Button, Dropdown, Label, Tooltip } from '@heroui/react';
import {
    BookOpen,
    ChevronLeft,
    ChevronRight,
    Code,
    FolderKanban,
    Home,
    LogOut,
    MoreHorizontal,
    Search,
    Settings,
    User
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import pkg from '../package.json';
import { ThemeSwitcher } from './ThemeSwitcher';

interface SidebarProps {
    isCollapsed: boolean;
    setIsCollapsed: (value: boolean) => void;
    isMobileOpen?: boolean;
    setIsMobileOpen?: (value: boolean) => void;
}

const Sidebar = ({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }: SidebarProps) => {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const prefs = (user?.preferences || {}) as Record<string, string | undefined>;
    const workspaceName = prefs?.workspaceName || 'justspace';
    const firstLetter = workspaceName.charAt(0).toUpperCase();

    const navItems = [
        { name: 'Home', href: '/', icon: Home },
        { name: 'Projects', href: '/projects', icon: FolderKanban },
        { name: 'Wiki', href: '/wiki', icon: BookOpen },
        { name: 'Snippets', href: '/snippets', icon: Code },
    ];

    return (
        <aside
            className={`fixed md:relative z-50 md:z-auto h-full flex flex-col bg-surface border-r border-border transition-all duration-300 ease-in-out overflow-x-hidden overflow-y-auto no-scrollbar ${
                isCollapsed ? 'w-[52px]' : 'w-56'
            } ${
                isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
            }`}
        >
            {/* Workspace header */}
            <div className={`flex items-center h-12 shrink-0 ${
                isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
            }`}>
                {!isCollapsed ? (
                    <Dropdown>
                        <Dropdown.Trigger>
                            <button className="flex items-center gap-2 min-w-0 hover:bg-surface-secondary rounded-xl px-1.5 py-1 -ml-1.5 transition-colors">
                                <div className="w-5 h-5 rounded bg-accent/90 flex items-center justify-center text-accent-foreground shrink-0">
                                    <span className="font-semibold text-[10px] leading-none">{firstLetter}</span>
                                </div>
                                <span className="text-[13px] font-semibold text-foreground truncate">{workspaceName}</span>
                            </button>
                        </Dropdown.Trigger>
                        <Dropdown.Popover placement="bottom start" className="min-w-[180px]">
                            <Dropdown.Menu>
                                <Dropdown.Item id="settings" textValue="Settings">
                                    <Link href="/settings" className="flex items-center gap-2 w-full">
                                        <Settings size={14} />
                                        <Label className="cursor-pointer text-[13px]">Settings</Label>
                                    </Link>
                                </Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                ) : (
                    <div className="w-5 h-5 rounded bg-accent/90 flex items-center justify-center text-accent-foreground">
                        <span className="font-semibold text-[10px] leading-none">{firstLetter}</span>
                    </div>
                )}
                {!isCollapsed && (
                    <button
                        onClick={() => setIsCollapsed(true)}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-secondary transition-colors"
                        aria-label="Collapse sidebar"
                    >
                        <ChevronLeft size={14} />
                    </button>
                )}
            </div>

            {/* Expand button when collapsed */}
            {isCollapsed && (
                <div className="flex justify-center py-1 shrink-0">
                    <button
                        onClick={() => setIsCollapsed(false)}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-secondary transition-colors"
                        aria-label="Expand sidebar"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            )}

            {/* Search trigger */}
            {!isCollapsed && (
                <div className="px-2 pb-1">
                    <button
                        onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-muted-foreground hover:bg-surface-secondary transition-colors text-[13px]"
                    >
                        <Search size={14} />
                        <span>Search</span>
                        <kbd className="ml-auto text-[10px] font-medium bg-surface-secondary rounded px-1 py-0.5 text-muted-foreground border border-border">⌘K</kbd>
                    </button>
                </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto no-scrollbar">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                    const Icon = item.icon;

                    const navLink = (
                        <Link
                            key={item.name}
                            href={item.href}
                            onClick={() => setIsMobileOpen?.(false)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-xl text-[13px] transition-colors ${
                                isCollapsed ? 'justify-center' : ''
                            } ${
                                isActive
                                    ? 'bg-surface-secondary text-foreground font-medium'
                                    : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                            }`}
                        >
                            <Icon size={15} strokeWidth={isActive ? 2 : 1.75} className="shrink-0" />
                            {!isCollapsed && <span>{item.name}</span>}
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
                })}
            </nav>

            {/* Footer */}
            <div className="p-2 space-y-0.5 shrink-0">
                <div className={`flex items-center gap-1 ${isCollapsed ? 'flex-col' : ''}`}>
                    <Dropdown>
                        <Dropdown.Trigger>
                            <Button
                                variant="ghost"
                                className={`border-0 transition-colors hover:bg-surface-secondary text-left ${
                                    isCollapsed ? 'justify-center px-0 h-9 w-9' : 'flex-1 px-2 py-1.5 h-auto justify-start'
                                }`}
                                aria-label="User menu"
                            >
                                <div className={`flex items-center gap-2 w-full ${
                                    isCollapsed ? 'justify-center' : ''
                                }`}>
                                    <Avatar size="sm" className="w-6 h-6 shrink-0">
                                        <Avatar.Fallback className="bg-surface-tertiary text-foreground text-[10px] font-medium">
                                            {user?.name?.charAt(0).toUpperCase() || <User size={11} />}
                                        </Avatar.Fallback>
                                    </Avatar>
                                    {!isCollapsed && (
                                        <>
                                            <span className="text-[13px] text-foreground truncate flex-1 min-w-0">
                                                {user?.name || 'Guest'}
                                            </span>
                                            <MoreHorizontal size={14} className="text-muted-foreground shrink-0" />
                                        </>
                                    )}
                                </div>
                            </Button>
                        </Dropdown.Trigger>
                        <Dropdown.Popover placement={isCollapsed ? 'right' : 'top'} className="min-w-[180px]">
                            <Dropdown.Menu>
                                <Dropdown.Section>
                                    <Dropdown.Item id="settings" textValue="Settings">
                                        <Link href="/settings" className="flex items-center gap-2 w-full">
                                            <Settings size={14} />
                                            <Label className="cursor-pointer text-[13px]">Settings</Label>
                                        </Link>
                                    </Dropdown.Item>
                                </Dropdown.Section>
                                <Dropdown.Item
                                    id="logout"
                                    variant="danger"
                                    textValue="Logout"
                                    onAction={logout}
                                >
                                    <div className="flex items-center gap-2">
                                        <LogOut size={14} />
                                        <Label className="cursor-pointer text-[13px]">Sign Out</Label>
                                    </div>
                                </Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                    <ThemeSwitcher />
                </div>
                {!isCollapsed && (
                    <div className="px-2 pt-1.5 pb-1">
                        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                            v{pkg.version} &nbsp;·&nbsp; © {new Date().getFullYear()} JustLAB
                        </p>
                        <p className="text-[10px] text-muted-foreground/45">
                            All rights reserved
                        </p>
                    </div>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
