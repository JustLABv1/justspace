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
                <Spinner size="lg" color="primary" />
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

    return (
        <Surface variant="secondary" className="p-8 rounded-[2rem] border border-border/50 h-full flex flex-col bg-surface shadow-sm">
            <div className="flex items-center justify-between mb-8">
                <h3 className="font-black text-xl flex items-center gap-3 tracking-tight">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                        <Activity size={20} weight="Bold" />
                    </div>
                    Activity Feed
                </h3>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onPress={() => fetchActivity(true)}
                    className="h-9 w-9 p-0 rounded-xl hover:bg-surface-tertiary transition-all"
                    isPending={refreshing}
                >
                    <RefreshCw size={16} weight="Linear" className={refreshing ? 'animate-spin' : ''} />
                </Button>
            </div>

            <div className="flex-1 space-y-8 overflow-y-auto pr-2 custom-scrollbar">
                {activities.length === 0 ? (
                    <div className="text-center py-20 flex flex-col items-center justify-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-surface-secondary flex items-center justify-center text-muted-foreground/30">
                            <Activity size={32} weight="Linear" />
                        </div>
                        <p className="text-muted-foreground font-medium">No recent activity found.</p>
                    </div>
                ) : (
                    activities.map((activity, idx) => (
                        <div key={activity.$id} className="relative pl-10 group">
                            {/* Connection Line */}
                            {idx !== activities.length - 1 && (
                                <div className="absolute left-[15px] top-8 bottom-[-32px] w-[2px] bg-gradient-to-b from-border/50 to-transparent" />
                            )}
                            
                            {/* Icon Container */}
                            <div className="absolute left-0 top-0.5 w-8 h-8 rounded-xl bg-surface-secondary border border-border/50 flex items-center justify-center z-10 group-hover:border-primary/50 transition-colors shadow-sm">
                                {getIcon(activity.type)}
                            </div>

                            <div className="flex flex-col space-y-1">
                                <div className="text-sm leading-tight">
                                    <span className="font-bold text-foreground">
                                        {getActionText(activity.type)}
                                    </span>
                                    <span className="text-muted-foreground mx-1.5 font-medium">
                                        {activity.type === 'work' ? 'time on' : activity.entityType.toLowerCase()}
                                    </span>
                                    <span className="font-bold text-foreground truncate inline-block max-w-[180px] align-bottom">
                                        {activity.entityName}
                                    </span>
                                </div>
                                {activity.metadata && (
                                    <div className="text-[11px] font-bold text-primary flex items-center gap-1.5 py-0.5">
                                        <Clock size={12} />
                                        {activity.metadata}
                                    </div>
                                )}
                                <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                                    <span className="flex items-center gap-1">
                                        <Clock size={10} />
                                        {dayjs(activity.$createdAt).fromNow()}
                                    </span>
                                    {activity.projectId && (
                                        <span className="bg-surface-tertiary px-2 py-0.5 rounded-md border border-border/30">
                                            ID: {activity.projectId.substring(0, 6)}...
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            <div className="mt-8 pt-6 border-t border-border/20">
                <p className="text-[10px] font-bold text-center text-muted-foreground uppercase tracking-[0.2em]">
                    Real-time Synchronization Active
                </p>
            </div>
        </Surface>
    );
}
