'use client';

import { Snippet } from '@/types';
import { Button, Checkbox, Form, Input, Label, Modal, TextArea, TextField } from "@heroui/react";
import { CodeCircle as Code, ShieldKeyhole as Shield } from '@solar-icons/react';
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
    const [isEncrypted, setIsEncrypted] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (snippet) {
            setTitle(snippet.title);
            setContent(snippet.content);
            setLanguage(snippet.language);
            setDescription(snippet.description || '');
            setTags(snippet.tags?.join(', ') || '');
            setIsEncrypted(snippet.isEncrypted ?? true);
        } else {
            setTitle('');
            setContent('');
            setLanguage('javascript');
            setDescription('');
            setTags('');
            setIsEncrypted(true);
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
                tags: tags.split(',').map(t => t.trim()).filter(Boolean),
                isEncrypted
            });
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
                className="bg-background/80 backdrop-blur-md"
                variant="blur"
            >
                <Modal.Container size="lg">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden">
                        <Modal.CloseTrigger className="absolute right-8 top-8 z-50 p-3 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-8 py-8 border-b border-border/20 flex flex-col items-start gap-4">
                            <div className="w-12 h-12 rounded-[1.5rem] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                                <Code size={24} weight="Bold" />
                            </div>
                            <div className="space-y-1">
                                <Modal.Heading className="text-3xl font-black tracking-tighter text-foreground leading-none">
                                    {snippet?.$id ? 'Edit Snippet' : 'New Snippet'}
                                </Modal.Heading>
                                <p className="text-muted-foreground text-xs uppercase font-black opacity-30 tracking-widest ml-0.5">Securely store code snippets for your projects.</p>
                            </div>
                        </Modal.Header>
                        
                        <Form onSubmit={handleSubmit}>
                            <Modal.Body className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                                <TextField autoFocus isRequired value={title} onChange={setTitle} className="w-full">
                                    <Label className="text-xs font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Title</Label>
                                    <Input 
                                        placeholder="Snippet title..." 
                                        className="h-11 rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold transition-all mt-1.5" 
                                    />
                                </TextField>

                                <div className="grid grid-cols-2 gap-4">
                                    <TextField isRequired value={language} onChange={setLanguage} className="w-full">
                                        <Label className="text-xs font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Language</Label>
                                        <Input 
                                            placeholder="e.g. typescript, bash" 
                                            className="h-11 rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold transition-all mt-1.5" 
                                        />
                                    </TextField>
                                    <TextField value={tags} onChange={setTags} className="w-full">
                                        <Label className="text-xs font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Tags (comma separated)</Label>
                                        <Input 
                                            placeholder="e.g. azure, auth, deployment" 
                                            className="h-11 rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold transition-all mt-1.5" 
                                        />
                                    </TextField>
                                </div>

                                <TextField value={description} onChange={setDescription} className="w-full">
                                    <Label className="text-xs font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Description</Label>
                                    <TextArea 
                                        placeholder="Short explanation..."
                                        className="rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-medium transition-all mt-1.5 min-h-[60px]" 
                                    />
                                </TextField>

                                <div className="flex items-center gap-2 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                                    <Checkbox isSelected={isEncrypted} onChange={setIsEncrypted}>
                                        <div className="flex items-center gap-2 ml-2">
                                            <Shield size={18} className="text-primary" />
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-foreground">Advanced Encryption</span>
                                                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Protect with client-side RSA/AES encryption</span>
                                            </div>
                                        </div>
                                    </Checkbox>
                                </div>

                                <TextField isRequired value={content} onChange={setContent} className="w-full">
                                    <Label className="text-xs font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Content</Label>
                                    <TextArea 
                                        placeholder="Paste your code here..."
                                        className="rounded-xl bg-surface-secondary border-border/40 hover:border-primary/40 focus:border-primary text-sm font-mono transition-all mt-1.5 min-h-[150px]" 
                                    />
                                </TextField>
                            </Modal.Body>

                            <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end gap-3">
                                <Button 
                                    variant="ghost" 
                                    className="rounded-xl h-10 px-6 font-bold tracking-tight opacity-40 hover:opacity-100 transition-opacity text-sm" 
                                    onPress={onClose} 
                                    isDisabled={isLoading}
                                >
                                    Abort
                                </Button>
                                <Button 
                                    type="submit"
                                    variant="primary" 
                                    className="rounded-xl h-10 px-8 font-bold tracking-[0.1em] text-sm shadow-2xl shadow-accent/20" 
                                    isPending={isLoading}
                                >
                                    {snippet?.$id ? 'Commit Changes' : 'Execute Creation'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
