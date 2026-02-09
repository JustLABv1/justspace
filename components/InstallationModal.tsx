'use client';

import { InstallationTarget } from '@/types';
import { Button, Form, Input, Label, Modal, Tabs, TextArea, TextField } from "@heroui/react";
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
        <Modal isOpen={isOpen} onOpenChange={onClose}>
            <Modal.Backdrop className="bg-background/80 backdrop-blur-md">
                <Modal.Container size="md">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden">
                        <Modal.Header className="px-8 py-6 border-b border-border/20 flex flex-col items-start gap-1">
                            <Modal.Heading className="text-2xl font-black tracking-tight">{installation ? 'Refine Target' : 'Configure Target'}</Modal.Heading>
                            <p className="text-muted-foreground text-xs font-medium">Define environment-specific parameters and checklist.</p>
                        </Modal.Header>
                        <Form onSubmit={handleSubmit}>
                            <Modal.Body className="p-8 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <TextField
                                        name="target"
                                        value={target}
                                        onChange={setTarget}
                                        isRequired
                                        className="w-full"
                                    >
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Environment Target</Label>
                                        <Input 
                                            placeholder="e.g. Azure, Linux" 
                                            className="h-11 rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold transition-all mt-1.5" 
                                        />
                                    </TextField>

                                    <TextField
                                        name="gitRepo"
                                        type="url"
                                        value={gitRepo}
                                        onChange={setGitRepo}
                                        className="w-full"
                                    >
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Repo URL</Label>
                                        <Input 
                                            placeholder="https://..." 
                                            className="h-11 rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold transition-all mt-1.5" 
                                        />
                                    </TextField>

                                    <TextField
                                        name="documentation"
                                        type="url"
                                        value={documentation}
                                        onChange={setDocumentation}
                                        className="md:col-span-2 w-full"
                                    >
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">External Docs</Label>
                                        <Input 
                                            placeholder="https://docs..." 
                                            className="h-11 rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold transition-all mt-1.5" 
                                        />
                                    </TextField>
                                </div>

                                <TextField
                                    name="tasks"
                                    value={tasksText}
                                    onChange={setTasksText}
                                    className="w-full"
                                >
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Setup Manifest (1 per line)</Label>
                                    <TextArea 
                                        placeholder="Add steps to complete..." 
                                        className="rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-medium transition-all mt-1.5 min-h-[80px]" 
                                    />
                                </TextField>

                                <div className="flex flex-col gap-3">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Deployment Manual (Markdown)</Label>
                                    <div className="border border-border/30 rounded-2xl overflow-hidden bg-surface-secondary/30">
                                        <Tabs 
                                            selectedKey={activeTab} 
                                            onSelectionChange={(key) => setActiveTab(key as string)}
                                            variant="secondary"
                                            className="w-full"
                                        >
                                            <Tabs.ListContainer className="px-3 pt-3 border-b border-border/20">
                                                <Tabs.List className="gap-2">
                                                    <Tabs.Tab id="edit" className="rounded-lg px-4 h-8 text-[10px] font-bold uppercase tracking-widest">Write</Tabs.Tab>
                                                    <Tabs.Tab id="preview" className="rounded-lg px-4 h-8 text-[10px] font-bold uppercase tracking-widest">Analyze Preview</Tabs.Tab>
                                                </Tabs.List>
                                            </Tabs.ListContainer>

                                            <Tabs.Panel id="edit" className="p-3">
                                                <TextArea 
                                                    value={notes} 
                                                    onChange={(e) => setNotes(e.target.value)} 
                                                    placeholder="Synthesize the setup guide..." 
                                                    className="min-h-[150px] bg-transparent border-none focus:ring-0 text-sm font-medium leading-relaxed"
                                                    fullWidth
                                                />
                                            </Tabs.Panel>
                                            <Tabs.Panel id="preview" className="p-4">
                                                <div className="min-h-[150px] overflow-auto max-h-[300px] prose prose-sm dark:prose-invert max-w-none">
                                                    {notes ? <Markdown content={notes} /> : <p className="text-muted-foreground italic text-[12px]">Waiting for input to render...</p>}
                                                </div>
                                            </Tabs.Panel>
                                        </Tabs>
                                    </div>
                                </div>
                            </Modal.Body>
                            <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end gap-3">
                                <Button variant="ghost" className="rounded-xl h-10 px-5 font-bold text-sm" onPress={onClose}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" isPending={isLoading} className="rounded-xl h-10 px-8 font-black uppercase tracking-widest text-sm shadow-lg shadow-primary/10">
                                    {installation ? 'Sync Updates' : 'Attach Target'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
