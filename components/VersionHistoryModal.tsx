'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { EncryptedData, ResourceVersion } from '@/types';
import { Button, Modal, Spinner } from "@heroui/react";
import { History, Restart as Restore, ShieldKeyhole as Shield } from '@solar-icons/react';
import { format } from 'date-fns';
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
                        const access = await db.getAccessKey(accessResourceId || resourceId, user.$id);
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
                className="bg-black/40 backdrop-blur-xl"
                variant="blur"
            >
                <Modal.Container size="md" scroll="inside">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden flex flex-col max-h-[80vh]">
                        <Modal.CloseTrigger className="absolute right-8 top-7 z-50 p-3 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-8 pt-6 pb-3 border-b border-border/20 flex flex-col items-start gap-2 shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                                <History size={20} weight="Bold" />
                            </div>
                            <div className="space-y-0">
                                <Modal.Heading className="text-2xl font-black tracking-tighter text-foreground leading-none">
                                    Version History_
                                </Modal.Heading>
                                <p className="text-muted-foreground text-[10px] font-black uppercase opacity-40 ml-0.5 mt-1 tracking-widest">Chronological Snapshots</p>
                            </div>
                        </Modal.Header>

                        <Modal.Body className="px-8 pt-4 pb-8 space-y-4 overflow-y-auto">
                            {isLoading ? (
                                <div className="py-12 flex justify-center"><Spinner /></div>
                            ) : versions.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground font-bold uppercase tracking-widest text-xs opacity-40">No snapshots found</div>
                            ) : (
                                <div className="space-y-3">
                                    {versions.map((v) => (
                                        <div key={v.$id} className="p-4 rounded-2xl bg-surface-secondary/50 border border-border/10 flex items-center justify-between group hover:bg-surface-secondary transition-colors">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-black text-foreground">
                                                        {v.title || 'Untitled Snapshot'}
                                                    </p>
                                                    {v.isEncrypted && (
                                                        <Shield size={12} className="text-primary" />
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                                                    <span>{format(new Date(v.$createdAt), 'MMM d, yyyy HH:mm')}</span>
                                                    {v.metadata && <span>• {v.metadata}</span>}
                                                </div>
                                            </div>
                                            <Button 
                                                variant="ghost" 
                                                size="sm"
                                                className="rounded-lg font-black text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
                                                onPress={() => onRestore(v)}
                                            >
                                                Restore
                                                <Restore size={14} className="ml-1" />
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
