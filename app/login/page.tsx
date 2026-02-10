'use client';

import { useAuth } from '@/context/AuthContext';
import { Button, Form, Input, Label, Surface, TextField, toast } from "@heroui/react";
import {
    AltArrowRight as ArrowRight,
    PasswordMinimalistic as Lock,
    Letter as Mail
} from "@solar-icons/react";
import { motion } from 'framer-motion';
import Link from 'next/link';
import React, { useState } from 'react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        
        try {
            console.log('Initiating login for:', email);
            await login(email, password);
            toast.success('Access granted', {
                description: 'Authentication successful.'
            });
        } catch (err: unknown) {
            console.error('Login caught error:', err);
            // Appwrite error messages are typically in err.message
            // We also check err.response?.message as a fallback
            const msg = (err as any)?.message || (err as any)?.response?.message || 'Authentication failed. Please check your credentials.';
            setError(msg);
            toast.danger('Authentication failed', {
                description: msg
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex overflow-hidden bg-background">
            {/* Left Side: Aesthetic brand area */}
            <div className="hidden lg:flex lg:w-1/2 relative bg-surface items-center justify-center p-12 overflow-hidden border-r border-border/40">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-accent/5" />
                
                {/* Animated background elements */}
                <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
                    className="absolute -top-24 -left-24 w-96 h-96 bg-accent/5 rounded-full blur-3xl opacity-40"
                />
                <motion.div 
                    animate={{ rotate: -360 }}
                    transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                    className="absolute -bottom-32 -right-32 w-[30rem] h-[30rem] bg-accent/5 rounded-full blur-3xl opacity-40"
                />

                <div className="relative z-10 max-w-lg space-y-12">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                    >
                        <div className="flex items-center gap-4 text-foreground mb-8">
                            <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center text-background shadow-2xl shadow-black/10">
                                <span className="font-bold text-2xl mt-0.5 leading-none">J</span>
                            </div>
                            <span className="text-3xl font-bold tracking-tight">justspace_</span>
                        </div>
                        <h1 className="text-5xl font-bold tracking-tight leading-[0.9]">
                            Elevate your <br/><span className="text-accent">Workflow.</span>
                        </h1>
                        <p className="text-lg text-muted-foreground font-medium leading-relaxed pt-6 opacity-60">
                            The professional platform for technical consultants to manage projects, 
                            documentation, and standard implementations.
                        </p>
                    </motion.div>

                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="grid grid-cols-2 gap-6 pt-10"
                    >
                        {[
                            { label: 'Project Pipeline', icon: 'UNIT-01' },
                            { label: 'Cloud Storage', icon: 'UNIT-02' },
                            { label: 'Standard Guides', icon: 'UNIT-03' },
                            { label: 'Activity Logs', icon: 'UNIT-04' }
                        ].map((item) => (
                            <Surface key={item.label} variant="secondary" className="p-4 rounded-2xl border border-border/40 flex flex-col gap-2 bg-surface/50 backdrop-blur-2xl shadow-sm">
                                <span className="text-[10px] font-bold text-accent uppercase tracking-[0.4em] opacity-40">{item.icon}</span>
                                <span className="font-bold tracking-tight text-[12px]">{item.label}_</span>
                            </Surface>
                        ))}
                    </motion.div>
                </div>
            </div>

            {/* Right Side: Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 relative">
                {/* Mobile Identity */}
                <div className="absolute top-10 left-10 lg:hidden flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center text-background shadow-lg">
                        <span className="font-bold text-xl">J</span>
                    </div>
                    <span className="text-2xl font-bold tracking-tight">justspace_</span>
                </div>

                <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="w-full max-w-[420px]"
                >
                    <div className="space-y-3 mb-10">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">Identity Check_</h2>
                        <p className="text-muted-foreground text-sm font-medium opacity-60">Authenticate to gain access to the OS core.</p>
                    </div>

                    {error && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="mb-8"
                        >
                            <Surface className="p-4 rounded-xl border border-danger/30 bg-danger/5 backdrop-blur-md">
                                <div className="flex gap-3 items-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
                                    <div className="flex flex-col">
                                        <span className="text-danger text-[10px] font-bold uppercase tracking-[0.2em]">Authentication Error_</span>
                                        <span className="text-danger/90 text-xs font-semibold mt-0.5">{error}</span>
                                    </div>
                                </div>
                            </Surface>
                        </motion.div>
                    )}

                    <Form onSubmit={handleSubmit} className="space-y-6">
                        
                        <div className="space-y-4">
                            <TextField className="w-full">
                                <Label className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground ml-1 mb-2 block opacity-40">Account Email</Label>
                                <div className="relative group">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 transition-colors group-focus-within:text-accent" size={18} weight="Bold" />
                                    <Input 
                                        type="email" 
                                        value={email} 
                                        onChange={(e) => setEmail(e.target.value)} 
                                        placeholder="user@example.com"
                                        className="w-full bg-surface-secondary/50 border-border/40 rounded-xl h-12 pl-12 font-bold tracking-tight focus:border-accent/50 transition-all shadow-inner text-sm"
                                        required
                                    />
                                </div>
                            </TextField>

                            <TextField className="w-full">
                                <Label className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground ml-1 mb-2 block opacity-40">System Password</Label>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 transition-colors group-focus-within:text-accent" size={18} weight="Bold" />
                                    <Input 
                                        type="password" 
                                        value={password} 
                                        onChange={(e) => setPassword(e.target.value)} 
                                        placeholder="••••••••"
                                        className="w-full bg-surface-secondary/50 border-border/40 rounded-xl h-12 pl-12 font-bold tracking-tight focus:border-accent/50 transition-all shadow-inner text-sm"
                                        required
                                    />
                                </div>
                            </TextField>
                        </div>

                        <div className="flex flex-col gap-6 pt-2">
                            <Button 
                                type="submit" 
                                variant="primary" 
                                className="w-full h-12 rounded-xl font-bold uppercase text-xs shadow-2xl shadow-accent/20 tracking-widest"
                                isPending={isLoading}
                            >
                                Synchronize Credentials
                                <ArrowRight size={18} className="ml-2" weight="Bold" />
                            </Button>
                            
                            <p className="text-center text-xs font-medium text-muted-foreground">
                                Domain unauthorized?{' '}
                                <Link href="/signup" className="text-accent font-bold uppercase tracking-widest text-[10px] ml-1 hover:underline underline-offset-4">
                                    Initialize Identity
                                </Link>
                            </p>
                        </div>
                    </Form>
                </motion.div>
            </div>
        </div>
    );
}