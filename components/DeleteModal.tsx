'use client';

import { Button, Modal } from "@heroui/react";
import { Trash2 } from 'lucide-react';
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
        <Modal>
            <Modal.Backdrop 
                isOpen={isOpen} 
                onOpenChange={(next) => !next && onClose()}
                className="bg-background/80 backdrop-blur-md"
                variant="blur"
            >
                <Modal.Container size="sm" scroll="inside">
                    <Modal.Dialog className="rounded-xl border border-border bg-surface shadow-lg p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-4 top-4 z-50 p-1.5 rounded-md hover:bg-surface-secondary transition-colors text-muted-foreground hover:text-foreground" />
                        
                        <Modal.Header className="px-6 pt-5 pb-3 border-b border-border flex items-center gap-3 shrink-0">
                            <div className="w-8 h-8 rounded-md bg-danger/10 flex items-center justify-center text-danger">
                                <Trash2 size={15} />
                            </div>
                            <div>
                                <Modal.Heading className="text-base font-semibold text-foreground">{title}</Modal.Heading>
                                <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
                            </div>
                        </Modal.Header>

                        <Modal.Body className="px-6 py-4 flex-1 overflow-y-auto">
                            <p className="text-sm text-muted-foreground">{message}</p>
                        </Modal.Body>

                        <Modal.Footer className="px-6 py-4 bg-surface-secondary/50 border-t border-border flex justify-end gap-2">
                            <Button 
                                variant="ghost" 
                                className="rounded-lg h-8 px-4 text-xs font-medium" 
                                onPress={onClose} 
                                isDisabled={isLoading}
                            >
                                Cancel
                            </Button>
                            <Button 
                                variant="danger" 
                                className="rounded-lg h-8 px-4 text-xs font-medium" 
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
