'use client';

import { db } from "@/lib/db";
import { ActivityLog } from "@/types";
import { Surface } from "@heroui/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Activity, CheckCircle, Clock, FileText, PlusCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

dayjs.extend(relativeTime);

export function ActivityFeed() {
    const [activities, setActivities] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchActivity = async () => {
            try {
                const res = await db.listActivity();
                setActivities(res.documents);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchActivity();
    }, []);

    if (loading) {
        return (
            <Surface variant="secondary" className="p-6 rounded-3xl border border-border h-full flex items-center justify-center">
                <div className="animate-pulse text-muted-foreground">Loading activity...</div>
            </Surface>
        );
    }

    return (
        <Surface variant="secondary" className="p-6 rounded-3xl border border-border h-full">
            <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold flex items-center gap-2">
                    <Activity size={20} className="text-primary" />
                    Recent Activity
                </h3>
            </div>
            <div className="space-y-6">
                {activities.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                        No recent activity found.
                    </div>
                ) : (
                    activities.map((activity) => (
                        <div key={activity.$id} className="relative pl-8">
                            {/* Connection Line */}
                            <div className="absolute left-[11px] top-6 bottom-[-24px] w-[2px] bg-border last:hidden" />
                            
                            {/* Icon */}
                            <div className="absolute left-0 top-1 p-1.5 rounded-full bg-surface border border-border z-10">
                                {activity.type === 'create' && <PlusCircle size={14} className="text-accent" />}
                                {activity.type === 'complete' && <CheckCircle size={14} className="text-success" />}
                                {activity.type === 'update' && <FileText size={14} className="text-primary" />}
                                {activity.type === 'delete' && <Trash2 size={14} className="text-danger" />}
                            </div>

                            <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                    <span className="text-muted-foreground">
                                        {activity.type === 'create' ? 'Created new' : 
                                         activity.type === 'complete' ? 'Completed' : 
                                         activity.type === 'delete' ? 'Deleted' : 'Updated'} 
                                    </span>
                                    {' '}{activity.entityType}: {activity.entityName}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                    <Clock size={10} />
                                    {dayjs(activity.$createdAt).fromNow()}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </Surface>
    );
}
