'use client';

import { useAuth } from '@/context/AuthContext';
import { Button, Form, Input, Label, Surface, TextField, toast } from "@heroui/react";
import {
    AltArrowRight as ArrowRight,
    Letter as Mail,
    ShieldCheck,
    StarsLine as Sparkles,
    UserCircle as User
} from "@solar-icons/react";
import { motion } from 'framer-motion';
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
            console.error('Signup error detailed:', err);
            const errorMessage = (err as any)?.message || ((err as any)?.response && typeof (err as any).response === 'object' ? (err as any).response.message : null) || 'Registration failed';
            setError(errorMessage);
            toast.danger('Enrollment failed', {
                description: errorMessage
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex overflow-hidden bg-background">
            {/* Left Side: Signup Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 order-2 lg:order-1 relative">
                {/* Mobile Identity */}
                <div className="absolute top-10 left-10 lg:hidden flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center text-background shadow-lg">
                        <span className="font-bold text-xl">J</span>
                    </div>
                    <span className="text-2xl font-bold tracking-tight">justspace_</span>
                </div>

                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="w-full max-w-[420px]"
                >
                    <div className="space-y-4 mb-10">
                        <div className="w-fit flex items-center gap-2 px-3 py-1 rounded-full bg-accent/5 text-accent text-[9px] font-bold uppercase tracking-[0.3em] border border-accent/10">
                            <ShieldCheck size={12} weight="Bold" />
                            Secure Enrollment
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">Create Identity_</h2>
                        <p className="text-muted-foreground text-sm font-medium opacity-60">Initialize your consultant profile within the OS.</p>
                    </div>

                    <Surface className="p-8 rounded-[2rem] border border-border/40 bg-surface/50 backdrop-blur-2xl shadow-sm">
                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="mb-6"
                            >
                                <div className="p-4 rounded-xl border border-danger/30 bg-danger/5 backdrop-blur-md">
                                    <div className="flex gap-3 items-center">
                                        <div className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
                                        <div className="flex flex-col">
                                            <span className="text-danger text-[10px] font-bold uppercase tracking-[0.2em]">Enrollment Error_</span>
                                            <span className="text-danger/90 text-xs font-semibold mt-0.5">{error}</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        <Form onSubmit={handleSubmit} className="space-y-4">

                            <TextField className="w-full">
                                <Label className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground ml-1 mb-2 block opacity-40">Full Designation</Label>
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 transition-colors group-focus-within:text-accent" size={18} weight="Bold" />
                                    <Input 
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Dominic Cobb" 
                                        className="w-full bg-surface-secondary/50 border-border/40 rounded-xl h-11 pl-12 font-bold tracking-tight focus:border-accent/50 transition-all shadow-inner text-sm"
                                        required
                                    />
                                </div>
                            </TextField>

                            <TextField className="w-full">
                                <Label className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground ml-1 mb-2 block opacity-40">Email Address</Label>
                                <div className="relative group">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 transition-colors group-focus-within:text-accent" size={18} weight="Bold" />
                                    <Input 
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="consultant@example.com" 
                                        className="w-full bg-surface-secondary/50 border-border/40 rounded-xl h-11 pl-12 font-bold tracking-tight focus:border-accent/50 transition-all shadow-inner text-sm"
                                        required
                                    />
                                </div>
                            </TextField>

                            <TextField className="w-full">
                                <Label className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground ml-1 mb-2 block opacity-40">Password</Label>
                                <div className="relative group">
                                    <Input 
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••" 
                                        className="w-full bg-surface-secondary/50 border-border/40 rounded-xl h-11 px-5 font-bold tracking-tight focus:border-accent/50 transition-all shadow-inner text-sm"
                                        required
                                    />
                                </div>
                            </TextField>

                            <div className="flex flex-col gap-6 pt-4">
                                <Button 
                                    type="submit" 
                                    variant="primary" 
                                    className="w-full h-12 rounded-xl font-bold uppercase text-xs shadow-2xl shadow-accent/20 tracking-widest"
                                    isPending={isLoading}
                                >
                                    Establish Identity
                                    <ArrowRight size={18} className="ml-2" weight="Bold" />
                                </Button>
                                
                                <p className="text-center text-xs font-medium text-muted-foreground">
                                    Already have a node?{' '}
                                    <Link href="/login" className="text-accent font-bold uppercase tracking-widest text-[10px] ml-1 hover:underline underline-offset-4">
                                        Authenticate
                                    </Link>
                                </p>
                            </div>
                        </Form>
                    </Surface>
                </motion.div>
            </div>

            {/* Right Side: Brand area */}
            <div className="hidden lg:flex lg:w-1/2 relative bg-surface items-center justify-center p-12 overflow-hidden border-l border-border/40 order-1 lg:order-2">
                <div className="absolute inset-0 bg-gradient-to-bl from-accent/5 via-transparent to-accent/5" />
                <div className="relative z-10 max-w-lg space-y-12">
                    <div className="flex items-center gap-4 text-foreground mb-8">
                        <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center text-background shadow-2xl shadow-black/10">
                            <span className="font-bold text-2xl mt-0.5 leading-none">J</span>
                        </div>
                        <span className="text-3xl font-bold tracking-tight">justspace_</span>
                    </div>
                    <h1 className="text-5xl font-bold tracking-tight leading-[0.9]">
                        The Master Console for <br/><span className="text-accent">Engineers.</span>
                    </h1>
                    <p className="text-lg text-muted-foreground font-medium leading-relaxed opacity-60">
                        Join the high-density environment optimized for professional consultants and solution architects.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4 pt-10">
                        <Surface className="p-6 rounded-2xl bg-foreground text-background border border-foreground relative overflow-hidden group shadow-2xl shadow-black/10">
                            <Sparkles size={24} weight="Bold" className="mb-4 text-accent" />
                            <h3 className="text-lg font-bold tracking-tight mb-1">Premium OS_</h3>
                            <p className="text-[11px] font-medium text-background/60 leading-snug">Designer UI built for high-performance engineers.</p>
                        </Surface>
                        <Surface className="p-6 rounded-2xl border border-border/40 bg-surface/50 backdrop-blur-2xl">
                            <ShieldCheck size={24} weight="Bold" className="mb-4 text-success" />
                            <h3 className="text-lg font-bold tracking-tight mb-1">Secured Node_</h3>
                            <p className="text-[11px] font-medium text-muted-foreground leading-snug">Encrypted identity and telemetry tracking.</p>
                        </Surface>
                    </div>
                </div>
            </div>
        </div>
    );
}