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
            <Modal.Backdrop className="bg-background/80 backdrop-blur-md">
                <Modal.Container size="lg">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden">
                        <Modal.Header className="px-8 py-6 border-b border-border/20 flex flex-col items-start gap-1">
                            <Modal.Heading className="text-2xl font-black tracking-tight">{guide ? 'Refine Guide' : 'Draft New Guide'}</Modal.Heading>
                            <p className="text-muted-foreground text-xs font-medium">Capture technical context for the knowledge base.</p>
                        </Modal.Header>
                        <Form onSubmit={handleSubmit}>
                            <Modal.Body className="p-8 space-y-6">
                                <div className="flex flex-col gap-6">
                                    <TextField
                                        name="title"
                                        value={title}
                                        onChange={setTitle}
                                        isRequired
                                        fullWidth
                                        className="w-full"
                                    >
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Documentation Title</Label>
                                        <Input 
                                            placeholder="e.g. LGTM Stack Migration" 
                                            className="h-12 rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold transition-all mt-1.5" 
                                        />
                                    </TextField>

                                    <div className="flex flex-col gap-3">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Detailed Log (Markdown Supported)</Label>
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
                                                        value={description} 
                                                        onChange={(e) => setDescription(e.target.value)} 
                                                        placeholder="Synthesize the mission details here..." 
                                                        className="min-h-[200px] bg-transparent border-none focus:ring-0 text-sm font-medium leading-relaxed"
                                                        fullWidth
                                                    />
                                                </Tabs.Panel>
                                                <Tabs.Panel id="preview" className="p-4">
                                                    <div className="min-h-[200px] overflow-auto max-h-[350px] prose prose-sm dark:prose-invert max-w-none">
                                                        {description ? <Markdown content={description} /> : <p className="text-muted-foreground italic text-[12px]">Waiting for input to render...</p>}
                                                    </div>
                                                </Tabs.Panel>
                                            </Tabs>
                                        </div>
                                    </div>
                                </div>
                            </Modal.Body>

                            <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end gap-3">
                                <Button variant="ghost" className="rounded-xl h-10 px-5 font-bold text-sm" onPress={onClose}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" isPending={isLoading} className="rounded-xl h-10 px-8 font-black uppercase tracking-widest text-sm shadow-lg shadow-primary/10">
                                    {guide ? 'Sync Improvements' : 'Publish Guide'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};

