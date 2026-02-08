'use client';

import { useAuth } from '@/context/AuthContext';
import { Button, Card, Form, Input, Label, TextField } from "@heroui/react";
import Link from 'next/link';
import React, { useState } from 'react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await login(email, password);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to login');
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-surface p-4">
            <Card className="w-full max-w-md p-8">
                <Card.Header className="flex flex-col gap-1 items-center mb-6">
                    <Card.Title className="text-2xl font-bold">Welcome Back</Card.Title>
                    <Card.Description>Login to your justspace account</Card.Description>
                </Card.Header>
                <Card.Content>
                    <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <TextField
                            name="email"
                            type="email"
                            value={email}
                            onChange={setEmail}
                            isRequired
                        >
                            <Label>Email</Label>
                            <Input placeholder="user@example.com" />
                        </TextField>
                        <TextField
                            name="password"
                            type="password"
                            value={password}
                            onChange={setPassword}
                            isRequired
                        >
                            <Label>Password</Label>
                            <Input placeholder="••••••••" />
                        </TextField>
                        {error && <p className="text-danger text-sm">{error}</p>}
                        <Button type="submit" variant="primary" fullWidth className="mt-2">
                            Login
                        </Button>
                    </Form>
                </Card.Content>
                <Card.Footer className="justify-center mt-4">
                    <p className="text-sm text-muted-foreground">
                        Don&apos;t have an account?{' '}
                        <Link href="/signup" className="text-primary font-semibold">
                            Sign Up
                        </Link>
                    </p>
                </Card.Footer>
            </Card>
        </div>
    );
}
