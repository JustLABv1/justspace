'use client';

import { Button, Surface, Switch } from '@heroui/react';
import { Bell, Cloud, Database, Lock, Moon, Palette, Shield, Sparkles, User } from 'lucide-react';
import { useState } from 'react';

export default function SettingsPage() {
    const [notifications, setNotifications] = useState(true);
    const [autoBackup, setAutoBackup] = useState(true);
    const [aiSync, setAiSync] = useState(false);

    return (
        <div className="max-w-[1000px] mx-auto p-6 md:p-10 space-y-10">
            <header className="space-y-2">
                <div className="flex items-center gap-3 text-primary font-bold tracking-widest uppercase text-[10px]">
                    <Shield size={14} className="animate-pulse" />
                    Global Configuration
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
                    System Settings
                </h1>
                <p className="text-muted-foreground font-medium">
                    Configure your workspace, security, and automated integrations.
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Sidebar Navigation */}
                <div className="space-y-1">
                    {[
                        { label: 'General', icon: Palette, active: true },
                        { label: 'Account', icon: User, active: false },
                        { label: 'Database', icon: Database, active: false },
                        { label: 'Security', icon: Lock, active: false },
                        { label: 'Integrations', icon: Cloud, active: false },
                    ].map((item) => (
                        <button 
                            key={item.label}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                                item.active 
                                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' 
                                    : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                            }`}
                        >
                            <item.icon size={18} />
                            {item.label}
                        </button>
                    ))}
                </div>

                {/* Main Settings Area */}
                <div className="md:col-span-2 space-y-8">
                    <section className="space-y-6">
                        <h3 className="text-lg font-black tracking-tight border-b border-border/20 pb-4">Personalization</h3>
                        
                        <div className="space-y-4">
                            <Surface variant="secondary" className="p-5 rounded-2xl border border-border/40 bg-surface/50 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-xl bg-primary/10 text-primary">
                                        <Bell size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm">Activity Notifications</p>
                                        <p className="text-xs text-muted-foreground">Get notified when tasks are completed.</p>
                                    </div>
                                </div>
                                <Switch isSelected={notifications} onChange={setNotifications} />
                            </Surface>

                            <Surface variant="secondary" className="p-5 rounded-2xl border border-border/40 bg-surface/50 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-xl bg-accent/10 text-accent">
                                        <Moon size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm">Automated Theme</p>
                                        <p className="text-xs text-muted-foreground">Follow system preference for light/dark mode.</p>
                                    </div>
                                </div>
                                <Switch isSelected={true} />
                            </Surface>
                        </div>
                    </section>

                    <section className="space-y-6">
                        <h3 className="text-lg font-black tracking-tight border-b border-border/20 pb-4">Consultant OS Features</h3>
                        
                        <div className="space-y-4">
                            <Surface variant="secondary" className="p-5 rounded-2xl border border-border/40 bg-surface/50 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-xl bg-success/10 text-success">
                                        <Cloud size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm">Automated Backups</p>
                                        <p className="text-xs text-muted-foreground">Sync your local data to Appwrite daily.</p>
                                    </div>
                                </div>
                                <Switch isSelected={autoBackup} onChange={setAutoBackup} />
                            </Surface>

                            <Surface variant="secondary" className="p-5 rounded-2xl border border-border/40 bg-surface/50 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-xl bg-warning/10 text-warning">
                                        <Sparkles size={20} className="text-warning" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm">AI-Powered Forecasting</p>
                                        <p className="text-xs text-muted-foreground">Let AI predict project delays based on velocity.</p>
                                    </div>
                                </div>
                                <Switch isSelected={aiSync} onChange={setAiSync} />
                            </Surface>
                        </div>
                    </section>

                    <div className="pt-6 flex justify-end gap-3">
                        <Button variant="secondary" className="rounded-xl font-bold">Discard Changes</Button>
                        <Button variant="primary" className="rounded-xl font-bold px-8 shadow-xl shadow-primary/20">Save Configuration</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
