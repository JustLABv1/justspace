'use client';

import { Surface } from "@heroui/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Activity, CheckCircle, Clock, FileText, PlusCircle } from "lucide-react";

dayjs.extend(relativeTime);

// Mock activity for now as we don't have a records collection
const MOCK_ACTIVITIES = [
    { id: '1', type: 'create', folder: 'Project', name: 'Azure Migration', time: dayjs().subtract(2, 'hours').toISOString() },
    { id: '2', type: 'complete', folder: 'Task', name: 'Setup VPC Subnets', time: dayjs().subtract(5, 'hours').toISOString() },
    { id: '3', type: 'update', folder: 'Wiki', name: 'EKS Cluster Guide', time: dayjs().subtract(1, 'day').toISOString() },
    { id: '4', type: 'create', folder: 'Project', name: 'Internal Wiki Sync', time: dayjs().subtract(2, 'days').toISOString() },
];

export function ActivityFeed() {
    return (
        <Surface variant="secondary" className="p-6 rounded-3xl border border-border h-full">
            <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold flex items-center gap-2">
                    <Activity size={20} className="text-primary" />
                    Recent Activity
                </h3>
            </div>
            <div className="space-y-6">
                {MOCK_ACTIVITIES.map((activity) => (
                    <div key={activity.id} className="relative pl-8">
                        {/* Connection Line */}
                        <div className="absolute left-[11px] top-6 bottom-[-24px] w-[2px] bg-border last:hidden" />
                        
                        {/* Icon */}
                        <div className="absolute left-0 top-1 p-1.5 rounded-full bg-surface border border-border z-10">
                            {activity.type === 'create' && <PlusCircle size={14} className="text-accent" />}
                            {activity.type === 'complete' && <CheckCircle size={14} className="text-success" />}
                            {activity.type === 'update' && <FileText size={14} className="text-primary" />}
                        </div>

                        <div className="flex flex-col">
                            <span className="text-sm font-medium">
                                <span className="text-muted-foreground">{activity.type === 'create' ? 'Created new' : activity.type === 'complete' ? 'Completed' : 'Updated'} </span>
                                {activity.folder}: {activity.name}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <Clock size={10} />
                                {dayjs(activity.time).fromNow()}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </Surface>
    );
}
