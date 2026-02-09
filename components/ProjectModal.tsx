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
                <Modal.Container size="md">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden">
                        <Modal.Header className="px-8 py-6 border-b border-border/20 flex flex-col items-start gap-1">
                            <Modal.Heading className="text-2xl font-black tracking-tight">{project?.$id ? 'Refine Project' : 'Initiate Project'}</Modal.Heading>
                            <p className="text-muted-foreground text-xs font-medium">Configure your consulting workspace and objectives.</p>
                        </Modal.Header>
                        
                        <Form onSubmit={handleSubmit}>
                            <Modal.Body className="p-8 space-y-6">
                                <TextField autoFocus isRequired value={name} onChange={setName} className="w-full">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Project Identifier</Label>
                                    <Input 
                                        placeholder="Enter project name..." 
                                        className="h-12 rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold transition-all mt-1.5" 
                                    />
                                </TextField>

                                <TextField value={description} onChange={setDescription} className="w-full">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Context & Objectives</Label>
                                    <TextArea 
                                        placeholder="Briefly describe the mission..."
                                        className="rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-medium transition-all mt-1.5 min-h-[100px]" 
                                    />
                                </TextField>

                                <div className="space-y-3">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Workflow Status</Label>
                                    <div className="flex bg-surface-secondary p-1 rounded-xl border border-border/30">
                                        {(['todo', 'in-progress', 'completed'] as const).map((s) => (
                                            <Button
                                                key={s}
                                                type="button"
                                                variant={status === s ? 'secondary' : 'ghost'}
                                                onPress={() => setStatus(s)}
                                                className={`flex-1 h-9 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                                    status === s ? 'shadow-sm text-foreground bg-surface border border-border/40' : 'text-muted-foreground'
                                                }`}
                                            >
                                                {s}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </Modal.Body>

                            <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end gap-3">
                                <Button variant="ghost" className="rounded-xl h-10 px-5 font-bold text-sm" onPress={onClose}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" isPending={isLoading} className="rounded-xl h-10 px-8 font-black uppercase tracking-widest text-sm shadow-lg shadow-primary/10">
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
