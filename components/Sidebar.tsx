'use client';

import { useAuth } from '@/context/AuthContext';
import { Avatar, Button, Dropdown, Label, Tooltip } from '@heroui/react';
import {
    BookOpen,
    CheckSquare,
    ChevronLeft,
    ChevronRight,
    Code,
    LayoutDashboard,
    LogOut,
    MoreVertical,
    Settings,
    User
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Projects', href: '/projects', icon: CheckSquare },
        { name: 'Wiki', href: '/wiki', icon: BookOpen },
        { name: 'Snippets', href: '/snippets', icon: Code },
    ];

    return (
        <aside
            className={`fixed md:relative z-50 md:z-auto h-full flex flex-col bg-surface-secondary border-r border-border transition-all duration-300 ease-in-out overflow-x-hidden overflow-y-auto no-scrollbar ${
                isCollapsed ? 'w-16' : 'w-60'
            } ${
                isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
            }`}
        >
            {/* Brand */}
            <div className={`flex items-center h-16 px-4 border-b border-border shrink-0 ${
                isCollapsed ? 'justify-center' : 'justify-between'
            }`}>
                {!isCollapsed && (
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-accent-foreground shrink-0">
                            <span className="font-bold text-sm leading-none">{firstLetter}</span>
                        </div>
                        <span className="font-semibold text-sm text-foreground truncate">{workspaceName}</span>
                    </div>
                )}
                {isCollapsed && (
                    <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-accent-foreground">
                        <span className="font-bold text-sm leading-none">{firstLetter}</span>
                    </div>
                )}
                {!isCollapsed && (
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-tertiary transition-colors"
                        aria-label="Collapse sidebar"
                    >
                        <ChevronLeft size={15} />
                    </button>
                )}
            </div>

            {/* Expand button when collapsed */}
            {isCollapsed && (
                <div className="flex justify-center py-2 border-b border-border shrink-0">
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-tertiary transition-colors"
                        aria-label="Expand sidebar"
                    >
                        <ChevronRight size={15} />
                    </button>
                </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto no-scrollbar">
                {!isCollapsed && (
                    <p className="px-3 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">Navigation</p>
                )}
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                    const Icon = item.icon;

                    const navLink = (
                        <Link
                            key={item.name}
                            href={item.href}
                            onClick={() => setIsMobileOpen?.(false)}
                            className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                                isCollapsed ? 'justify-center' : ''
                            } ${
                                isActive
                                    ? 'bg-accent-muted text-accent font-semibold'
                                    : 'text-muted-foreground hover:bg-surface-tertiary hover:text-foreground font-medium'
                            }`}
                        >
                            {isActive && !isCollapsed && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent rounded-r-full" />
                            )}
                            <Icon size={17} strokeWidth={isActive ? 2.5 : 2} />
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
            <div className="border-t border-border p-2 space-y-1 shrink-0">
                {!isCollapsed && (
                    <div className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-[11px] font-medium text-muted-foreground">Appearance</span>
                        <ThemeSwitcher />
                    </div>
                )}
                <Dropdown>
                    <Dropdown.Trigger>
                        <Button
                            variant="ghost"
                            className={`w-full border-0 transition-colors hover:bg-surface-tertiary text-left ${
                                isCollapsed ? 'justify-center px-0 h-10 w-10 mx-auto' : 'px-3 py-2 h-auto justify-start'
                            }`}
                            aria-label="User menu"
                        >
                            <div className={`flex items-center gap-2.5 w-full ${
                                isCollapsed ? 'justify-center' : ''
                            }`}>
                                <Avatar size="sm">
                                    <Avatar.Fallback className="bg-surface-tertiary text-foreground text-xs font-semibold">
                                        {user?.name?.charAt(0).toUpperCase() || <User size={13} />}
                                    </Avatar.Fallback>
                                </Avatar>
                                {!isCollapsed && (
                                    <>
                                        <div className="flex flex-col items-start overflow-hidden flex-1 min-w-0">
                                            <span className="text-xs font-semibold text-foreground truncate w-full">
                                                {user?.name || 'Guest User'}
                                            </span>
                                            <span className="text-[11px] text-muted-foreground truncate w-full">
                                                {user?.email || ''}
                                            </span>
                                        </div>
                                        <MoreVertical size={14} className="text-muted-foreground shrink-0" />
                                    </>
                                )}
                            </div>
                        </Button>
                    </Dropdown.Trigger>
                    <Dropdown.Popover placement={isCollapsed ? 'right' : 'top'} className="min-w-[200px]">
                        <Dropdown.Menu>
                            <Dropdown.Section>
                                <Dropdown.Item id="settings" textValue="Settings">
                                    <Link href="/settings" className="flex items-center gap-2 w-full">
                                        <Settings size={15} />
                                        <Label className="cursor-pointer">Account Settings</Label>
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
                                    <LogOut size={15} />
                                    <Label className="cursor-pointer">Sign Out</Label>
                                </div>
                            </Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown.Popover>
                </Dropdown>
                {isCollapsed && (
                    <div className="flex justify-center pt-1">
                        <ThemeSwitcher />
                    </div>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
