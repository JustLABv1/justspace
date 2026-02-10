'use client';

import { useAuth } from '@/context/AuthContext';
import { Avatar, Button, Dropdown, Label, Surface, Tooltip } from '@heroui/react';
import {
    Book,
    Checklist as CheckSquare,
    AltArrowLeft as ChevronLeft,
    AltArrowRight as ChevronRight,
    CodeCircle as Code2,
    Widget as LayoutDashboard,
    Logout as LogOut,
    MenuDots as MoreVertical,
    Settings,
    User
} from '@solar-icons/react';
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
    // Use safe access for workspaceName as preferences are dynamic
    const prefs = user?.prefs as Record<string, string | undefined>;
    const workspaceName = prefs?.workspaceName || 'justspace_';
    const firstLetter = workspaceName.charAt(0).toUpperCase();

    const navItems = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Projects', href: '/projects', icon: CheckSquare },
        { name: 'Wiki', href: '/wiki', icon: Book },
        { name: 'Snippets', href: '/snippets', icon: Code2 },
    ];

    return (
        <Surface 
            variant="secondary" 
            className={`fixed md:relative z-50 md:z-auto h-full flex flex-col border border-border/50 rounded-none md:rounded-[2rem] bg-gradient-to-b from-surface to-surface-secondary shadow-2xl shadow-black/5 transition-all duration-300 ease-in-out overflow-hidden ${
                isCollapsed ? 'w-20 p-4' : 'w-72 p-6'
            } ${
                isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
            }`}
        >
            <div className={`mb-10 flex flex-col ${isCollapsed ? 'items-center' : ''}`}>
                <div className={`flex items-center w-full ${isCollapsed ? 'justify-center' : 'justify-between'} mb-6`}>
                    {!isCollapsed && (
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-accent-foreground shadow-lg shadow-accent/20 border border-white/10 ring-1 ring-accent/30">
                                <span className="font-bold text-xl leading-none tracking-tighter">{firstLetter}</span>
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-xl font-bold tracking-tight text-foreground leading-none truncate max-w-[120px]">{workspaceName}</h1>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent/80 mt-1.5 flex items-center gap-1">
                                    <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />
                                    Consultant OS
                                </span>
                            </div>
                        </div>
                    )}
                    {isCollapsed && (
                        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-accent-foreground shadow-lg shadow-accent/20 border border-white/10 ring-1 ring-accent/30">
                            <span className="font-bold text-xl leading-none tracking-tighter">{firstLetter}</span>
                        </div>
                    )}
                    
                    {!isCollapsed && (
                        <Button 
                            variant="ghost" 
                            size="sm"
                            onPress={() => setIsCollapsed(!isCollapsed)}
                            className="p-0 h-8 w-8 min-w-8 rounded-lg border border-border/50 hover:bg-surface-tertiary transition-all hover:scale-105 active:scale-95"
                        >
                            <ChevronLeft size={16} weight="Bold" />
                        </Button>
                    )}
                </div>

                {isCollapsed && (
                    <Button 
                        variant="ghost" 
                        size="sm"
                        onPress={() => setIsCollapsed(!isCollapsed)}
                        className="p-1 h-8 w-8 rounded-lg border border-border/50 hover:bg-surface-tertiary transition-all"
                    >
                        <ChevronRight size={16} weight="Linear" />
                    </Button>
                )}
            </div>
            
            <nav className="flex-1 space-y-2 overflow-y-auto no-scrollbar">
                {!isCollapsed && (
                    <div className="flex items-center justify-between px-4 mb-4">
                        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-muted-foreground opacity-40">Main Menu</p>
                        <div className="flex items-center gap-1.5 opacity-30">
                             <kbd className="text-[10px] font-mono border border-border/50 px-1 rounded bg-surface">⌘</kbd>
                             <kbd className="text-[10px] font-mono border border-border/50 px-1 rounded bg-surface">K</kbd>
                        </div>
                    </div>
                )}
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                    const Icon = item.icon;
                    
                    const navLink = (
                        <Link 
                            key={item.name} 
                            href={item.href}
                            onClick={() => setIsMobileOpen?.(false)}
                            className={`flex items-center gap-4 rounded-xl transition-all duration-300 group ${
                                isCollapsed ? 'justify-center px-0 py-3' : 'px-4 py-3'
                            } ${
                                isActive 
                                    ? 'bg-foreground text-background font-black shadow-lg shadow-black/20 scale-[1.02]' 
                                    : 'text-muted-foreground hover:bg-surface-tertiary hover:text-foreground font-black opacity-60 hover:opacity-100'
                            }`}
                        >
                            <Icon 
                                size={20} 
                                weight={isActive ? "Bold" : "Linear"} 
                                className={isActive ? 'text-accent' : 'group-hover:text-accent transition-colors'} 
                            />
                            {!isCollapsed && <span className="tracking-tighter text-[13px] font-bold">{item.name}</span>}
                            {!isCollapsed && isActive && (
                                <div className="ml-auto w-1 h-1 rounded-full bg-accent animate-pulse" />
                            )}
                        </Link>
                    );

                    if (isCollapsed) {
                        return (
                            <Tooltip key={item.name} delay={0}>
                                <Tooltip.Trigger>
                                    {navLink}
                                </Tooltip.Trigger>
                                <Tooltip.Content placement="right" showArrow className="font-bold">
                                    <Tooltip.Arrow />
                                    {item.name}
                                </Tooltip.Content>
                            </Tooltip>
                        );
                    }

                    return navLink;
                })}
            </nav>

            <div className="mt-auto space-y-4 pt-4 border-t border-border/50">
                <div className={`flex flex-col gap-2 ${isCollapsed ? 'items-center px-0' : ''}`}>
                    {!isCollapsed && (
                        <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-surface/30 border border-border/40 backdrop-blur-sm group/theme">
                            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground/50 group-hover/theme:text-foreground transition-colors">Interface</span>
                            <ThemeSwitcher />
                        </div>
                    )}
                   <Dropdown>
                        <Dropdown.Trigger>
                            <Button 
                                variant="tertiary" 
                                className={`w-full group/user border border-transparent hover:border-border/50 transition-all duration-300 ${
                                    isCollapsed ? 'p-0 h-12 w-12 rounded-xl' : 'p-2 h-auto rounded-2xl justify-start'
                                }`}
                                aria-label="User menu"
                            >
                                <div className={`flex items-center gap-3 w-full ${isCollapsed ? 'justify-center' : ''}`}>
                                    <Avatar size={isCollapsed ? "md" : "sm"} className="shadow-lg">
                                        <Avatar.Fallback className="bg-accent text-accent-foreground font-black text-xs">
                                            {user?.name?.charAt(0).toUpperCase() || <User size={14} />}
                                        </Avatar.Fallback>
                                    </Avatar>
                                    
                                    {!isCollapsed && (
                                        <div className="flex flex-col items-start overflow-hidden mr-auto">
                                            <span className="text-xs font-black text-foreground truncate w-full tracking-tight">
                                                {user?.name || 'Guest User'}
                                            </span>
                                            <span className="text-[10px] font-bold text-muted-foreground truncate w-full opacity-60">
                                                {user?.email || 'not-signed-in'}
                                            </span>
                                        </div>
                                    )}

                                    {!isCollapsed && (
                                        <MoreVertical size={16} className="text-muted-foreground opacity-0 group-hover/user:opacity-100 transition-opacity" />
                                    )}
                                </div>
                            </Button>
                        </Dropdown.Trigger>
                        <Dropdown.Popover placement={isCollapsed ? "right" : "top"} className="min-w-[200px]">
                            <Dropdown.Menu>
                                <Dropdown.Section>
                                    <Dropdown.Item id="settings" textValue="Settings">
                                        <Link href="/settings" className="flex items-center gap-2 w-full">
                                            <Settings size={18} />
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
                                        <LogOut size={18} />
                                        <Label className="cursor-pointer font-bold">Sign Out</Label>
                                    </div>
                                </Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                </div>
            </div>
        </Surface>
    );
};

export default Sidebar;
