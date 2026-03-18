'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { Project } from '@/types';
import { Button, Modal, Spinner } from "@heroui/react";
import { FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface ProjectSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (projectId: string) => Promise<void>;
}

export const ProjectSelectorModal = ({ isOpen, onClose, onSelect }: ProjectSelectorModalProps) => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { user, privateKey } = useAuth();

    const fetchProjects = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await db.listProjects();
            const rawProjects = data.documents;

            const processedProjects = await Promise.all(rawProjects.map(async (project) => {
                if (project.isEncrypted) {
                    if (privateKey && user) {
                        try {
                            const access = await db.getAccessKey(project.id, user.id);
                            if (access) {
                                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                                
                                const nameData = JSON.parse(project.name);
                                const decryptedName = await decryptData(nameData, docKey);
                                
                                return { ...project, name: decryptedName };
                            }
                        } catch (e) {
                            console.error('Failed to decrypt project info in selector:', e);
                            return { ...project, name: 'Decryption Error' };
                        }
                    }
                    return { ...project, name: 'Encrypted Project' };
                }
                return project;
            }));

            setProjects(processedProjects);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [privateKey, user]);

    useEffect(() => {
        if (isOpen) {
            fetchProjects();
        }
    }, [isOpen, fetchProjects]);

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
                className="bg-black/50"
                variant="blur"
            >
                <Modal.Container size="sm" scroll="inside">
                    <Modal.Dialog className="rounded-xl border border-border bg-surface shadow-lg p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-4 top-4 z-50 p-1.5 rounded-md bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-6 pt-5 pb-4 border-b border-border flex items-center gap-3 shrink-0">
                            <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground">
                                <FolderOpen size={14} />
                            </div>
                            <div>
                                <Modal.Heading className="text-base font-semibold text-foreground leading-none">Select Project</Modal.Heading>
                                <p className="text-xs text-muted-foreground mt-0.5">Choose a project to continue</p>
                            </div>
                        </Modal.Header>

                        <Modal.Body className="px-6 py-4 flex-1 overflow-y-auto">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                    <Spinner color="accent" size="sm" />
                                    <p className="text-xs text-muted-foreground">Loading projects...</p>
                                </div>
                            ) : projects.length > 0 ? (
                                <div className="flex flex-col gap-2">
                                    {projects.map((project) => (
                                        <button 
                                            key={project.id}
                                            onClick={() => handleSelect(project.id)}
                                            disabled={isSubmitting}
                                            className="flex items-center gap-3 p-3 rounded-lg border border-border text-left hover:border-accent/50 hover:bg-surface-secondary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <div className="w-8 h-8 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground shrink-0">
                                                <FolderOpen size={15} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium truncate text-sm text-foreground">{project.name}</h4>
                                                <p className="text-xs text-muted-foreground capitalize">{project.status}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-12 text-center border border-dashed border-border rounded-lg space-y-2">
                                    <div className="w-10 h-10 rounded-lg bg-surface-secondary flex items-center justify-center text-muted-foreground/40 mx-auto">
                                        <FolderOpen size={18} />
                                    </div>
                                    <p className="text-sm font-medium text-foreground">No projects</p>
                                    <p className="text-xs text-muted-foreground">Create a project to get started</p>
                                </div>
                            )}
                        </Modal.Body>

                        <Modal.Footer className="px-6 py-4 bg-surface-secondary/50 border-t border-border flex justify-end gap-2">
                            <Button 
                                variant="ghost" 
                                className="rounded-lg h-8 px-4 text-xs font-medium" 
                                onPress={onClose} 
                                isDisabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
