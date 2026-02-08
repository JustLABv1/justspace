'use client';

import { WikiGuide } from '@/types';
import { Button, Form, Input, Label, Modal, TextArea, TextField } from "@heroui/react";
import React, { useEffect, useState } from 'react';

interface WikiModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<WikiGuide>) => Promise<void>;
    guide?: WikiGuide;
}

export const WikiModal = ({ isOpen, onClose, onSubmit, guide }: WikiModalProps) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (guide) {
            setTitle(guide.title);
            setDescription(guide.description);
        } else {
            setTitle('');
            setDescription('');
        }
    }, [guide, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await onSubmit({ title, description });
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
                            <Modal.Heading>{guide ? 'Edit Guide' : 'New Wiki Guide'}</Modal.Heading>
                        </Modal.Header>
                        <Form onSubmit={handleSubmit}>
                            <Modal.Body className="p-6">
                                <div className="flex flex-col gap-4">
                                    <TextField
                                        name="title"
                                        value={title}
                                        onChange={setTitle}
                                        isRequired
                                        fullWidth
                                    >
                                        <Label>Guide Title</Label>
                                        <Input placeholder="e.g. LGTM Stack Migration" />
                                    </TextField>

                                    <TextField
                                        name="description"
                                        value={description}
                                        onChange={setDescription}
                                        isRequired
                                        fullWidth
                                    >
                                        <Label>Short Description</Label>
                                        <TextArea placeholder="What is this guide about?" />
                                    </TextField>
                                </div>
                            </Modal.Body>
                            <Modal.Footer className="gap-3">
                                <Button variant="tertiary" onPress={onClose}>Cancel</Button>
                                <Button type="submit" variant="primary" isPending={isLoading}>
                                    {guide ? 'Update' : 'Create'} Guide
                                </Button>
                            </Modal.Footer>
                        </Form>
                </Modal.Dialog>
            </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
