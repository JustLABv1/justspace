'use client';

import { Snippet } from '@/types';
import { Button, Form, Input, Label, Modal, TextArea, TextField } from "@heroui/react";
import React, { useEffect, useState } from 'react';

interface SnippetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Snippet>) => Promise<void>;
    snippet?: Snippet;
}

export const SnippetModal = ({ isOpen, onClose, onSubmit, snippet }: SnippetModalProps) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [language, setLanguage] = useState('javascript');
    const [description, setDescription] = useState('');
    const [tags, setTags] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (snippet) {
            setTitle(snippet.title);
            setContent(snippet.content);
            setLanguage(snippet.language);
            setDescription(snippet.description || '');
            setTags(snippet.tags?.join(', ') || '');
        } else {
            setTitle('');
            setContent('');
            setLanguage('javascript');
            setDescription('');
            setTags('');
        }
    }, [snippet, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await onSubmit({ 
                title, 
                content, 
                language, 
                description, 
                tags: tags.split(',').map(t => t.trim()).filter(Boolean) 
            });
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
                            <Modal.Heading className="text-2xl font-black tracking-tight">{snippet?.$id ? 'Edit Snippet' : 'Create Snippet'}</Modal.Heading>
                            <p className="text-muted-foreground text-xs font-medium">Store reusable code blocks for your consulting projects.</p>
                        </Modal.Header>
                        
                        <Form onSubmit={handleSubmit}>
                            <Modal.Body className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                                <TextField autoFocus isRequired value={title} onChange={setTitle} className="w-full">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Title</Label>
                                    <Input 
                                        placeholder="Snippet title..." 
                                        className="h-12 rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold transition-all mt-1.5" 
                                    />
                                </TextField>

                                <div className="grid grid-cols-2 gap-4">
                                    <TextField isRequired value={language} onChange={setLanguage} className="w-full">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Language</Label>
                                        <Input 
                                            placeholder="e.g. typescript, bash" 
                                            className="h-12 rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold transition-all mt-1.5" 
                                        />
                                    </TextField>
                                    <TextField value={tags} onChange={setTags} className="w-full">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Tags (comma separated)</Label>
                                        <Input 
                                            placeholder="e.g. azure, auth, deployment" 
                                            className="h-12 rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold transition-all mt-1.5" 
                                        />
                                    </TextField>
                                </div>

                                <TextField value={description} onChange={setDescription} className="w-full">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Description</Label>
                                    <TextArea 
                                        placeholder="Short explanation..."
                                        className="rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-medium transition-all mt-1.5 min-h-[60px]" 
                                    />
                                </TextField>

                                <TextField isRequired value={content} onChange={setContent} className="w-full">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Content</Label>
                                    <TextArea 
                                        placeholder="Paste your code here..."
                                        className="rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-mono transition-all mt-1.5 min-h-[200px]" 
                                    />
                                </TextField>
                            </Modal.Body>

                            <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end gap-3">
                                <Button variant="ghost" className="rounded-xl h-10 px-5 font-bold text-sm" onPress={onClose}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" isPending={isLoading} className="rounded-xl h-10 px-8 font-black uppercase tracking-widest text-sm shadow-lg shadow-primary/10">
                                    {snippet?.$id ? 'Save Changes' : 'Create Snippet'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
