'use client';

import { Project } from '@/types';
import { Button, Form, Input, Label, Modal, TextArea, TextField } from "@heroui/react";
import { Folder2 as Folder } from '@solar-icons/react';
import React, { useEffect, useState } from 'react';

interface ProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Project>) => Promise<void>;
    project?: Project;
}

export const ProjectModal = ({ isOpen, onClose, onSubmit, project }: ProjectModalProps) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<'todo' | 'in-progress' | 'completed'>('todo');
    const [daysPerWeek, setDaysPerWeek] = useState<string>('');
    const [allocatedDays, setAllocatedDays] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (project) {
            setName(project.name);
            setDescription(project.description);
            setStatus(project.status as 'todo' | 'in-progress' | 'completed');
            setDaysPerWeek(project.daysPerWeek?.toString() || '');
            setAllocatedDays(project.allocatedDays?.toString() || '');
        } else {
            setName('');
            setDescription('');
            setStatus('todo');
            setDaysPerWeek('');
            setAllocatedDays('');
        }
    }, [project, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await onSubmit({ 
                name, 
                description, 
                status,
                daysPerWeek: daysPerWeek ? parseFloat(daysPerWeek) : undefined,
                allocatedDays: allocatedDays ? parseInt(allocatedDays) : undefined
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
                className="bg-black/60 backdrop-blur-xl"
                variant="blur"
            >
                <Modal.Container className="max-w-xl pt-[10%]">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] p-0 overflow-hidden">
                        <Modal.CloseTrigger className="absolute right-8 top-8 z-50 p-3 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-8 py-8 border-b border-border/20 flex flex-col items-start gap-4">
                            <div className="w-12 h-12 rounded-[1.5rem] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                                <Folder size={24} weight="Bold" />
                            </div>
                            <div className="space-y-1">
                                <Modal.Heading className="text-3xl font-black tracking-tighter text-foreground leading-none">
                                    {project?.$id ? 'Refine Project_' : 'Init Project_'}
                                </Modal.Heading>
                                <p className="text-muted-foreground text-[11px] font-black uppercase tracking-widest opacity-40 ml-0.5 mt-1">Consultant Workspace Configuration</p>
                            </div>
                        </Modal.Header>
                        
                        <Form onSubmit={handleSubmit}>
                            <Modal.Body className="p-8 space-y-6">
                                <TextField autoFocus isRequired value={name} onChange={setName} className="w-full">
                                    <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Project Identifier</Label>
                                    <Input 
                                        placeholder="Enter project name..." 
                                        className="h-12 rounded-xl bg-surface-secondary/50 border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold tracking-tight transition-all mt-2 px-5" 
                                    />
                                </TextField>

                                <TextField value={description} onChange={setDescription} className="w-full">
                                    <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Context & Objectives</Label>
                                    <TextArea 
                                        placeholder="Briefly describe the mission specs..."
                                        className="rounded-xl bg-surface-secondary/50 border-border/40 hover:border-primary/40 focus:border-primary text-sm font-medium transition-all mt-2 min-h-[100px] p-5" 
                                    />
                                </TextField>

                                <div className="space-y-4">
                                    <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Operating Frequency Status</Label>
                                    <div className="flex bg-surface-secondary/30 p-1.5 rounded-xl border border-border/20 shadow-inner">
                                        {(['todo', 'in-progress', 'completed'] as const).map((s) => (
                                            <Button
                                                key={s}
                                                type="button"
                                                variant={status === s ? 'secondary' : 'ghost'}
                                                onPress={() => setStatus(s)}
                                                className={`flex-1 h-9 rounded-lg text-[10px] font-black uppercase tracking-[0.1em] transition-all ${
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
                                        <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Days / Week</Label>
                                        <Input 
                                            type="number"
                                            step="0.5"
                                            placeholder="e.g. 5" 
                                            className="h-12 rounded-xl bg-surface-secondary/50 border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold tracking-tight transition-all mt-2 px-5" 
                                        />
                                    </TextField>

                                    <TextField value={allocatedDays} onChange={setAllocatedDays} className="w-full">
                                        <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Total Allocation</Label>
                                        <Input 
                                            type="number"
                                            placeholder="e.g. 100" 
                                            className="h-12 rounded-xl bg-surface-secondary/50 border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold tracking-tight transition-all mt-2 px-5" 
                                        />
                                    </TextField>
                                </div>
                            </Modal.Body>

                            <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end gap-3">
                                <Button 
                                    variant="ghost" 
                                    className="rounded-xl h-10 px-8 font-bold tracking-tight opacity-40 hover:opacity-100 transition-opacity text-sm" 
                                    onPress={onClose} 
                                    isDisabled={isLoading}
                                >
                                    Abort
                                </Button>
                                <Button 
                                    type="submit"
                                    variant="primary" 
                                    className="rounded-xl h-10 px-8 font-bold tracking-[0.1em] text-sm shadow-2xl shadow-primary/20" 
                                    isPending={isLoading}
                                >
                                    {project?.$id ? 'Commit Records' : 'Execute Creation'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
