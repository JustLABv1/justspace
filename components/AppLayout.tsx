'use client';

import { CommandPalette } from "@/components/CommandPalette";
import Sidebar from "@/components/Sidebar";
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

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
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mounted, setMounted] = useState(false);
    const isAuthPage = pathname === '/login' || pathname === '/signup';

    useEffect(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        if (saved !== null) {
            setIsCollapsed(saved === 'true');
        }
        setMounted(true);
    }, []);

    const toggleCollapse = (value: boolean) => {
        setIsCollapsed(value);
        localStorage.setItem('sidebar-collapsed', String(value));
    };

    useEffect(() => {
        if (!isLoading && !user && !isAuthPage) {
            router.push('/login');
        }
    }, [user, isLoading, isAuthPage, router]);

    if (isLoading || !mounted) {
        return <div className="flex h-screen w-screen items-center justify-center">Loading...</div>;
    }

    if (isAuthPage) {
        return <>{children}</>;
    }

    if (!user) {
        return null;
    }

    return (
        <div className="flex bg-background h-screen overflow-hidden p-4 gap-4">
            <Sidebar isCollapsed={isCollapsed} setIsCollapsed={toggleCollapse} />
            <main className="flex-1 bg-surface-secondary/30 rounded-[2.5rem] border border-border/40 overflow-y-auto shadow-sm no-scrollbar">
                {children}
            </main>
        </div>
    );
}
