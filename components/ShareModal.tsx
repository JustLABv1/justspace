'use client';

import { Button, Form, Input, Label, Modal, TextField } from "@heroui/react";
import { ShareCircle as ShareIcon, ShieldKeyhole as Shield } from '@solar-icons/react';
import React, { useState } from 'react';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    onShare: (email: string) => Promise<void>;
}

export const ShareModal = ({ isOpen, onClose, onShare }: ShareModalProps) => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await onShare(email);
            setEmail('');
            onClose();
        } catch (error) {
            console.error(error);
            alert('Could not find user keys for this email.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal>
            <Modal.Backdrop 
                isOpen={isOpen} 
                onOpenChange={(next) => !next && onClose()}
                className="bg-black/60 backdrop-blur-xl"
                variant="blur"
            >
                <Modal.Container size="md" scroll="inside">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-8 top-7 z-50 p-3 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-8 pt-6 pb-3 border-b border-border/20 flex flex-col items-start gap-2 shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-inner">
                                <ShareIcon size={20} weight="Bold" />
                            </div>
                            <div className="space-y-0">
                                <Modal.Heading className="text-2xl font-black tracking-tighter text-foreground leading-none">
                                    Secure Share_
                                </Modal.Heading>
                                <p className="text-muted-foreground text-[10px] font-black uppercase opacity-40 ml-0.5 mt-1 tracking-widest">RSA Key Distribution</p>
                            </div>
                        </Modal.Header>
                        
                        <Form onSubmit={handleSubmit} className="flex flex-col min-h-0 overflow-hidden flex-1">
                            <Modal.Body className="px-8 pt-4 pb-8 space-y-6">
                                <div className="space-y-4">
                                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-start gap-3">
                                        <Shield size={20} className="text-primary shrink-0 mt-0.5" />
                                        <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                                            This document is end-to-end encrypted. Sharing will encrypt the document&apos;s secret key with the recipient&apos;s public RSA key.
                                        </p>
                                    </div>

                                    <TextField
                                        name="email"
                                        value={email}
                                        onChange={setEmail}
                                        isRequired
                                        fullWidth
                                        className="w-full"
                                    >
                                        <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Recipient Email</Label>
                                        <Input 
                                            type="email"
                                            placeholder="colleague@example.com" 
                                            className="h-12 rounded-xl bg-surface-secondary/50 border-border/40 hover:border-primary/40 focus:border-primary text-sm font-bold tracking-tight transition-all mt-2 px-5" 
                                        />
                                    </TextField>
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
                                    Distribute Keys
                                </Button>
                            </Modal.Footer>
                        </Form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
