'use client';

import { useAuth } from '@/context/AuthContext';
import { Button, Surface } from '@heroui/react';
import { Book, CheckSquare, ChevronLeft, ChevronRight, Code2, LayoutDashboard, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeSwitcher } from './ThemeSwitcher';

interface SidebarProps {
    isCollapsed: boolean;
    setIsCollapsed: (value: boolean) => void;
}

const Sidebar = ({ isCollapsed, setIsCollapsed }: SidebarProps) => {
    const pathname = usePathname();
    const { logout } = useAuth();

    const navItems = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Projects', href: '/projects', icon: CheckSquare },
        { name: 'Wiki', href: '/wiki', icon: Book },
        { name: 'Snippets', href: '/snippets', icon: Code2 },
    ];

    return (
        <Surface 
            variant="secondary" 
            className={`h-full flex flex-col border border-border/50 rounded-[2.5rem] bg-gradient-to-b from-surface to-surface-secondary shadow-2xl shadow-black/5 transition-all duration-300 ease-in-out overflow-hidden ${
                isCollapsed ? 'w-20 p-4' : 'w-72 p-6'
            }`}
        >
            <div className={`mb-10 flex flex-col ${isCollapsed ? 'items-center' : ''}`}>
                <div className={`flex items-center w-full ${isCollapsed ? 'justify-center' : 'justify-between'} mb-6`}>
                    {!isCollapsed && (
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
                                <span className="font-black text-xl italic mt-1">J</span>
                            </div>
                            <div>
                                <h1 className="text-2xl font-black tracking-tighter text-foreground leading-none">justspace</h1>
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground ml-0.5 mt-1 block">Internal</span>
                            </div>
                        </div>
                    )}
                    {isCollapsed && (
                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
                            <span className="font-black text-lg italic mt-1">J</span>
                        </div>
                    )}
                    
                    {!isCollapsed && (
                        <Button 
                            variant="ghost" 
                            size="sm"
                            onPress={() => setIsCollapsed(!isCollapsed)}
                            className="p-1 h-8 w-8 rounded-lg border border-border/50 hover:bg-surface-tertiary transition-all"
                        >
                            <ChevronLeft size={16} />
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
                        <ChevronRight size={16} />
                    </Button>
                )}
            </div>
            
            <nav className="flex-1 space-y-2 overflow-y-auto no-scrollbar">
                {!isCollapsed && <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 px-4 mb-4">Main Menu</p>}
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
                                    ? 'bg-foreground text-background font-bold shadow-lg shadow-black/10' 
                                    : 'text-muted-foreground hover:bg-surface-tertiary hover:text-foreground'
                            }`}
                        >
                            <Icon size={20} className={isActive ? 'text-primary' : 'group-hover:text-primary transition-colors'} />
                            {!isCollapsed && <span className="tracking-tight">{item.name}</span>}
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto space-y-4">
                {!isCollapsed && (
                    <Surface variant="tertiary" className="p-4 rounded-2xl border border-border/40 bg-surface/50 backdrop-blur-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Theme</span>
                            <ThemeSwitcher />
                        </div>
                        <p className="text-[10px] font-medium text-muted-foreground leading-snug">
                            Customize your view for focus or clarity.
                        </p>
                    </Surface>
                )}

                <div className={`pt-4 border-t border-border/50 flex flex-col gap-1 ${isCollapsed ? 'items-center px-0' : ''}`}>
                    <Link 
                        href="/settings"
                        title={isCollapsed ? 'Settings' : ''}
                        className={`flex items-center gap-4 rounded-xl text-muted-foreground hover:text-foreground transition-all group ${
                            isCollapsed ? 'justify-center p-3' : 'px-4 py-3'
                        }`}
                    >
                        <Settings size={20} className="group-hover:rotate-45 transition-transform" />
                        {!isCollapsed && <span className="font-medium tracking-tight">Settings</span>}
                    </Link>
                    
                    <button 
                        onClick={logout}
                        title={isCollapsed ? 'Logout' : ''}
                        className={`flex items-center gap-4 rounded-xl text-danger/70 hover:text-danger hover:bg-danger/5 transition-all group ${
                            isCollapsed ? 'justify-center p-3' : 'px-4 py-3'
                        }`}
                    >
                        <LogOut size={20} />
                        {!isCollapsed && <span className="font-medium tracking-tight">Logout</span>}
                    </button>
                </div>
            </div>
        </Surface>
    );
};

export default Sidebar;
