'use client';

import { WorkspaceManagementPanel } from '@/services/frontend/components/WorkspaceManagementPanel';

export default function WorkspacePage() {
    return (
        <div className="w-full px-6 py-8">
            <div className="mb-6 space-y-0.5">
                <h1 className="text-lg font-semibold text-foreground">Workspace</h1>
                <p className="text-[13px] text-muted-foreground">Manage members, invitations, and defaults for the active workspace.</p>
            </div>
            <WorkspaceManagementPanel />
        </div>
    );
}
