'use client';

import { Project } from '@/types';
import { Zap } from "lucide-react";

export function ResourceHeatmap({ projects }: { projects: Project[] }) {
    const activeProjects = projects.filter(p => p.status === 'in-progress' && (p.daysPerWeek || 0) > 0);
    const totalDaysPerWeek = activeProjects.reduce((acc, p) => acc + (p.daysPerWeek || 0), 0);
    const maxDays = 5;
    const loadPercentage = Math.round((totalDaysPerWeek / maxDays) * 100);
    const freeDays = Math.max(0, maxDays - totalDaysPerWeek);
    const isOverloaded = totalDaysPerWeek > maxDays;

    return (
        <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[13px] font-semibold text-foreground">Weekly Capacity</h3>
                <div className={`w-6 h-6 rounded-xl flex items-center justify-center ${isOverloaded ? 'bg-danger-muted text-danger' : 'bg-surface-secondary text-muted-foreground'}`}>
                    <Zap size={12} />
                </div>
            </div>

            {activeProjects.length === 0 ? (
                <p className="text-[12px] text-muted-foreground py-2">No active projects</p>
            ) : (
                <div className="space-y-2.5 mb-4">
                    {activeProjects.map(p => {
                        const pct = Math.min(100, ((p.daysPerWeek || 0) / maxDays) * 100);
                        return (
                            <div key={p.id} className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] text-foreground truncate max-w-[130px]">{p.name}</span>
                                    <span className="text-[11px] text-muted-foreground tabular-nums">{p.daysPerWeek}d/w</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-surface-secondary">
                                    <div
                                        className="h-full rounded-full bg-accent transition-all"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="pt-3 border-t border-border space-y-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Total allocated</span>
                    <span className={`text-[12px] font-medium tabular-nums ${isOverloaded ? 'text-danger' : 'text-foreground'}`}>
                        {totalDaysPerWeek.toFixed(1)} / {maxDays}d
                    </span>
                </div>
                <div className="h-2 rounded-full bg-surface-secondary overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${isOverloaded ? 'bg-danger' : 'bg-accent'}`}
                        style={{ width: `${Math.min(100, loadPercentage)}%` }}
                    />
                </div>
                <div className="flex justify-between">
                    <span className="text-[11px] text-muted-foreground">{loadPercentage}% utilized</span>
                    {isOverloaded ? (
                        <span className="text-[11px] text-danger">Over capacity</span>
                    ) : freeDays > 0 ? (
                        <span className="text-[11px] text-success">{freeDays.toFixed(1)}d free</span>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
