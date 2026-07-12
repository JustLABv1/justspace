'use client';

import { AdminAuditEvent, AdminOverview, api } from '@/services/frontend/lib/api';
import { Alert, Card, Chip } from '@heroui/react';
import { Activity, ArrowRight, Database, Loader2, ScrollText, Users } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const initialOverview: AdminOverview = {
    databaseStatus: 'unknown', totalUsers: 0, activeUsers: 0, inactiveUsers: 0,
    platformAdmins: 0, projects: 0, tasks: 0, enabledOidcProviders: 0,
    totalOidcProviders: 0, localAuthEnabled: true,
};

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: typeof Users }) {
    return (
        <Card>
            <Card.Header className="flex-row items-start justify-between gap-4">
                <div><Card.Description>{label}</Card.Description><Card.Title className="mt-1 text-2xl">{value}</Card.Title></div>
                <div className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon size={17} /></div>
            </Card.Header>
            <Card.Footer className="text-xs text-muted-foreground">{detail}</Card.Footer>
        </Card>
    );
}

export default function AdminOverviewPage() {
    const [overview, setOverview] = useState<AdminOverview>(initialOverview);
    const [events, setEvents] = useState<AdminAuditEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const [nextOverview, audit] = await Promise.all([api.getAdminOverview(), api.listAdminAudit(6, 0)]);
            setOverview(nextOverview);
            setEvents(audit.documents);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load the admin overview.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    if (isLoading) {
        return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>;
    }

    return (
        <div className="mx-auto w-full max-w-6xl space-y-8 p-6 md:p-10">
            <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">Platform administration</p>
                <h1 className="mt-2 text-2xl font-semibold text-foreground">Overview</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Operational health and the latest platform changes at a glance.</p>
            </div>

            {error && <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>Unable to load overview</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Content></Alert>}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Users" value={overview.totalUsers} detail={`${overview.activeUsers} active · ${overview.inactiveUsers} inactive`} icon={Users} />
                <Metric label="Projects" value={overview.projects} detail={`${overview.tasks} tasks across the platform`} icon={Activity} />
                <Metric label="OIDC providers" value={overview.enabledOidcProviders} detail={`${overview.totalOidcProviders} configured · ${overview.localAuthEnabled ? 'local auth on' : 'local auth off'}`} icon={ScrollText} />
                <Metric label="Database" value={overview.databaseStatus === 'healthy' ? 'Healthy' : 'Attention'} detail={`${overview.platformAdmins} platform admin${overview.platformAdmins === 1 ? '' : 's'}`} icon={Database} />
            </div>

            <Card>
                <Card.Header className="flex-row items-start justify-between gap-4">
                    <div><Card.Title>Recent admin activity</Card.Title><Card.Description>Changes are retained for 12 months.</Card.Description></div>
                    <Link href="/admin/audit" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">View all <ArrowRight size={14} /></Link>
                </Card.Header>
                <Card.Content>
                    {events.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No administrator actions recorded yet.</p> : (
                        <div className="divide-y divide-border/70">
                            {events.map((event) => (
                                <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                                    <div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{event.action}</p><p className="mt-0.5 text-xs text-muted-foreground">{event.actorName || event.actorEmail || 'System'} · {event.targetLabel || event.targetType}</p></div>
                                    <Chip size="sm" variant="soft">{new Date(event.createdAt).toLocaleString()}</Chip>
                                </div>
                            ))}
                        </div>
                    )}
                </Card.Content>
            </Card>
        </div>
    );
}
