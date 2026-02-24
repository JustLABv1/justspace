'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { InstallationTarget, WikiGuide } from '@/types';
import { Button, Modal, Spinner } from "@heroui/react";
import { BookMinimalistic as Book, Checklist as CheckSquare, MagicStick2 as Sparkles } from '@solar-icons/react';
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
                                    } catch (e) { /* fallback to original */ }
                                }
                                
                                let tasks = inst.tasks || [];
                                if (tasks.length > 0 && tasks[0].startsWith('{')) {
                                    tasks = await Promise.all(tasks.map(async (t: string) => {
                                        try {
                                            return await decryptData(JSON.parse(t), docKey);
                                        } catch (e) { return t; }
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
                className="bg-background/80 backdrop-blur-md"
                variant="blur"
            >
                <Modal.Container size="md" scroll="inside">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-8 top-7 z-50 p-3 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-8 pt-6 pb-3 border-b border-border/20 flex flex-col items-start gap-2 shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-inner">
                                <Sparkles size={20} weight="Bold" />
                            </div>
                            <div className="space-y-0">
                                <Modal.Heading className="text-2xl font-bold tracking-tight text-foreground leading-none">Apply Roadmap</Modal.Heading>
                                <p className="text-muted-foreground text-[10px] uppercase font-bold opacity-30 tracking-wider ml-0.5 mt-1">Populate project with expert tasks.</p>
                            </div>
                        </Modal.Header>
                        
                        <Modal.Body className="px-8 pt-4 pb-8 space-y-6 flex-1 overflow-y-auto">
                            {isLoading && (
                                <div className="flex flex-col items-center justify-center py-20 gap-4">
                                    <Spinner color="accent" size="lg" />
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-accent/40">Loading templates...</p>
                                </div>
                            )}

                            {!isLoading && !selectedGuideId && (
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/30 ml-2 leading-none">AVAILABLE TEMPLATES</h3>
                                    <div className="grid grid-cols-1 gap-3">
                                        {guides.map(guide => (
                                            <button 
                                                key={guide.id} 
                                                className="flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-surface-secondary/20 text-left hover:border-accent/40 hover:bg-surface-secondary/40 transition-all group active:scale-[0.98]"
                                                onClick={() => fetchInstallations(guide.id)}
                                            >
                                                <div className="w-10 h-10 rounded-xl bg-foreground/5 border border-border/40 flex items-center justify-center text-foreground group-hover:scale-110 transition-transform shrink-0 shadow-sm">
                                                    <Book size={20} weight="Bold" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold truncate text-foreground text-sm tracking-tight uppercase">{guide.title}</h4>
                                                    <p className="text-[10px] text-muted-foreground/40 truncate uppercase font-bold tracking-wider mt-0.5">Guide Template</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!isLoading && selectedGuideId && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between px-2">
                                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/30">SELECT TARGET NODE</h3>
                                        <Button variant="ghost" className="text-[10px] font-bold uppercase tracking-wider h-8 px-4 rounded-xl opacity-40 hover:opacity-100" onPress={() => setSelectedGuideId(null)}>Restart Scan</Button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        {installations.map(inst => (
                                            <button 
                                                key={inst.target}
                                                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all group text-left active:scale-[0.98] ${
                                                    selectedInstallation?.target === inst.target 
                                                    ? 'bg-accent/10 border-accent shadow-inner' 
                                                    : 'bg-surface-secondary/20 border-border/40 hover:border-accent/40 hover:bg-surface-secondary/40'
                                                }`}
                                                onClick={() => setSelectedInstallation(inst)}
                                            >
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                                                    selectedInstallation?.target === inst.target 
                                                    ? 'bg-accent text-white shadow-lg' 
                                                    : 'bg-foreground/5 text-foreground group-hover:scale-110'
                                                }`}>
                                                    <CheckSquare size={20} weight="Bold" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className={`font-bold truncate text-sm tracking-tight uppercase ${
                                                        selectedInstallation?.target === inst.target ? 'text-accent' : 'text-foreground'
                                                    }`}>{inst.target}</h4>
                                                    <p className="text-[10px] text-muted-foreground/40 truncate uppercase font-bold tracking-wider mt-0.5">{inst.tasks?.length || 0} Sub-routines Detected</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Modal.Body>

                        <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end gap-3">
                            <Button 
                                variant="ghost" 
                                className="rounded-xl h-9 px-6 font-bold tracking-tight opacity-40 hover:opacity-100 transition-opacity uppercase text-[10px]" 
                                onPress={onClose} 
                                isDisabled={isApplying}
                            >
                                Abort
                            </Button>
                            <Button 
                                variant="primary" 
                                className="rounded-xl h-9 px-8 font-bold uppercase tracking-wider text-[10px] shadow-2xl shadow-accent/20" 
                                onPress={handleApply}
                                isDisabled={!selectedInstallation || isApplying}
                                isPending={isApplying}
                            >
                                Execute Injection
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
