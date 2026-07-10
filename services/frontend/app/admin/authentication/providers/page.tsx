'use client';

import { Alert, Button, Card } from '@heroui/react';
import { api, OIDCProvider } from '@/services/frontend/lib/api';
import { Loader2, Plus, Settings2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function AdminOIDCProvidersPage() {
    const router = useRouter();
    const [providers, setProviders] = useState<OIDCProvider[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await api.getAdminSettings();
            setProviders(response.oidcProviders);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load OIDC providers.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const deleteProvider = async (provider: OIDCProvider) => {
        if (!window.confirm(`Remove ${provider.name}? Linked identities must be removed first.`)) return;
        try {
            await api.deleteOIDCProvider(provider.id);
            setNotice('OIDC provider removed.');
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to remove provider.');
        }
    };

    return (
        <div className="mx-auto w-full max-w-5xl space-y-6 p-6 md:p-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-accent">Admin / Authentication / Providers</p>
                    <h1 className="mt-2 text-2xl font-semibold text-foreground">OIDC providers</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Manage provider-specific discovery and client credentials.</p>
                </div>
                <Button variant="primary" onPress={() => router.push('/admin/authentication/providers/new')}><Plus size={14} />Add provider</Button>
            </div>

            {error && <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>Action failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Content></Alert>}
            {notice && <Alert status="success"><Alert.Indicator /><Alert.Content><Alert.Title>Saved</Alert.Title><Alert.Description>{notice}</Alert.Description></Alert.Content></Alert>}

            <Card>
                <Card.Header><Card.Title>Configured providers</Card.Title><Card.Description>{providers.length} provider{providers.length === 1 ? '' : 's'} configured. Secrets are encrypted on the server.</Card.Description></Card.Header>
                <Card.Content className="space-y-2">
                    {isLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div> : providers.map((provider) => (
                        <div key={provider.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-4">
                            <div className="min-w-0 flex-1"><p className="text-sm font-medium text-foreground">{provider.name} <span className="ml-1 text-xs text-muted-foreground">({provider.slug})</span></p><p className="mt-1 truncate text-xs text-muted-foreground">{provider.issuerUrl}</p><p className="mt-1 text-xs text-muted-foreground">Client secret: {provider.hasSecret ? 'configured' : 'not configured'}</p></div>
                            <span className={`text-xs ${provider.enabled ? 'text-success' : 'text-muted-foreground'}`}>{provider.enabled ? 'Enabled' : 'Disabled'}</span>
                            <Button size="sm" variant="secondary" onPress={() => router.push(`/admin/authentication/providers/${provider.id}`)}><Settings2 size={14} />Edit</Button>
                            <Button size="sm" variant="danger" onPress={() => void deleteProvider(provider)}><Trash2 size={14} />Delete</Button>
                        </div>
                    ))}
                    {!isLoading && providers.length === 0 && <p className="py-6 text-sm text-muted-foreground">No OIDC providers configured yet.</p>}
                </Card.Content>
            </Card>
        </div>
    );
}
