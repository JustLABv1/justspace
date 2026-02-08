'use client';

import { InstallationTarget } from '@/types';
import { Button, Form, Input, Label, Modal, TextArea, TextField } from "@heroui/react";
import React, { useEffect, useState } from 'react';

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
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (installation) {
            setTarget(installation.target);
            setGitRepo(installation.gitRepo || '');
            setDocumentation(installation.documentation || '');
            setNotes(installation.notes || '');
        } else {
            setTarget('');
            setGitRepo('');
            setDocumentation('');
            setNotes('');
        }
    }, [installation, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await onSubmit({ guideId, target, gitRepo, documentation, notes });
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
                                <div className="flex flex-col gap-4">
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
                                        <Label>Git Repository URL</Label>
                                        <Input placeholder="https://github.com/..." />
                                    </TextField>

                                    <TextField
                                        name="documentation"
                                        type="url"
                                        value={documentation}
                                        onChange={setDocumentation}
                                        fullWidth
                                    >
                                        <Label>Documentation URL</Label>
                                        <Input placeholder="https://docs.example.com" />
                                    </TextField>

                                    <TextField
                                        name="notes"
                                        value={notes}
                                        onChange={setNotes}
                                        fullWidth
                                    >
                                        <Label>Implementation Notes</Label>
                                        <TextArea placeholder="Add specific instructions, prerequisites, etc." />
                                    </TextField>
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
