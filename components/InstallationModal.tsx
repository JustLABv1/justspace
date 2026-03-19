'use client';

import { InstallationTarget } from '@/types';
import { Button, Form, Input, Label, Modal, Tabs, TextArea, TextField } from "@heroui/react";
import { Server } from 'lucide-react';
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
                className="bg-black/50"
                variant="blur"
            >
                <Modal.Container size="lg" scroll="inside">
                    <Modal.Dialog className="rounded-xl border border-border bg-surface shadow-lg p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-4 top-4 z-50 p-1.5 rounded-md bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-6 pt-5 pb-4 border-b border-border shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground shrink-0">
                                    <Server size={14} />
                                </div>
                                <div>
                                    <Modal.Heading className="text-base font-semibold text-foreground leading-none">
                                        {installation ? 'Edit Target' : 'New Target'}
                                    </Modal.Heading>
                                    <p className="text-xs text-muted-foreground mt-0.5">Installation target configuration</p>
                                </div>
                            </div>
                        </Modal.Header>

                        <Form onSubmit={handleSubmit} className="flex flex-col min-h-0 overflow-hidden flex-1">
                            <Modal.Body className="px-6 py-4 space-y-4 overflow-y-auto">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <TextField
                                        name="target"
                                        value={target}
                                        onChange={setTarget}
                                        isRequired
                                        className="w-full"
                                    >
                                        <Label className="text-sm font-medium text-muted-foreground">Target Name</Label>
                                        <Input 
                                            placeholder="e.g. Azure, Linux" 
                                            className="h-9 rounded-xl border border-border bg-surface-secondary/50 text-sm mt-1 px-3" 
                                        />
                                    </TextField>

                                    <TextField
                                        name="gitRepo"
                                        type="url"
                                        value={gitRepo}
                                        onChange={setGitRepo}
                                        className="w-full"
                                    >
                                        <Label className="text-sm font-medium text-muted-foreground">Git Repository</Label>
                                        <Input 
                                            placeholder="https://..." 
                                            className="h-9 rounded-xl border border-border bg-surface-secondary/50 text-sm mt-1 px-3" 
                                        />
                                    </TextField>

                                    <TextField
                                        name="documentation"
                                        type="url"
                                        value={documentation}
                                        onChange={setDocumentation}
                                        className="md:col-span-2 w-full"
                                    >
                                        <Label className="text-sm font-medium text-muted-foreground">Documentation URL</Label>
                                        <Input 
                                            placeholder="https://docs..." 
                                            className="h-9 rounded-xl border border-border bg-surface-secondary/50 text-sm mt-1 px-3" 
                                        />
                                    </TextField>
                                </div>

                                <TextField
                                    name="tasks"
                                    value={tasksText}
                                    onChange={setTasksText}
                                    className="w-full"
                                >
                                    <Label className="text-sm font-medium text-muted-foreground">Tasks (one per line)</Label>
                                    <TextArea 
                                        placeholder="Add step-by-step instructions..." 
                                        className="rounded-xl border border-border bg-surface-secondary/50 text-sm mt-1 min-h-[80px] p-3" 
                                    />
                                </TextField>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-sm font-medium text-muted-foreground">Notes (Markdown)</Label>
                                    <div className="border border-border rounded-xl overflow-hidden bg-surface-secondary/20">
                                        <Tabs 
                                            selectedKey={activeTab} 
                                            onSelectionChange={(key) => setActiveTab(key as string)}
                                            variant="secondary"
                                            className="w-full"
                                        >
                                            <Tabs.ListContainer className="px-2 pt-1.5 border-b border-border">
                                                <Tabs.List className="gap-1">
                                                <Tabs.Tab id="edit" className="rounded-md px-3 h-7 text-xs font-medium data-[selected=true]:bg-foreground data-[selected=true]:text-background">Editor</Tabs.Tab>
                                                <Tabs.Tab id="preview" className="rounded-md px-3 h-7 text-xs font-medium data-[selected=true]:bg-foreground data-[selected=true]:text-background">Preview</Tabs.Tab>
                                                </Tabs.List>
                                            </Tabs.ListContainer>

                                            <Tabs.Panel id="edit" className="p-4">
                                                <TextArea 
                                                    value={notes} 
                                                    onChange={(e) => setNotes(e.target.value)} 
                                                    placeholder="Deployment guide..." 
                                                    className="min-h-[150px] bg-transparent border-none focus:ring-0 text-sm font-medium leading-relaxed"
                                                    fullWidth
                                                />
                                            </Tabs.Panel>
                                            <Tabs.Panel id="preview" className="p-4">
                                                <div className="min-h-[150px] overflow-auto max-h-[300px]">
                                                    {notes ? <Markdown content={notes} /> : <p className="text-muted-foreground/40 text-center py-10 text-xs">No content to preview...</p>}
                                                </div>
                                            </Tabs.Panel>
                                        </Tabs>
                                    </div>
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
                                    {installation ? 'Save Changes' : 'Create Target'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
