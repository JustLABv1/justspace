'use client';

import { WikiGuide } from '@/types';
import { Button, Form, Input, Label, Modal, Tabs, TextArea, TextField } from "@heroui/react";
import React, { useEffect, useState } from 'react';
import { Markdown } from './Markdown';

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
    const [activeTab, setActiveTab] = useState('edit');

    useEffect(() => {
        if (guide) {
            setTitle(guide.title);
            setDescription(guide.description);
        } else {
            setTitle('');
            setDescription('');
        }
        setActiveTab('edit');
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
                                <div className="flex flex-col gap-6">
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

                                    <div className="flex flex-col gap-2">
                                        <Label className="text-sm font-medium">Description (Markdown)</Label>
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
                                                    value={description} 
                                                    onChange={(e) => setDescription(e.target.value)} 
                                                    placeholder="Detailed description or summary..." 
                                                    className="min-h-[200px]"
                                                    fullWidth
                                                />
                                            </Tabs.Panel>
                                            <Tabs.Panel id="preview" className="mt-4">
                                                <div className="min-h-[200px] p-4 rounded-lg bg-surface-tertiary border border-border overflow-auto max-h-[300px]">
                                                    {description ? <Markdown content={description} /> : <p className="text-muted-foreground italic text-sm">Nothing to preview yet.</p>}
                                                </div>
                                            </Tabs.Panel>
                                        </Tabs>
                                    </div>
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
