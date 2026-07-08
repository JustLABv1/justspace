'use client';

import { Button } from '@heroui/react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="col-span-full py-20 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-lg bg-surface-secondary flex items-center justify-center">
                <Icon size={22} className="text-muted-foreground" />
            </div>
            <div className="max-w-sm">
                <h2 className="text-sm font-medium text-foreground">{title}</h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
            </div>
            {action}
        </div>
    );
}

export function EmptyStateAction({
    children,
    onPress,
}: {
    children: ReactNode;
    onPress: () => void;
}) {
    return (
        <Button variant="primary" size="sm" onPress={onPress}>
            {children}
        </Button>
    );
}
