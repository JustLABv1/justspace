'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { LayoutDashboard, LockKeyhole, Palette, ScrollText, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

const navigation = [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/authentication', label: 'Authentication', icon: LockKeyhole },
    { href: '/admin/authentication/providers', label: 'OIDC providers', icon: ShieldCheck },
    { href: '/admin/branding', label: 'Branding', icon: Palette },
    { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, isLoading } = useAuth();

    useEffect(() => {
        if (!isLoading && (!user || !user.isPlatformAdmin)) {
            router.replace('/');
        }
    }, [isLoading, user, router]);

    if (isLoading || !user || !user.isPlatformAdmin) {
        return <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-muted-foreground">Loading admin workspace…</div>;
    }

    return (
        <div className="flex min-h-[calc(100vh-3.5rem)] flex-col md:flex-row">
            <aside className="w-full shrink-0 border-b border-border bg-surface px-4 py-4 md:w-60 md:border-b-0 md:border-r md:px-3 md:py-6">
                <div className="mb-5 px-2">
                    <div>
                        <div className="flex items-center gap-2 text-accent">
                            <ShieldCheck size={17} />
                            <span className="text-xs font-semibold uppercase tracking-wider">Admin center</span>
                        </div>
                        <p className="mt-1 hidden text-xs text-muted-foreground md:block">Platform controls</p>
                    </div>
                </div>

                <nav aria-label="Admin navigation" className="flex gap-1 overflow-x-auto md:block md:space-y-1">
                    {navigation.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.href === '/admin'
                            ? pathname === '/admin'
                            : item.href === '/admin/authentication/providers' || item.href === '/admin/branding' || item.href === '/admin/audit'
                                ? pathname === item.href || pathname.startsWith(`${item.href}/`)
                                : pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={isActive ? 'page' : undefined}
                                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors md:w-full ${isActive ? 'bg-surface-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'}`}
                            >
                                <Icon size={15} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </aside>
            <main className="min-w-0 flex-1 bg-background">{children}</main>
        </div>
    );
}
