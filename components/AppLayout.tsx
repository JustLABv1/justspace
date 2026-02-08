'use client';

import Sidebar from "@/components/Sidebar";
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import React from 'react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <AuthBoundary>
                {children}
            </AuthBoundary>
        </AuthProvider>
    );
}

function AuthBoundary({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, isLoading } = useAuth();
    const isAuthPage = pathname === '/login' || pathname === '/signup';

    if (isLoading) {
        return <div className="flex h-screen w-screen items-center justify-center">Loading...</div>;
    }

    if (isAuthPage) {
        return <>{children}</>;
    }

    // Optional: Redirect to login if not authenticated
    // if (!user) {
    //     return <RedirectToLogin />;
    // }

    return (
        <div className="flex">
            <Sidebar />
            <main className="flex-1 min-h-screen bg-background overflow-auto">
                {children}
            </main>
        </div>
    );
}
