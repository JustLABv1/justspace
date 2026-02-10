'use client';

import { useAuth } from '@/context/AuthContext';
import { Snippet, SnippetBlock } from '@/types';
import { Button, Form, Input, Label, Modal, Switch, TextArea, TextField } from "@heroui/react";
import {
    CodeCircle as Code,
    Notes as MarkdownIcon,
    ShieldKeyhole as Shield,
    TrashBinTrash as Trash
} from '@solar-icons/react';
import React, { useEffect, useState } from 'react';

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
                className="bg-black/40 backdrop-blur-xl"
                variant="blur"
            >
                <Modal.Container size="lg" scroll="inside">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-8 top-7 z-50 p-3 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-8 pt-6 pb-3 border-b border-border/20 flex flex-col items-start gap-2 shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-inner">
                                <Code size={20} weight="Bold" />
                            </div>
                            <div className="space-y-0">
                                <Modal.Heading className="text-2xl font-black tracking-tighter text-foreground leading-none">
                                    {snippet?.$id ? 'Sync Snippet_' : 'Init Snippet_'}
                                </Modal.Heading>
                                <p className="text-muted-foreground text-[10px] font-black uppercase opacity-40 ml-0.5 mt-1 tracking-widest">Code Inventory</p>
                            </div>
                        </Modal.Header>
                        
                        <Form onSubmit={handleSubmit} className="flex flex-col min-h-0 overflow-hidden flex-1">
                            <Modal.Body className="px-8 pt-4 pb-8 space-y-4 overflow-y-auto">
                                <TextField autoFocus isRequired value={title} onChange={setTitle} className="w-full">
                                    <Label className="text-xs font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Title</Label>
                                    <Input 
                                        placeholder="Snippet title..." 
                                        className="h-11 rounded-xl bg-surface-secondary border-border/40 hover:border-accent/40 focus:border-accent text-sm font-bold transition-all mt-1.5" 
                                    />
                                </TextField>

                                <div className="grid grid-cols-2 gap-4">
                                    <TextField isRequired value={language} onChange={setLanguage} className="w-full">
                                        <Label className="text-xs font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Language</Label>
                                        <Input 
                                            placeholder="e.g. typescript, bash" 
                                            className="h-11 rounded-xl bg-surface-secondary border-border/40 hover:border-accent/40 focus:border-accent text-sm font-bold transition-all mt-1.5" 
                                        />
                                    </TextField>
                                    <TextField value={tags} onChange={setTags} className="w-full">
                                        <Label className="text-xs font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Tags (comma separated)</Label>
                                        <Input 
                                            placeholder="e.g. azure, auth, deployment" 
                                            className="h-11 rounded-xl bg-surface-secondary border-border/40 hover:border-accent/40 focus:border-accent text-sm font-bold transition-all mt-1.5" 
                                        />
                                    </TextField>
                                </div>

                                <TextField value={description} onChange={setDescription} className="w-full">
                                    <Label className="text-xs font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Description</Label>
                                    <TextArea 
                                        placeholder="Short explanation..."
                                        className="rounded-xl bg-surface-secondary border-border/40 hover:border-accent/40 focus:border-accent text-sm font-medium transition-all mt-1.5 min-h-[60px]" 
                                    />
                                </TextField>

                                <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-secondary/50 border border-border/10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                                            <Shield size={20} weight="Bold" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-xs font-black uppercase tracking-widest text-foreground">End-to-End Encryption</p>
                                            <p className="text-[10px] text-muted-foreground font-medium opacity-60">Vault-based client-side security</p>
                                        </div>
                                    </div>
                                    <Switch 
                                        isSelected={isEncrypted} 
                                        onChange={setIsEncrypted}
                                        isDisabled={!hasVault || (snippet?.isEncrypted)}
                                        aria-label="Toggle encryption"
                                    >
                                        <Switch.Control>
                                            <Switch.Thumb />
                                        </Switch.Control>
                                    </Switch>
                                </div>

                                {!hasVault && (
                                    <div className="px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[10px] font-bold text-orange-500 flex items-center gap-2">
                                        <Shield size={16} />
                                        SETUP YOUR VAULT IN SETTINGS TO ENABLE ENCRYPTION
                                    </div>
                                )}

                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Components / Blocks</Label>
                                        <div className="flex gap-2">
                                            <Button variant="secondary" size="sm" className="h-7 rounded-lg text-[10px] font-bold uppercase tracking-widest" onPress={() => addBlock('code')}>
                                                <Code size={12} className="mr-1" />
                                                Add Code
                                            </Button>
                                            <Button variant="secondary" size="sm" className="h-7 rounded-lg text-[10px] font-bold uppercase tracking-widest" onPress={() => addBlock('markdown')}>
                                                <MarkdownIcon size={12} className="mr-1" />
                                                Add Text
                                            </Button>
                                        </div>
                                    </div>

                                    {blocks.map((block, index) => (
                                        <div key={block.id} className="relative group p-4 rounded-2xl bg-surface-secondary/30 border border-border/20 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-lg bg-foreground/5 flex items-center justify-center text-[10px] font-black">
                                                        {index + 1}
                                                    </div>
                                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40">
                                                        {block.type} component
                                                    </span>
                                                </div>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    isIconOnly 
                                                    className="h-6 w-6 text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onPress={() => removeBlock(block.id)}
                                                >
                                                    <Trash size={14} />
                                                </Button>
                                            </div>

                                            {block.type === 'code' && (
                                                <TextField value={block.language} onChange={(l) => updateBlockLanguage(block.id, l)} className="w-fit">
                                                    <Input 
                                                        placeholder="Language..." 
                                                        className="h-7 px-3 rounded-lg bg-surface-secondary border-border/20 text-[10px] font-bold transition-all w-24" 
                                                    />
                                                </TextField>
                                            )}

                                            <TextArea 
                                                value={block.content} 
                                                onChange={(e) => updateBlock(block.id, e.target.value)}
                                                placeholder={block.type === 'code' ? 'Paste code component...' : 'Enter documentation block...'}
                                                className={`rounded-xl bg-surface-secondary/50 border-border/40 hover:border-accent/40 focus:border-accent text-sm transition-all min-h-[100px] ${block.type === 'code' ? 'font-mono' : 'font-medium'}`} 
                                            />
                                        </div>
                                    ))}
                                </div>
                            </Modal.Body>

                            <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end gap-3">
                                <Button 
                                    variant="ghost" 
                                    className="rounded-xl h-9 px-8 font-bold tracking-tight opacity-40 hover:opacity-100 transition-opacity text-sm" 
                                    onPress={onClose} 
                                    isDisabled={isLoading}
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    type="submit"
                                    variant="primary" 
                                    className="rounded-xl h-9 px-8 font-bold tracking-[0.1em] text-sm shadow-2xl shadow-accent/20" 
                                    isPending={isLoading}
                                >
                                    {snippet?.$id ? 'Commit Sync' : 'Execute Init'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
