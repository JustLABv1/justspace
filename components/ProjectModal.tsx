'use client';

import { Project } from '@/types';
import { Button, Form, Input, Label, ListBox, Modal, Select, TextArea, TextField } from "@heroui/react";
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
            <Modal.Backdrop>
                <Modal.Container size="lg">
                    <Modal.Dialog>
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading>{project ? 'Edit Project' : 'New Project'}</Modal.Heading>
                        </Modal.Header>
                        <Form onSubmit={handleSubmit}>
                            <Modal.Body className="p-6">
                                <div className="flex flex-col gap-4">
                                    <TextField
                                        name="name"
                                        value={name}
                                        onChange={setName}
                                        isRequired
                                        fullWidth
                                    >
                                        <Label>Project Name</Label>
                                        <Input placeholder="e.g. Azure Migration" />
                                    </TextField>

                                    <TextField
                                        name="description"
                                        value={description}
                                        onChange={setDescription}
                                        isRequired
                                        fullWidth
                                    >
                                        <Label>Description</Label>
                                        <TextArea placeholder="Briefly describe the consulting engagement" />
                                    </TextField>

                                    <Select
                                        name="status"
                                        selectedKey={status}
                                        onSelectionChange={(key) => setStatus(key as 'todo' | 'in-progress' | 'completed')}
                                        fullWidth
                                    >
                                        <Label>Status</Label>
                                        <Select.Trigger>
                                            <Select.Value />
                                            <Select.Indicator />
                                        </Select.Trigger>
                                        <Select.Popover>
                                            <ListBox>
                                                <ListBox.Item id="todo" textValue="To Do">
                                                    To Do
                                                    <ListBox.ItemIndicator />
                                                </ListBox.Item>
                                                <ListBox.Item id="in-progress" textValue="In Progress">
                                                    In Progress
                                                    <ListBox.ItemIndicator />
                                                </ListBox.Item>
                                                <ListBox.Item id="completed" textValue="Completed">
                                                    Completed
                                                    <ListBox.ItemIndicator />
                                                </ListBox.Item>
                                            </ListBox>
                                        </Select.Popover>
                                    </Select>
                                </div>
                            </Modal.Body>
                            <Modal.Footer className="gap-3">
                                <Button variant="tertiary" onPress={onClose}>Cancel</Button>
                                <Button type="submit" variant="primary" isPending={isLoading}>
                                    {project ? 'Update' : 'Create'} Project
                                </Button>
                            </Modal.Footer>
                        </Form>
                </Modal.Dialog>
            </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
