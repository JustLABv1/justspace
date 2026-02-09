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
            <Modal.Backdrop>
                <Modal.Container size="lg">
                    <Modal.Dialog>
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading>{installation ? 'Edit Installation' : 'Add Installation Target'}</Modal.Heading>
                        </Modal.Header>
                        <Form onSubmit={handleSubmit}>
                            <Modal.Body className="p-6">
                                <div className="flex flex-col gap-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <TextField
                                            name="target"
                                            value={target}
                                            onChange={setTarget}
                                            isRequired
                                            fullWidth
                                        >
                                            <Label>Target Name</Label>
                                            <Input placeholder="e.g. Azure, Linux, AWS" />
                                        </TextField>

                                        <TextField
                                            name="gitRepo"
                                            type="url"
                                            value={gitRepo}
                                            onChange={setGitRepo}
                                            fullWidth
                                        >
                                            <Label>Git Repository</Label>
                                            <Input placeholder="https://github.com/..." />
                                        </TextField>

                                        <TextField
                                            name="documentation"
                                            type="url"
                                            value={documentation}
                                            onChange={setDocumentation}
                                            fullWidth
                                            className="md:col-span-2"
                                        >
                                            <Label>Documentation URL</Label>
                                            <Input placeholder="https://docs.example.com" />
                                        </TextField>
                                    </div>

                                    <TextField
                                        name="tasks"
                                        value={tasksText}
                                        onChange={setTasksText}
                                        fullWidth
                                    >
                                        <Label>Setup Checklist (one per line)</Label>
                                        <TextArea placeholder="e.g.&#10;Install dependencies&#10;Configure API keys&#10;Run migrations" />
                                    </TextField>

                                    <div className="flex flex-col gap-2">
                                        <Label className="text-sm font-medium">Implementation Notes (Markdown)</Label>
                                        <Tabs 
                                            selectedKey={activeTab} 
                                            onSelectionChange={(key) => setActiveTab(key as string)}
                                            variant="secondary"
                                            className="w-full"
                                        >
                                            <Tabs.ListContainer>
                                                <Tabs.List className="w-fit">
                                                    <Tabs.Tab id="edit">Write</Tabs.Tab>
                                                    <Tabs.Tab id="preview">Preview</Tabs.Tab>
                                                </Tabs.List>
                                            </Tabs.ListContainer>

                                            <Tabs.Panel id="edit" className="mt-4">
                                                <TextArea 
                                                    value={notes} 
                                                    onChange={(e) => setNotes(e.target.value)} 
                                                    placeholder="Add instructions using Markdown..." 
                                                    className="min-h-[250px] font-mono text-sm leading-relaxed"
                                                    fullWidth
                                                />
                                            </Tabs.Panel>
                                            <Tabs.Panel id="preview" className="mt-4">
                                                <div className="min-h-[250px] p-4 rounded-lg bg-surface-tertiary border border-border overflow-auto max-h-[400px]">
                                                    {notes ? (
                                                        <Markdown content={notes} />
                                                    ) : (
                                                        <p className="text-muted-foreground italic text-sm">Nothing to preview yet.</p>
                                                    )}
                                                </div>
                                            </Tabs.Panel>
                                        </Tabs>
                                    </div>
                                </div>
                            </Modal.Body>
                            <Modal.Footer className="gap-3">
                                <Button variant="tertiary" onPress={onClose}>Cancel</Button>
                                <Button type="submit" variant="primary" isPending={isLoading}>
                                    {installation ? 'Update' : 'Add'} Target
                                </Button>
                            </Modal.Footer>
                        </Form>
                </Modal.Dialog>
            </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
