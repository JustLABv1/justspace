'use client';

import { Surface } from '@heroui/react';
import { Book, CheckSquare, LayoutDashboard, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeSwitcher } from './ThemeSwitcher';

const Sidebar = () => {
    const pathname = usePathname();

    const navItems = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Projects', href: '/projects', icon: CheckSquare },
        { name: 'Wiki', href: '/wiki', icon: Book },
    ];

    return (
        <Surface variant="secondary" className="w-72 min-h-screen flex flex-col p-6 border-r border-border/50 bg-gradient-to-b from-surface to-surface-secondary">
            <div className="mb-12 flex flex-col">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
                            <span className="font-black text-xl italic mt-1">J</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tighter text-foreground leading-none">justspace</h1>
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground ml-0.5 mt-1 block">Internal Hub</span>
                        </div>
                    </div>
                    <ThemeSwitcher />
                </div>
            </div>
            
            <nav className="flex-1 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 px-4 mb-4">Main Menu</p>
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                    const Icon = item.icon;
                    
                    return (
                        <Link 
                            key={item.name} 
                            href={item.href}
                            className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
                                isActive 
                                    ? 'bg-foreground text-background font-bold shadow-xl shadow-black/10' 
                                    : 'text-muted-foreground hover:bg-surface-tertiary hover:text-foreground'
                            }`}
                        >
                            <Icon size={20} className={isActive ? 'text-primary' : 'group-hover:text-primary transition-colors'} />
                            <span className="tracking-tight">{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto space-y-4">
                <Surface variant="tertiary" className="p-5 rounded-[2rem] border border-border/40 bg-surface relative overflow-hidden group">
                    <p className="text-xs font-bold text-muted-foreground relative z-10 leading-relaxed">
                        Need help? Check the <Link href="/wiki" className="text-primary hover:underline">Wiki</Link> for guides.
                    </p>
                </Surface>

                <div className="pt-6 border-t border-border/50">
                    <Link 
                        href="/settings"
                        className="flex items-center gap-4 px-4 py-3 text-muted-foreground hover:text-foreground transition-all group"
                    >
                        <Settings size={20} className="group-hover:rotate-45 transition-transform" />
                        <span className="font-medium tracking-tight">Settings</span>
                    </Link>
                </div>
            </div>
        </Surface>
    );
};

export default Sidebar;
