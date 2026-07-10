'use client';

import { db } from '@/services/frontend/lib/db';
import { ProjectTaskStatus } from '@/services/frontend/types';
import { Button, Checkbox, Input, Label, ListBox, Modal, Select, toast } from '@heroui/react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const COLOR_OPTIONS: Array<{ key: ProjectTaskStatus['colorToken']; label: string }> = [
    { key: 'default', label: 'Neutral' },
    { key: 'accent', label: 'Accent' },
    { key: 'warning', label: 'Warning' },
    { key: 'danger', label: 'Risk' },
    { key: 'success', label: 'Done' },
];

interface TaskWorkflowModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    statuses: ProjectTaskStatus[];
    onChange: () => void;
}

export function TaskWorkflowModal({ isOpen, onClose, projectId, statuses, onChange }: TaskWorkflowModalProps) {
    const [drafts, setDrafts] = useState<ProjectTaskStatus[]>(statuses);
    const [newLabel, setNewLabel] = useState('');
    const [newColorToken, setNewColorToken] = useState<ProjectTaskStatus['colorToken']>('accent');
    const [newCompleted, setNewCompleted] = useState(false);
    const [deletingStatusId, setDeletingStatusId] = useState<string | null>(null);
    const [replacementStatusId, setReplacementStatusId] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setDrafts([...statuses].sort((a, b) => a.position - b.position));
            setDeletingStatusId(null);
            setReplacementStatusId('');
        }
    }, [isOpen, statuses]);

    const replacementOptions = useMemo(() => {
        return drafts.filter((status) => status.id !== deletingStatusId);
    }, [deletingStatusId, drafts]);

    const updateDraft = (statusId: string, patch: Partial<ProjectTaskStatus>) => {
        setDrafts((current) => current.map((status) => status.id === statusId ? { ...status, ...patch } : status));
    };

    const persistStatus = async (status: ProjectTaskStatus) => {
        setIsSaving(true);
        try {
            await db.updateProjectTaskStatus(projectId, status.id, {
                label: status.label,
                colorToken: status.colorToken,
                isCompletedState: status.isCompletedState,
            });
            onChange();
            toast.success(`Saved ${status.label}`);
        } catch (error) {
            console.error(error);
            toast.danger('Failed to update workflow status');
        } finally {
            setIsSaving(false);
        }
    };

    const reorderStatus = async (statusId: string, direction: 'up' | 'down') => {
        const currentIndex = drafts.findIndex((status) => status.id === statusId);
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= drafts.length) {
            return;
        }

        const nextDrafts = [...drafts];
        const [moved] = nextDrafts.splice(currentIndex, 1);
        nextDrafts.splice(targetIndex, 0, moved);
        setDrafts(nextDrafts.map((status, index) => ({ ...status, position: index })));

        try {
            await db.reorderProjectTaskStatuses(projectId, nextDrafts.map((status) => status.id));
            onChange();
        } catch (error) {
            console.error(error);
            toast.danger('Failed to reorder workflow');
            setDrafts([...statuses].sort((a, b) => a.position - b.position));
        }
    };

    const createStatus = async () => {
        if (!newLabel.trim()) {
            return;
        }

        setIsSaving(true);
        try {
            await db.createProjectTaskStatus(projectId, {
                label: newLabel.trim(),
                colorToken: newColorToken,
                isCompletedState: newCompleted,
            });
            setNewLabel('');
            setNewColorToken('accent');
            setNewCompleted(false);
            onChange();
            toast.success('Workflow status added');
        } catch (error) {
            console.error(error);
            toast.danger('Failed to create workflow status');
        } finally {
            setIsSaving(false);
        }
    };

    const deleteStatus = async () => {
        if (!deletingStatusId || !replacementStatusId) {
            return;
        }

        setIsSaving(true);
        try {
            await db.deleteProjectTaskStatus(projectId, deletingStatusId, replacementStatusId);
            setDeletingStatusId(null);
            setReplacementStatusId('');
            onChange();
            toast.success('Workflow status removed');
        } catch (error) {
            console.error(error);
            toast.danger('Failed to delete workflow status');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal>
            <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()} variant="blur" className="bg-black/50">
                <Modal.Container size="cover" scroll="inside" className="px-4 py-4 sm:px-6 sm:py-6">
                    <Modal.Dialog className="max-h-full w-full max-w-5xl rounded-xl border border-border bg-surface shadow-lg">
                        <Modal.CloseTrigger className="absolute right-4 top-4 z-50 rounded-md bg-foreground/5 p-1.5 text-foreground/40 transition-colors hover:bg-foreground/10 hover:text-foreground" />
                        <Modal.Header className="border-b border-border px-6 py-4">
                            <div>
                                <Modal.Heading className="text-base font-semibold text-foreground">Workflow</Modal.Heading>
                                <p className="mt-1 text-xs text-muted-foreground">Project-local task statuses for board columns, filters and task detail controls.</p>
                            </div>
                        </Modal.Header>
                        <Modal.Body className="space-y-5 px-6 py-5">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-foreground">Current statuses</h3>
                                    <span className="text-xs text-muted-foreground">{drafts.length} columns</span>
                                </div>
                                <div className="space-y-2">
                                    {drafts.map((status, index) => (
                                        <div key={status.id} className="rounded-xl border border-border bg-surface-secondary/30 p-3">
                                            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.55fr)] lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.55fr)_auto] lg:items-end">
                                                <div className="flex min-w-0 flex-col gap-1.5">
                                                    <Label className="text-xs text-muted-foreground">Label</Label>
                                                    <Input
                                                        value={status.label}
                                                        onChange={(event) => updateDraft(status.id, { label: event.target.value })}
                                                        variant="secondary"
                                                        className="h-9 w-full rounded-lg text-sm"
                                                        fullWidth
                                                    />
                                                </div>
                                                <Select
                                                    selectedKey={status.colorToken}
                                                    onSelectionChange={(key) => updateDraft(status.id, { colorToken: String(key) as ProjectTaskStatus['colorToken'] })}
                                                    variant="secondary"
                                                    className="flex min-w-0 flex-col gap-1.5"
                                                >
                                                    <Label className="text-xs text-muted-foreground">Color</Label>
                                                    <Select.Trigger className="h-9 w-full rounded-lg">
                                                        <Select.Value />
                                                        <Select.Indicator />
                                                    </Select.Trigger>
                                                    <Select.Popover>
                                                        <ListBox>
                                                            {COLOR_OPTIONS.map((option) => (
                                                                <ListBox.Item key={option.key} id={option.key} textValue={option.label}>
                                                                    {option.label}
                                                                </ListBox.Item>
                                                            ))}
                                                        </ListBox>
                                                    </Select.Popover>
                                                </Select>
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" isIconOnly className="h-8 w-8 rounded-lg" onPress={() => reorderStatus(status.id, 'up')} isDisabled={index === 0 || isSaving}>
                                                        <ArrowUp size={14} />
                                                    </Button>
                                                    <Button variant="ghost" isIconOnly className="h-8 w-8 rounded-lg" onPress={() => reorderStatus(status.id, 'down')} isDisabled={index === drafts.length - 1 || isSaving}>
                                                        <ArrowDown size={14} />
                                                    </Button>
                                                    <Button variant="secondary" className="h-8 rounded-lg px-3 text-xs font-medium" onPress={() => void persistStatus(status)} isDisabled={isSaving}>
                                                        Save
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        isIconOnly
                                                        className="h-8 w-8 rounded-lg text-danger"
                                                        onPress={() => {
                                                            setDeletingStatusId(status.id);
                                                            setReplacementStatusId(replacementOptions[0]?.id || '');
                                                        }}
                                                        isDisabled={status.isBuiltin || isSaving}
                                                    >
                                                        <Trash2 size={14} />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                                <Checkbox isSelected={status.isCompletedState} onChange={(value) => updateDraft(status.id, { isCompletedState: value })} variant="secondary">
                                                    <Checkbox.Content>
                                                        <Checkbox.Control className="rounded-md">
                                                            <Checkbox.Indicator />
                                                        </Checkbox.Control>
                                                        <Label className="text-xs text-muted-foreground">Marks tasks as completed</Label>
                                                    </Checkbox.Content>
                                                </Checkbox>
                                                {status.isBuiltin && (
                                                    <span className="text-xs text-muted-foreground">Built-in status</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-xl border border-dashed border-border bg-surface-secondary/20 p-4">
                                <div className="mb-3">
                                    <h3 className="text-sm font-semibold text-foreground">Add status</h3>
                                    <p className="mt-1 text-xs text-muted-foreground">Create a new board column and task state for this project.</p>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.55fr)] lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.55fr)_auto] lg:items-end">
                                    <div className="flex min-w-0 flex-col gap-1.5">
                                        <Label className="text-xs text-muted-foreground">Label</Label>
                                        <Input
                                            value={newLabel}
                                            onChange={(event) => setNewLabel(event.target.value)}
                                            placeholder="Waiting on customer"
                                            variant="secondary"
                                            className="h-9 w-full rounded-lg text-sm"
                                            fullWidth
                                        />
                                    </div>
                                    <Select selectedKey={newColorToken} onSelectionChange={(key) => setNewColorToken(String(key) as ProjectTaskStatus['colorToken'])} variant="secondary" className="flex min-w-0 flex-col gap-1.5">
                                        <Label className="text-xs text-muted-foreground">Color</Label>
                                        <Select.Trigger className="h-9 w-full rounded-lg">
                                            <Select.Value />
                                            <Select.Indicator />
                                        </Select.Trigger>
                                        <Select.Popover>
                                            <ListBox>
                                                {COLOR_OPTIONS.map((option) => (
                                                    <ListBox.Item key={option.key} id={option.key} textValue={option.label}>
                                                        {option.label}
                                                    </ListBox.Item>
                                                ))}
                                            </ListBox>
                                        </Select.Popover>
                                    </Select>
                                    <Button variant="primary" className="h-9 rounded-lg px-3 text-xs font-semibold" onPress={() => void createStatus()} isDisabled={isSaving}>
                                        <Plus size={14} />
                                        Add status
                                    </Button>
                                </div>
                                <div className="mt-4">
                                    <Checkbox isSelected={newCompleted} onChange={setNewCompleted} variant="secondary">
                                        <Checkbox.Content>
                                            <Checkbox.Control className="rounded-md">
                                                <Checkbox.Indicator />
                                            </Checkbox.Control>
                                            <Label className="text-xs text-muted-foreground">Marks tasks as completed</Label>
                                        </Checkbox.Content>
                                    </Checkbox>
                                </div>
                            </div>

                            {deletingStatusId && (
                                <div className="rounded-xl border border-danger/30 bg-danger-muted/20 p-4">
                                    <h4 className="text-sm font-semibold text-foreground">Reassign tasks before deleting</h4>
                                    <p className="mt-1 text-xs text-muted-foreground">Choose the status that should receive tasks from the removed column.</p>
                                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                                        <Select selectedKey={replacementStatusId} onSelectionChange={(key) => setReplacementStatusId(String(key))} variant="secondary">
                                            <Label className="text-xs text-muted-foreground">Replacement status</Label>
                                            <Select.Trigger className="h-9 rounded-lg">
                                                <Select.Value />
                                                <Select.Indicator />
                                            </Select.Trigger>
                                            <Select.Popover>
                                                <ListBox>
                                                    {replacementOptions.map((status) => (
                                                        <ListBox.Item key={status.id} id={status.id} textValue={status.label}>
                                                            {status.label}
                                                        </ListBox.Item>
                                                    ))}
                                                </ListBox>
                                            </Select.Popover>
                                        </Select>
                                        <div className="flex items-center justify-end gap-2">
                                            <Button variant="ghost" className="h-9 rounded-lg px-3 text-xs" onPress={() => setDeletingStatusId(null)}>
                                                Cancel
                                            </Button>
                                            <Button variant="danger" className="h-9 rounded-lg px-3 text-xs font-semibold" onPress={() => void deleteStatus()} isDisabled={!replacementStatusId || isSaving}>
                                                Delete status
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </Modal.Body>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
