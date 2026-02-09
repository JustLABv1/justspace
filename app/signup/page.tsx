'use client';

import { useAuth } from '@/context/AuthContext';
import { Button, Form, Input, Label, Surface, TextField } from "@heroui/react";
import { motion } from 'framer-motion';
import { ArrowRight, Mail, ShieldCheck, Sparkles, User } from 'lucide-react';
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
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Registration failed');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex overflow-hidden bg-background font-sans">
            {/* Left Side: Signup Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 order-2 lg:order-1">
                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="w-full max-w-[420px]"
                >
                    <div className="mb-10 lg:hidden flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
                            <span className="font-black text-xl italic uppercase">J</span>
                        </div>
                        <span className="text-2xl font-black tracking-tighter">justspace</span>
                    </div>

                    <div className="space-y-2 mb-10 text-center lg:text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-widest">
                            <ShieldCheck size={12} />
                            Secure Enrollment
                        </div>
                        <h2 className="text-4xl font-extrabold tracking-tight">Create Identity.</h2>
                        <p className="text-muted-foreground font-medium">Join the elite network of technical consultants.</p>
                    </div>

                    <Surface variant="tertiary" className="p-8 rounded-[2.5rem] border border-border/40 bg-surface shadow-2xl shadow-black/5">
                        <Form onSubmit={handleSubmit} className="space-y-5">
                            <TextField
                                name="name"
                                value={name}
                                onChange={setName}
                                isRequired
                                className="w-full"
                            >
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 mb-2 block">Full Name</Label>
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors" size={18} />
                                    <Input 
                                        placeholder="Dominic Cobb" 
                                        className="h-14 rounded-2xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary pl-12 text-sm font-medium transition-all" 
                                    />
                                </div>
                            </TextField>

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
                                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors" size={18} />
                                    <Input 
                                        placeholder="••••••••" 
                                        className="h-14 rounded-2xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary pl-12 text-sm font-medium transition-all" 
                                    />
                                </div>
                            </TextField>

                            {error && (
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="bg-danger/10 text-danger text-[11px] font-bold p-3 rounded-xl border border-danger/20"
                                >
                                    {error}
                                </motion.div>
                            )}

                            <Button 
                                type="submit" 
                                variant="primary" 
                                isPending={isLoading}
                                className="w-full h-14 rounded-2xl font-bold uppercase tracking-widest shadow-xl shadow-primary/20 text-sm mt-2"
                            >
                                {isLoading ? 'Processing...' : 'Provision Account'}
                                {!isLoading && <ArrowRight size={18} className="ml-2" />}
                            </Button>
                        </Form>
                    </Surface>

                    <p className="text-center mt-10 text-sm font-bold text-muted-foreground">
                        Already qualified?{' '}
                        <Link href="/login" className="text-primary hover:underline underline-offset-4 decoration-2">
                            Secure Login
                        </Link>
                    </p>
                </motion.div>
            </div>

            {/* Right Side: Visual Content */}
            <div className="hidden lg:flex lg:w-1/2 relative bg-surface items-center justify-center p-12 overflow-hidden border-l border-border/40 order-2">
                <div className="absolute inset-0 bg-gradient-to-bl from-accent/5 via-transparent to-primary/5" />
                
                <motion.div 
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 20, repeat: Infinity }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-accent/5 rounded-full blur-[120px]"
                />

                <div className="relative z-10 max-w-lg space-y-10">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                    >
                        <div className="inline-flex py-1 px-3 rounded-md bg-foreground text-background text-[10px] font-black uppercase tracking-tighter">
                            New Version 3.4.0
                        </div>
                        <h1 className="text-6xl font-black tracking-tighter leading-[0.9]">
                            Scale with <br/><span className="text-accent italic">Confidence.</span>
                        </h1>
                        <p className="text-xl text-muted-foreground font-medium leading-relaxed">
                            Access unified dashboards, technical wikis, and automated project tracking designed for the modern architect.
                        </p>
                    </motion.div>

                    <div className="space-y-6">
                        {[
                            { title: 'Centralized Control', desc: 'One workspace for all client environments.', icon: <Sparkles size={20}/> },
                            { title: 'Knowledge Base', desc: 'Secure technical documentation at your fingertips.', icon: <ShieldCheck size={20}/> }
                        ].map((feature, i) => (
                            <motion.div 
                                key={i}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.6 + (i * 0.1) }}
                                className="flex gap-4 items-start"
                            >
                                <div className="w-10 h-10 rounded-xl bg-surface-secondary border border-border/40 flex items-center justify-center text-primary shrink-0">
                                    {feature.icon}
                                </div>
                                <div>
                                    <h4 className="font-black text-sm uppercase tracking-tight">{feature.title}</h4>
                                    <p className="text-sm text-muted-foreground font-medium">{feature.desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
