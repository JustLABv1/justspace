'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { useWorkspace } from '@/services/frontend/context/WorkspaceContext';
import { db } from '@/services/frontend/lib/db';
import { Button, Spinner, toast } from '@heroui/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function InvitePage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user, isLoading } = useAuth();
    const { refresh: refreshWorkspaces } = useWorkspace();
    const [accepting, setAccepting] = useState(false);

    useEffect(() => {
        const token = searchParams.get('token');
        if (!token || !user || accepting) {
            return;
        }

        let cancelled = false;
        const accept = async () => {
            setAccepting(true);
            try {
                const result = await db.acceptInvitation(token);
                await refreshWorkspaces();
                if (!cancelled) {
                    toast.success('Invitation accepted');
                    router.replace(result.projectId ? `/projects/${result.projectId}` : result.workspaceId ? '/workspace' : '/');
                }
            } catch (error) {
                console.error(error);
                if (!cancelled) {
                    toast.danger('Failed to accept invitation');
                }
            } finally {
                if (!cancelled) {
                    setAccepting(false);
                }
            }
        };

        void accept();
        return () => {
            cancelled = true;
        };
    }, [accepting, refreshWorkspaces, router, searchParams, user]);

    if (isLoading || accepting) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
                <div>
                    <h1 className="text-lg font-semibold text-foreground">Sign in to accept your invite</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Your invitation will be ready once you log in.</p>
                </div>
                <Button variant="primary" onPress={() => router.push('/login')}>
                    Go to login
                </Button>
            </div>
        );
    }

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
            <div>
                <h1 className="text-lg font-semibold text-foreground">Invite ready</h1>
                <p className="mt-1 text-sm text-muted-foreground">Use the button below if automatic acceptance did not start.</p>
            </div>
            <Button
                variant="primary"
                onPress={async () => {
                    const token = searchParams.get('token');
                    if (!token) {
                        return;
                    }
                    setAccepting(true);
                    try {
                        const result = await db.acceptInvitation(token);
                        await refreshWorkspaces();
                        toast.success('Invitation accepted');
                        router.replace(result.projectId ? `/projects/${result.projectId}` : result.workspaceId ? '/workspace' : '/');
                    } catch (error) {
                        console.error(error);
                        toast.danger('Failed to accept invitation');
                    } finally {
                        setAccepting(false);
                    }
                }}
            >
                Accept invite
            </Button>
        </div>
    );
}
