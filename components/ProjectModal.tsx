'use client';

import { useAuth } from '@/context/AuthContext';
import { Project } from '@/types';
import { Button, Form, Input, Label, Modal, Switch, TextArea, TextField } from "@heroui/react";
import { Folder2 as Folder, ShieldKeyhole as Shield } from '@solar-icons/react';
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
                className="bg-black/40 backdrop-blur-xl"
                variant="blur"
            >
                <Modal.Container size="lg" scroll="inside">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-8 top-7 z-50 p-3 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-8 pt-6 pb-3 border-b border-border/20 flex flex-col items-start gap-2 shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-inner">
                                <Folder size={20} weight="Bold" />
                            </div>
                            <div className="space-y-0">
                                <Modal.Heading className="text-2xl font-bold tracking-tight text-foreground leading-none">
                                    {project?.id ? 'Sync Project' : 'Init Project'}
                                </Modal.Heading>
                                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider opacity-40 ml-0.5 mt-1">Consultant Workspace Configuration</p>
                            </div>
                        </Modal.Header>
                        
                        <Form onSubmit={handleSubmit} className="flex flex-col min-h-0 overflow-hidden flex-1">
                            <Modal.Body className="px-8 pt-4 pb-8 space-y-4 overflow-y-auto">
                                <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-secondary/50 border border-border/10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                                            <Shield size={20} weight="Bold" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-xs font-bold uppercase tracking-wider">End-to-End Encryption</p>
                                            <p className="text-[10px] text-muted-foreground font-medium opacity-60">Secure project metadata & details</p>
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
                                    <div className="px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[10px] font-bold text-orange-500 flex items-center gap-2">
                                        <Shield size={16} />
                                        SETUP YOUR VAULT IN SETTINGS TO ENABLE ENCRYPTION
                                    </div>
                                )}

                                <TextField autoFocus isRequired value={name} onChange={setName} className="w-full">
                                    <Label className="text-[10px] font-bold tracking-wider text-muted-foreground ml-2 opacity-60 uppercase">Project Identifier</Label>
                                    <Input 
                                        placeholder="Enter project name..." 
                                        className="h-12 rounded-xl bg-surface-secondary/50 border-border/40 hover:border-accent/40 focus:border-accent text-sm font-bold tracking-tight transition-all mt-2 px-5" 
                                    />
                                </TextField>

                                <TextField value={description} onChange={setDescription} className="w-full">
                                    <Label className="text-[10px] font-bold tracking-wider text-muted-foreground ml-2 opacity-60 uppercase">Description</Label>
                                    <TextArea 
                                        placeholder="Briefly describe the project objectives..."
                                        className="rounded-xl bg-surface-secondary/50 border-border/40 hover:border-accent/40 focus:border-accent text-sm font-medium transition-all mt-2 min-h-[100px] p-5" 
                                    />
                                </TextField>

                                <div className="space-y-4">
                                    <Label className="text-[10px] font-bold tracking-wider text-muted-foreground ml-2 opacity-60 uppercase">Project Status</Label>
                                    <div className="flex bg-surface-secondary/30 p-1.5 rounded-xl border border-border/20 shadow-inner">
                                        {(['todo', 'in-progress', 'completed'] as const).map((s) => (
                                            <Button
                                                key={s}
                                                type="button"
                                                variant={status === s ? 'secondary' : 'ghost'}
                                                onPress={() => setStatus(s)}
                                                className={`flex-1 h-9 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                                                    status === s ? 'shadow-lg text-foreground bg-surface border border-border/40' : 'text-muted-foreground opacity-40 hover:opacity-100'
                                                }`}
                                            >
                                                {s}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <TextField value={daysPerWeek} onChange={setDaysPerWeek} className="w-full">
                                        <Label className="text-[10px] font-bold tracking-wider text-muted-foreground ml-2 opacity-60 uppercase">Days / Week</Label>
                                        <Input 
                                            type="number"
                                            step="0.5"
                                            placeholder="e.g. 5" 
                                            className="h-12 rounded-xl bg-surface-secondary/50 border-border/40 hover:border-accent/40 focus:border-accent text-sm font-bold tracking-tight transition-all mt-2 px-5" 
                                        />
                                    </TextField>

                                    <TextField value={allocatedDays} onChange={setAllocatedDays} className="w-full">
                                        <Label className="text-[10px] font-bold tracking-wider text-muted-foreground ml-2 opacity-60 uppercase">Total Allocation</Label>
                                        <Input 
                                            type="number"
                                            placeholder="e.g. 100" 
                                            className="h-12 rounded-xl bg-surface-secondary/50 border-border/40 hover:border-accent/40 focus:border-accent text-sm font-bold tracking-tight transition-all mt-2 px-5" 
                                        />
                                    </TextField>
                                </div>
                            </Modal.Body>

                            <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end gap-3">
                                <Button 
                                    variant="ghost" 
                                    className="rounded-xl h-9 px-8 font-bold tracking-tight opacity-40 hover:opacity-100 transition-opacity text-sm" 
                                    onPress={onClose} 
                                    isDisabled={isLoading}
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    type="submit"
                                    variant="primary" 
                                    className="rounded-xl h-9 px-8 font-bold tracking-tight text-sm shadow-2xl shadow-accent/20" 
                                    isPending={isLoading}
                                >
                                    {project?.id ? 'Commit Records' : 'Execute Creation'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
