'use client';

import { useAuth } from '@/context/AuthContext';
import { Button, Form, Input, Label, Surface, TextField } from "@heroui/react";
import { motion } from 'framer-motion';
import { ArrowRight, Lock, Mail, Sparkles } from 'lucide-react';
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
            await login(email, password);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid credentials');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex overflow-hidden bg-background">
            {/* Left Side: Aesthetic brand area */}
            <div className="hidden lg:flex lg:w-1/2 relative bg-surface items-center justify-center p-12 overflow-hidden border-r border-border/40">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
                
                {/* Animated background elements */}
                <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
                    className="absolute -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl"
                />
                <motion.div 
                    animate={{ rotate: -360 }}
                    transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                    className="absolute -bottom-32 -right-32 w-[30rem] h-[30rem] bg-accent/5 rounded-full blur-3xl"
                />

                <div className="relative z-10 max-w-lg space-y-8">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-2"
                    >
                        <div className="flex items-center gap-3 text-primary mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shadow-2xl shadow-primary/20">
                                <span className="font-black text-2xl italic">J</span>
                            </div>
                            <span className="text-3xl font-black tracking-tighter">justspace</span>
                        </div>
                        <h1 className="text-6xl font-black tracking-tighter leading-[0.9]">
                            Elevate your <span className="text-primary italic">workflow.</span>
                        </h1>
                        <p className="text-xl text-muted-foreground font-medium leading-relaxed pt-4">
                            The comprehensive portal for technical consultants to track projects, 
                            manage infrastructure, and document deployments.
                        </p>
                    </motion.div>

                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="grid grid-cols-2 gap-4 pt-8"
                    >
                        {[
                            { label: 'Project Tracking', icon: '01' },
                            { label: 'Cloud Templates', icon: '02' },
                            { label: 'Wiki Engine', icon: '03' },
                            { label: 'Time Logs', icon: '04' }
                        ].map((item) => (
                            <Surface key={item.label} variant="secondary" className="p-4 rounded-2xl border border-border/40 flex flex-col gap-2 bg-surface/50 backdrop-blur-sm">
                                <span className="text-[10px] font-black text-primary uppercase tracking-widest">{item.icon}</span>
                                <span className="font-bold tracking-tight">{item.label}</span>
                            </Surface>
                        ))}
                    </motion.div>
                </div>
            </div>

            {/* Right Side: Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12">
                <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="w-full max-w-[420px]"
                >
                    <div className="mb-10 lg:hidden flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
                            <span className="font-black text-xl italic uppercase">J</span>
                        </div>
                        <span className="text-2xl font-black tracking-tighter">justspace</span>
                    </div>

                    <div className="space-y-2 mb-10">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest">
                            <Sparkles size={12} />
                            Access Granted
                        </div>
                        <h2 className="text-4xl font-extrabold tracking-tight">Welcome Back.</h2>
                        <p className="text-muted-foreground font-medium">Please enter your credentials to initiate session.</p>
                    </div>

                    <Surface variant="tertiary" className="p-8 rounded-[2.5rem] border border-border/40 bg-surface shadow-2xl shadow-black/5">
                        <Form onSubmit={handleSubmit} className="space-y-6">
                            <TextField
                                name="email"
                                type="email"
                                value={email}
                                onChange={setEmail}
                                isRequired
                                className="w-full"
                            >
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 mb-2 block">Company Email</Label>
                                <div className="relative group">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors" size={18} />
                                    <Input 
                                        placeholder="consultant@justlab.io" 
                                        className="h-14 rounded-2xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary pl-12 text-sm font-medium transition-all" 
                                    />
                                </div>
                            </TextField>

                            <TextField
                                name="password"
                                type="password"
                                value={password}
                                onChange={setPassword}
                                isRequired
                                className="w-full"
                            >
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 mb-2 block">Password</Label>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors" size={18} />
                                    <Input 
                                        placeholder="••••••••" 
                                        className="h-14 rounded-2xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary pl-12 text-sm font-medium transition-all" 
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                        <Link 
                                            href="#" 
                                            className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 hover:text-primary transition-colors py-1 py-2 px-1"
                                        >
                                            Forgot?
                                        </Link>
                                    </div>
                                </div>
                            </TextField>

                            {error && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="bg-danger/10 text-danger text-[11px] font-bold p-3 rounded-xl border border-danger/20"
                                >
                                    {error}
                                </motion.div>
                            )}

                            <Button 
                                type="submit" 
                                variant="primary" 
                                isPending={isLoading}
                                className="w-full h-14 rounded-2xl font-bold uppercase tracking-widest shadow-xl shadow-primary/20 text-sm"
                            >
                                {isLoading ? 'Authenticating...' : 'Sign In'}
                                {!isLoading && <ArrowRight size={18} className="ml-2" />}
                            </Button>
                        </Form>
                    </Surface>

                    <p className="text-center mt-10 text-sm font-bold text-muted-foreground">
                        Not a member yet?{' '}
                        <Link href="/signup" className="text-primary hover:underline underline-offset-4 decoration-2">
                            Request Access
                        </Link>
                    </p>
                </motion.div>
            </div>
        </div>
    );
}
