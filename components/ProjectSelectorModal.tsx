'use client';

import { db } from '@/lib/db';
import { Project } from '@/types';
import { Button, Modal, Spinner } from "@heroui/react";
import { Folder } from '@solar-icons/react';
import { useEffect, useState } from 'react';

interface ProjectSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (projectId: string) => Promise<void>;
}

export const ProjectSelectorModal = ({ isOpen, onClose, onSelect }: ProjectSelectorModalProps) => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchProjects();
        }
    }, [isOpen]);

    const fetchProjects = async () => {
        setIsLoading(true);
        try {
            const data = await db.listProjects();
            setProjects(data.documents);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = async (projectId: string) => {
        setIsSubmitting(true);
        try {
            await onSelect(projectId);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
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
                <Modal.Container size="sm" scroll="inside">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-8 top-7 z-50 p-3 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-8 pt-6 pb-3 border-b border-border/20 flex flex-col items-start gap-2 shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-inner">
                                <Folder size={20} weight="Bold" />
                            </div>
                            <div className="space-y-0">
                                <Modal.Heading className="text-2xl font-black tracking-tighter uppercase text-foreground leading-none">Target Project_</Modal.Heading>
                                <p className="text-muted-foreground text-[10px] uppercase font-black opacity-30 tracking-widest ml-0.5 mt-1">Destination for data sync.</p>
                            </div>
                        </Modal.Header>

                        <Modal.Body className="px-8 pt-4 pb-8 flex-1 overflow-y-auto">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-4">
                                    <Spinner color="accent" size="lg" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-accent/40">Loading projects...</p>
                                </div>
                            ) : projects.length > 0 ? (
                                <div className="flex flex-col gap-3">
                                    {projects.map((project) => (
                                        <button 
                                            key={project.$id}
                                            onClick={() => handleSelect(project.$id)}
                                            disabled={isSubmitting}
                                            className="flex items-center gap-5 p-5 rounded-[2.5rem] border border-border/40 bg-surface-secondary/20 text-left hover:border-accent/40 hover:bg-surface-secondary/40 transition-all group disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                                        >
                                            <div className="w-14 h-14 rounded-3xl bg-foreground/5 border border-border/40 flex items-center justify-center text-foreground group-hover:scale-110 transition-transform shrink-0 shadow-sm">
                                                <Folder size={28} weight="Bold" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-black truncate text-foreground text-base tracking-tight uppercase">{project.name}</h4>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                                                    <p className="text-[11px] text-accent/80 truncate uppercase font-black tracking-widest">{project.status}</p>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-20 text-center border-2 border-dashed border-border/30 rounded-[3rem] bg-foreground/[0.02] space-y-4">
                                    <div className="w-20 h-20 rounded-[2.5rem] bg-foreground/5 flex items-center justify-center text-muted-foreground/20 mx-auto border border-border/40">
                                        <Folder size={40} weight="Linear" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-foreground font-black uppercase tracking-tight text-lg">Zero Active Nodes</p>
                                        <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest opacity-40">No available synchronization targets.</p>
                                    </div>
                                </div>
                            )}
                        </Modal.Body>

                        <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end gap-3">
                            <Button 
                                variant="ghost" 
                                className="rounded-xl h-9 px-8 font-black tracking-tight opacity-40 hover:opacity-100 transition-opacity uppercase text-[10px]" 
                                onPress={onClose} 
                                isDisabled={isSubmitting}
                            >
                                Abort
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
