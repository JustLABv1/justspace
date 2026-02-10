'use client';

import { useAuth } from "@/context/AuthContext";
import { client } from "@/lib/appwrite";
import { decryptData, decryptDocumentKey } from "@/lib/crypto";
import { ACTIVITY_ID, db, DB_ID } from "@/lib/db";
import { ActivityLog } from "@/types";
import { Button, Chip, Spinner, Surface } from "@heroui/react";
import {
    History as Activity,
    CheckCircle,
    Document as FileText,
    Play as PlayIcon,
    AddCircle as PlusCircle,
    Restart as RefreshCw,
    TrashBinMinimalistic as Trash2
} from "@solar-icons/react";
import dayjs from "dayjs";
import isToday from "dayjs/plugin/isToday";
import isYesterday from "dayjs/plugin/isYesterday";
import relativeTime from "dayjs/plugin/relativeTime";
import { useCallback, useEffect, useState } from "react";

dayjs.extend(relativeTime);
dayjs.extend(isToday);
dayjs.extend(isYesterday);

export function ActivityFeed() {
    const { user, privateKey } = useAuth();
    const [activities, setActivities] = useState<ActivityLog[]>([]);
    const [decryptedActivities, setDecryptedActivities] = useState<ActivityLog[]>([]);
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
        const decryptAll = async () => {
            const processed = await Promise.all(activities.map(async (activity) => {
                if ((activity.entityName.startsWith('{"iv":') || activity.entityName.startsWith('{"ciphertext":')) && privateKey && user && (activity.projectId || activity.metadata?.includes('Secure'))) {
                    try {
                        // Use projectId for decryption key lookup
                        const resourceId = activity.projectId;
                        if (resourceId) {
                            const access = await db.getAccessKey(resourceId, user.$id);
                            if (access) {
                                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                const nameData = JSON.parse(activity.entityName);
                                const decrypted = await decryptData(nameData, docKey);
                                return { ...activity, entityName: decrypted };
                            }
                        }
                    } catch (e) {
                        console.error('Failed to decrypt activity name:', activity.$id, e);
                    }
                    return { ...activity, entityName: 'Secure Activity' };
                }
                return activity;
            }));
            setDecryptedActivities(processed);
        };
        decryptAll();
    }, [activities, privateKey, user]);

    useEffect(() => {
        fetchActivity();
        
        const unsubscribe = client.subscribe([
            `databases.${DB_ID}.collections.${ACTIVITY_ID}.documents`
        ], () => {
            fetchActivity(true); // Silent refresh on any activity change
        });

        return () => unsubscribe();
    }, [fetchActivity]);

    // Grouping logic
    const groupedActivities = decryptedActivities.reduce((groups: Record<string, ActivityLog[]>, activity) => {
        const date = dayjs(activity.$createdAt);
        let groupKey = '';
        if (date.isToday()) groupKey = 'Today';
        else if (date.isYesterday()) groupKey = 'Yesterday';
        else groupKey = date.format('MMMM D, YYYY');

        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(activity);
        return groups;
    }, {});

    if (loading) {
        return (
            <Surface variant="secondary" className="p-8 rounded-[2rem] border border-border/50 flex flex-col items-center justify-center space-y-4">
                <Spinner size="lg" color="accent" />
                <div className="text-muted-foreground font-medium animate-pulse">Syncing telemetry...</div>
            </Surface>
        );
    }

    const getIcon = (type: string) => {
        switch (type) {
            case 'create': return <PlusCircle size={12} weight="Bold" className="text-accent" />;
            case 'complete': return <CheckCircle size={12} weight="Bold" className="text-success" />;
            case 'update': return <FileText size={12} weight="Bold" className="text-accent" />;
            case 'delete': return <Trash2 size={12} weight="Bold" className="text-danger" />;
            case 'work': return <PlayIcon size={12} weight="Bold" className="text-warning" />;
            default: return <Activity size={12} weight="Bold" className="text-muted-foreground" />;
        }
    };

    const getActionColor = (type: string): "default" | "success" | "warning" | "danger" | "accent" => {
        switch (type) {
            case 'create': return 'accent';
            case 'complete': return 'success';
            case 'delete': return 'danger';
            case 'work': return 'warning';
            default: return 'default';
        }
    };

    return (
        <Surface variant="secondary" className="p-6 rounded-[2rem] border border-border/40 flex flex-col bg-surface/40 backdrop-blur-xl shadow-sm">
            <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-xl flex items-center gap-3 tracking-tight">
                    <div className="w-10 h-10 rounded-xl bg-foreground/5 border border-border/50 flex items-center justify-center text-foreground/80 shadow-inner">
                        <Activity size={20} weight="Bold" />
                    </div>
                    Activity Feed
                </h3>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onPress={() => fetchActivity(true)}
                    className="h-8 w-8 p-0 rounded-lg hover:bg-foreground/5 transition-all opacity-50 hover:opacity-100"
                    isPending={refreshing}
                >
                    <RefreshCw size={16} weight="Bold" className={refreshing ? 'animate-spin text-accent' : ''} />
                </Button>
            </div>

            <div className="space-y-8 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {Object.keys(groupedActivities).length === 0 ? (
                    <div className="text-center py-12 flex flex-col items-center justify-center space-y-4">
                        <div className="w-16 h-16 rounded-[1.5rem] bg-foreground/5 flex items-center justify-center text-muted-foreground/30 border border-border/30 border-dashed animate-pulse">
                            <Activity size={32} weight="Linear" />
                        </div>
                        <p className="text-muted-foreground font-bold uppercase tracking-[0.3em] text-[10px] opacity-40">Zero telemetry records.</p>
                    </div>
                ) : (
                    Object.entries(groupedActivities).map(([day, items]) => (
                        <div key={day} className="space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40">{day}</span>
                                <div className="h-px flex-1 bg-border/20" />
                            </div>
                            
                            <div className="space-y-4 pl-1">
                                {items.map((activity) => (
                                    <div key={activity.$id} className="group relative pr-2">
                                        <div className="flex items-start gap-4">
                                            {/* Minimalist dot/icon indicator */}
                                            <div className="mt-1 flex-shrink-0 w-6 h-6 rounded-lg bg-surface-secondary border border-border/40 flex items-center justify-center z-10 group-hover:border-accent/50 transition-all duration-300">
                                                {getIcon(activity.type)}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-col">
                                                    <div className="text-xs font-semibold text-foreground tracking-tight leading-tight truncate group-hover:text-accent transition-colors">
                                                        {activity.entityName}
                                                    </div>
                                                    <div className="mt-1 flex items-center flex-wrap gap-2">
                                                        <Chip 
                                                            size="sm" 
                                                            variant="soft" 
                                                            color={getActionColor(activity.type)}
                                                            className="h-4 px-1 text-[8px] font-bold uppercase tracking-widest rounded-md"
                                                        >
                                                            {activity.type}
                                                        </Chip>
                                                        <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                                                            {activity.entityType}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-widest flex items-center gap-1">
                                                            • {dayjs(activity.$createdAt).format('HH:mm')}
                                                        </span>
                                                    </div>
                                                    
                                                    {activity.metadata && (
                                                        <div className="mt-2 text-[9px] font-medium text-accent/60 bg-accent/5 px-2 py-0.5 rounded border border-accent/10 w-fit">
                                                            {activity.metadata}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            <div className="mt-8 pt-6 border-t border-border/20">
                <div className="flex items-center justify-center gap-2 opacity-30">
                    <div className="w-1 h-1 rounded-full bg-success animate-pulse" />
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em]">
                        Live Telemetry Active
                    </p>
                </div>
            </div>
        </Surface>
    );
}
