'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { AuthShell } from '@/components/AuthShell';
import { api, AuthConfig } from '@/services/frontend/lib/api';
import { Alert, Button, Card, Form, InputGroup, Label, TextField, toast } from "@heroui/react";
import { ArrowRight, Lock, Mail, ShieldCheck, User } from "lucide-react";
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

export default function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
    const { signup } = useAuth();

    useEffect(() => {
        api.getAuthConfig().then(setAuthConfig).catch(() => setAuthConfig({ localAuthEnabled: true, oidcProviders: [] }));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await signup(email, password, name);
            toast.success('Account created', {
                description: 'Next step: create your vault to enable encrypted workspace data.'
            });
        } catch (err: unknown) {
            const e = err as { message?: string; response?: { message?: string } };
            const errorMessage = e?.message || e?.response?.message || 'Registration failed';
            setError(errorMessage);
            toast.danger('Enrollment failed', {
                description: errorMessage
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthShell>
            <div className="w-full max-w-[430px]">
                <div className="mb-7">
                    <div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-accent-muted text-accent"><ShieldCheck className="size-5" /></div>
                    <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">Create your account</h1>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">Start planning securely. Your private vault is created right after signup.</p>
                </div>

                <Card className="auth-form-card">
                    <Card.Content className="p-0">

                    {error && (
                        <Alert status="danger" className="mb-5"><Alert.Content><Alert.Description>{error}</Alert.Description></Alert.Content></Alert>
                    )}

                    {authConfig?.localAuthEnabled !== false && <Form onSubmit={handleSubmit} className="space-y-4">
                        <TextField className="w-full" value={name} onChange={setName}>
                            <Label>Full name</Label>
                            <InputGroup><InputGroup.Prefix><User className="size-4 text-muted-foreground" /></InputGroup.Prefix><InputGroup.Input
                                    placeholder="Jane Smith"
                                    required
                                /></InputGroup>
                        </TextField>

                        <TextField className="w-full" value={email} onChange={setEmail}>
                            <Label>Email address</Label>
                            <InputGroup><InputGroup.Prefix><Mail className="size-4 text-muted-foreground" /></InputGroup.Prefix><InputGroup.Input
                                    type="email"
                                    placeholder="you@example.com"
                                    required
                                /></InputGroup>
                        </TextField>

                        <TextField className="w-full" value={password} onChange={setPassword}>
                            <Label>Password</Label>
                            <InputGroup><InputGroup.Prefix><Lock className="size-4 text-muted-foreground" /></InputGroup.Prefix><InputGroup.Input
                                    type="password"
                                    placeholder="••••••••"
                                    required
                                /></InputGroup>
                        </TextField>

                        <Button
                            type="submit"
                            variant="primary"
                            fullWidth
                            className="mt-2 h-11 rounded-xl font-medium"
                            isPending={isLoading}
                        >
                            Create account
                            <ArrowRight size={15} className="ml-1" />
                        </Button>
                    </Form>}

                    {authConfig && authConfig.oidcProviders.length > 0 && (
                        <div className="mt-6 space-y-3">
                            {authConfig.localAuthEnabled && <div className="flex items-center gap-3 text-[11px] text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>}
                            <p className="text-xs text-muted-foreground text-center">Create an account with your organization</p>
                            {authConfig.oidcProviders.map((provider) => (
                                <Button key={provider.id} variant="secondary" className="w-full h-10 rounded-xl text-sm" onPress={() => { window.location.href = api.getOIDCStartURL(provider.slug); }}>
                                    Continue with {provider.name}
                                </Button>
                            ))}
                        </div>
                    )}
                    </Card.Content>
                </Card>

                <p className="text-center text-sm text-muted-foreground mt-5">
                    Already have an account?{' '}
                    <Link href="/login" className="text-accent font-medium hover:underline underline-offset-4">
                        Sign in
                    </Link>
                </p>
            </div>
        </AuthShell>
    );
}
