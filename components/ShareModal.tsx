'use client';

import { db } from '@/lib/db';
import { AccessControl } from '@/types';
import { Button, Form, Input, Label, Modal, Spinner, TextField } from "@heroui/react";
import {
    ShareCircle as ShareIcon,
    ShieldKeyhole as Shield,
    TrashBinMinimalistic as Trash,
    UserRounded as UserIcon
} from '@solar-icons/react';
import React, { useCallback, useEffect, useState } from 'react';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    onShare: (email: string) => Promise<void>;
    resourceId: string;
    resourceType: 'Project' | 'Wiki';
    currentUserId: string;
}

interface Collaborator extends AccessControl {
    email?: string;
}

export const ShareModal = ({ isOpen, onClose, onShare, resourceId, resourceType, currentUserId }: ShareModalProps) => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingCollaborators, setIsFetchingCollaborators] = useState(false);
    const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

    const fetchCollaborators = useCallback(async () => {
        if (!isOpen) return;
        setIsFetchingCollaborators(true);
        try {
            const records = await db.listAccess(resourceId);
            // We want to show everyone EXCEPT the current user (the owner/sharer)
            const others = records.filter(r => r.userId !== currentUserId);
            
            // Try to resolve emails for these users
            const enriched = await Promise.all(others.map(async (record) => {
                try {
                    const keys = await db.getUserKeys(record.userId);
                    return { ...record, email: keys?.email || 'Unknown User' };
                } catch {
                    return { ...record, email: 'Unknown User' };
                }
            }));
            
            setCollaborators(enriched);
        } catch (error) {
            console.error('Failed to fetch collaborators:', error);
        } finally {
            setIsFetchingCollaborators(false);
        }
    }, [isOpen, resourceId, currentUserId]);

    useEffect(() => {
        fetchCollaborators();
    }, [fetchCollaborators]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            // 1. Create a Team for this project if it doesn't have one
            const project = await db.getProject(resourceId);
            let teamId = project.teamId;

            if (!teamId) {
                const team = await db.createTeam(`Project: ${project.name || resourceId}`);
                teamId = team.$id;
                // Update project with teamId
                await db.updateProject(resourceId, { teamId });
            }

            // 2. Invite user to the team
            await db.addTeamMember(teamId, email.trim());

            // 3. Proceed with existing RSA key distribution
            await onShare(email.trim());
            setEmail('');
            fetchCollaborators();
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Could not share with this email.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRevoke = async (collab: Collaborator) => {
        if (!confirm(`Revoke access for ${collab.email}?`)) return;
        
        setIsLoading(true);
        try {
            await db.revokeAccess(collab.$id, resourceId, resourceType, collab.userId);
            fetchCollaborators();
        } catch (error) {
            console.error('Revoke failed:', error);
            alert('Failed to revoke access');
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
                    <Modal.Dialog className="rounded-[2rem] border border-border/40 bg-surface shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] p-0 overflow-hidden flex flex-col max-h-[90vh]">
                        <Modal.CloseTrigger className="absolute right-8 top-7 z-50 p-3 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors text-foreground/40 hover:text-foreground" />
                        
                        <Modal.Header className="px-8 pt-6 pb-3 border-b border-border/20 flex flex-col items-start gap-2 shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-inner">
                                <ShareIcon size={20} weight="Bold" />
                            </div>
                            <div className="space-y-0">
                                <Modal.Heading className="text-2xl font-black tracking-tighter text-foreground leading-none">
                                    Access Management_
                                </Modal.Heading>
                                <p className="text-muted-foreground text-[10px] font-black uppercase opacity-40 ml-0.5 mt-1 tracking-widest">RSA Key Distribution & Revocation</p>
                            </div>
                        </Modal.Header>
                        
                        <div className="flex flex-col min-h-0 overflow-hidden flex-1">
                            <Modal.Body className="px-8 py-6 space-y-8 overflow-y-auto">
                                <div className="space-y-4">
                                    <div className="p-4 rounded-xl bg-accent/5 border border-accent/10 flex items-start gap-3">
                                        <Shield size={20} className="text-accent shrink-0 mt-0.5" />
                                        <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                                            This document is end-to-end encrypted. Sharing will encrypt the document&apos;s secret key with the recipient&apos;s public RSA key.
                                        </p>
                                    </div>

                                    <Form onSubmit={handleSubmit} className="space-y-4">
                                        <TextField
                                            name="email"
                                            value={email}
                                            onChange={setEmail}
                                            isRequired
                                            fullWidth
                                            className="w-full"
                                        >
                                            <Label className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Add Collaborator Email</Label>
                                            <div className="flex gap-2 mt-2">
                                                <Input 
                                                    type="email"
                                                    placeholder="colleague@example.com" 
                                                    className="h-12 rounded-xl bg-surface-secondary/50 border-border/40 hover:border-accent/40 focus:border-accent text-sm font-bold tracking-tight transition-all px-5 flex-1" 
                                                />
                                                <Button 
                                                    type="submit"
                                                    variant="primary" 
                                                    className="rounded-xl h-12 px-6 font-bold text-xs uppercase shadow-xl shadow-accent/20"
                                                    isPending={isLoading}
                                                >
                                                    Grant Access
                                                </Button>
                                            </div>
                                        </TextField>
                                    </Form>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black tracking-[0.3em] text-muted-foreground ml-2 opacity-60 uppercase">Current Access List</h3>
                                    
                                    {isFetchingCollaborators ? (
                                        <div className="py-8 flex justify-center"><Spinner size="sm" /></div>
                                    ) : collaborators.length > 0 ? (
                                        <div className="space-y-2">
                                            {collaborators.map((collab) => (
                                                <div key={collab.$id} className="flex items-center justify-between p-3 rounded-xl bg-surface-secondary/30 border border-border/10 group hover:border-border/40 transition-all">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center text-muted-foreground">
                                                            <UserIcon size={16} />
                                                        </div>
                                                        <span className="text-sm font-bold tracking-tight">{collab.email}</span>
                                                    </div>
                                                    <Button 
                                                        variant="ghost" 
                                                        isIconOnly 
                                                        className="h-8 w-8 rounded-lg text-danger opacity-0 group-hover:opacity-100 hover:bg-danger/5 transition-all"
                                                        onPress={() => handleRevoke(collab)}
                                                        isDisabled={isLoading}
                                                    >
                                                        <Trash size={16} />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="py-8 text-center text-xs font-bold text-muted-foreground/40 uppercase tracking-widest border-2 border-dashed border-border/20 rounded-2xl">
                                            No external collaborators
                                        </div>
                                    )}
                                </div>
                            </Modal.Body>

                            <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/20 flex justify-end">
                                <Button 
                                    variant="ghost" 
                                    className="rounded-xl h-9 px-8 font-bold tracking-tight opacity-40 hover:opacity-100 transition-opacity text-sm" 
                                    onPress={onClose}
                                >
                                    Done
                                </Button>
                            </Modal.Footer>
                        </div>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
