'use client';

import { Project } from '@/types';
import { Button, Form, Input, Label, Modal, TextArea, TextField } from "@heroui/react";
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
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (project) {
            setName(project.name);
            setDescription(project.description);
            setStatus(project.status as 'todo' | 'in-progress' | 'completed');
        } else {
            setName('');
            setDescription('');
            setStatus('todo');
        }
    }, [project, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await onSubmit({ name, description, status });
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onOpenChange={onClose}>
            <Modal.Backdrop className="bg-background/80 backdrop-blur-md">
                <Modal.Container size="lg">
                    <Modal.Dialog className="rounded-[2.5rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden">
                        <Modal.Header className="px-10 py-8 border-b border-border/20 flex flex-col items-start gap-1">
                            <Modal.Heading className="text-3xl font-black tracking-tight">{project?.$id ? 'Refine Project' : 'Initiate Project'}</Modal.Heading>
                            <p className="text-muted-foreground text-sm font-medium mt-1">Configure your consulting workspace and objectives.</p>
                        </Modal.Header>
                        
                        <Form onSubmit={handleSubmit}>
                            <Modal.Body className="p-10 space-y-8">
                                <TextField autoFocus isRequired value={name} onChange={setName} className="w-full">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Project Identifier</Label>
                                    <Input 
                                        placeholder="Enter project name..." 
                                        className="h-14 rounded-2xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-base font-bold transition-all mt-2" 
                                    />
                                </TextField>

                                <TextField value={description} onChange={setDescription} className="w-full">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Context & Objectives</Label>
                                    <TextArea 
                                        placeholder="Briefly describe the mission..."
                                        className="rounded-2xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-medium transition-all mt-2 min-h-[120px]" 
                                    />
                                </TextField>

                                <div className="space-y-3">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Workflow Status</Label>
                                    <div className="flex bg-surface-secondary p-1.5 rounded-2xl border border-border/40">
                                        {(['todo', 'in-progress', 'completed'] as const).map((s) => (
                                            <Button
                                                key={s}
                                                type="button"
                                                variant={status === s ? 'secondary' : 'ghost'}
                                                onPress={() => setStatus(s)}
                                                className={`flex-1 h-11 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                                    status === s ? 'shadow-sm text-foreground bg-surface italic border border-border/40' : 'text-muted-foreground'
                                                }`}
                                            >
                                                {s}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </Modal.Body>

                            <Modal.Footer className="px-10 py-8 bg-surface-secondary/50 border-t border-border/20 flex justify-end gap-3">
                                <Button variant="ghost" className="rounded-xl h-12 px-6 font-bold" onPress={onClose}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" isPending={isLoading} className="rounded-xl h-12 px-10 font-black uppercase tracking-widest shadow-lg shadow-primary/20">
                                    {project?.$id ? 'Apply Updates' : 'Confirm Launch'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
