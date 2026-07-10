'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { Snippet, SnippetBlock } from '@/services/frontend/types';
import { Button, Form, Input, Label, Modal, Switch, TextArea, TextField } from "@heroui/react";
import { Code, FileText, Lock, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

const fieldClass = "w-full flex flex-col gap-1.5";
const labelClass = "text-sm font-medium text-muted-foreground";
const inputClass = "h-10 rounded-xl text-sm px-3";
const textAreaClass = "rounded-xl text-sm p-3 resize-none";

interface SnippetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Snippet>) => Promise<void>;
    snippet?: Snippet;
}

export const SnippetModal = ({ isOpen, onClose, onSubmit, snippet }: SnippetModalProps) => {
    const [title, setTitle] = useState('');
    const [language, setLanguage] = useState('javascript');
    const [description, setDescription] = useState('');
    const [tags, setTags] = useState('');
    const [blocks, setBlocks] = useState<SnippetBlock[]>([]);
    const [isEncrypted, setIsEncrypted] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const { hasVault } = useAuth();

    useEffect(() => {
        if (snippet) {
            setTitle(snippet.title);
            setLanguage(snippet.language);
            setDescription(snippet.description || '');
            setTags(snippet.tags?.join(', ') || '');
            setIsEncrypted(snippet.isEncrypted ?? true);
            
            if (snippet.blocks) {
                try {
                    setBlocks(JSON.parse(snippet.blocks));
                } catch {
                    setBlocks([{ id: '1', type: 'code', content: snippet.content, language: snippet.language }]);
                }
            } else {
                setBlocks([{ id: '1', type: 'code', content: snippet.content, language: snippet.language }]);
            }
        } else {
            setTitle('');
            setLanguage('javascript');
            setDescription('');
            setTags('');
            setBlocks([{ id: '1', type: 'code', content: '', language: 'javascript' }]);
            setIsEncrypted(hasVault);
        }
    }, [snippet, isOpen, hasVault]);

    const addBlock = (type: 'code' | 'markdown') => {
        setBlocks([...blocks, { 
            id: Math.random().toString(36).substr(2, 9), 
            type, 
            content: '', 
            language: type === 'code' ? language : undefined 
        }]);
    };

    const removeBlock = (id: string) => {
        setBlocks(blocks.filter(b => b.id !== id));
    };

    const updateBlock = (id: string, content: string) => {
        setBlocks(blocks.map(b => b.id === id ? { ...b, content } : b));
    };

    const updateBlockLanguage = (id: string, lang: string) => {
        setBlocks(blocks.map(b => b.id === id ? { ...b, language: lang } : b));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await onSubmit({ 
                title, 
                content: blocks[0]?.content || '', // Fallback for list view/simple cases
                blocks: JSON.stringify(blocks),
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
                className="bg-black/50"
                variant="blur"
            >
                <Modal.Container size="lg" scroll="inside">
                    <Modal.Dialog className="rounded-xl border border-border bg-surface shadow-lg p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-4 top-4 z-50 p-1.5 rounded-md bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-6 pt-5 pb-4 border-b border-border shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground shrink-0">
                                    <Code size={14} />
                                </div>
                                <div>
                                    <Modal.Heading className="text-base font-semibold text-foreground leading-none">
                                        {snippet?.id ? 'Edit Snippet' : 'New Snippet'}
                                    </Modal.Heading>
                                    <p className="text-xs text-muted-foreground mt-0.5">Code inventory item</p>
                                </div>
                            </div>
                        </Modal.Header>
                        
                        <Form onSubmit={handleSubmit} className="flex flex-col min-h-0 overflow-hidden flex-1">
                            <Modal.Body className="px-6 py-4 space-y-4 overflow-y-auto">
                                <TextField autoFocus isRequired value={title} onChange={setTitle} className={fieldClass}>
                                    <Label className={labelClass}>Title</Label>
                                    <Input 
                                        placeholder="Snippet title..." 
                                        variant="secondary"
                                        className={inputClass}
                                    />
                                </TextField>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <TextField isRequired value={language} onChange={setLanguage} className={fieldClass}>
                                        <Label className={labelClass}>Language</Label>
                                        <Input 
                                            placeholder="e.g. typescript, bash" 
                                            variant="secondary"
                                            className={inputClass}
                                        />
                                    </TextField>
                                    <TextField value={tags} onChange={setTags} className={fieldClass}>
                                        <Label className={labelClass}>Tags (comma separated)</Label>
                                        <Input 
                                            placeholder="e.g. azure, auth, deployment" 
                                            variant="secondary"
                                            className={inputClass}
                                        />
                                    </TextField>
                                </div>

                                <TextField value={description} onChange={setDescription} className={fieldClass}>
                                    <Label className={labelClass}>Description</Label>
                                    <TextArea
                                        placeholder="Short explanation..."
                                        variant="secondary"
                                        className={`${textAreaClass} min-h-[60px]`}
                                    />
                                </TextField>

                                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-secondary/40 border border-border/60">
                                    <div className="flex items-center gap-2.5">
                                        <Lock size={14} className="text-muted-foreground" />
                                        <div>
                                            <p className="text-sm font-medium text-foreground">End-to-End Encryption</p>
                                            <p className="text-xs text-muted-foreground">Vault-based client-side security</p>
                                        </div>
                                    </div>
                                    <Switch 
                                        isSelected={isEncrypted} 
                                        onChange={setIsEncrypted}
                                        isDisabled={!hasVault || (snippet?.isEncrypted)}
                                        aria-label="Toggle encryption"
                                    >
                                        <Switch.Content>
                                            <Switch.Control>
                                                <Switch.Thumb />
                                            </Switch.Control>
                                        </Switch.Content>
                                    </Switch>
                                </div>

                                {!hasVault && (
                                    <div className="px-3 py-2 rounded-xl bg-warning-muted border border-warning/30 text-xs text-warning flex items-center gap-2">
                                        <Lock size={13} />
                                        Setup your vault in Settings to enable encryption
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label className={labelClass}>Blocks</Label>
                                        <div className="flex gap-2">
                                            <Button variant="secondary" size="sm" className="h-7 rounded-md text-xs font-medium" onPress={() => addBlock('code')}>
                                                <Code size={12} className="mr-1" />
                                                Add Code
                                            </Button>
                                            <Button variant="secondary" size="sm" className="h-7 rounded-md text-xs font-medium" onPress={() => addBlock('markdown')}>
                                                <FileText size={12} className="mr-1" />
                                                Add Text
                                            </Button>
                                        </div>
                                    </div>

                                    {blocks.map((block, index) => (
                                        <div key={block.id} className="relative group p-3 rounded-xl bg-surface-secondary/30 border border-border space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-5 h-5 rounded bg-surface-secondary flex items-center justify-center text-xs text-muted-foreground font-medium">
                                                        {index + 1}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {block.type}
                                                    </span>
                                                </div>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    isIconOnly 
                                                    aria-label="Remove block"
                                                    className="h-8 w-8 text-danger sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                                                    onPress={() => removeBlock(block.id)}
                                                >
                                                    <Trash2 size={13} />
                                                </Button>
                                            </div>

                                            {block.type === 'code' && (
                                                <TextField value={block.language} onChange={(l) => updateBlockLanguage(block.id, l)} className="w-fit flex flex-col">
                                                    <Input 
                                                        placeholder="Language..." 
                                                        variant="secondary"
                                                        className="h-8 px-3 rounded-md text-xs w-28"
                                                    />
                                                </TextField>
                                            )}

                                            <TextArea 
                                                value={block.content} 
                                                onChange={(e) => updateBlock(block.id, e.target.value)}
                                                placeholder={block.type === 'code' ? 'Paste code here...' : 'Enter documentation...'}
                                                variant="secondary"
                                                className={`rounded-xl w-full text-sm min-h-[100px] p-3 resize-none ${block.type === 'code' ? 'font-mono' : 'font-medium'}`}
                                            />
                                        </div>
                                    ))}
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
                                    {snippet?.id ? 'Save Changes' : 'Create Snippet'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
