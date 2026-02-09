'use client';

import { Project } from '@/types';
import { Surface, Tooltip } from "@heroui/react";
import { Zap } from "lucide-react";

export function ResourceHeatmap({ projects }: { projects: Project[] }) {
    const totalDaysPerWeek = projects.reduce((acc, p) => acc + (p.daysPerWeek || 0), 0);
    const loadPercentage = (totalDaysPerWeek / 5) * 100;
    
    const days = ['M', 'T', 'W', 'T', 'F'];
    const weeks = [1, 2, 3, 4]; // Simplified 4-week view
    
    // Intensity categories
    const getIntensityClass = (load: number) => {
        if (load === 0) return 'bg-surface-secondary text-muted-foreground/20';
        if (load <= 20) return 'bg-primary/20 text-primary/40';
        if (load <= 50) return 'bg-primary/40 text-primary/60';
        if (load <= 80) return 'bg-primary/70 text-white';
        if (load <= 100) return 'bg-primary text-white';
        return 'bg-danger text-white animate-pulse'; // Overbooked
    };

    return (
        <Surface className="p-6 rounded-[2rem] border border-border/50 bg-surface relative overflow-hidden group hover:border-primary/30 transition-all duration-500 border-l-4 border-l-primary/50">
            <div className="relative z-10 flex flex-col">
                <header className="flex items-center justify-between mb-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Pulse Monitor</p>
                        </div>
                        <h3 className="text-lg font-black tracking-tighter">Capacity Load</h3>
                    </div>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${loadPercentage > 100 ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary shadow-inner shadow-primary/5'}`}>
                        <Zap size={18} className={loadPercentage > 100 ? 'animate-bounce' : ''} />
                    </div>
                </header>

                <div className="flex flex-col gap-1.5 mb-6 overflow-hidden">
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
                                                    className={`w-full aspect-square rounded-md flex items-center justify-center text-[10px] font-black transition-all duration-500 cursor-default hover:scale-105 active:scale-95 shadow-sm ${getIntensityClass(loadPercentage > 0 ? adjustedLoad : 0)}`}
                                                />
                                            </Tooltip.Trigger>
                                            <Tooltip.Content>
                                                <p className="text-xs font-bold">{day} - Week {week}: {adjustedLoad.toFixed(0)}% Projected Load</p>
                                            </Tooltip.Content>
                                        </Tooltip>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                    <div className="flex justify-between px-1 mt-1 text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground/30">
                        {days.map((d, i) => <span key={i}>{d}</span>)}
                    </div>
                </div>

                <div className="flex justify-between items-end border-t border-border/20 pt-6 mt-auto">
                    <div className="space-y-0.5">
                        <p className="text-2xl font-black tracking-tighter tabular-nums leading-none">{totalDaysPerWeek.toFixed(1)}</p>
                        <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">Days / week</p>
                    </div>
                    <div className="text-right space-y-0.5">
                        <p className={`text-xl font-black tracking-tighter tabular-nums leading-none ${loadPercentage > 100 ? 'text-danger' : 'text-primary'}`}>
                            {loadPercentage.toFixed(0)}%
                        </p>
                        <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">Utilization</p>
                    </div>
                </div>
            </div>

            {/* Decorative background */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        </Surface>
    );
}
