'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { Button, Form, Input, Label, TextField, toast } from "@heroui/react";
import { ArrowRight, Lock, Mail, User } from "lucide-react";
import Link from 'next/link';
import React, { useState } from 'react';

export default function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { signup } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await signup(email, password, name);
            toast.success('Account created', {
                description: 'Welcome to justspace.'
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
        <div className="min-h-screen flex items-center justify-center bg-muted p-4">
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="flex justify-center mb-8">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-accent-foreground">
                            <span className="font-bold text-sm leading-none">J</span>
                        </div>
                        <span className="font-semibold text-lg text-foreground">justspace</span>
                    </div>
                </div>

                {/* Card */}
                <div className="bg-surface rounded-2xl border border-border p-8 shadow-sm">
                    <div className="mb-6">
                        <h1 className="text-xl font-semibold text-foreground">Create an account</h1>
                        <p className="text-sm text-muted-foreground mt-1">Get started with justspace today.</p>
                    </div>

                    {error && (
                        <div className="mb-5 p-3 rounded-xl bg-danger-muted border border-danger/20 text-danger text-sm">
                            {error}
                        </div>
                    )}

                    <Form onSubmit={handleSubmit} className="space-y-4">
                        <TextField className="w-full">
                            <Label className="text-sm font-medium text-foreground mb-1.5 block">Full name</Label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Jane Smith"
                                    className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-background text-sm"
                                    required
                                />
                            </div>
                        </TextField>

                        <TextField className="w-full">
                            <Label className="text-sm font-medium text-foreground mb-1.5 block">Email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-background text-sm"
                                    required
                                />
                            </div>
                        </TextField>

                        <TextField className="w-full">
                            <Label className="text-sm font-medium text-foreground mb-1.5 block">Password</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-background text-sm"
                                    required
                                />
                            </div>
                        </TextField>

                        <Button
                            type="submit"
                            variant="primary"
                            className="w-full h-10 rounded-xl font-medium text-sm mt-1"
                            isPending={isLoading}
                        >
                            Create account
                            <ArrowRight size={15} className="ml-1" />
                        </Button>
                    </Form>
                </div>

                <p className="text-center text-sm text-muted-foreground mt-5">
                    Already have an account?{' '}
                    <Link href="/login" className="text-accent font-medium hover:underline underline-offset-4">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
