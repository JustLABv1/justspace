'use client';

import { CommandPalette } from "@/components/CommandPalette";
import Sidebar from "@/components/Sidebar";
import { VaultBanner } from "@/components/VaultBanner";
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Search } from "lucide-react";
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useSyncExternalStore } from 'react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <AuthBoundary>
                {children}
            </AuthBoundary>
            <CommandPalette />
        </AuthProvider>
    );
}

function AuthBoundary({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, isLoading } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
    
    // Reset mobile menu on navigation without useEffect to avoid cascading renders
    const [prevPathname, setPrevPathname] = React.useState(pathname);
    if (pathname !== prevPathname) {
        setPrevPathname(pathname);
        setIsMobileMenuOpen(false);
    }

    const isClient = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );

    const isCollapsed = useSyncExternalStore(
        (callback) => {
            window.addEventListener('sidebar-collapsed-change', callback);
            return () => window.removeEventListener('sidebar-collapsed-change', callback);
        },
        () => localStorage.getItem('sidebar-collapsed') === 'true',
        () => false
    );

    const isAuthPage = pathname === '/login' || pathname === '/signup';

    const toggleCollapse = (value: boolean) => {
        localStorage.setItem('sidebar-collapsed', String(value));
        window.dispatchEvent(new Event('sidebar-collapsed-change'));
    };

    useEffect(() => {
        if (!isLoading && !user && !isAuthPage) {
            router.push('/login');
        }
    }, [user, isLoading, isAuthPage, router]);

    if (!isClient) {
        return <div className="flex h-screen w-screen items-center justify-center">Loading...</div>;
    }

    if (isAuthPage) {
        return <>{children}</>;
    }

    if (isLoading && !user) {
        return <div className="flex h-screen w-screen items-center justify-center">Loading...</div>;
    }

    if (!user) {
        return null;
    }

    return (
        <div className="flex bg-background h-screen overflow-hidden relative">
            <Sidebar 
                isCollapsed={isCollapsed} 
                setIsCollapsed={toggleCollapse} 
                isMobileOpen={isMobileMenuOpen}
                setIsMobileOpen={setIsMobileMenuOpen}
            />

            {/* Mobile overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}
            
            <main className="flex-1 min-w-0 flex flex-col bg-background overflow-hidden relative">
                {/* Mobile Header */}
                <header className="md:hidden flex items-center justify-between h-14 px-4 bg-surface border-b border-border z-40">
                    <button 
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Toggle menu"
                    >
                        <div className="flex flex-col gap-1.5 w-5">
                            <span className={`h-0.5 w-full bg-current rounded-full transition-all ${isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                            <span className={`h-0.5 w-full bg-current rounded-full transition-all ${isMobileMenuOpen ? 'opacity-0' : ''}`} />
                            <span className={`h-0.5 w-full bg-current rounded-full transition-all ${isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
                        </div>
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-accent-foreground">
                            <span className="font-bold text-sm leading-none">J</span>
                        </div>
                        <span className="font-semibold text-sm">justspace</span>
                    </div>
                    <button 
                        onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
                        className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Open search"
                    >
                        <Search size={18} />
                    </button>
                </header>

                <VaultBanner />
                
                <div className="flex-1 overflow-y-auto no-scrollbar">
                    {children}
                </div>
            </main>

        </div>
    );
}
