'use client';

import { db } from '@/lib/db';
import { InstallationTarget, WikiGuide } from '@/types';
import { Button, Modal, Spinner } from "@heroui/react";
import { BookMinimalistic as Book, Checklist as CheckSquare, MagicStick2 as Sparkles } from '@solar-icons/react';
import { useEffect, useState } from 'react';

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

    useEffect(() => {
        if (isOpen) {
            fetchGuides();
        }
    }, [isOpen]);

    const fetchGuides = async () => {
        setIsLoading(true);
        try {
            const data = await db.listGuides();
            setGuides(data.documents);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchInstallations = async (guideId: string) => {
        setIsLoading(true);
        try {
            const guide = await db.getGuide(guideId);
            setInstallations(guide.installations || []);
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
                                <Modal.Heading className="text-2xl font-black tracking-tighter uppercase text-foreground leading-none">Apply Roadmap_</Modal.Heading>
                                <p className="text-muted-foreground text-[10px] uppercase font-black opacity-30 tracking-widest ml-0.5 mt-1">Populate project with expert tasks.</p>
                            </div>
                        </Modal.Header>
                        
                        <Modal.Body className="px-8 pt-4 pb-8 space-y-6 flex-1 overflow-y-auto">
                            {isLoading && (
                                <div className="flex flex-col items-center justify-center py-20 gap-4">
                                    <Spinner color="accent" size="lg" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/40">Loading templates...</p>
                                </div>
                            )}

                            {!isLoading && !selectedGuideId && (
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/30 ml-2 leading-none">AVAILABLE TEMPLATES</h3>
                                    <div className="grid grid-cols-1 gap-3">
                                        {guides.map(guide => (
                                            <button 
                                                key={guide.$id} 
                                                className="flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-surface-secondary/20 text-left hover:border-accent/40 hover:bg-surface-secondary/40 transition-all group active:scale-[0.98]"
                                                onClick={() => fetchInstallations(guide.$id)}
                                            >
                                                <div className="w-10 h-10 rounded-xl bg-foreground/5 border border-border/40 flex items-center justify-center text-foreground group-hover:scale-110 transition-transform shrink-0 shadow-sm">
                                                    <Book size={20} weight="Bold" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-black truncate text-foreground text-sm tracking-tight uppercase">{guide.title}</h4>
                                                    <p className="text-[10px] text-muted-foreground/40 truncate uppercase font-black tracking-widest mt-0.5">Guide Template</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!isLoading && selectedGuideId && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between px-2">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/30">SELECT TARGET NODE</h3>
                                        <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest h-8 px-4 rounded-xl opacity-40 hover:opacity-100" onPress={() => setSelectedGuideId(null)}>Restart Scan</Button>
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
                                                    <h4 className={`font-black truncate text-sm tracking-tight uppercase ${
                                                        selectedInstallation?.target === inst.target ? 'text-accent' : 'text-foreground'
                                                    }`}>{inst.target}</h4>
                                                    <p className="text-[10px] text-muted-foreground/40 truncate uppercase font-black tracking-widest mt-0.5">{inst.tasks?.length || 0} Sub-routines Detected</p>
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
                                className="rounded-xl h-9 px-6 font-black tracking-tight opacity-40 hover:opacity-100 transition-opacity uppercase text-[10px]" 
                                onPress={onClose} 
                                isDisabled={isApplying}
                            >
                                Abort
                            </Button>
                            <Button 
                                variant="primary" 
                                className="rounded-xl h-9 px-8 font-black uppercase tracking-[0.1em] text-[10px] shadow-2xl shadow-accent/20" 
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
