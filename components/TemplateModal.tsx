'use client';

import { db } from '@/lib/db';
import { InstallationTarget, WikiGuide } from '@/types';
import { Button, Modal, Spinner } from "@heroui/react";
import { Book, CheckSquare, Sparkles } from "lucide-react";
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
        <Modal isOpen={isOpen} onOpenChange={onClose}>
            <Modal.Backdrop className="bg-background/80 backdrop-blur-md">
                <Modal.Container size="md">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden">
                        <Modal.Header className="px-8 py-6 border-b border-border/20 flex flex-col items-start gap-1">
                            <Modal.Heading className="text-2xl font-black tracking-tight flex items-center gap-3">
                                <Sparkles className="text-primary" />
                                Apply Roadmap Template
                            </Modal.Heading>
                            <p className="text-muted-foreground text-xs font-medium">Select a guide to populate your project with expert tasks.</p>
                        </Modal.Header>
                        
                        <Modal.Body className="p-8 space-y-6">
                            {isLoading && (
                                <div className="flex justify-center py-10"><Spinner /></div>
                            )}

                            {!isLoading && !selectedGuideId && (
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Select Wiki Guide</h3>
                                    <div className="grid grid-cols-1 gap-2">
                                        {guides.map(guide => (
                                            <Button 
                                                key={guide.$id} 
                                                variant="secondary" 
                                                className="justify-start h-14 rounded-xl px-4 font-bold"
                                                onPress={() => fetchInstallations(guide.$id)}
                                            >
                                                <Book size={18} className="mr-3 text-primary" />
                                                {guide.title}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!isLoading && selectedGuideId && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Select Installation Target</h3>
                                        <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase" onPress={() => setSelectedGuideId(null)}>Change Guide</Button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {installations.map(inst => (
                                            <Button 
                                                key={inst.$id} 
                                                variant={selectedInstallation?.$id === inst.$id ? 'primary' : 'secondary'} 
                                                className="justify-start h-14 rounded-xl px-4 font-bold"
                                                onPress={() => setSelectedInstallation(inst)}
                                            >
                                                <CheckSquare size={18} className="mr-3" />
                                                {inst.target}
                                                <span className="ml-auto text-[10px] opacity-60">({inst.tasks?.length || 0} tasks)</span>
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Modal.Body>

                        <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end gap-3">
                            <Button variant="ghost" className="rounded-xl h-10 px-5 font-bold text-sm" onPress={onClose}>
                                Cancel
                            </Button>
                            <Button 
                                variant="primary" 
                                isPending={isApplying} 
                                isDisabled={!selectedInstallation}
                                className="rounded-xl h-10 px-8 font-black uppercase tracking-widest text-sm shadow-lg shadow-primary/10"
                                onPress={handleApply}
                            >
                                Apply Checklists
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
