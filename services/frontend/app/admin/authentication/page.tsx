'use client';

import { Alert, Button, Card, Label, Switch } from '@heroui/react';
import { api, OIDCProvider } from '@/services/frontend/lib/api';
import { ArrowRight, Loader2, Plus, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function AdminAuthenticationPage() {
    const router = useRouter();
    const [localAuthEnabled, setLocalAuthEnabled] = useState(true);
    const [providers, setProviders] = useState<OIDCProvider[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await api.getAdminSettings();
            setLocalAuthEnabled(response.settings.localAuthEnabled);
            setProviders(response.oidcProviders);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load authentication settings.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const toggleLocalAuth = async (enabled: boolean) => {
        setError('');
        try {
            const settings = await api.updateAdminSettings({ localAuthEnabled: enabled });
            setLocalAuthEnabled(settings.localAuthEnabled);
            setNotice('Local authentication setting updated.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to update authentication settings.');
        }
    };

    if (isLoading) {
        return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>;
    }

    return (
        <div className="mx-auto w-full max-w-5xl space-y-6 p-6 md:p-10">
            <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">Admin / Authentication</p>
                <h1 className="mt-2 text-2xl font-semibold text-foreground">Authentication</h1>
                <p className="mt-1 text-sm text-muted-foreground">Define how people can enter the platform. Provider-specific settings live in their own section.</p>
            </div>

            {error && <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>Action failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Content></Alert>}
            {notice && <Alert status="success"><Alert.Indicator /><Alert.Content><Alert.Title>Saved</Alert.Title><Alert.Description>{notice}</Alert.Description></Alert.Content></Alert>}

            <Card>
                <Card.Header><Card.Title>Local authentication</Card.Title><Card.Description>Enable or disable the built-in email/password login and public signup together.</Card.Description></Card.Header>
                <Card.Content>
                    <Switch isSelected={localAuthEnabled} onChange={toggleLocalAuth}>
                        <Switch.Control><Switch.Thumb /></Switch.Control>
                        <Label>Enable local authentication</Label>
                    </Switch>
                    <p className="mt-2 text-xs text-muted-foreground">At least one active OIDC provider is required before local authentication can be disabled.</p>
                </Card.Content>
            </Card>

            <Card>
                <Card.Header>
                    <div className="flex items-start justify-between gap-4">
                        <div><Card.Title>OIDC providers</Card.Title><Card.Description>Organization SSO providers available to users.</Card.Description></div>
                        <ShieldCheck className="text-accent" size={19} />
                    </div>
                </Card.Header>
                <Card.Content>
                    <div className="flex items-center justify-between rounded-xl border border-border/70 p-4">
                        <div><p className="text-sm font-medium text-foreground">{providers.length} configured provider{providers.length === 1 ? '' : 's'}</p><p className="mt-1 text-xs text-muted-foreground">Secrets remain encrypted and are never displayed.</p></div>
                        <Button variant="secondary" onPress={() => router.push('/admin/authentication/providers')}>Manage providers <ArrowRight size={14} /></Button>
                    </div>
                    <div className="mt-3 flex gap-2"><Link href="/admin/authentication/providers/new" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"><Plus size={14} />Add provider</Link></div>
                </Card.Content>
            </Card>
        </div>
    );
}
