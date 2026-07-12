'use client';

import { Alert, Button, Card, Input, Label, Switch, TextField } from '@heroui/react';
import { api, OIDCProvider } from '@/services/frontend/lib/api';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type ProviderForm = {
    slug: string;
    name: string;
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
    enabled: boolean;
};

const emptyProvider: ProviderForm = { slug: '', name: '', issuerUrl: '', clientId: '', clientSecret: '', enabled: true };

export default function OIDCProviderForm({ providerId }: { providerId?: string }) {
    const router = useRouter();
    const [form, setForm] = useState<ProviderForm>(emptyProvider);
    const [provider, setProvider] = useState<OIDCProvider | null>(null);
    const [isLoading, setIsLoading] = useState(Boolean(providerId));
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!providerId) return;
        setIsLoading(true);
        try {
            const response = await api.getAdminSettings();
            const current = response.oidcProviders.find((item) => item.id === providerId);
            if (!current) {
                setError('OIDC provider not found.');
                return;
            }
            setProvider(current);
            setForm({ slug: current.slug, name: current.name, issuerUrl: current.issuerUrl, clientId: current.clientId, clientSecret: '', enabled: current.enabled });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load OIDC provider.');
        } finally {
            setIsLoading(false);
        }
    }, [providerId]);

    useEffect(() => {
        void load();
    }, [load]);

    const update = (key: keyof ProviderForm, value: string | boolean) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const save = async () => {
        setError('');
        setIsSaving(true);
        try {
            if (providerId) {
                await api.updateOIDCProvider(providerId, form);
            } else {
                await api.createOIDCProvider(form);
            }
            router.push('/admin/authentication/providers');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to save OIDC provider.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>;
    }

    return (
        <div className="mx-auto w-full max-w-3xl space-y-6 p-6 md:p-10">
            <div>
                <Button variant="ghost" size="sm" onPress={() => router.push('/admin/authentication/providers')}><ArrowLeft size={14} />Back to providers</Button>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-accent">Admin / Authentication / Providers</p>
                <h1 className="mt-2 text-2xl font-semibold text-foreground">{provider ? `Edit ${provider.name}` : 'Add OIDC provider'}</h1>
                <p className="mt-1 text-sm text-muted-foreground">The issuer is validated through OpenID Discovery before the provider is saved.</p>
            </div>

            {error && <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>Action failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Content></Alert>}

            <Card>
                <Card.Header><Card.Title>Provider details</Card.Title><Card.Description>Use the issuer URL from your OpenID Connect provider, for example a Keycloak realm or Authentik application issuer.</Card.Description></Card.Header>
                <Card.Content className="space-y-4">
                    <TextField><Label>Display name</Label><Input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Company SSO" /></TextField>
                    <TextField><Label>Slug</Label><Input value={form.slug} onChange={(event) => update('slug', event.target.value)} placeholder="company-sso" /><span className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens only.</span></TextField>
                    <TextField><Label>Issuer URL</Label><Input value={form.issuerUrl} onChange={(event) => update('issuerUrl', event.target.value)} placeholder="https://id.example.com/realms/main" /></TextField>
                    <TextField><Label>Client ID</Label><Input value={form.clientId} onChange={(event) => update('clientId', event.target.value)} /></TextField>
                    <TextField><Label>Client secret {provider && '(leave blank to keep current)'}</Label><Input type="password" value={form.clientSecret} onChange={(event) => update('clientSecret', event.target.value)} /></TextField>
                    <Switch isSelected={form.enabled} onChange={(value) => update('enabled', value)}><Switch.Control><Switch.Thumb /></Switch.Control><Label>Provider enabled</Label></Switch>
                </Card.Content>
                <Card.Footer className="justify-end gap-2"><Button variant="tertiary" onPress={() => router.push('/admin/authentication/providers')}>Cancel</Button><Button variant="primary" isPending={isSaving} onPress={() => void save()}><Save size={14} />Save provider</Button></Card.Footer>
            </Card>
        </div>
    );
}
