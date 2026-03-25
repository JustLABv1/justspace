'use client';

import { CommandPalette } from "@/components/CommandPalette";
import Sidebar from "@/components/Sidebar";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { VaultBanner } from "@/components/VaultBanner";
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { promptForPwaInstall, usePwaInstallState } from '@/lib/pwa';
import { Avatar, Button, Dropdown, Label } from "@heroui/react";
import { ChevronDown, Download, LogOut, Search, Settings, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState, useSyncExternalStore } from 'react';

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
    const router = useRouter();
    const { user, isLoading, logout } = useAuth();
    const pwa = usePwaInstallState();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // Reset mobile menu on navigation
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

    // Open search from event (sidebar search button, mobile header icon)
    useEffect(() => {
        const handler = () => setIsSearchOpen(true);
        window.addEventListener('open-command-palette', handler);
        return () => window.removeEventListener('open-command-palette', handler);
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setIsSearchOpen(prev => !prev);
            }
            if (e.key === 'p' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                router.push('/projects');
            }
            if (e.key === 'w' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                router.push('/wiki');
            }
            if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                router.push('/snippets');
            }
        };
        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, [router]);

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
                        <div className="w-7 h-7 rounded-xl bg-accent flex items-center justify-center text-accent-foreground">
                            <span className="font-bold text-sm leading-none">J</span>
                        </div>
                        <span className="font-semibold text-sm">justspace</span>
                    </div>
                    <button
                        onClick={() => setIsSearchOpen(true)}
                        className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Open search"
                    >
                        <Search size={18} />
                    </button>
                </header>

                {/* Desktop Header */}
                <header className="hidden md:flex items-center justify-between h-14 px-6 bg-surface border-b border-border shrink-0 z-30">
                    <div className="w-48" />

                    {/* Search button — highlights when open */}
                    <button
                        onClick={() => setIsSearchOpen(true)}
                        className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border transition-all min-w-[360px] max-w-[480px] ${
                            isSearchOpen
                                ? 'bg-surface border-accent/40 ring-2 ring-accent/15 shadow-sm'
                                : 'bg-surface-secondary/60 border-border/60 hover:bg-surface-secondary hover:border-border'
                        }`}
                    >
                        <Search size={14} className="text-muted-foreground shrink-0" />
                        <span className="text-[13px] text-muted-foreground flex-1 text-left">
                            Search by name, label, task or team member...
                        </span>
                        <kbd className="ml-auto text-[10px] font-medium bg-surface rounded px-1.5 py-0.5 text-muted-foreground border border-border shrink-0">⌘K</kbd>
                    </button>

                    <div className="flex items-center gap-2 w-48 justify-end">
                        {pwa.canInstall && !pwa.isStandalone && (
                            <Button
                                variant="secondary"
                                className="hidden lg:inline-flex h-8 px-3 rounded-xl text-[12px] font-medium"
                                onPress={() => {
                                    void promptForPwaInstall();
                                }}
                            >
                                <Download size={13} className="mr-1.5" />
                                Install app
                            </Button>
                        )}

                        <ThemeSwitcher />

                        <Dropdown>
                            <Dropdown.Trigger>
                                <button className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-surface-secondary transition-colors">
                                    <Avatar size="sm" className="w-7 h-7 shrink-0">
                                        <Avatar.Fallback className="bg-accent/20 text-accent text-[11px] font-semibold">
                                            {user?.name?.charAt(0).toUpperCase() || <User size={12} />}
                                        </Avatar.Fallback>
                                    </Avatar>
                                    <span className="text-[13px] font-medium text-foreground hidden lg:block max-w-[120px] truncate">
                                        {user?.name || 'Guest'}
                                    </span>
                                    <ChevronDown size={12} className="text-muted-foreground hidden lg:block" />
                                </button>
                            </Dropdown.Trigger>
                            <Dropdown.Popover placement="bottom end" className="min-w-[180px]">
                                <Dropdown.Menu>
                                    <Dropdown.Section>
                                        <Dropdown.Item id="settings" textValue="Settings">
                                            <Link href="/settings" className="flex items-center gap-2 w-full">
                                                <Settings size={14} />
                                                <Label className="cursor-pointer text-[13px]">Settings</Label>
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
                                            <LogOut size={14} />
                                            <Label className="cursor-pointer text-[13px]">Sign Out</Label>
                                        </div>
                                    </Dropdown.Item>
                                </Dropdown.Menu>
                            </Dropdown.Popover>
                        </Dropdown>
                    </div>
                </header>

                <VaultBanner />

                <div className="flex-1 overflow-y-auto no-scrollbar">
                    {children}
                </div>
            </main>

            {/* Command palette — rendered as a fixed panel, not a modal */}
            {isSearchOpen && <CommandPalette onClose={() => setIsSearchOpen(false)} />}
        </div>
    );
}
