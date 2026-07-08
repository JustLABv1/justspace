'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { Alert, Button } from '@heroui/react';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function VaultSetupNotice() {
    const router = useRouter();
    const { hasVault } = useAuth();

    if (hasVault) return null;

    return (
        <div className="shrink-0 border-b border-warning/20 bg-warning-muted/70 px-4 py-3 md:px-6">
            <Alert status="warning" className="mx-auto max-w-5xl border border-warning/30 bg-warning-muted shadow-sm">
                <Alert.Indicator>
                    <ShieldAlert size={18} />
                </Alert.Indicator>
                <Alert.Content className="gap-1">
                    <Alert.Title className="text-sm font-semibold text-warning">Vault setup required</Alert.Title>
                    <Alert.Description className="text-xs leading-relaxed text-foreground/80">
                        Create your vault before adding projects, wiki guides, or snippets so new workspace data can be protected with end-to-end encryption.
                    </Alert.Description>
                </Alert.Content>
                <Button
                    variant="primary"
                    size="sm"
                    className="ml-auto shrink-0"
                    onPress={() => router.push('/settings?tab=Security')}
                >
                    Set up vault
                    <ArrowRight size={13} className="ml-1" />
                </Button>
            </Alert>
        </div>
    );
}
