'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { useWorkspace } from '@/services/frontend/context/WorkspaceContext';
import { db } from '@/services/frontend/lib/db';
import { Workspace, WorkspaceInvitation, WorkspaceMember } from '@/services/frontend/lib/api';
import { WorkspaceTypePicker } from '@/services/frontend/components/WorkspaceTypePicker';
import { Button, Card, Input, Label, ListBox, Select, Spinner, Switch, toast } from '@heroui/react';
import { Copy, Mail, Plus, Save, Trash2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

const workspaceRoles = [
    { id: 'admin', label: 'Admin', description: 'Can manage members and workspace settings' },
    { id: 'member', label: 'Member', description: 'Can participate in workspace projects' },
    { id: 'guest', label: 'Guest', description: 'Limited access for external collaborators' },
];

const fieldClass = 'flex min-w-0 flex-col gap-1.5';
const fieldLabelClass = 'text-xs font-medium text-muted-foreground';

export function WorkspaceManagementPanel() {
    const router = useRouter();
    const { user } = useAuth();
    const { workspace, workspaceId, refresh } = useWorkspace();
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [workspaceName, setWorkspaceName] = useState('');
    const [workspaceType, setWorkspaceType] = useState<Workspace['type']>('project_management');
    const [autoAddMembersToProjects, setAutoAddMembersToProjects] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('member');
    const [inviteLink, setInviteLink] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isUpdatingWorkspaceType, setIsUpdatingWorkspaceType] = useState(false);
    const [isUpdatingAutoAddMembers, setIsUpdatingAutoAddMembers] = useState(false);

    const canManage = workspace?.role === 'owner' || workspace?.role === 'admin';
    const currentUserRole = members.find((member) => member.userId === user?.id)?.role ?? workspace?.role;

    const loadWorkspaceData = useCallback(async () => {
        if (!workspaceId) {
            setMembers([]);
            setInvitations([]);
            return;
        }
        setIsLoading(true);
        try {
            const [memberResponse, invitationResponse] = await Promise.all([
                db.listWorkspaceMembers(workspaceId),
                db.listWorkspaceInvitations(workspaceId),
            ]);
            setMembers(memberResponse.documents);
            setInvitations(invitationResponse.documents);
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not load workspace members');
        } finally {
            setIsLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        setWorkspaceName(workspace?.name ?? '');
        setWorkspaceType(workspace?.type ?? 'project_management');
        setAutoAddMembersToProjects(workspace?.autoAddMembersToProjects ?? false);
        void loadWorkspaceData();
    }, [loadWorkspaceData, workspace?.autoAddMembersToProjects, workspace?.name, workspace?.type]);

    const pendingInvitations = useMemo(
        () => invitations.filter((invitation) => invitation.status === 'pending'),
        [invitations],
    );

    const saveWorkspaceName = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!workspaceId || !workspaceName.trim() || workspaceName.trim() === workspace?.name) return;
        setIsSaving(true);
        try {
            await db.updateWorkspace(workspaceId, { name: workspaceName.trim() });
            await refresh();
            toast.success('Workspace updated');
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not update workspace');
        } finally {
            setIsSaving(false);
        }
    };

    const updateWorkspaceType = async (type: Workspace['type']) => {
        if (!workspaceId || !canManage || type === workspaceType || isUpdatingWorkspaceType) return;
        const previousType = workspaceType;
        setWorkspaceType(type);
        setIsUpdatingWorkspaceType(true);
        try {
            await db.updateWorkspace(workspaceId, { type });
            await refresh();
            toast.success(type === 'consulting' ? 'Consulting features enabled' : 'Project management features enabled');
        } catch (error) {
            setWorkspaceType(previousType);
            toast.danger(error instanceof Error ? error.message : 'Could not update workspace type');
        } finally {
            setIsUpdatingWorkspaceType(false);
        }
    };

    const updateAutoAddMembersToProjects = async (isSelected: boolean) => {
        if (!workspaceId || !canManage || isUpdatingAutoAddMembers) return;
        const previousValue = autoAddMembersToProjects;
        setAutoAddMembersToProjects(isSelected);
        setIsUpdatingAutoAddMembers(true);
        try {
            const updated = await db.updateWorkspace(workspaceId, { autoAddMembersToProjects: isSelected });
            setAutoAddMembersToProjects(updated.autoAddMembersToProjects);
            await refresh();
            toast.success(updated.autoAddMembersToProjects ? 'New projects will include workspace members automatically' : 'New projects will start without automatic members');
        } catch (error) {
            setAutoAddMembersToProjects(previousValue);
            toast.danger(error instanceof Error ? error.message : 'Could not update project default');
        } finally {
            setIsUpdatingAutoAddMembers(false);
        }
    };

    const inviteMember = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!workspaceId || !inviteEmail.trim()) return;
        setIsSaving(true);
        try {
            const invitation = await db.createWorkspaceInvitation(workspaceId, { email: inviteEmail.trim(), role: inviteRole });
            setInvitations((current) => [invitation, ...current.filter((item) => item.id !== invitation.id)]);
            setInviteLink(invitation.token ? `${window.location.origin}/invite?token=${encodeURIComponent(invitation.token)}` : null);
            setInviteEmail('');
            toast.success('Invitation created', { description: 'The invitation link is ready to share.' });
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not create invitation');
        } finally {
            setIsSaving(false);
        }
    };

    const updateMemberRole = async (member: WorkspaceMember, role: string) => {
        if (!workspaceId || member.role === 'owner' || role === member.role) return;
        try {
            const updated = await db.updateWorkspaceMember(workspaceId, member.userId, { role });
            setMembers((current) => current.map((item) => item.userId === updated.userId ? updated : item));
            toast.success('Role updated');
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not update role');
        }
    };

    const updateMemberCapacity = async (member: WorkspaceMember, value: string) => {
        if (!workspaceId || !canManage) return;
        const weeklyCapacityDays = Number(value);
        if (!Number.isFinite(weeklyCapacityDays) || weeklyCapacityDays < 0) return;
        try {
            const updated = await db.updateWorkspaceMember(workspaceId, member.userId, { weeklyCapacityDays });
            setMembers((current) => current.map((item) => item.userId === updated.userId ? updated : item));
            toast.success('Weekly capacity updated');
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not update weekly capacity');
        }
    };

    const removeMember = async (member: WorkspaceMember) => {
        if (!workspaceId || member.role === 'owner') return;
        if (!window.confirm(`Remove ${member.name || member.email} from this workspace?`)) return;
        try {
            await db.removeWorkspaceMember(workspaceId, member.userId);
            setMembers((current) => current.filter((item) => item.userId !== member.userId));
            toast.success('Member removed');
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not remove member');
        }
    };

    const cancelInvitation = async (invitation: WorkspaceInvitation) => {
        if (!workspaceId) return;
        try {
            await db.cancelWorkspaceInvitation(workspaceId, invitation.id);
            setInvitations((current) => current.map((item) => item.id === invitation.id ? { ...item, status: 'cancelled' } : item));
            toast.success('Invitation revoked');
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not revoke invitation');
        }
    };

    if (!workspaceId) {
        return (
            <Card className="border border-border">
                <Card.Header>
                    <Card.Title>Workspace</Card.Title>
                    <Card.Description>Create your first workspace to organize projects, wiki, and snippets.</Card.Description>
                </Card.Header>
                <Card.Content>
                    <Button onPress={() => router.push('/workspace/new')}>
                        <Plus size={15} />
                        Create workspace
                    </Button>
                </Card.Content>
            </Card>

        );
    }

    return (
        <div className="space-y-5">
            <Card className="border border-border">
                <Card.Header>
                    <Card.Title>Workspace settings</Card.Title>
                    <Card.Description>Manage the name and access for {workspace?.name ?? 'this workspace'}.</Card.Description>
                </Card.Header>
                <Card.Content className="space-y-5">
                    <form onSubmit={saveWorkspaceName} className="flex flex-col gap-4 sm:flex-row sm:items-end">
                        <div className={`${fieldClass} flex-1`}>
                            <Label htmlFor="workspace-name" className={fieldLabelClass}>Workspace name</Label>
                            <Input id="workspace-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} disabled={!canManage} variant="secondary" fullWidth />
                        </div>
                        {canManage && <Button type="submit" variant="secondary" isPending={isSaving} isDisabled={!workspaceName.trim() || workspaceName.trim() === workspace?.name}>
                            <Save size={15} />
                            Save
                        </Button>}
                    </form>

                    <div className="flex flex-wrap gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                        <span className="rounded-full border border-border bg-surface-secondary px-2.5 py-1">{members.length} members</span>
                        <span className="rounded-full border border-border bg-surface-secondary px-2.5 py-1">Your role: {currentUserRole}</span>
                    </div>
                </Card.Content>
            </Card>

            <Card className="border border-border">
                <Card.Header>
                    <Card.Title>Workspace type</Card.Title>
                    <Card.Description>Choose the planning model for this workspace. Switching types keeps existing capacity values intact.</Card.Description>
                </Card.Header>
                <Card.Content>
                    <WorkspaceTypePicker value={workspaceType} onChange={(value) => void updateWorkspaceType(value)} isDisabled={!canManage || isUpdatingWorkspaceType} />
                </Card.Content>
            </Card>

            <Card className="border border-border">
                <Card.Header>
                    <Card.Title>New projects</Card.Title>
                    <Card.Description>Choose whether workspace members are added when a project is created.</Card.Description>
                </Card.Header>
                <Card.Content>
                    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                            <Label className="text-sm font-medium text-foreground">Automatically add workspace members</Label>
                            <p className="max-w-2xl text-xs text-muted-foreground">Members and admins are added as project editors, guests as viewers. This never grants project-admin access. Encrypted projects are excluded for security.</p>
                        </div>
                        <Switch
                            aria-label="Automatically add workspace members to new projects"
                            isSelected={autoAddMembersToProjects}
                            onChange={(isSelected) => void updateAutoAddMembersToProjects(isSelected)}
                            isDisabled={!canManage || isUpdatingAutoAddMembers}
                        >
                            <Switch.Control><Switch.Thumb /></Switch.Control>
                        </Switch>
                    </div>
                </Card.Content>
            </Card>

            {canManage && (
                <Card className="border border-border">
                    <Card.Header>
                        <div className="flex items-start gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                <Mail size={16} />
                            </div>
                            <div>
                                <Card.Title>Invite person</Card.Title>
                                <Card.Description>Create a secure link and share it directly with the invited person.</Card.Description>
                            </div>
                        </div>
                    </Card.Header>
                    <Card.Content className="space-y-4">
                        <form onSubmit={inviteMember} className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_200px]">
                                <div className={fieldClass}>
                                    <Label htmlFor="invite-email" className={fieldLabelClass}>Email address</Label>
                                    <Input id="invite-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" required variant="secondary" fullWidth />
                                </div>
                                <Select selectedKey={inviteRole} onSelectionChange={(key) => setInviteRole(String(key))}>
                                    <Label className={fieldLabelClass}>Role</Label>
                                    <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                                    <Select.Popover>
                                        <ListBox>
                                            {workspaceRoles.map((role) => (
                                                <ListBox.Item key={role.id} id={role.id} textValue={role.label}>
                                                    <Label>{role.label}</Label>
                                                    <ListBox.ItemIndicator />
                                                </ListBox.Item>
                                            ))}
                                        </ListBox>
                                    </Select.Popover>
                                </Select>
                            </div>
                            <div className="flex justify-end">
                                <Button type="submit" isPending={isSaving} isDisabled={!inviteEmail.trim()}>
                                    <Users size={15} />
                                    Invite
                                </Button>
                            </div>
                        </form>

                        {inviteLink && (
                            <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3 sm:flex-row sm:items-center">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-foreground">Invitation link ready</p>
                                    <p className="truncate text-xs text-muted-foreground">{inviteLink}</p>
                                </div>
                                <Button variant="secondary" size="sm" onPress={() => { void navigator.clipboard.writeText(inviteLink).then(() => toast.success('Link copied')); }}>
                                    <Copy size={13} />
                                    Copy
                                </Button>
                            </div>
                        )}
                    </Card.Content>
                </Card>
            )}

            <Card className="border border-border">
                <Card.Header>
                    <Card.Title>Members</Card.Title>
                    <Card.Description>Workspace membership enables collaboration. Access to individual projects is granted separately.</Card.Description>
                </Card.Header>
                <Card.Content>
                    {isLoading ? <div className="flex justify-center py-8"><Spinner /></div> : (
                        <div className="divide-y divide-border rounded-xl border border-border">
                            {members.map((member) => (
                                <div key={member.userId} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-foreground">{member.name || member.email}</p>
                                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {workspace?.type === 'consulting' && (
                                            <Input
                                                aria-label={`Weekly capacity for ${member.name || member.email}`}
                                                type="number"
                                                min="0"
                                                step="0.5"
                                                defaultValue={String(member.weeklyCapacityDays ?? 5)}
                                                disabled={!canManage}
                                                onBlur={(event) => void updateMemberCapacity(member, event.target.value)}
                                                className="w-16"
                                                variant="secondary"
                                            />
                                        )}
                                        {member.role === 'owner' ? (
                                            <span className="rounded-lg border border-border bg-surface-secondary px-3 py-1.5 text-xs text-muted-foreground">Owner</span>
                                        ) : (
                                            <Select selectedKey={member.role} onSelectionChange={(key) => void updateMemberRole(member, String(key))} isDisabled={!canManage} className="w-36">
                                                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                                                <Select.Popover>
                                                    <ListBox>
                                                        {workspaceRoles.map((role) => <ListBox.Item key={role.id} id={role.id} textValue={role.label}>{role.label}</ListBox.Item>)}
                                                    </ListBox>
                                                </Select.Popover>
                                            </Select>
                                        )}
                                        {member.role !== 'owner' && canManage && <Button variant="ghost" isIconOnly size="sm" className="text-danger" onPress={() => void removeMember(member)} aria-label={`Remove ${member.name || member.email}`}>
                                            <Trash2 size={15} />
                                        </Button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card.Content>
            </Card>

            {pendingInvitations.length > 0 && (
                <Card className="border border-border">
                    <Card.Header>
                        <Card.Title>Pending invitations</Card.Title>
                        <Card.Description>Invitations are valid for seven days and can be revoked here.</Card.Description>
                    </Card.Header>
                    <Card.Content className="space-y-2">
                        {pendingInvitations.map((invitation) => (
                            <div key={invitation.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface-secondary/40 px-3 py-3 sm:flex-row sm:items-center">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm text-foreground">{invitation.email}</p>
                                    <p className="text-xs text-muted-foreground">{workspaceRoles.find((role) => role.id === invitation.role)?.label ?? invitation.role} · expires {new Date(invitation.expiresAt).toLocaleDateString('en-US')}</p>
                                </div>
                                {canManage && <Button variant="tertiary" size="sm" onPress={() => void cancelInvitation(invitation)}>Revoke</Button>}
                            </div>
                        ))}
                    </Card.Content>
                </Card>
            )}

        </div>
    );
}
