'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { Alert, Button, Form, InputGroup, Label, Modal, TextField } from '@heroui/react';
import { Binary, KeyRound, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

export const VaultBanner = () => {
    const { hasVault, privateKey, unlockVault, logout } = useAuth();
    const [password, setPassword] = useState('');
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [error, setError] = useState('');

    if (!hasVault || privateKey) return null;

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsUnlocking(true);
        setError('');
        try {
            await unlockVault(password);
            setPassword('');
        } catch {
            setError('Incorrect password. Please try again.');
        } finally {
            setIsUnlocking(false);
        }
    };

    return (
        <Modal>
            <Modal.Backdrop
                isOpen
                isDismissable={false}
                isKeyboardDismissDisabled
                variant="blur"
                className="vault-modal__backdrop data-[entering]:duration-300 data-[exiting]:duration-200"
            >
                <Modal.Container className="data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95 data-[entering]:duration-300 data-[entering]:ease-[cubic-bezier(0.23,1,0.32,1)]">
                    <Modal.Dialog className="vault-modal__dialog sm:max-w-[460px]">
                        <div className="vault-encryption" aria-hidden="true">
                            <div className="vault-encryption__glow" />
                            <div className="vault-encryption__orbit vault-encryption__orbit--outer"><span /><span /><span /></div>
                            <div className="vault-encryption__orbit vault-encryption__orbit--inner"><span /><span /></div>
                            <div className="vault-encryption__core">
                                <LockKeyhole className="size-7" />
                                <div className="vault-encryption__scan" />
                            </div>
                            <span className="vault-encryption__code vault-encryption__code--one">01101</span>
                            <span className="vault-encryption__code vault-encryption__code--two">AES-256</span>
                        </div>

                        <Modal.Header className="items-center text-center">
                            <div className="mx-auto mb-2 flex items-center gap-1.5 text-xs font-medium text-accent"><ShieldCheck className="size-4" /> Encrypted workspace</div>
                            <Modal.Heading className="text-2xl font-semibold tracking-[-0.03em]">Your vault is locked</Modal.Heading>
                        </Modal.Header>

                        <Modal.Body className="text-center">
                            <p className="mx-auto max-w-[350px] text-sm leading-6 text-muted-foreground">
                                Your projects and knowledge are encrypted. Enter your vault password to reconstruct your private key on this device.
                            </p>

                            <div className="my-2 flex items-center justify-center gap-4 text-[11px] font-medium text-muted-foreground">
                                <span className="flex items-center gap-1.5"><Binary className="size-3.5 text-accent" /> Local decryption</span>
                                <span className="size-1 rounded-full bg-border" />
                                <span className="flex items-center gap-1.5"><KeyRound className="size-3.5 text-accent" /> Zero-knowledge</span>
                            </div>

                            {error && <Alert status="danger"><Alert.Content><Alert.Description>{error}</Alert.Description></Alert.Content></Alert>}

                            <Form onSubmit={handleUnlock} className="mt-2 w-full space-y-3 text-left">
                                <TextField fullWidth value={password} onChange={(value) => { setPassword(value); setError(''); }}>
                                    <Label>Vault password</Label>
                                    <InputGroup>
                                        <InputGroup.Prefix><KeyRound className="size-4 text-muted-foreground" /></InputGroup.Prefix>
                                        <InputGroup.Input type="password" autoFocus placeholder="Enter your vault password" required />
                                    </InputGroup>
                                </TextField>
                                <Button type="submit" fullWidth className="h-11 rounded-xl font-medium" isPending={isUnlocking}>
                                    <LockKeyhole className="size-4" />
                                    {isUnlocking ? 'Decrypting workspace…' : 'Decrypt & unlock'}
                                </Button>
                            </Form>
                        </Modal.Body>

                        <Modal.Footer className="justify-center pt-0">
                            <Button variant="ghost" size="sm" onPress={logout}>
                                <LogOut className="size-3.5" /> Sign out instead
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
