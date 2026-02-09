'use client';

import { Project } from '@/types';
import { Surface, Tooltip } from "@heroui/react";
import { Bolt as Zap } from "@solar-icons/react";

export function ResourceHeatmap({ projects }: { projects: Project[] }) {
    const totalDaysPerWeek = projects.reduce((acc, p) => acc + (p.daysPerWeek || 0), 0);
    const loadPercentage = (totalDaysPerWeek / 5) * 100;
    
    const days = ['M', 'T', 'W', 'T', 'F'];
    const weeks = [1, 2, 3, 4]; // Simplified 4-week view
    
    // Intensity categories
    const getIntensityClass = (load: number) => {
        if (load === 0) return 'bg-foreground/5 text-muted-foreground/20';
        if (load <= 20) return 'bg-primary/20 text-primary/40';
        if (load <= 50) return 'bg-primary/40 text-primary/60';
        if (load <= 80) return 'bg-primary/70 text-white';
        if (load <= 100) return 'bg-primary text-white';
        return 'bg-danger text-white animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.4)]'; // Overbooked
    };

    return (
        <Surface className="p-8 rounded-[2rem] border border-border/40 bg-surface/50 backdrop-blur-2xl relative overflow-hidden group hover:border-primary/40 transition-all duration-700 hover:shadow-lg">
            <div className="relative z-10 flex flex-col">
                <header className="flex items-center justify-between mb-8">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                             <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-muted-foreground opacity-60">Pulse Telemetry</p>
                        </div>
                        <h3 className="text-xl font-bold tracking-tight">Capacity Load_</h3>
                    </div>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center border border-border/50 shadow-inner ${loadPercentage > 100 ? 'bg-danger/10 text-danger border-danger/20' : 'bg-foreground/5 text-foreground'}`}>
                        <Zap size={20} weight="Bold" className={loadPercentage > 100 ? 'animate-bounce' : ''} />
                    </div>
                </header>

                <div className="flex flex-col gap-1.5 mb-8 overflow-hidden">
                    {weeks.map((week) => (
                        <div key={week} className="flex gap-1.5">
                            {days.map((day, dayIdx) => {
                                // Add a bit of visual variation for the heatmap look
                                const variance = (Math.sin(week * dayIdx + week) + 1) / 2;
                                const adjustedLoad = loadPercentage * (0.8 + variance * 0.4);
                                
                                return (
                                    <div key={`${week}-${dayIdx}`} className="flex-1">
                                        <Tooltip delay={0}>
                                            <Tooltip.Trigger className="w-full">
                                                <div 
                                                    className={`w-full aspect-square rounded-lg flex items-center justify-center text-[9px] font-bold transition-all duration-500 cursor-default hover:scale-110 active:scale-95 shadow-sm border border-black/5 ${getIntensityClass(loadPercentage > 0 ? adjustedLoad : 0)}`}
                                                />
                                            </Tooltip.Trigger>
                                            <Tooltip.Content offset={10}>
                                                <div className="px-2 py-1 bg-foreground text-background rounded-lg font-bold text-[9px] tracking-widest leading-none">
                                                    {day} Index {week}: {adjustedLoad.toFixed(0)}% Load
                                                </div>
                                            </Tooltip.Content>
                                        </Tooltip>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                    <div className="flex justify-between px-1 mt-1 text-[9px] font-bold uppercase tracking-[0.3em] text-muted-foreground/30">
                        {days.map((d, i) => <span key={i}>{d}</span>)}
                    </div>
                </div>

                <div className="flex justify-between items-end border-t border-border/20 pt-6 mt-auto">
                    <div className="space-y-1">
                        <p className="text-3xl font-bold tracking-tighter tabular-nums leading-none">{totalDaysPerWeek.toFixed(1)}</p>
                        <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.2em] opacity-60">Allocated Days / Week</p>
                    </div>
                    <div className="text-right space-y-1">
                        <p className={`text-3xl font-bold tracking-tighter tabular-nums leading-none ${loadPercentage > 100 ? 'text-danger' : 'text-primary'}`}>
                            {loadPercentage.toFixed(0)}%
                        </p>
                        <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.2em] opacity-60">System Utilization</p>
                    </div>
                </div>
            </div>

            {/* Decorative background depth */}
            <div className="absolute -right-16 -top-16 w-48 h-48 bg-primary/5 blur-[80px] rounded-full opacity-50 pointer-events-none" />
        </Surface>
    );
}
