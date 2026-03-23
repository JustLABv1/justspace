'use client';

import { InstallationTarget } from '@/types';
import { Button, Form, Input, Label, Modal, TextField } from "@heroui/react";
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
    const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

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
                                <div className="w-7 h-7 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                                    <Server size={14} className="text-accent" />
                                </div>
                                <div>
                                    <Modal.Heading className="text-base font-semibold text-foreground leading-none">
                                        {installation ? 'Edit Target' : 'New Target'}
                                    </Modal.Heading>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Installation target configuration
                                    </p>
                                </div>
                            </div>
                        </Modal.Header>

                        <Form onSubmit={handleSubmit} className="flex flex-col min-h-0 overflow-hidden flex-1">
                            <Modal.Body className="px-6 py-4 space-y-4 overflow-y-auto">
                                {/* Target name + Git repo */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <TextField
                                        name="target"
                                        value={target}
                                        onChange={setTarget}
                                        isRequired
                                        className="w-full"
                                    >
                                        <Label className="text-[12px] font-medium text-muted-foreground">Target Name</Label>
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
                                        <Label className="text-[12px] font-medium text-muted-foreground">Git Repository</Label>
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
                                        <Label className="text-[12px] font-medium text-muted-foreground">Documentation URL</Label>
                                        <Input
                                            placeholder="https://docs..."
                                            className="h-9 rounded-xl border border-border bg-surface-secondary/50 text-sm mt-1 px-3"
                                        />
                                    </TextField>
                                </div>

                                {/* Tasks */}
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-[12px] font-medium text-muted-foreground">
                                        Tasks <span className="text-muted-foreground/50 font-normal">(one per line)</span>
                                    </Label>
                                    <textarea
                                        value={tasksText}
                                        onChange={(e) => setTasksText(e.target.value)}
                                        placeholder="Add step-by-step instructions..."
                                        className="w-full rounded-xl border border-border bg-surface-secondary/50 text-sm p-3 min-h-[80px] resize-none outline-none focus:border-accent/60 transition-colors placeholder:text-muted-foreground/40 text-foreground"
                                    />
                                </div>

                                {/* Notes markdown editor */}
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[12px] font-medium text-muted-foreground">Notes (Markdown)</Label>
                                        <div className="flex items-center gap-0.5 p-0.5 bg-surface-secondary rounded-lg">
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('edit')}
                                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                                    activeTab === 'edit'
                                                        ? 'bg-background text-foreground shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                Editor
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('preview')}
                                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                                    activeTab === 'preview'
                                                        ? 'bg-background text-foreground shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                Preview
                                            </button>
                                        </div>
                                    </div>

                                    <div className="border border-border rounded-xl overflow-hidden bg-surface-secondary/20">
                                        {activeTab === 'edit' ? (
                                            <textarea
                                                value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                                placeholder="Deployment guide, configuration steps..."
                                                className="min-h-[180px] w-full bg-transparent border-none outline-none text-sm font-medium leading-relaxed placeholder:text-muted-foreground/30 p-4 resize-none text-foreground"
                                            />
                                        ) : (
                                            <div className="min-h-[180px] p-4 max-h-[300px] overflow-auto">
                                                {notes
                                                    ? <Markdown content={notes} />
                                                    : <p className="text-muted-foreground/40 text-center py-10 text-xs">Nothing to preview...</p>
                                                }
                                            </div>
                                        )}
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
