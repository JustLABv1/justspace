'use client';

import { Button, Modal } from "@heroui/react";
import { TrashBinMinimalistic as Trash } from '@solar-icons/react';
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
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-2xl p-0 overflow-hidden flex flex-col">
                        <Modal.CloseTrigger className="absolute right-8 top-7 z-50 p-3 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-8 pt-6 pb-3 border-b border-border/20 flex flex-col items-start gap-2 shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center text-danger shadow-inner">
                                <Trash size={20} weight="Bold" />
                            </div>
                            <div className="space-y-0">
                                <Modal.Heading className="text-2xl font-black tracking-tighter text-foreground leading-none">{title}_</Modal.Heading>
                                <p className="text-muted-foreground text-[10px] font-black uppercase opacity-40 ml-0.5 mt-1 tracking-widest">This action is permanent.</p>
                            </div>
                        </Modal.Header>

                        <Modal.Body className="px-8 pt-4 pb-8 flex-1 overflow-y-auto">
                            <p className="text-lg text-muted-foreground font-medium leading-relaxed opacity-80">{message}</p>
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
                                variant="danger" 
                                className="rounded-xl h-9 px-8 font-bold tracking-[0.1em] text-sm shadow-2xl shadow-danger/20" 
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
