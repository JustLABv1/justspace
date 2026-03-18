'use client';

import { Project } from '@/types';
import { Tooltip } from "@heroui/react";
import { Zap } from "lucide-react";

export function ResourceHeatmap({ projects }: { projects: Project[] }) {
    const activeProjects = projects.filter(p => p.status === 'in-progress');
    const totalDaysPerWeek = activeProjects.reduce((acc, p) => acc + (p.daysPerWeek || 0), 0);
    const loadPercentage = (totalDaysPerWeek / 5) * 100;
    
    const days = ['M', 'T', 'W', 'T', 'F'];
    const weeks = [1, 2, 3, 4];
    
    const getIntensityClass = (load: number) => {
        if (load === 0) return 'bg-surface-secondary';
        if (load <= 20) return 'bg-accent/20';
        if (load <= 50) return 'bg-accent/40';
        if (load <= 80) return 'bg-accent/70';
        if (load <= 100) return 'bg-accent';
        return 'bg-danger animate-pulse';
    };

    return (
        <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Capacity Load</h3>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${loadPercentage > 100 ? 'bg-danger-muted text-danger' : 'bg-surface-secondary text-muted-foreground'}`}>
                    <Zap size={13} />
                </div>
            </div>

            <div className="flex flex-col gap-1 mb-4">
                {weeks.map((week) => (
                    <div key={week} className="flex gap-1">
                        {days.map((day, dayIdx) => {
                            const variance = (Math.sin(week * dayIdx + week) + 1) / 2;
                            const adjustedLoad = loadPercentage * (0.8 + variance * 0.4);
                            
                            return (
                                <div key={`${week}-${dayIdx}`} className="flex-1">
                                    <Tooltip delay={0}>
                                        <Tooltip.Trigger className="w-full">
                                            <div 
                                                className={`w-full aspect-square rounded flex items-center justify-center transition-colors cursor-default ${getIntensityClass(loadPercentage > 0 ? adjustedLoad : 0)}`}
                                            />
                                        </Tooltip.Trigger>
                                        <Tooltip.Content offset={8}>
                                            <div className="px-2 py-1 text-xs">
                                                {day} W{week}: {adjustedLoad.toFixed(0)}%
                                            </div>
                                        </Tooltip.Content>
                                    </Tooltip>
                                </div>
                            );
                        })}
                    </div>
                ))}
                <div className="flex justify-between px-0.5 mt-1">
                    {days.map((d, i) => <span key={i} className="text-[10px] text-muted-foreground">{d}</span>)}
                </div>
            </div>

            <div className="flex justify-between items-end pt-3 border-t border-border">
                <div>
                    <p className="text-xl font-semibold tabular-nums">{totalDaysPerWeek.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">days / week</p>
                </div>
                <div className="text-right">
                    <p className={`text-xl font-semibold tabular-nums ${loadPercentage > 100 ? 'text-danger' : 'text-accent'}`}>
                        {loadPercentage.toFixed(0)}%
                    </p>
                    <p className="text-xs text-muted-foreground">utilization</p>
                </div>
            </div>
        </div>
    );
}
