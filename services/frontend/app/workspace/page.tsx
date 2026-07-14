'use client';

import { WorkspaceManagementPanel } from '@/services/frontend/components/WorkspaceManagementPanel';
import { Button } from '@heroui/react';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function WorkspacePage() {
    const router = useRouter();

    return (
        <div className="w-full px-6 py-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-0.5">
                    <h1 className="text-lg font-semibold text-foreground">Workspace</h1>
                    <p className="text-[13px] text-muted-foreground">Manage members, invitations, and defaults for the active workspace.</p>
                </div>
                <Button onPress={() => router.push('/workspace/new')}>
                    <Plus size={15} />
                    New workspace
                </Button>
            </div>
            <WorkspaceManagementPanel />
        </div>
    );
}
