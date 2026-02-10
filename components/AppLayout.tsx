'use client';

import { CommandPalette } from "@/components/CommandPalette";
import Sidebar from "@/components/Sidebar";
import { VaultBanner } from "@/components/VaultBanner";
import { AuthProvider, useAuth } from '@/context/AuthContext';
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
        <div className="flex bg-background h-screen overflow-hidden p-4 gap-4">
            <Sidebar isCollapsed={isCollapsed} setIsCollapsed={toggleCollapse} />
            <main className="flex-1 bg-surface-secondary/30 rounded-[2rem] border border-border/40 overflow-y-auto shadow-sm no-scrollbar relative">
                <VaultBanner />
                {children}
            </main>
        </div>
    );
}
