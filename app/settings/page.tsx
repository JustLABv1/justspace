'use client';

import { Button, Surface } from '@heroui/react';
import {
  Translation as Globe,
  Keyboard,
  MoneyBag,
  Palette,
  Settings as SettingsIcon,
  ShieldCheck,
  Restart as Update,
  User
} from '@solar-icons/react';
import { useState } from 'react';

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('General');

    const menuItems = [
        { id: 'General', label: 'General', icon: SettingsIcon },
        { id: 'User', label: 'Account', icon: User },
        { id: 'Appearance', label: 'Appearance', icon: Palette },
        { id: 'Financial', label: 'Financial', icon: MoneyBag },
        { id: 'Shortcuts', label: 'Shortcuts', icon: Keyboard },
    ];

    return (
        <div className="max-w-[1200px] mx-auto p-6 md:p-12 space-y-12">
            <header className="space-y-3">
                <div className="flex items-center gap-3 text-primary font-bold tracking-widest uppercase text-[10px]">
                    <SettingsIcon size={14} weight="Bold" className="animate-pulse" />
                    System Configuration
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
                    Settings
                </h1>
                <p className="text-muted-foreground font-medium">
                    Configure your workspace, security, and global defaults.
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-10 items-start">
                {/* Sidebar Navigation */}
                <div className="md:col-span-1 space-y-2">
                    {menuItems.map((item) => (
                        <button 
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl font-bold text-sm transition-all duration-300 ${
                                activeTab === item.id 
                                    ? 'bg-foreground text-background shadow-xl shadow-black/10' 
                                    : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                            }`}
                        >
                            <item.icon size={20} weight={activeTab === item.id ? "Bold" : "Linear"} />
                            {item.label}
                        </button>
                    ))}
                </div>

                {/* Main Settings Area */}
                <div className="md:col-span-3">
                    <Surface variant="secondary" className="p-10 rounded-[3rem] border border-border/40 bg-surface/50 backdrop-blur-md space-y-10">
                        {activeTab === 'General' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div>
                                    <h3 className="text-xl font-black tracking-tight mb-2">General Workspace</h3>
                                    <p className="text-xs text-muted-foreground">Global defaults for your consulting environment.</p>
                                </div>
                                
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Workspace Name</label>
                                        <input 
                                            className="w-full h-14 bg-surface rounded-2xl border border-border/50 px-5 font-bold outline-none focus:border-primary transition-all"
                                            defaultValue="Justin's Space"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Language</label>
                                            <div className="h-14 bg-surface rounded-2xl border border-border/50 flex items-center px-5 font-bold cursor-pointer group hover:border-primary transition-all">
                                                <Globe size={18} className="mr-3 text-primary" />
                                                <span>English (US)</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Timezone</label>
                                            <div className="h-14 bg-surface rounded-2xl border border-border/50 flex items-center px-5 font-bold cursor-pointer group hover:border-primary transition-all">
                                                <Globe size={18} className="mr-3 text-accent" />
                                                <span>Europe/Berlin (UTC+1)</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'Financial' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div>
                                    <h3 className="text-xl font-black tracking-tight mb-2">Financial Defaults</h3>
                                    <p className="text-xs text-muted-foreground">Configure your billing and pipeline calculations.</p>
                                </div>
                                
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Default Currency</label>
                                            <input 
                                                className="w-full h-14 bg-surface rounded-2xl border border-border/50 px-5 font-bold outline-none focus:border-primary transition-all"
                                                defaultValue="EUR (€)"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Standard Day Rate</label>
                                            <input 
                                                className="w-full h-14 bg-surface rounded-2xl border border-border/50 px-5 font-bold outline-none focus:border-primary transition-all"
                                                defaultValue="1.200"
                                            />
                                        </div>
                                    </div>

                                    <Surface variant="tertiary" className="p-6 rounded-2xl border border-border/40 bg-primary/5 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <ShieldCheck size={24} weight="Bold" className="text-primary" />
                                            <div>
                                                <p className="font-bold text-sm">Tax Compliance Mode</p>
                                                <p className="text-[11px] text-muted-foreground">Automatically calculate VAT/Sales Tax on forecasts.</p>
                                            </div>
                                        </div>
                                        <div className="w-12 h-6 bg-primary rounded-full relative flex items-center px-1 shadow-inner cursor-pointer">
                                            <div className="w-4 h-4 bg-white rounded-full ml-auto shadow-sm" />
                                        </div>
                                    </Surface>
                                </div>
                            </div>
                        )}

                        <div className="pt-8 flex justify-end gap-3 border-t border-border/20">
                            <Button variant="ghost" className="rounded-xl font-bold px-6">Discard</Button>
                            <Button variant="primary" className="rounded-xl font-black italic px-10 shadow-xl shadow-primary/20">
                                <Update size={18} weight="Bold" className="mr-2" />
                                Save Changes
                            </Button>
                        </div>
                    </Surface>
                </div>
            </div>
        </div>
    );
}

