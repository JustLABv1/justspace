'use client';

import { Surface } from '@heroui/react';
import { Book, CheckSquare, LayoutDashboard, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Sidebar = () => {
    const pathname = usePathname();

    const navItems = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Projects', href: '/projects', icon: CheckSquare },
        { name: 'Wiki', href: '/wiki', icon: Book },
    ];

    return (
        <Surface variant="secondary" className="w-64 min-h-screen flex flex-col p-4 border-r border-border">
            <div className="mb-8 px-2">
                <h1 className="text-2xl font-bold text-foreground">justspace</h1>
                <p className="text-xs text-muted mt-1">Consultant Portal</p>
            </div>
            
            <nav className="flex-1 space-y-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                    const Icon = item.icon;
                    
                    return (
                        <Link 
                            key={item.name} 
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                                isActive 
                                    ? 'bg-accent text-accent-foreground font-medium' 
                                    : 'text-muted-foreground hover:bg-surface-tertiary hover:text-foreground'
                            }`}
                        >
                            <Icon size={20} />
                            <span>{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto pt-4 border-t border-border">
                <Link 
                    href="/settings"
                    className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <Settings size={20} />
                    <span>Settings</span>
                </Link>
            </div>
        </Surface>
    );
};

export default Sidebar;
