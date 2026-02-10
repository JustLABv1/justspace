'use client';

import { useAuth } from '@/context/AuthContext';
import { WikiGuide } from '@/types';
import { Button, Form, Input, Label, Modal, Switch, Tabs, TextArea, TextField } from "@heroui/react";
import { BookMinimalistic as Book, ShieldKeyhole as Shield } from '@solar-icons/react';
import React, { useEffect, useState } from 'react';
import { Markdown } from './Markdown';

interface WikiModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<WikiGuide> & { shouldEncrypt?: boolean }) => Promise<void>;
    guide?: WikiGuide;
}

export const WikiModal = ({ isOpen, onClose, onSubmit, guide }: WikiModalProps) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [isEncrypted, setIsEncrypted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('edit');
    const { privateKey, hasVault } = useAuth();

    useEffect(() => {
        if (guide) {
            setTitle(guide.title);
            setDescription(guide.description);
            setIsEncrypted(!!guide.isEncrypted);
        } else {
            setTitle('');
            setDescription('');
            setIsEncrypted(hasVault);
        }
        setActiveTab('edit');
    }, [guide, isOpen, hasVault]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await onSubmit({ title, description, isEncrypted, shouldEncrypt: isEncrypted });
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
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-8 top-7 z-50 p-3 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-8 pt-6 pb-3 border-b border-border/20 flex flex-col items-start gap-2 shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-inner">
                                <Book size={20} weight="Bold" />
                            </div>
                            <div className="space-y-0">
                                <Modal.Heading className="text-2xl font-black tracking-tighter text-foreground leading-none">
                                    {guide ? 'Sync Guide_' : 'Init Guide_'}
                                </Modal.Heading>
                                <p className="text-muted-foreground text-[10px] font-black uppercase opacity-40 ml-0.5 mt-1 tracking-widest">Knowledge Base Integration</p>
                            </div>
                        </Modal.Header>
                        
                        <Form onSubmit={handleSubmit} className="flex flex-col min-h-0 overflow-hidden flex-1">
                            <Modal.Body className="px-8 pt-4 pb-8 space-y-4 overflow-y-auto">
                                <div className="flex flex-col gap-6">
                                    <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-secondary/50 border border-border/10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                                                <Shield size={20} weight="Bold" />
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className="text-xs font-black uppercase tracking-widest">End-to-End Encryption</p>
                                                <p className="text-[10px] text-muted-foreground font-medium opacity-60">Vault-based client-side security</p>
                                            </div>
                                        </div>
                                        <Switch 
                                            isSelected={isEncrypted} 
                                            onChange={setIsEncrypted}
                                            isDisabled={!hasVault || (guide?.isEncrypted)} // Cannot disable once enabled for now
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

                                    <TextField
                                        name="title"
                                        value={title}
                                        onChange={setTitle}
                                        isRequired
                                        fullWidth
                                        className="w-full"
                                    >
                                        <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Document Title</Label>
                                        <Input 
                                            placeholder="e.g. System Architecture Guide" 
                                            className="h-12 rounded-xl bg-surface-secondary/50 border-border/40 hover:border-accent/40 focus:border-accent text-sm font-bold tracking-tight transition-all mt-2 px-5" 
                                        />
                                    </TextField>

                                    <div className="flex flex-col gap-4">
                                        <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Content Editor (Markdown)</Label>
                                        <div className="border border-border/20 rounded-2xl overflow-hidden bg-surface-secondary/20 shadow-inner">
                                            <Tabs 
                                                selectedKey={activeTab} 
                                                onSelectionChange={(key) => setActiveTab(key as string)}
                                                variant="secondary"
                                                className="w-full"
                                            >
                                                <Tabs.ListContainer className="p-2 border-b border-border/10">
                                                    <Tabs.List className="gap-2">
                                                        <Tabs.Tab id="edit" className="rounded-lg px-6 h-8 text-[9px] font-black tracking-[0.2em] data-[selected=true]:bg-foreground data-[selected=true]:text-background uppercase">Editor</Tabs.Tab>
                                                        <Tabs.Tab id="preview" className="rounded-lg px-6 h-8 text-[9px] font-black tracking-[0.2em] data-[selected=true]:bg-foreground data-[selected=true]:text-background uppercase">Preview</Tabs.Tab>
                                                    </Tabs.List>
                                                </Tabs.ListContainer>

                                                <Tabs.Panel id="edit" className="p-4">
                                                    <TextArea 
                                                        value={description} 
                                                        onChange={(e) => setDescription(e.target.value)} 
                                                        placeholder="Technical documentation content..." 
                                                        className="min-h-[150px] bg-transparent border-none focus:ring-0 text-sm font-medium leading-relaxed placeholder:text-muted-foreground/20"
                                                        fullWidth
                                                    />
                                                </Tabs.Panel>
                                                <Tabs.Panel id="preview" className="p-4">
                                                    <div className="min-h-[150px] overflow-auto max-h-[300px]">
                                                        {description ? <Markdown content={description} /> : <p className="text-muted-foreground/30 font-black text-center py-10 uppercase tracking-widest text-xs">No content to preview...</p>}
                                                    </div>
                                                </Tabs.Panel>
                                            </Tabs>
                                        </div>
                                    </div>
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
                                    {guide ? 'Save Changes' : 'Create Document'}
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
