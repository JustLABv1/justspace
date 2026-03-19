'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { EncryptedData, ResourceVersion } from '@/types';
import { Button, Modal, Spinner } from "@heroui/react";
import { format } from 'date-fns';
import { History, Lock, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface VersionHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    resourceId: string;
    resourceType: 'Wiki' | 'Snippet' | 'Installation';
    onRestore: (version: ResourceVersion) => Promise<void>;
    accessResourceId?: string;
}

export const VersionHistoryModal = ({ isOpen, onClose, resourceId, resourceType, onRestore, accessResourceId }: VersionHistoryModalProps) => {
    const [versions, setVersions] = useState<ResourceVersion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { user, privateKey } = useAuth();

    const fetchVersions = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await db.listVersions(resourceId);
            const rawVersions = data.documents;

            const processedVersions = await Promise.all(rawVersions.map(async (v) => {
                if (v.isEncrypted && privateKey && user) {
                    try {
                        const access = await db.getAccessKey(accessResourceId || resourceId, user.id);
                        if (access) {
                            const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                            
                            let decryptedContent = v.content;
                            let decryptedTitle = v.title;

                            if (v.content.startsWith('{')) {
                                try {
                                    decryptedContent = await decryptData(JSON.parse(v.content) as EncryptedData, docKey);
                                } catch {}
                            }
                            if (v.title && v.title.startsWith('{')) {
                                try {
                                    decryptedTitle = await decryptData(JSON.parse(v.title) as EncryptedData, docKey);
                                } catch {}
                            }
                            
                            return { ...v, content: decryptedContent, title: decryptedTitle };
                        }
                    } catch (e) {
                        return { ...v, content: 'Decryption Error', title: 'Decryption Error' };
                    }
                }
                return v;
            }));

            setVersions(processedVersions);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [resourceId, privateKey, user, accessResourceId]);

    useEffect(() => {
        if (isOpen) {
            fetchVersions();
        }
    }, [isOpen, fetchVersions]);

    return (
        <Modal>
            <Modal.Backdrop 
                isOpen={isOpen} 
                onOpenChange={(next) => !next && onClose()}
                className="bg-black/50"
                variant="blur"
            >
                <Modal.Container size="md" scroll="inside">
                    <Modal.Dialog className="rounded-xl border border-border bg-surface shadow-lg p-0 overflow-hidden flex flex-col max-h-[80vh]">
                        <Modal.CloseTrigger className="absolute right-4 top-4 z-50 p-1.5 rounded-md bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-6 pt-5 pb-4 border-b border-border shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground shrink-0">
                                    <History size={14} />
                                </div>
                                <div>
                                    <Modal.Heading className="text-base font-semibold text-foreground leading-none">
                                        Version History
                                    </Modal.Heading>
                                    <p className="text-xs text-muted-foreground mt-0.5">Chronological snapshots</p>
                                </div>
                            </div>
                        </Modal.Header>

                        <Modal.Body className="px-6 py-4 space-y-3 overflow-y-auto">
                            {isLoading ? (
                                <div className="py-12 flex justify-center"><Spinner /></div>
                            ) : versions.length === 0 ? (
                                <div className="text-center py-12 text-xs text-muted-foreground">No snapshots found</div>
                            ) : (
                                <div className="space-y-2">
                                    {versions.map((v) => (
                                        <div key={v.id} className="px-3 py-2.5 rounded-xl border border-border flex items-center justify-between group hover:bg-surface-secondary/50 transition-colors">
                                            <div className="space-y-0.5">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-sm font-medium text-foreground">
                                                        {v.title || 'Untitled'}
                                                    </p>
                                                    {v.isEncrypted && (
                                                        <Lock size={11} className="text-muted-foreground" />
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <span>{format(new Date(v.createdAt), 'MMM d, yyyy HH:mm')}</span>
                                                    {v.metadata && <span>· {v.metadata}</span>}
                                                </div>
                                            </div>
                                            <Button 
                                                variant="ghost" 
                                                size="sm"
                                                className="rounded-md h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                                onPress={() => onRestore(v)}
                                            >
                                                <RotateCcw size={12} className="mr-1" />
                                                Restore
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Modal.Body>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
