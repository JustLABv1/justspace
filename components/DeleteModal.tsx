'use client';

import { Button, Modal } from "@heroui/react";
import React from 'react';

interface DeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    title: string;
    message: string;
}

export const DeleteModal = ({ isOpen, onClose, onConfirm, title, message }: DeleteModalProps) => {
    const [isLoading, setIsLoading] = React.useState(false);

    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            await onConfirm();
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
                <Modal.Container size="sm">
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden">
                        <Modal.Header className="px-8 py-6 border-b border-border/20">
                            <Modal.Heading className="text-xl font-black tracking-tight">{title}</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body className="p-8">
                            <p className="text-muted-foreground font-medium leading-relaxed">{message}</p>
                        </Modal.Body>
                        <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end gap-3">
                            <Button variant="ghost" className="rounded-xl h-10 px-5 font-bold text-sm" onPress={onClose}>
                                Cancel
                            </Button>
                            <Button 
                                variant="danger" 
                                className="rounded-xl h-10 px-8 font-black uppercase tracking-widest text-sm shadow-lg shadow-danger/10" 
                                onPress={handleConfirm} 
                                isPending={isLoading}
                            >
                                Confirm Delete
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
