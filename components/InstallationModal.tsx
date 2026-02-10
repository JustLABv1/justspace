'use client';

import { InstallationTarget } from '@/types';
import { Button, Form, Input, Label, Modal, Tabs, TextArea, TextField } from "@heroui/react";
import { Cpu } from '@solar-icons/react';
import React, { useEffect, useState } from 'react';
import { Markdown } from './Markdown';

interface InstallationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<InstallationTarget>) => Promise<void>;
    installation?: InstallationTarget;
    guideId: string;
}

export const InstallationModal = ({ isOpen, onClose, onSubmit, installation, guideId }: InstallationModalProps) => {
    const [target, setTarget] = useState('');
    const [gitRepo, setGitRepo] = useState('');
    const [documentation, setDocumentation] = useState('');
    const [notes, setNotes] = useState('');
    const [tasksText, setTasksText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('edit');

    useEffect(() => {
        if (installation) {
            setTarget(installation.target);
            setGitRepo(installation.gitRepo || '');
            setDocumentation(installation.documentation || '');
            setNotes(installation.notes || '');
            setTasksText(installation.tasks?.join('\n') || '');
        } else {
            setTarget('');
            setGitRepo('');
            setDocumentation('');
            setNotes('');
            setTasksText('');
        }
        setActiveTab('edit');
    }, [installation, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const tasks = tasksText.split('\n').map(t => t.trim()).filter(Boolean);
            await onSubmit({ guideId, target, gitRepo, documentation, notes, tasks });
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
                <Modal.Container className="max-w-2xl pt-[5%]">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] p-0 overflow-hidden">
                        <Modal.CloseTrigger className="absolute right-8 top-8 z-50 p-3 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-8 py-8 border-b border-border/20 flex flex-col items-start gap-4">
                            <div className="w-12 h-12 rounded-[1.5rem] bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-inner">
                                <Cpu size={24} weight="Bold" />
                            </div>
                            <div className="space-y-1">
                                <Modal.Heading className="text-3xl font-black tracking-tighter text-foreground leading-none">
                                    {installation ? 'Refine Target_' : 'Init Target_'}
                                </Modal.Heading>
                                <p className="text-muted-foreground text-[10px] uppercase font-black opacity-30 tracking-widest ml-0.5">Environment Instance Configuration</p>
                            </div>
                        </Modal.Header>

                        <Form onSubmit={handleSubmit}>
                            <Modal.Body className="p-8 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <TextField
                                        name="target"
                                        value={target}
                                        onChange={setTarget}
                                        isRequired
                                        className="w-full"
                                    >
                                        <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Target Frequency</Label>
                                        <Input 
                                            placeholder="e.g. Azure, Linux" 
                                            className="h-11 rounded-xl bg-surface-secondary/50 border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold tracking-tight transition-all mt-2 px-4" 
                                        />
                                    </TextField>

                                    <TextField
                                        name="gitRepo"
                                        type="url"
                                        value={gitRepo}
                                        onChange={setGitRepo}
                                        className="w-full"
                                    >
                                        <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Source Registry</Label>
                                        <Input 
                                            placeholder="https://..." 
                                            className="h-11 rounded-xl bg-surface-secondary/50 border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold tracking-tight transition-all mt-2 px-4" 
                                        />
                                    </TextField>

                                    <TextField
                                        name="documentation"
                                        type="url"
                                        value={documentation}
                                        onChange={setDocumentation}
                                        className="md:col-span-2 w-full"
                                    >
                                        <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">External Documentation</Label>
                                        <Input 
                                            placeholder="https://docs..." 
                                            className="h-11 rounded-xl bg-surface-secondary/50 border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold tracking-tight transition-all mt-2 px-4" 
                                        />
                                    </TextField>
                                </div>

                                <TextField
                                    name="tasks"
                                    value={tasksText}
                                    onChange={setTasksText}
                                    className="w-full"
                                >
                                    <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Deployment Checklist</Label>
                                    <TextArea 
                                        placeholder="Add step-by-step instructions..." 
                                        className="rounded-xl bg-surface-secondary/50 border-border/40 hover:border-primary/40 focus:border-primary text-sm font-medium transition-all mt-2 min-h-[100px] p-4" 
                                    />
                                </TextField>

                                <div className="flex flex-col gap-4">
                                    <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Deployment Manual (Markdown)</Label>
                                    <div className="border border-border/20 rounded-2xl overflow-hidden bg-surface-secondary/20 shadow-inner">
                                        <Tabs 
                                            selectedKey={activeTab} 
                                            onSelectionChange={(key) => setActiveTab(key as string)}
                                            variant="secondary"
                                            className="w-full"
                                        >
                                            <Tabs.ListContainer className="p-2 border-b border-border/10">
                                                <Tabs.List className="gap-2">
                                                <Tabs.Tab id="edit" className="rounded-lg px-4 h-8 text-[10px] font-black tracking-[0.2em] data-[selected=true]:bg-foreground data-[selected=true]:text-background">Write Manual</Tabs.Tab>
                                                <Tabs.Tab id="preview" className="rounded-lg px-4 h-8 text-[10px] font-black tracking-[0.2em] data-[selected=true]:bg-foreground data-[selected=true]:text-background">Analyze Preview</Tabs.Tab>
                                                </Tabs.List>
                                            </Tabs.ListContainer>

                                            <Tabs.Panel id="edit" className="p-4">
                                                <TextArea 
                                                    value={notes} 
                                                    onChange={(e) => setNotes(e.target.value)} 
                                                    placeholder="Synthesize the deployment guide..." 
                                                    className="min-h-[150px] bg-transparent border-none focus:ring-0 text-sm font-medium leading-relaxed placeholder:text-muted-foreground/20"
                                                    fullWidth
                                                />
                                            </Tabs.Panel>
                                            <Tabs.Panel id="preview" className="p-6">
                                                <div className="min-h-[150px] overflow-auto max-h-[300px] prose prose-neutral dark:prose-invert max-w-none">
                                                    {notes ? <Markdown content={notes} /> : <p className="text-muted-foreground/30 font-black text-center py-10 uppercase tracking-widest text-xs">Awaiting manual input...</p>}
                                                </div>
                                            </Tabs.Panel>
                                        </Tabs>
                                    </div>
                                </div>
                            </Modal.Body>
                            <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end gap-3">
                                <Button 
                                    variant="ghost" 
                                    className="rounded-xl h-10 px-6 font-bold tracking-tight opacity-40 hover:opacity-100 transition-opacity text-sm" 
                                    onPress={onClose} 
                                    isDisabled={isLoading}
                                >
                                    Abort
                                </Button>
                                <Button 
                                    type="submit"
                                    variant="primary" 
                                    className="rounded-xl h-10 px-8 font-bold tracking-[0.1em] text-sm shadow-2xl shadow-accent/20" 
                                    isPending={isLoading}
                                >
                                    {installation ? 'Commit Target' : 'Execute Init'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
