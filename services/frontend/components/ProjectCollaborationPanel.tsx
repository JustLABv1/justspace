'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { useWorkspace } from '@/services/frontend/context/WorkspaceContext';
import { WorkspaceMember } from '@/services/frontend/lib/api';
import { decryptBytes, decryptData, decryptDocumentKey, encryptBytes, encryptData, encryptDocumentKey } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { wsClient, WSEvent } from '@/services/frontend/lib/ws';
import { ActivityLog, PresenceSession, Project, ProjectFile, ProjectMember, ProjectMemberAllocation, TeamInvitation } from '@/services/frontend/types';
import { Avatar, Button, Chip, Description, Dropdown, Input, Label, ListBox, Modal, Select, Tabs, toast } from '@heroui/react';
import dayjs from 'dayjs';
import { saveAs } from 'file-saver';
import { FileText, FolderUp, Link as LinkIcon, Mail, MoreHorizontal, Trash2, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

type CollaborationTab = 'team' | 'files' | 'activity';
type InviteRole = 'admin' | 'editor' | 'viewer';

const inviteRoleLabels: Record<InviteRole, string> = {
    admin: 'Admin',
    editor: 'Editor',
    viewer: 'Viewer',
};

export function ProjectCollaborationPanel({ project, compact = false }: { project: Project; compact?: boolean }) {
    const { privateKey } = useAuth();
    const { workspace } = useWorkspace();
    const [selectedTab, setSelectedTab] = useState<CollaborationTab>('team');
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
    const [invites, setInvites] = useState<TeamInvitation[]>([]);
    const [files, setFiles] = useState<ProjectFile[]>([]);
    const [activity, setActivity] = useState<ActivityLog[]>([]);
    const [decryptedActivity, setDecryptedActivity] = useState<ActivityLog[]>([]);
    const [presence, setPresence] = useState<PresenceSession[]>([]);
    const [allocations, setAllocations] = useState<ProjectMemberAllocation[]>([]);
    const [docKey, setDocKey] = useState<CryptoKey | null>(null);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        let ignore = false;

        const loadDocKey = async () => {
            if (!project.isEncrypted || !privateKey) {
                setDocKey(null);
                return;
            }
            try {
                const access = await db.getAccessKey(project.id);
                if (!access || ignore) {
                    return;
                }
                const nextKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                if (!ignore) {
                    setDocKey(nextKey);
                }
            } catch (error) {
                console.error('Failed to load project key for collaboration:', error);
            }
        };

        void loadDocKey();
        return () => {
            ignore = true;
        };
    }, [project.id, project.isEncrypted, privateKey]);

    useEffect(() => {
        const load = async () => {
            try {
                const [memberRes, workspaceMemberRes, inviteRes, fileRes, activityRes, presenceRes, allocationRes] = await Promise.all([
                    db.listProjectMembers(project.id),
                    project.workspaceId ? db.listWorkspaceMembers(project.workspaceId) : Promise.resolve({ documents: [] as WorkspaceMember[] }),
                    db.listProjectInvitations(project.id),
                    db.listProjectFiles(project.id),
                    db.listProjectActivity(project.id),
                    db.heartbeatProjectPresence(project.id),
                    db.listProjectAllocations(project.id),
                ]);
                setMembers(memberRes.documents);
                setWorkspaceMembers(workspaceMemberRes.documents);
                setInvites(inviteRes.documents);
                setFiles(fileRes.documents);
                setActivity(activityRes.documents);
                setPresence(presenceRes.documents);
                setAllocations(allocationRes.documents);
            } catch (error) {
                console.error('Failed to load collaboration panel:', error);
            }
        };

        void load();

        const unsubscribe = wsClient.subscribe((event: WSEvent) => {
            const payload = event.document as Partial<ProjectFile> & { projectId?: string };
            const eventProjectId = payload.projectId || ('projectId' in payload ? payload.projectId : undefined);
            if (eventProjectId && eventProjectId !== project.id) {
                return;
            }
            if (event.collection === 'project_members') {
                void db.listProjectMembers(project.id).then((response) => setMembers(response.documents)).catch(console.error);
            }
            if (event.collection === 'workspace_members' && project.workspaceId) {
                void db.listWorkspaceMembers(project.workspaceId).then((response) => setWorkspaceMembers(response.documents)).catch(console.error);
            }
            if (event.collection === 'team_invitations') {
                void db.listProjectInvitations(project.id).then((response) => setInvites(response.documents)).catch(console.error);
            }
            if (event.collection === 'project_files') {
                void db.listProjectFiles(project.id).then((response) => setFiles(response.documents)).catch(console.error);
            }
            if (event.collection === 'project_activity') {
                if (Array.isArray(event.document)) {
                    setActivity(event.document as ActivityLog[]);
                } else {
                    void db.listProjectActivity(project.id).then((response) => setActivity(response.documents)).catch(console.error);
                }
            }
            if (event.collection === 'project_presence' && Array.isArray(event.document)) {
                setPresence(event.document as PresenceSession[]);
            }
        });

        return () => unsubscribe();
    }, [project.id]);

    useEffect(() => {
        const tick = () => {
            void db.heartbeatProjectPresence(project.id)
                .then((response) => setPresence(response.documents))
                .catch(console.error);
        };
        tick();
        const timer = window.setInterval(tick, 20000);
        return () => window.clearInterval(timer);
    }, [project.id]);

    useEffect(() => {
        let ignore = false;

        const decryptActivity = async () => {
            const next = await Promise.all(activity.map(async (item) => {
                const isEncrypted = (() => {
                    try {
                        const parsed = JSON.parse(item.entityName);
                        return typeof parsed?.ciphertext === 'string';
                    } catch {
                        return false;
                    }
                })();

                if (!isEncrypted || !docKey) {
                    return item;
                }
                try {
                    const decryptedName = await decryptData(JSON.parse(item.entityName), docKey);
                    return { ...item, entityName: decryptedName };
                } catch {
                    return { ...item, entityName: 'Secure item' };
                }
            }));
            if (!ignore) {
                setDecryptedActivity(next);
            }
        };

        void decryptActivity();
        return () => {
            ignore = true;
        };
    }, [activity, docKey]);

    const canManageMembers = project.role === 'owner' || project.role === 'admin';
    const canEdit = canManageMembers || project.role === 'editor';

    const memberCountLabel = useMemo(() => `${members.length} member${members.length === 1 ? '' : 's'}`, [members.length]);

    const handleDownload = async (file: ProjectFile) => {
        try {
            const blob = await db.downloadProjectFile(file.id);
            if (!project.isEncrypted || !docKey) {
                saveAs(blob, `project-file-${file.id}`);
                return;
            }
            const encryptedBytes = await blob.arrayBuffer();
            const decrypted = await decryptBytes({ ciphertext: encryptedBytes, iv: file.iv || '' }, docKey);
            const decryptedName = await decryptData(JSON.parse(file.encryptedName), docKey);
            saveAs(new Blob([decrypted]), decryptedName);
        } catch (error) {
            console.error(error);
            toast.danger('File download failed');
        }
    };

    const handleUploadChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        if (project.isEncrypted && !docKey) {
            toast.danger('Unlock your vault before uploading encrypted files');
            return;
        }

        setIsUploading(true);
        try {
            let uploadBlob = file;
            let encryptedName = file.name;
            const contentType = file.type || 'application/octet-stream';
            let iv = '';

            if (project.isEncrypted && docKey) {
                const [encryptedFile, encryptedFileName] = await Promise.all([
                    encryptBytes(await file.arrayBuffer(), docKey),
                    encryptData(file.name, docKey),
                ]);
                const encryptedBytes = new Uint8Array(encryptedFile.ciphertext.byteLength);
                encryptedBytes.set(encryptedFile.ciphertext);
                uploadBlob = new File([encryptedBytes], 'cipher.bin', { type: 'application/octet-stream' });
                encryptedName = JSON.stringify(encryptedFileName);
                iv = encryptedFile.iv;
            }

            const formData = new FormData();
            formData.append('file', uploadBlob);
            formData.append('encryptedName', encryptedName);
            formData.append('contentType', contentType);
            if (iv) {
                formData.append('iv', iv);
            }
            formData.append('isEncrypted', String(!!project.isEncrypted));
            await db.uploadProjectFile(project.id, formData);
            toast.success('File uploaded');
            const response = await db.listProjectFiles(project.id);
            setFiles(response.documents);
        } catch (error) {
            console.error(error);
            toast.danger('File upload failed');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleDeleteFile = async (fileId: string) => {
        try {
            await db.deleteProjectFile(fileId);
            setFiles((current) => current.filter((file) => file.id !== fileId));
            toast.success('File removed');
        } catch (error) {
            console.error(error);
            toast.danger('Failed to remove file');
        }
    };

    const handleRoleChange = async (member: ProjectMember, role: ProjectMember['role']) => {
        try {
            const updated = await db.updateProjectMember(project.id, member.userId, { role });
            setMembers((current) => current.map((item) => item.userId === member.userId ? updated : item));
            toast.success('Role updated');
        } catch (error) {
            console.error(error);
            toast.danger('Failed to update role');
        }
    };

    const handleRemoveMember = async (member: ProjectMember) => {
        try {
            await db.removeProjectMember(project.id, member.userId);
            setMembers((current) => current.filter((item) => item.userId !== member.userId));
            toast.success('Member removed');
        } catch (error) {
            console.error(error);
            toast.danger('Failed to remove member');
        }
    };

    const updateAllocation = async (member: ProjectMember, value: string) => {
        const daysPerWeek = Number(value);
        if (!Number.isFinite(daysPerWeek) || daysPerWeek < 0) return;
        try {
            const updated = await db.updateProjectAllocation(project.id, member.userId, daysPerWeek);
            setAllocations((current) => [...current.filter((item) => item.userId !== updated.userId), updated]);
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not update allocation');
        }
    };

    return (
        <div className={`rounded-xl border border-border bg-surface overflow-hidden ${compact ? 'flex flex-col' : ''}`}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Users size={14} className="text-muted-foreground" />
                        <h2 className="text-sm font-semibold text-foreground">Collaboration</h2>
                    </div>
                    <p className="text-xs text-muted-foreground">{memberCountLabel}</p>
                    {presence.length > 0 && (
                        <div className="flex items-center gap-2">
                            <div className="flex -space-x-2">
                                {presence.slice(0, 3).map((session) => (
                                    <Avatar key={session.userId} size="sm" color="accent" variant="soft" className="border border-surface">
                                        <Avatar.Fallback>{session.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                    </Avatar>
                                ))}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                {presence.length} active now
                            </p>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadChange} />
                    {canEdit && (
                        <Button aria-label="Upload file" variant="secondary" className="h-8 rounded-lg px-2.5 text-xs font-medium" onPress={() => fileInputRef.current?.click()} isPending={isUploading}>
                            <FolderUp size={13} />
                            {!compact && 'Upload file'}
                        </Button>
                    )}
                    {canManageMembers && (
                        <Button variant="primary" className="h-8 rounded-lg px-2.5 text-xs font-medium" onPress={() => setIsInviteOpen(true)}>
                            <UserPlus size={13} />
                            Invite
                        </Button>
                    )}
                </div>
            </div>

            <Tabs selectedKey={selectedTab} onSelectionChange={(key) => setSelectedTab(key as CollaborationTab)} variant="secondary" className={`w-full ${compact ? 'flex flex-col' : ''}`}>
                <Tabs.ListContainer className="border-b border-border px-4">
                    <Tabs.List aria-label="Collaboration tabs" className="h-10 w-full *:flex-1 *:text-sm">
                        <Tabs.Tab id="team" className="px-3">Team<Tabs.Indicator /></Tabs.Tab>
                        <Tabs.Tab id="files" className="px-3">Files<Tabs.Indicator /></Tabs.Tab>
                        <Tabs.Tab id="activity" className="px-3">Activity<Tabs.Indicator /></Tabs.Tab>
                    </Tabs.List>
                </Tabs.ListContainer>

                <Tabs.Panel id="team" className={`p-4 ${compact ? 'max-h-[360px] overflow-y-auto' : ''}`}>
                    <div className="space-y-3">
                        {members.map((member) => (
                            <div key={member.userId} className="rounded-lg border border-border px-3 py-2.5">
                                <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <Avatar size="md" color="accent" variant="soft">
                                        <Avatar.Fallback>{member.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-foreground truncate">{member.name || member.email}</div>
                                        <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Chip size="sm" variant="soft" color={member.role === 'owner' ? 'accent' : 'default'} className="rounded-md">
                                        <Chip.Label className="text-[11px]">{member.role}</Chip.Label>
                                    </Chip>
                                    {canManageMembers && member.role !== 'owner' && (
                                        <Dropdown>
                                            <Button aria-label={`Manage ${member.name || member.email}`} variant="ghost" isIconOnly className="h-8 w-8 rounded-lg text-muted-foreground"><MoreHorizontal size={15} /></Button>
                                            <Dropdown.Popover placement="bottom end">
                                                <Dropdown.Menu>
                                                    {(['admin', 'editor', 'viewer'] as const).map((role) => (
                                                        <Dropdown.Item key={role} id={role} textValue={role} onAction={() => handleRoleChange(member, role)}>
                                                            <Label className="cursor-pointer text-sm">{inviteRoleLabels[role]}</Label>
                                                        </Dropdown.Item>
                                                    ))}
                                                    <Dropdown.Item id="remove" textValue="Remove member" variant="danger" onAction={() => handleRemoveMember(member)}>
                                                        <div className="flex items-center gap-2 text-sm">
                                                            <Trash2 size={13} />
                                                            Remove
                                                        </div>
                                                    </Dropdown.Item>
                                                </Dropdown.Menu>
                                            </Dropdown.Popover>
                                        </Dropdown>
                                    )}
                                </div>
                                </div>
                                {workspace?.type === 'consulting' && (
                                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2.5">
                                        <Label className="text-xs text-muted-foreground">Weekly allocation</Label>
                                        <div className="flex items-center gap-1.5">
                                            <Input
                                                aria-label={`Weekly allocation for ${member.name || member.email}`}
                                                type="number"
                                                min="0"
                                                step="0.5"
                                                defaultValue={String(allocations.find((allocation) => allocation.userId === member.userId)?.daysPerWeek ?? 0)}
                                                disabled={!canManageMembers}
                                                onBlur={(event) => void updateAllocation(member, event.target.value)}
                                                variant="secondary"
                                                className="w-20"
                                            />
                                            <span className="text-xs text-muted-foreground">days/week</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        {invites.length > 0 && (
                            <div className="rounded-xl border border-dashed border-border p-3 space-y-2">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending invites</p>
                                {invites.filter((invite) => invite.status === 'pending').map((invite) => (
                                    <div key={invite.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-secondary/50 px-3 py-2">
                                        <div className="min-w-0">
                                            <div className="text-sm text-foreground truncate">{invite.email}</div>
                                            <div className="text-xs text-muted-foreground">Project role: {invite.role} · becomes a workspace member · expires {dayjs(invite.expiresAt).format('MMM D, HH:mm')}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {invite.token && (
                                                <Button
                                                    variant="ghost"
                                                    className="h-8 rounded-lg px-2 text-xs"
                                                    onPress={async () => {
                                                        const url = `${window.location.origin}/invite?token=${invite.token}`;
                                                        await navigator.clipboard.writeText(url);
                                                        toast.success('Invite link copied');
                                                    }}
                                                >
                                                    <LinkIcon size={13} />
                                                </Button>
                                            )}
                                            {canManageMembers && (
                                                <Button
                                                    variant="ghost"
                                                    className="h-8 rounded-lg px-2 text-xs text-danger"
                                                    onPress={async () => {
                                                        await db.cancelProjectInvitation(project.id, invite.id);
                                                        setInvites((current) => current.filter((item) => item.id !== invite.id));
                                                    }}
                                                >
                                                    <Trash2 size={13} />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </Tabs.Panel>

                <Tabs.Panel id="files" className={`p-4 ${compact ? 'max-h-[360px] overflow-y-auto' : ''}`}>
                    <div className="space-y-3">
                        {files.length === 0 && (
                            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                                No shared files yet
                            </div>
                        )}
                        {files.map((file) => (
                            <ProjectFileRow key={file.id} file={file} docKey={docKey} onDownload={() => handleDownload(file)} onDelete={canEdit ? () => handleDeleteFile(file.id) : undefined} />
                        ))}
                    </div>
                </Tabs.Panel>

                <Tabs.Panel id="activity" className={`p-4 ${compact ? 'max-h-[360px] overflow-y-auto' : ''}`}>
                    <div className="space-y-2">
                        {decryptedActivity.length === 0 && (
                            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                                No recent activity yet
                            </div>
                        )}
                        {decryptedActivity.map((item) => (
                            <div key={item.id} className="rounded-xl border border-border px-3 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-foreground truncate">{item.entityName}</div>
                                        <div className="text-xs text-muted-foreground">{item.type} · {item.entityType}</div>
                                    </div>
                                    <span className="text-xs text-muted-foreground shrink-0">{dayjs(item.createdAt).format('MMM D, HH:mm')}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </Tabs.Panel>
            </Tabs>

            <InviteMemberModal
                isOpen={isInviteOpen}
                onClose={() => setIsInviteOpen(false)}
                project={project}
                docKey={docKey}
                workspaceMembers={workspaceMembers}
                projectMembers={members}
                onCreated={(member, invitation) => {
                    if (member) {
                        setMembers((current) => {
                            const next = current.filter((item) => item.userId !== member.userId);
                            return [...next, member];
                        });
                    }
                    if (invitation) {
                        setInvites((current) => [invitation, ...current.filter((item) => item.id !== invitation.id)]);
                    }
                }}
            />
        </div>
    );
}

function ProjectFileRow({ file, docKey, onDownload, onDelete }: { file: ProjectFile; docKey: CryptoKey | null; onDownload: () => void; onDelete?: () => void }) {
    const [displayName, setDisplayName] = useState(file.encryptedName);

    useEffect(() => {
        let ignore = false;
        const loadName = async () => {
            if (!docKey) {
                setDisplayName(file.encryptedName);
                return;
            }
            try {
                const decrypted = await decryptData(JSON.parse(file.encryptedName), docKey);
                if (!ignore) {
                    setDisplayName(decrypted);
                }
            } catch {
                if (!ignore) {
                    setDisplayName(file.encryptedName);
                }
            }
        };
        void loadName();
        return () => {
            ignore = true;
        };
    }, [docKey, file.encryptedName]);

    return (
        <div className="flex items-center justify-between rounded-xl border border-border px-3 py-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-secondary text-muted-foreground">
                    <FileText size={15} />
                </div>
                <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{displayName}</div>
                    <div className="text-xs text-muted-foreground">{Math.max(1, Math.round(file.sizeBytes / 1024))} KB · {file.uploaderName || 'Unknown'} · {dayjs(file.createdAt).format('MMM D, HH:mm')}</div>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <Button variant="secondary" className="h-8 rounded-lg px-3 text-xs" onPress={onDownload}>Download</Button>
                {onDelete && (
                    <Button variant="ghost" className="h-8 rounded-lg px-2 text-danger" onPress={onDelete}>
                        <Trash2 size={13} />
                    </Button>
                )}
            </div>
        </div>
    );
}

function InviteMemberModal({
    isOpen,
    onClose,
    project,
    docKey,
    workspaceMembers,
    projectMembers,
    onCreated,
}: {
    isOpen: boolean;
    onClose: () => void;
    project: Project;
    docKey: CryptoKey | null;
    workspaceMembers: WorkspaceMember[];
    projectMembers: ProjectMember[];
    onCreated: (member?: ProjectMember, invitation?: TeamInvitation) => void;
}) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<InviteRole>('editor');
    const [selectedWorkspaceMemberId, setSelectedWorkspaceMemberId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const availableWorkspaceMembers = useMemo(
        () => workspaceMembers.filter((member) => !projectMembers.some((projectMember) => projectMember.userId === member.userId)),
        [projectMembers, workspaceMembers],
    );

    const addWorkspaceMemberToProject = async () => {
        const target = availableWorkspaceMembers.find((member) => member.userId === selectedWorkspaceMemberId);
        if (!target) {
            toast.danger('Select a workspace member');
            return;
        }
        setIsSubmitting(true);
        try {
            let encryptedKey: string | undefined;
            if (project.isEncrypted) {
                if (!docKey || !target.publicKey) {
                    toast.danger('Encrypted projects require a vault-enabled teammate');
                    return;
                }
                encryptedKey = await encryptDocumentKey(docKey, target.publicKey);
            }

            const member = await db.addProjectMember(project.id, { userId: target.userId, role, encryptedKey });
            onCreated(member);
            toast.success('Person added to project');
            setSelectedWorkspaceMemberId('');
            onClose();
        } catch (error) {
            console.error(error);
            toast.danger('Could not add person to project');
        } finally {
            setIsSubmitting(false);
        }
    };

    const createExternalInvitation = async () => {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
            toast.danger('Enter an email address');
            return;
        }
        setIsSubmitting(true);
        try {
            let encryptedKey: string | undefined;
            if (project.isEncrypted) {
                const users = await db.searchUsers(normalizedEmail);
                const target = users.documents.find((item) => item.email.toLowerCase() === normalizedEmail);
                if (!docKey || !target?.publicKey) {
                    toast.danger('Encrypted projects require an existing account with a configured vault');
                    return;
                }
                encryptedKey = await encryptDocumentKey(docKey, target.publicKey);
            }
            const invitation = await db.createProjectInvitation(project.id, { email: normalizedEmail, role, encryptedKey });
            onCreated(undefined, invitation);
            toast.success('Invitation created');
            setEmail('');
            onClose();
        } catch (error) {
            console.error(error);
            toast.danger(error instanceof Error ? error.message : 'Could not create invitation');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal>
            <Modal.Backdrop isOpen={isOpen} onOpenChange={(next) => !next && onClose()} variant="blur">
                <Modal.Container size="lg" scroll="inside">
                    <Modal.Dialog className="rounded-xl border border-border bg-surface">
                        <Modal.CloseTrigger />
                        <Modal.Header className="px-6 pt-5 pb-4 border-b border-border">
                            <div className="space-y-1">
                                <Modal.Heading className="text-base font-semibold text-foreground">Add people to project</Modal.Heading>
                                <p className="text-xs text-muted-foreground">Workspace members receive access to this project only when you add them here.</p>
                            </div>
                        </Modal.Header>
                        <Modal.Body className="px-6 py-5 space-y-5">
                            <div className="rounded-xl border border-border bg-surface-secondary/30 p-4 space-y-4">
                                <div>
                                    <h3 className="text-sm font-medium text-foreground">Choose from workspace</h3>
                                    <p className="mt-1 text-xs text-muted-foreground">These people already belong to the workspace but not yet to this project.</p>
                                </div>
                                <Select selectedKey={selectedWorkspaceMemberId || null} onSelectionChange={(key) => setSelectedWorkspaceMemberId(String(key))} variant="secondary" isDisabled={availableWorkspaceMembers.length === 0}>
                                    <Label className="text-xs font-medium text-muted-foreground">Workspace member</Label>
                                    <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                                    <Select.Popover>
                                        <ListBox>
                                            {availableWorkspaceMembers.map((member) => (
                                                <ListBox.Item key={member.userId} id={member.userId} textValue={`${member.name} ${member.email}`}>
                                                    <Label>{member.name || member.email}</Label>
                                                    <Description>{member.email} · Workspace role: {member.role}</Description>
                                                    <ListBox.ItemIndicator />
                                                </ListBox.Item>
                                            ))}
                                        </ListBox>
                                    </Select.Popover>
                                </Select>
                                {availableWorkspaceMembers.length === 0 && <p className="text-xs text-muted-foreground">All workspace members are already in this project.</p>}
                                <Button variant="secondary" className="w-full" isPending={isSubmitting} isDisabled={!selectedWorkspaceMemberId} onPress={() => void addWorkspaceMemberToProject()}>
                                    <UserPlus size={14} />
                                    Add to project
                                </Button>
                            </div>

                            <div className="border-t border-border pt-5 space-y-4">
                                <div>
                                    <h3 className="text-sm font-medium text-foreground">Invite external person</h3>
                                    <p className="mt-1 text-xs text-muted-foreground">On acceptance, this person becomes a workspace member and receives the selected project role.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="project-invite-email" className="text-xs font-medium text-muted-foreground">Email address</Label>
                                    <Input id="project-invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" variant="secondary" className="h-10 w-full rounded-xl" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-muted-foreground">Project role</Label>
                                <div className="flex gap-2">
                                    {(['admin', 'editor', 'viewer'] as const).map((value) => (
                                        <Button
                                            key={value}
                                            type="button"
                                            variant={role === value ? 'primary' : 'secondary'}
                                            className="h-8 rounded-xl px-3 text-xs font-medium"
                                            onPress={() => setRole(value)}
                                        >
                                            {inviteRoleLabels[value]}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            {project.isEncrypted && (
                                <div className="rounded-xl border border-warning/30 bg-warning-muted px-3 py-2 text-xs text-warning">
                                    Encrypted projects can only be shared with existing accounts that have a configured vault.
                                </div>
                            )}
                        </Modal.Body>
                        <Modal.Footer className="px-6 py-4 border-t border-border">
                            <Button variant="ghost" className="h-8 rounded-xl px-4 text-xs" onPress={onClose}>
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                className="h-8 rounded-xl px-4 text-xs"
                                isPending={isSubmitting}
                                isDisabled={!email.trim()}
                                onPress={() => void createExternalInvitation()}
                            >
                                <Mail size={13} />
                                Create invitation
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
