'use client';

import { AdminAuditEvent, api } from '@/services/frontend/lib/api';
import { Alert, Card, Chip } from '@heroui/react';
import { Loader2, ScrollText } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export default function AdminAuditPage() {
    const [events, setEvents] = useState<AdminAuditEvent[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await api.listAdminAudit(50, 0);
            setEvents(result.documents); setTotal(result.total); setError('');
        } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load audit log.'); }
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 p-6 md:p-10">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Admin / Audit log</p><h1 className="mt-2 text-2xl font-semibold">Audit log</h1><p className="mt-1 text-sm text-muted-foreground">Administrator changes are append-only and retained for 12 months.</p></div>
            {error && <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>Unable to load audit log</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Content></Alert>}
            <Card>
                <Card.Header className="flex-row items-center justify-between"><div><Card.Title>Platform events</Card.Title><Card.Description>{total} recorded event{total === 1 ? '' : 's'}</Card.Description></div><ScrollText className="text-accent" size={19} /></Card.Header>
                <Card.Content>
                    {isLoading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div> : events.length === 0 ? <p className="py-8 text-sm text-muted-foreground">No administrator actions recorded yet.</p> : (
                        <div className="divide-y divide-border/70">
                            {events.map((event) => <div key={event.id} className="grid gap-2 py-4 first:pt-0 md:grid-cols-[1fr_auto] md:items-start"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-foreground">{event.action}</span><Chip size="sm" variant="soft">{event.targetType}</Chip></div><p className="mt-1 text-sm text-muted-foreground">{event.targetLabel || event.targetId || 'Platform'} · {event.actorName || event.actorEmail || 'System'}</p>{Object.keys(event.metadata || {}).length > 0 && <pre className="mt-2 max-w-full overflow-x-auto rounded-lg bg-surface-secondary p-2 text-[11px] text-muted-foreground">{JSON.stringify(event.metadata, null, 2)}</pre>}</div><time className="text-xs text-muted-foreground md:text-right" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div>)}
                        </div>
                    )}
                </Card.Content>
            </Card>
        </div>
    );
}
