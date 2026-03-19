'use client';

import { useAuth } from "@/context/AuthContext";
import { decryptData, decryptDocumentKey } from "@/lib/crypto";
import { db } from "@/lib/db";
import { wsClient, WSEvent } from "@/lib/ws";
import { ActivityLog } from "@/types";
import { Button, Chip, ScrollShadow, Spinner } from "@heroui/react";
import dayjs from "dayjs";
import isToday from "dayjs/plugin/isToday";
import isYesterday from "dayjs/plugin/isYesterday";
import relativeTime from "dayjs/plugin/relativeTime";
import {
    Activity,
    CheckCircle,
    FileText,
    Play,
    PlusCircle,
    RefreshCw,
    Trash2
} from "lucide-react";
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
                const isEncrypted = (() => {
                    try { const p = JSON.parse(activity.entityName); return typeof p?.ciphertext === 'string'; } catch { return false; }
                })();

                if (isEncrypted) {
                    if (privateKey && user && activity.projectId) {
                        try {
                            const access = await db.getAccessKey(activity.projectId, user.id);
                            if (access) {
                                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                const nameData = JSON.parse(activity.entityName);
                                const decrypted = await decryptData(nameData, docKey);
                                return { ...activity, entityName: decrypted };
                            }
                        } catch (e) {
                            console.error('Failed to decrypt activity name:', activity.id, e);
                        }
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
        
        const unsub = wsClient.subscribe((event: WSEvent) => {
            if (event.collection === 'activity') {
                fetchActivity(true); // Silent refresh on any activity change
            }
        });

        return () => unsub();
    }, [fetchActivity]);

    // Grouping logic
    const groupedActivities = decryptedActivities.reduce((groups: Record<string, ActivityLog[]>, activity) => {
        const date = dayjs(activity.createdAt);
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
            <div className="p-6 rounded-2xl border border-border flex flex-col items-center justify-center space-y-3 h-32">
                <Spinner size="sm" color="accent" />
            </div>
        );
    }

    const getIcon = (type: string) => {
        switch (type) {
            case 'create': return <PlusCircle size={12} className="text-accent" />;
            case 'complete': return <CheckCircle size={12} className="text-success" />;
            case 'update': return <FileText size={12} className="text-accent" />;
            case 'delete': return <Trash2 size={12} className="text-danger" />;
            case 'work': return <Play size={12} className="text-warning" />;
            default: return <Activity size={12} className="text-muted-foreground" />;
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
        <div className="rounded-2xl border border-border bg-surface flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                <div className="flex items-center gap-2">
                    <Activity size={14} className="text-muted-foreground" />
                    <h3 className="text-[13px] font-semibold text-foreground">Activity</h3>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => fetchActivity(true)}
                    className="h-6 w-6 p-0 rounded-xl text-muted-foreground hover:text-foreground"
                    isPending={refreshing}
                >
                    <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                </Button>
            </div>

            <ScrollShadow hideScrollBar className="max-h-[480px]" size={20}>
                {Object.keys(groupedActivities).length === 0 ? (
                    <div className="text-center py-10 flex flex-col items-center justify-center space-y-2">
                        <Activity size={24} className="text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">No activity yet</p>
                    </div>
                ) : (
                    Object.entries(groupedActivities).map(([day, items]) => (
                        <div key={day}>
                            <div className="flex items-center gap-2 px-5 py-2">
                                <span className="text-[11px] font-medium text-muted-foreground">{day}</span>
                                <div className="h-px flex-1 bg-border/60" />
                            </div>

                            <div className="px-3 pb-2 space-y-0.5">
                                {items.map((activity) => (
                                    <div key={activity.id} className="flex items-start gap-3 px-2 py-2 rounded-xl hover:bg-surface-secondary/50 transition-colors">
                                        <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-xl bg-surface-tertiary flex items-center justify-center">
                                            {getIcon(activity.type)}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13px] font-medium text-foreground truncate">
                                                {activity.entityName}
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-2">
                                                <Chip
                                                    size="sm"
                                                    variant="soft"
                                                    color={getActionColor(activity.type)}
                                                    className="h-4 px-1.5 rounded-full"
                                                >
                                                    <Chip.Label className="text-[10px] font-medium">
                                                        {activity.type}
                                                    </Chip.Label>
                                                </Chip>
                                                <span className="text-xs text-muted-foreground">
                                                    {dayjs(activity.createdAt).format('HH:mm')}
                                                </span>
                                            </div>
                                            {activity.metadata && (
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {activity.metadata}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </ScrollShadow>
        </div>
    );
}
