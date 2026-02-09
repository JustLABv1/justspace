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
                <Modal.Container size="xl">
                    <Modal.Dialog className="rounded-[2.5rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden">
                        <Modal.Header className="px-10 py-8 border-b border-border/20 flex flex-col items-start gap-1">
                            <Modal.Heading className="text-3xl font-black tracking-tight">{guide ? 'Refine Guide' : 'Draft New Guide'}</Modal.Heading>
                            <p className="text-muted-foreground text-sm font-medium mt-1">Capture technical context for the knowledge base.</p>
                        </Modal.Header>
                        <Form onSubmit={handleSubmit}>
                            <Modal.Body className="p-10 space-y-8">
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
                                            className="h-14 rounded-2xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-base font-bold transition-all mt-2" 
                                        />
                                    </TextField>

                                    <div className="flex flex-col gap-3">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Detailed Log (Markdown Supported)</Label>
                                        <div className="border border-border/30 rounded-3xl overflow-hidden bg-surface-secondary/50">
                                            <Tabs 
                                                selectedKey={activeTab} 
                                                onSelectionChange={(key) => setActiveTab(key as string)}
                                                variant="secondary"
                                                className="w-full"
                                            >
                                                <Tabs.ListContainer className="px-4 pt-4 border-b border-border/20">
                                                    <Tabs.List className="gap-2">
                                                        <Tabs.Tab id="edit" className="rounded-xl px-6 h-10 text-xs font-bold uppercase tracking-widest">Write</Tabs.Tab>
                                                        <Tabs.Tab id="preview" className="rounded-xl px-6 h-10 text-xs font-bold uppercase tracking-widest">Analyze Preview</Tabs.Tab>
                                                    </Tabs.List>
                                                </Tabs.ListContainer>

                                                <Tabs.Panel id="edit" className="p-4">
                                                    <TextArea 
                                                        value={description} 
                                                        onChange={(e) => setDescription(e.target.value)} 
                                                        placeholder="Synthesize the mission details here..." 
                                                        className="min-h-[250px] bg-transparent border-none focus:ring-0 text-sm font-medium leading-relaxed"
                                                        fullWidth
                                                    />
                                                </Tabs.Panel>
                                                <Tabs.Panel id="preview" className="p-6">
                                                    <div className="min-h-[250px] overflow-auto max-h-[400px] prose prose-sm dark:prose-invert max-w-none">
                                                        {description ? <Markdown content={description} /> : <p className="text-muted-foreground italic text-sm">Waiting for input to render...</p>}
                                                    </div>
                                                </Tabs.Panel>
                                            </Tabs>
                                        </div>
                                    </div>
                                </div>
                            </Modal.Body>
                            <Modal.Footer className="px-10 py-8 bg-surface-secondary/50 border-t border-border/20 flex justify-end gap-3">
                                <Button variant="ghost" className="rounded-xl h-12 px-6 font-bold" onPress={onClose}>
                                    Discard
                                </Button>
                                <Button type="submit" variant="primary" isPending={isLoading} className="rounded-xl h-12 px-10 font-black uppercase tracking-widest shadow-lg shadow-primary/20">
                                    {guide ? 'Synchronize' : 'Publish Guide'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
