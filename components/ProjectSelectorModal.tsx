'use client';

import { db } from '@/lib/db';
import { Project } from '@/types';
import { Button, Modal, Spinner } from "@heroui/react";
import { Folder } from 'lucide-react';
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
        <Modal isOpen={isOpen} onOpenChange={onClose}>
            <Modal.Backdrop className="bg-background/80 backdrop-blur-md">
                <Modal.Container size="md">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden">
                        <Modal.Header className="px-8 py-6 border-b border-border/20 flex flex-col items-start gap-1">
                            <Modal.Heading className="text-2xl font-black tracking-tight">Select Destination</Modal.Heading>
                            <p className="text-muted-foreground text-xs font-medium">Choose a project to synchronize these checklist tasks.</p>
                        </Modal.Header>
                        <Modal.Body className="p-8">
                            {isLoading ? (
                                <div className="flex justify-center py-12"><Spinner color="primary" /></div>
                            ) : projects.length > 0 ? (
                                <div className="flex flex-col gap-3">
                                    {projects.map((project) => (
                                        <button 
                                            key={project.$id}
                                            onClick={() => handleSelect(project.$id)}
                                            disabled={isSubmitting}
                                            className="flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-surface-secondary/30 text-left hover:border-primary/40 hover:bg-surface-secondary/50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform shrink-0">
                                                <Folder size={18} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold truncate text-foreground text-sm tracking-tight">{project.name}</h4>
                                                <p className="text-[10px] text-muted-foreground truncate uppercase font-bold tracking-widest mt-0.5">{project.status}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-12 text-center border-2 border-dashed border-border/20 rounded-2xl">
                                    <p className="text-muted-foreground text-xs font-medium">No active initiatives found.</p>
                                </div>
                            )}
                        </Modal.Body>
                        <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end">
                            <Button variant="ghost" className="rounded-xl h-10 px-6 font-bold text-sm" onPress={onClose} isDisabled={isSubmitting}>
                                Cancel
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
