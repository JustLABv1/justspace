'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { WikiGuide } from '@/services/frontend/types';
import { Button, Form, Input, Label, Modal, Switch, TextField } from "@heroui/react";
import { BookOpen, Lock } from 'lucide-react';
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
    const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
    const { hasVault } = useAuth();

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
                className="bg-black/50"
                variant="blur"
            >
                <Modal.Container size="lg" scroll="inside">
                    <Modal.Dialog className="rounded-xl border border-border bg-surface shadow-lg p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-4 top-4 z-50 p-1.5 rounded-md bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />

                        <Modal.Header className="px-6 pt-5 pb-4 border-b border-border shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                                    <BookOpen size={14} className="text-accent" />
                                </div>
                                <div>
                                    <Modal.Heading className="text-base font-semibold text-foreground leading-none">
                                        {guide ? 'Edit Guide' : 'New Guide'}
                                    </Modal.Heading>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {guide ? 'Update your knowledge base document' : 'Create a new knowledge base document'}
                                    </p>
                                </div>
                            </div>
                        </Modal.Header>

                        <Form onSubmit={handleSubmit} className="flex flex-col min-h-0 overflow-hidden flex-1">
                            <Modal.Body className="px-6 py-4 space-y-4 overflow-y-auto">
                                {/* Encryption toggle */}
                                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-secondary/50 border border-border/60">
                                    <div className="flex items-center gap-2.5">
                                        <Lock size={13} className="text-muted-foreground" />
                                        <div>
                                            <p className="text-[13px] font-medium text-foreground">End-to-End Encryption</p>
                                            <p className="text-[11px] text-muted-foreground">Vault-based client-side security</p>
                                        </div>
                                    </div>
                                    <Switch
                                        isSelected={isEncrypted}
                                        onChange={setIsEncrypted}
                                        isDisabled={!hasVault || (guide?.isEncrypted)}
                                        aria-label="Toggle encryption"
                                    >
                                        <Switch.Control>
                                            <Switch.Thumb />
                                        </Switch.Control>
                                    </Switch>
                                </div>

                                {!hasVault && (
                                    <div className="px-3 py-2 rounded-xl bg-warning/10 border border-warning/20 text-[12px] text-warning flex items-center gap-2">
                                        <Lock size={12} />
                                        Set up your vault in Settings to enable encryption
                                    </div>
                                )}

                                {/* Title */}
                                <TextField
                                    name="title"
                                    value={title}
                                    onChange={setTitle}
                                    isRequired
                                    fullWidth
                                    className="w-full flex flex-col"
                                >
                                    <Label className="text-[12px] font-medium text-muted-foreground">Document Title</Label>
                                    <Input
                                        placeholder="e.g. System Architecture Guide"
                                        className="h-9 rounded-xl border border-border bg-surface-secondary/50 text-sm mt-1 px-3"
                                    />
                                </TextField>

                                {/* Markdown editor */}
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[12px] font-medium text-muted-foreground">Content (Markdown)</Label>
                                        <div className="flex items-center gap-0.5 p-0.5 bg-surface-secondary rounded-lg">
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('edit')}
                                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                                    activeTab === 'edit'
                                                        ? 'bg-background text-foreground shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                Editor
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('preview')}
                                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                                    activeTab === 'preview'
                                                        ? 'bg-background text-foreground shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                Preview
                                            </button>
                                        </div>
                                    </div>

                                    <div className="border border-border rounded-xl overflow-hidden bg-surface-secondary/20">
                                        {activeTab === 'edit' ? (
                                            <textarea
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                placeholder="Technical documentation content..."
                                                className="min-h-[200px] w-full bg-transparent border-none outline-none text-sm font-medium leading-relaxed placeholder:text-muted-foreground/30 p-4 resize-none text-foreground"
                                            />
                                        ) : (
                                            <div className="min-h-[200px] p-4 max-h-[300px] overflow-auto">
                                                {description
                                                    ? <Markdown content={description} />
                                                    : <p className="text-muted-foreground/40 text-center py-10 text-xs">Nothing to preview...</p>
                                                }
                                            </div>
                                        )}
                                    </div>
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
