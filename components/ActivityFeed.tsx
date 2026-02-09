'use client';

import { db } from "@/lib/db";
import { ActivityLog } from "@/types";
import { Button, Spinner, Surface } from "@heroui/react";
import {
    History as Activity,
    CheckCircle,
    ClockCircle as Clock,
    Document as FileText,
    Play as PlayIcon,
    AddCircle as PlusCircle,
    Restart as RefreshCw,
    TrashBinMinimalistic as Trash2
} from "@solar-icons/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useCallback, useEffect, useState } from "react";

dayjs.extend(relativeTime);

export function ActivityFeed() {
    const [activities, setActivities] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchActivity = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        else setRefreshing(true);
        try {
            const res = await db.listActivity();
            if (res) {
                setActivities(res.documents);
            }
        } catch (e) {
            console.error('Activity Feed Error:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchActivity();
        
        // Auto-refresh every 30 seconds
        const interval = setInterval(() => fetchActivity(true), 30000);
        return () => clearInterval(interval);
    }, [fetchActivity]);

    if (loading) {
        return (
            <Surface variant="secondary" className="p-8 rounded-[2rem] border border-border/50 h-full flex flex-col items-center justify-center space-y-4">
                <Spinner size="lg" color="accent" />
                <div className="text-muted-foreground font-medium animate-pulse">Syncing activities...</div>
            </Surface>
        );
    }

    const getIcon = (type: string) => {
        switch (type) {
            case 'create': return <PlusCircle size={14} weight="Bold" className="text-accent" />;
            case 'complete': return <CheckCircle size={14} weight="Bold" className="text-success" />;
            case 'update': return <FileText size={14} weight="Bold" className="text-primary" />;
            case 'delete': return <Trash2 size={14} weight="Bold" className="text-danger" />;
            case 'work': return <PlayIcon size={14} weight="Bold" className="text-warning" />;
            default: return <Activity size={14} weight="Bold" className="text-muted-foreground" />;
        }
    };

    const getActionText = (type: string) => {
        switch (type) {
            case 'create': return 'Created';
            case 'complete': return 'Completed';
            case 'delete': return 'Deleted';
            case 'update': return 'Modified';
            case 'work': return 'Logged';
            default: return 'Updated';
        }
    };

    const formatName = (name: string) => {
        if (name.startsWith('{"iv":') || name.startsWith('{"ciphertext":')) return '🔒 Protected Logic Fragment';
        return name;
    };

    return (
        <Surface variant="secondary" className="p-6 rounded-[2rem] border border-border/40 h-full flex flex-col bg-surface shadow-sm backdrop-blur-2xl">
            <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-xl flex items-center gap-3 tracking-tight">
                    <div className="w-10 h-10 rounded-xl bg-foreground/5 border border-border/50 flex items-center justify-center text-foreground/80 shadow-inner">
                        <Activity size={20} weight="Bold" />
                    </div>
                    Activity Feed_
                </h3>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onPress={() => fetchActivity(true)}
                    className="h-8 w-8 p-0 rounded-lg hover:bg-foreground/5 transition-all opacity-50 hover:opacity-100"
                    isPending={refreshing}
                >
                    <RefreshCw size={16} weight="Bold" className={refreshing ? 'animate-spin text-primary' : ''} />
                </Button>
            </div>

            <div className="flex-1 space-y-10 overflow-y-auto pr-4 custom-scrollbar">
                {activities.length === 0 ? (
                    <div className="text-center py-20 flex flex-col items-center justify-center space-y-6">
                        <div className="w-20 h-20 rounded-[2rem] bg-foreground/5 flex items-center justify-center text-muted-foreground/30 border border-border/30 border-dashed animate-pulse">
                            <Activity size={40} weight="Linear" />
                        </div>
                        <p className="text-muted-foreground font-bold uppercase tracking-[0.3em] text-[10px] opacity-40">Zero active telemetry records.</p>
                    </div>
                ) : (
                    activities.map((activity, idx) => (
                        <div key={activity.$id} className="relative pl-12 group">
                            {/* Connection Line */}
                            {idx !== activities.length - 1 && (
                                <div className="absolute left-[19px] top-10 bottom-[-40px] w-[2px] bg-gradient-to-b from-border/50 to-transparent" />
                            )}
                            
                            {/* Icon Container */}
                            <div className="absolute left-0 top-0.5 w-10 h-10 rounded-2xl bg-surface-secondary border border-border/50 flex items-center justify-center z-10 group-hover:border-primary/50 transition-all duration-500 shadow-sm group-hover:scale-110">
                                {getIcon(activity.type)}
                            </div>

                            <div className="flex flex-col space-y-2">
                                <div className="text-base leading-tight">
                                    <span className="font-bold text-foreground text-[10px] tracking-widest opacity-60 uppercase">
                                        {getActionText(activity.type)}
                                    </span>
                                    <span className="text-muted-foreground mx-2 font-bold text-[10px] tracking-widest opacity-40 uppercase">
                                        {activity.type === 'work' ? 'time on' : activity.entityType.toLowerCase()}
                                    </span>
                                    <span className="font-bold text-foreground truncate inline-block max-w-[200px] align-bottom tracking-tight text-sm">
                                        {formatName(activity.entityName)}
                                    </span>
                                </div>
                                {activity.metadata && (
                                    <div className="text-[10px] font-bold text-primary tracking-widest flex items-center gap-2 py-1 bg-primary/5 px-3 rounded-lg w-fit border border-primary/10 uppercase">
                                        <Clock size={12} weight="Bold" />
                                        {activity.metadata}
                                    </div>
                                )}
                                <div className="flex items-center gap-4 text-[10px] font-bold tracking-[0.2em] text-muted-foreground/40">
                                    <span className="flex items-center gap-1.5 hover:text-foreground transition-colors uppercase">
                                        <Clock size={12} weight="Bold" />
                                        {dayjs(activity.$createdAt).fromNow()}
                                    </span>
                                    {activity.projectId && (
                                        <span className="bg-foreground/5 px-2 py-0.5 rounded border border-border/30 uppercase">
                                            SEGMENT: {activity.projectId.substring(0, 8)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            <div className="mt-10 pt-8 border-t border-border/20">
                <p className="text-xs font-black text-center text-muted-foreground uppercase tracking-[0.4em] opacity-30">
                    Telemetry Stream: Operational // Live Sync Active
                </p>
            </div>
        </Surface>
    );
}
