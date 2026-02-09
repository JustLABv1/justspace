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
            <Modal.Backdrop>
                <Modal.Container size="md">
                    <Modal.Dialog>
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading>Apply Tasks to Project</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body className="p-6">
                            <p className="text-sm text-muted-foreground mb-6">
                                Choose a project to add these checklist tasks to.
                            </p>

                            {isLoading ? (
                                <div className="flex justify-center py-10"><Spinner /></div>
                            ) : projects.length > 0 ? (
                                <div className="flex flex-col gap-3">
                                    {projects.map((project) => (
                                        <button 
                                            key={project.$id}
                                            onClick={() => handleSelect(project.$id)}
                                            disabled={isSubmitting}
                                            className="flex items-center gap-4 p-4 rounded-xl border border-border bg-surface-secondary text-left hover:border-accent hover:ring-1 hover:ring-accent transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-colors shrink-0">
                                                <Folder size={20} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold truncate text-foreground">{project.name}</h4>
                                                <p className="text-xs text-muted-foreground truncate">{project.description}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-10 text-center border-2 border-dashed border-border rounded-xl">
                                    <p className="text-muted-foreground">No projects found. Create one first!</p>
                                </div>
                            )}
                        </Modal.Body>
                        <Modal.Footer>
                            <Button variant="tertiary" onPress={onClose} isDisabled={isSubmitting}>Cancel</Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
