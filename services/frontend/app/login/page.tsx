'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { useBranding } from '@/services/frontend/context/BrandingContext';
import { AuthShell } from '@/components/AuthShell';
import { api, AuthConfig } from '@/services/frontend/lib/api';
import { Alert, Button, Card, Form, InputGroup, Label, TextField, toast } from "@heroui/react";
import { ArrowRight, Lock, Mail, ShieldCheck } from "lucide-react";
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
    const { login } = useAuth();
    const { branding } = useBranding();

    useEffect(() => {
        api.getAuthConfig().then(setAuthConfig).catch(() => setAuthConfig({ localAuthEnabled: true, oidcProviders: [] }));
        const oidcError = new URLSearchParams(window.location.search).get('oidcError');
        if (oidcError) setError(oidcError);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        
        try {
            await login(email, password);
            toast.success('Access granted', {
                description: 'Authentication successful.'
            });
        } catch (err: unknown) {
            const e = err as { message?: string; response?: { message?: string } };
            const msg = e?.message || e?.response?.message || 'Authentication failed. Please check your credentials.';
            setError(msg);
            toast.danger('Authentication failed', {
                description: msg
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthShell>
            <div className="w-full max-w-[430px]">
                <div className="mb-8">
                    <div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-accent-muted text-accent"><ShieldCheck className="size-5" /></div>
                    <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">Welcome back</h1>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in to continue to your secure {branding.name} workspace.</p>
                </div>

                <Card className="auth-form-card">
                    <Card.Content className="p-0">

                    {error && (
                        <Alert status="danger" className="mb-5"><Alert.Content><Alert.Description>{error}</Alert.Description></Alert.Content></Alert>
                    )}

                    {authConfig?.localAuthEnabled !== false && <Form onSubmit={handleSubmit} className="space-y-4">
                        <TextField className="w-full" value={email} onChange={setEmail}>
                            <Label>Email address</Label>
                            <InputGroup>
                                <InputGroup.Prefix><Mail className="size-4 text-muted-foreground" /></InputGroup.Prefix>
                                <InputGroup.Input
                                    type="email"
                                    placeholder="you@example.com"
                                    required
                                />
                            </InputGroup>
                        </TextField>

                        <TextField className="w-full" value={password} onChange={setPassword}>
                            <Label>Password</Label>
                            <InputGroup>
                                <InputGroup.Prefix><Lock className="size-4 text-muted-foreground" /></InputGroup.Prefix>
                                <InputGroup.Input
                                    type="password"
                                    placeholder="••••••••"
                                    required
                                />
                            </InputGroup>
                        </TextField>

                        <Button
                            type="submit"
                            variant="primary"
                            fullWidth
                            className="mt-2 h-11 rounded-xl font-medium"
                            isPending={isLoading}
                        >
                            Sign in
                            <ArrowRight size={15} className="ml-1" />
                        </Button>
                    </Form>}

                    {authConfig && authConfig.oidcProviders.length > 0 && (
                        <div className="mt-6 space-y-3">
                            {authConfig.localAuthEnabled && <div className="flex items-center gap-3 text-[11px] text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>}
                            {authConfig.oidcProviders.map((provider) => (
                                <Button key={provider.id} variant="secondary" className="w-full h-10 rounded-xl text-sm" onPress={() => { window.location.href = api.getOIDCStartURL(provider.slug); }}>
                                    Continue with {provider.name}
                                </Button>
                            ))}
                        </div>
                    )}

                    {authConfig && !authConfig.localAuthEnabled && authConfig.oidcProviders.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center">No authentication method is currently enabled.</p>
                    )}
                    </Card.Content>
                </Card>

                {authConfig?.localAuthEnabled !== false && <p className="text-center text-sm text-muted-foreground mt-5">
                    Don&apos;t have an account?{' '}
                    <Link href="/signup" className="text-accent font-medium hover:underline underline-offset-4">
                        Sign up
                    </Link>
                </p>}
            </div>
        </AuthShell>
    );
}
