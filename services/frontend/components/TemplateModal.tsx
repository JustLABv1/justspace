'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { InstallationTarget, WikiGuide } from '@/services/frontend/types';
import { Button, Modal, Spinner } from "@heroui/react";
import { BookOpen, CheckSquare, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface TemplateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (tasks: string[]) => Promise<void>;
}

export const TemplateModal = ({ isOpen, onClose, onApply }: TemplateModalProps) => {
    const [guides, setGuides] = useState<WikiGuide[]>([]);
    const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
    const [installations, setInstallations] = useState<InstallationTarget[]>([]);
    const [selectedInstallation, setSelectedInstallation] = useState<InstallationTarget | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isApplying, setIsApplying] = useState(false);
    const { user, privateKey } = useAuth();

    const fetchGuides = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await db.listGuides();
            const processed = await Promise.all(data.documents.map(async (g) => {
                if (g.isEncrypted) {
                    if (privateKey && user) {
                        try {
                            const access = await db.getAccessKey(g.id, user.id);
                            if (access) {
                                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                const titleData = JSON.parse(g.title);
                                return { ...g, title: await decryptData(titleData, docKey) };
                            }
                        } catch (e) {
                            console.error('Template Guide Decrypt error:', e);
                        }
                    }
                    return { ...g, title: 'Encrypted Guide' };
                }
                return g;
            }));
            setGuides(processed);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [privateKey, user]);

    useEffect(() => {
        if (isOpen) {
            fetchGuides();
        }
    }, [isOpen, fetchGuides]);

    const fetchInstallations = async (guideId: string) => {
        setIsLoading(true);
        try {
            const guide = await db.getGuide(guideId);
            const insts: InstallationTarget[] = guide.installations || [];
            
            const processedInsts = await Promise.all(insts.map(async (inst: InstallationTarget) => {
                if (guide.isEncrypted || inst.isEncrypted) {
                    if (privateKey && user) {
                        try {
                            const access = await db.getAccessKey(guide.id, user.id);
                            if (access) {
                                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                
                                let target = inst.target;
                                if (inst.target.startsWith('{')) {
                                    try {
                                        target = await decryptData(JSON.parse(inst.target), docKey);
                                    } catch { /* fallback to original */ }
                                }
                                
                                let tasks = inst.tasks || [];
                                if (tasks.length > 0 && tasks[0].startsWith('{')) {
                                    tasks = await Promise.all(tasks.map(async (t: string) => {
                                        try {
                                            return await decryptData(JSON.parse(t), docKey);
                                        } catch { return t; }
                                    }));
                                }

                                return { ...inst, target, tasks };
                            }
                        } catch (e) {
                            console.error('Template Inst Decrypt error:', e);
                        }
                    }
                    return { ...inst, target: 'Encrypted Installation' };
                }
                return inst;
            }));

            setInstallations(processedInsts);
            setSelectedGuideId(guideId);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApply = async () => {
        if (selectedInstallation?.tasks && selectedInstallation.tasks.length > 0) {
            setIsApplying(true);
            try {
                await onApply(selectedInstallation.tasks);
                onClose();
            } catch (error) {
                console.error(error);
            } finally {
                setIsApplying(false);
            }
        }
    };

    return (
        <Modal>
            <Modal.Backdrop 
                isOpen={isOpen} 
                onOpenChange={(next) => !next && onClose()}
                className="bg-black/50"
                variant="blur"
            >
                <Modal.Container size="md" scroll="inside">
                    <Modal.Dialog className="rounded-xl border border-border bg-surface shadow-lg p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-4 top-4 z-50 p-1.5 rounded-md bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-6 pt-5 pb-4 border-b border-border shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground shrink-0">
                                    <Sparkles size={14} />
                                </div>
                                <div>
                                    <Modal.Heading className="text-base font-semibold text-foreground leading-none">Apply Template</Modal.Heading>
                                    <p className="text-xs text-muted-foreground mt-0.5">Populate project with tasks from a guide</p>
                                </div>
                            </div>
                        </Modal.Header>
                        
                        <Modal.Body className="px-6 py-4 space-y-4 flex-1 overflow-y-auto">
                            {isLoading && (
                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                    <Spinner color="accent" size="sm" />
                                    <p className="text-xs text-muted-foreground">Loading templates...</p>
                                </div>
                            )}

                            {!isLoading && !selectedGuideId && (
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Available guides</p>
                                    <div className="grid grid-cols-1 gap-2">
                                        {guides.map(guide => (
                                            <button 
                                                key={guide.id} 
                                                className="flex items-center gap-3 p-3 rounded-xl border border-border text-left hover:border-accent/50 hover:bg-surface-secondary/50 transition-all group"
                                                onClick={() => fetchInstallations(guide.id)}
                                            >
                                                <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground shrink-0">
                                                    <BookOpen size={14} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-medium truncate text-sm text-foreground">{guide.title}</h4>
                                                    <p className="text-xs text-muted-foreground">Guide template</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!isLoading && selectedGuideId && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-medium text-muted-foreground">Select installation target</p>
                                        <Button variant="ghost" className="h-7 px-2 text-xs rounded-md" onPress={() => setSelectedGuideId(null)}>Back</Button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {installations.map(inst => (
                                            <button 
                                                key={inst.target}
                                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                                                    selectedInstallation?.target === inst.target 
                                                    ? 'bg-accent/5 border-accent' 
                                                    : 'border-border hover:border-accent/50 hover:bg-surface-secondary/50'
                                                }`}
                                                onClick={() => setSelectedInstallation(inst)}
                                            >
                                                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                                                    selectedInstallation?.target === inst.target 
                                                    ? 'bg-accent text-white' 
                                                    : 'bg-surface-secondary text-muted-foreground'
                                                }`}>
                                                    <CheckSquare size={14} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className={`font-medium truncate text-sm ${
                                                        selectedInstallation?.target === inst.target ? 'text-accent' : 'text-foreground'
                                                    }`}>{inst.target}</h4>
                                                    <p className="text-xs text-muted-foreground">{inst.tasks?.length || 0} tasks</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Modal.Body>

                        <Modal.Footer className="px-6 py-4 bg-surface-secondary/50 border-t border-border flex justify-end gap-2">
                            <Button 
                                variant="ghost" 
                                className="rounded-xl h-8 px-4 text-xs font-medium" 
                                onPress={onClose} 
                                isDisabled={isApplying}
                            >
                                Cancel
                            </Button>
                            <Button 
                                variant="primary" 
                                className="rounded-xl h-8 px-4 text-xs font-medium" 
                                onPress={handleApply}
                                isDisabled={!selectedInstallation || isApplying}
                                isPending={isApplying}
                            >
                                Apply Template
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
