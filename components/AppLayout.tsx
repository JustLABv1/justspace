'use client';

import { CommandPalette } from "@/components/CommandPalette";
import Sidebar from "@/components/Sidebar";
import { VaultBanner } from "@/components/VaultBanner";
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Magnifer as Search } from "@solar-icons/react";
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
        <div className="flex bg-background h-screen overflow-hidden p-0 md:p-4 md:gap-4 relative">
            <Sidebar 
                isCollapsed={isCollapsed} 
                setIsCollapsed={toggleCollapse} 
                isMobileOpen={isMobileMenuOpen}
                setIsMobileOpen={setIsMobileMenuOpen}
            />
            
            <main className={`flex-1 min-w-0 flex flex-col bg-surface-secondary/30 md:rounded-[2rem] border-x md:border border-border/40 overflow-hidden shadow-sm relative transition-all duration-300 ${isMobileMenuOpen ? 'blur-sm brightness-50 md:blur-0 md:brightness-100' : ''}`}>
                {/* Mobile Header */}
                <header className="md:hidden flex items-center justify-between p-4 bg-surface border-b border-border/40 z-40">
                    <button 
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="p-2 -ml-2 text-foreground"
                    >
                        <div className="flex flex-col gap-1.5 w-6">
                            <span className={`h-0.5 w-full bg-current rounded-full transition-all ${isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                            <span className={`h-0.5 w-full bg-current rounded-full transition-all ${isMobileMenuOpen ? 'opacity-0' : ''}`} />
                            <span className={`h-0.5 w-full bg-current rounded-full transition-all ${isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
                        </div>
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-accent-foreground shadow-lg shadow-accent/20">
                            <span className="font-bold text-sm">J</span>
                        </div>
                        <span className="font-bold tracking-tight text-sm">justspace</span>
                    </div>
                    <button 
                        onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
                        className="p-2 -mr-2 text-foreground/60 hover:text-accent transition-colors"
                    >
                        <Search size={22} weight="Bold" />
                    </button>
                </header>

                <VaultBanner />
                
                <div className="flex-1 overflow-y-auto no-scrollbar">
                    {children}
                </div>
            </main>

            {/* Backdrop for mobile */}
            {isMobileMenuOpen && (
                <div 
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}
        </div>
    );
}
