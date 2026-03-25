'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { Project } from '@/services/frontend/types';
import { Button, Form, Input, Label, Modal, Switch, TextArea, TextField } from "@heroui/react";
import { FolderOpen, Lock } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface ProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Project> & { shouldEncrypt?: boolean }) => Promise<void>;
    project?: Project;
}

export const ProjectModal = ({ isOpen, onClose, onSubmit, project }: ProjectModalProps) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<'todo' | 'in-progress' | 'completed'>('todo');
    const [daysPerWeek, setDaysPerWeek] = useState<string>('');
    const [allocatedDays, setAllocatedDays] = useState<string>('');
    const [isEncrypted, setIsEncrypted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { hasVault } = useAuth();

    useEffect(() => {
        if (project) {
            setName(project.name);
            setDescription(project.description);
            setStatus(project.status as 'todo' | 'in-progress' | 'completed');
            setDaysPerWeek(project.daysPerWeek?.toString() || '');
            setAllocatedDays(project.allocatedDays?.toString() || '');
            setIsEncrypted(!!project.isEncrypted);
        } else {
            setName('');
            setDescription('');
            setStatus('todo');
            setDaysPerWeek('');
            setAllocatedDays('');
            setIsEncrypted(hasVault);
        }
    }, [project, isOpen, hasVault]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await onSubmit({ 
                name, 
                description, 
                status,
                daysPerWeek: daysPerWeek ? parseFloat(daysPerWeek) : undefined,
                allocatedDays: allocatedDays ? parseInt(allocatedDays) : undefined,
                isEncrypted,
                shouldEncrypt: isEncrypted && !project?.isEncrypted
            });
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
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
                <Modal.Container size="lg" scroll="inside">
                    <Modal.Dialog className="rounded-xl border border-border bg-surface shadow-lg p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-4 top-4 z-50 p-1.5 rounded-md bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-6 pt-5 pb-4 border-b border-border shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground shrink-0">
                                    <FolderOpen size={14} />
                                </div>
                                <div>
                                    <Modal.Heading className="text-base font-semibold text-foreground leading-none">
                                        {project?.id ? 'Edit Project' : 'New Project'}
                                    </Modal.Heading>
                                    <p className="text-xs text-muted-foreground mt-0.5">Configure workspace project settings</p>
                                </div>
                            </div>
                        </Modal.Header>
                        
                        <Form onSubmit={handleSubmit} className="flex flex-col min-h-0 overflow-hidden flex-1">
                            <Modal.Body className="px-6 py-4 space-y-4 overflow-y-auto">
                                <div className="flex items-center justify-between py-2">
                                    <div className="flex items-center gap-2.5">
                                        <Lock size={14} className="text-muted-foreground" />
                                        <div>
                                            <p className="text-sm font-medium text-foreground">End-to-End Encryption</p>
                                            <p className="text-xs text-muted-foreground">Secure project metadata & details</p>
                                        </div>
                                    </div>
                                    <Switch 
                                        isSelected={isEncrypted} 
                                            onChange={setIsEncrypted}
                                            isDisabled={!hasVault || (project?.isEncrypted)}
                                            aria-label="Toggle encryption"
                                        >
                                            <Switch.Control>
                                                <Switch.Thumb />
                                            </Switch.Control>
                                        </Switch>
                                </div>
                                {!hasVault && (
                                    <div className="px-3 py-2 rounded-xl bg-warning-muted border border-warning/30 text-xs text-warning flex items-center gap-2">
                                        <Lock size={13} />
                                        Setup your vault in Settings to enable encryption
                                    </div>
                                )}

                                <TextField autoFocus isRequired value={name} onChange={setName} className="w-full">
                                    <Label className="text-sm font-medium text-muted-foreground">Project Name</Label>
                                    <Input 
                                        placeholder="Enter project name..." 
                                        className="h-9 rounded-xl border border-border bg-surface-secondary/50 text-sm mt-1 px-3" 
                                    />
                                </TextField>

                                <TextField value={description} onChange={setDescription} className="w-full">
                                    <Label className="text-sm font-medium text-muted-foreground">Description</Label>
                                    <TextArea 
                                        placeholder="Briefly describe the project objectives..."
                                        className="rounded-xl border border-border bg-surface-secondary/50 text-sm mt-1 min-h-[90px] p-3" 
                                    />
                                </TextField>

                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                                    <div className="flex bg-surface-secondary/50 p-1 rounded-xl border border-border">
                                        {(['todo', 'in-progress', 'completed'] as const).map((s) => (
                                            <Button
                                                key={s}
                                                type="button"
                                                variant={status === s ? 'secondary' : 'ghost'}
                                                onPress={() => setStatus(s)}
                                                className={`flex-1 h-7 rounded-md text-xs font-medium transition-all ${
                                                    status === s ? 'text-foreground bg-surface border border-border' : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                {s}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <TextField value={daysPerWeek} onChange={setDaysPerWeek} className="w-full">
                                        <Label className="text-sm font-medium text-muted-foreground">Days / Week</Label>
                                        <Input 
                                            type="number"
                                            step="0.5"
                                            placeholder="e.g. 5" 
                                            className="h-9 rounded-xl border border-border bg-surface-secondary/50 text-sm mt-1 px-3" 
                                        />
                                    </TextField>

                                    <TextField value={allocatedDays} onChange={setAllocatedDays} className="w-full">
                                        <Label className="text-sm font-medium text-muted-foreground">Total Allocation</Label>
                                        <Input 
                                            type="number"
                                            placeholder="e.g. 100" 
                                            className="h-9 rounded-xl border border-border bg-surface-secondary/50 text-sm mt-1 px-3" 
                                        />
                                    </TextField>
                                </div>
                            </Modal.Body>

                            <Modal.Footer className="px-6 py-4 bg-surface-secondary/50 border-t border-border flex justify-end gap-2">
                                <Button 
                                    variant="ghost" 
                                    className="rounded-xl h-8 px-4 text-xs font-medium" 
                                    onPress={onClose} 
                                    isDisabled={isLoading}
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    type="submit"
                                    variant="primary" 
                                    className="rounded-xl h-8 px-4 text-xs font-medium" 
                                    isPending={isLoading}
                                >
                                    {project?.id ? 'Save Changes' : 'Create Project'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
