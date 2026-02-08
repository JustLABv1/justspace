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
            <Modal.Backdrop>
                <Modal.Container>
                    <Modal.Dialog>
                        <Modal.Header>
                            <Modal.Heading>{title}</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            <p className="text-muted-foreground">{message}</p>
                        </Modal.Body>
                        <Modal.Footer className="gap-3">
                            <Button variant="ghost" onPress={onClose}>Cancel</Button>
                            <Button variant="danger" onPress={handleConfirm} isPending={isLoading}>
                                Delete
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
