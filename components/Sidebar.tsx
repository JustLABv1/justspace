'use client';

import { useAuth } from '@/context/AuthContext';
import { Button, Surface } from '@heroui/react';
import {
    Book,
    Checklist as CheckSquare,
    AltArrowLeft as ChevronLeft,
    AltArrowRight as ChevronRight,
    CodeCircle as Code2,
    Widget as LayoutDashboard,
    Logout as LogOut,
    Settings
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
    const workspaceName = user?.prefs?.workspaceName || 'justspace_';
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
                            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-accent-foreground shadow-lg shadow-accent/20">
                                <span className="font-bold text-xl leading-none">{firstLetter}</span>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-foreground leading-none truncate max-w-[120px]">{workspaceName}</h1>
                                <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-accent ml-0.5 mt-1 block opacity-60">Consultant OS</span>
                            </div>
                        </div>
                    )}
                    {isCollapsed && (
                        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-accent-foreground shadow-lg shadow-accent/20">
                            <span className="font-bold text-xl leading-none">{firstLetter}</span>
                        </div>
                    )}
                    
                    {!isCollapsed && (
                        <Button 
                            variant="ghost" 
                            size="sm"
                            onPress={() => setIsCollapsed(!isCollapsed)}
                            className="p-1 h-8 w-8 rounded-lg border border-border/50 hover:bg-surface-tertiary transition-all"
                        >
                            <ChevronLeft size={16} weight="Linear" />
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
                    
                    return (
                        <Link 
                            key={item.name} 
                            href={item.href}
                            title={isCollapsed ? item.name : ''}
                            className={`flex items-center gap-4 rounded-xl transition-all duration-300 group ${
                                isCollapsed ? 'justify-center px-0 py-3' : 'px-4 py-3'
                            } ${
                                isActive 
                                    ? 'bg-foreground text-background font-black shadow-lg shadow-black/10' 
                                    : 'text-muted-foreground hover:bg-surface-tertiary hover:text-foreground font-black opacity-50 hover:opacity-100'
                            }`}
                        >
                            <Icon size={20} weight={isActive ? "Bold" : "Linear"} className={isActive ? 'text-accent' : 'group-hover:text-accent transition-colors'} />
                            {!isCollapsed && <span className="tracking-tighter text-xs font-bold">{item.name}</span>}
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto space-y-4">
                {!isCollapsed && (
                    <Surface variant="tertiary" className="p-4 rounded-2xl border border-border/40 bg-surface/50 backdrop-blur-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-muted-foreground opacity-40">Theme</span>
                            <ThemeSwitcher />
                        </div>
                        <p className="text-[11px] font-medium text-muted-foreground leading-snug">
                            Customize your view for focus or clarity.
                        </p>
                    </Surface>
                )}

                <div className={`pt-4 border-t border-border/50 flex flex-col gap-1 ${isCollapsed ? 'items-center px-0' : ''}`}>
                    <Link 
                        href="/settings"
                        title={isCollapsed ? 'Settings' : ''}
                        className={`flex items-center gap-4 rounded-xl text-muted-foreground hover:text-foreground transition-all group font-bold opacity-60 hover:opacity-100 ${
                            isCollapsed ? 'justify-center p-3' : 'px-4 py-3'
                        }`}
                    >
                        <Settings size={20} weight="Linear" className="group-hover:rotate-45 transition-transform" />
                        {!isCollapsed && <span className="tracking-tight text-xs font-bold">Settings</span>}
                    </Link>
                    
                    <button 
                        onClick={logout}
                        title={isCollapsed ? 'Logout' : ''}
                        className={`flex items-center gap-4 rounded-xl text-danger/70 hover:text-danger hover:bg-danger/5 transition-all group font-bold opacity-60 hover:opacity-100 ${
                            isCollapsed ? 'justify-center p-3' : 'px-4 py-3'
                        }`}
                    >
                        <LogOut size={20} weight="Linear" />
                        {!isCollapsed && <span className="tracking-tighter text-xs font-bold">Logout</span>}
                    </button>
                </div>
            </div>
        </Surface>
    );
};

export default Sidebar;
