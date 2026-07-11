'use client';

import { db } from '@/services/frontend/lib/db';
import { ProjectMilestone } from '@/services/frontend/types';
import { Alert, Button, Calendar, Card, Checkbox, Chip, DateField, DatePicker, Input, Label, TextField, toast } from '@heroui/react';
import type { DateValue } from '@internationalized/date';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Flag, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

function formatDueDate(value: string) {
    return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

export function MilestonePanel({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
    const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
    const [title, setTitle] = useState('');
    const [dueDate, setDueDate] = useState<DateValue | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    const completedCount = useMemo(
        () => milestones.filter((item) => item.status === 'completed').length,
        [milestones],
    );

    const load = useCallback(async () => {
        try {
            const response = await db.listProjectMilestones(projectId);
            setMilestones(response.documents);
        } catch {
            setMilestones([]);
        }
    }, [projectId]);

    useEffect(() => { void load(); }, [load]);

    const addMilestone = async () => {
        const trimmed = title.trim();
        if (!trimmed) return;
        setIsAdding(true);
        try {
            await db.createProjectMilestone(projectId, { title: trimmed, dueDate: dueDate?.toString() || undefined });
            setTitle('');
            setDueDate(null);
            await load();
            toast.success('Milestone created');
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not create milestone');
        } finally {
            setIsAdding(false);
        }
    };

    const toggle = async (milestone: ProjectMilestone) => {
        try {
            await db.updateMilestone(milestone.id, { status: milestone.status === 'completed' ? 'open' : 'completed' });
            await load();
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not update milestone status');
        }
    };

    const remove = async (milestone: ProjectMilestone) => {
        try {
            await db.deleteMilestone(milestone.id);
            setMilestones((current) => current.filter((item) => item.id !== milestone.id));
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not delete milestone');
        }
    };

    return (
        <Card variant="default" className="rounded-xl border border-border bg-surface">
            <Card.Header className="border-b border-border px-5 py-4">
                <div className="flex w-full items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                            <Flag size={16} />
                        </div>
                        <div className="min-w-0">
                            <Card.Title className="text-sm font-semibold">Milestones</Card.Title>
                            <Card.Description className="mt-0.5 text-xs">{compact ? 'Track delivery targets separately from tasks.' : 'Key delivery moments such as client review, beta, or go-live — separate from individual tasks.'}</Card.Description>
                        </div>
                    </div>
                    <Chip size="sm" variant="soft" color={completedCount === milestones.length && milestones.length > 0 ? 'success' : 'default'} className="shrink-0">
                        <Chip.Label>{completedCount} of {milestones.length} complete</Chip.Label>
                    </Chip>
                </div>
            </Card.Header>

            <Card.Content className="space-y-4 px-5 py-4">
                {milestones.length === 0 ? (
                    <Alert status="default" className="rounded-xl border border-border bg-surface-secondary/30 px-3 py-3">
                        <Alert.Indicator><Flag size={15} /></Alert.Indicator>
                        <Alert.Content>
                            <Alert.Title>No delivery target yet</Alert.Title>
                            <Alert.Description>Add only the moments where an outcome is reviewed or handed over.</Alert.Description>
                        </Alert.Content>
                    </Alert>
                ) : (
                    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                        {milestones.map((milestone) => {
                            const isComplete = milestone.status === 'completed';
                            const isOverdue = !isComplete && !!milestone.dueDate && new Date(`${milestone.dueDate}T23:59:59`) < new Date();
                            return (
                                <div key={milestone.id} className="group flex items-center gap-3 px-3 py-3">
                                    <Checkbox isSelected={isComplete} onChange={() => void toggle(milestone)} aria-label={`Mark ${milestone.title} as complete`}>
                                        <Checkbox.Content><Checkbox.Control><Checkbox.Indicator><Check size={11} /></Checkbox.Indicator></Checkbox.Control></Checkbox.Content>
                                    </Checkbox>
                                    <div className="min-w-0 flex-1">
                                        <p className={`truncate text-sm font-medium ${isComplete ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{milestone.title}</p>
                                        {milestone.dueDate && (
                                            <p className={`mt-1 flex items-center gap-1 text-xs ${isOverdue ? 'text-danger' : 'text-muted-foreground'}`}>
                                                <CalendarDays size={12} />
                                                {isOverdue ? 'Overdue · ' : ''}{formatDueDate(milestone.dueDate)}
                                            </p>
                                        )}
                                    </div>
                                    <Chip size="sm" variant="soft" color={isComplete ? 'success' : isOverdue ? 'danger' : 'accent'}>
                                        <Chip.Label>{isComplete ? 'Complete' : isOverdue ? 'Overdue' : 'Open'}</Chip.Label>
                                    </Chip>
                                    <Button variant="ghost" size="sm" isIconOnly aria-label={`Delete ${milestone.title}`} onPress={() => void remove(milestone)} className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-danger">
                                        <Trash2 size={13} />
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}

                <form onSubmit={(event) => { event.preventDefault(); void addMilestone(); }} className="rounded-xl border border-border bg-surface-secondary/20 p-3">
                    <div className="mb-3">
                        <p className="text-sm font-medium text-foreground">Add milestone</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Describe the expected outcome, not the work steps.</p>
                    </div>
                    <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end'}`}>
                        <TextField value={title} onChange={setTitle} className="min-w-0">
                            <Label className="text-xs font-medium text-muted-foreground">Delivery target</Label>
                            <Input placeholder="e.g. Client review" variant="secondary" className="h-9 rounded-lg text-sm" />
                        </TextField>
                        <DatePicker value={dueDate} onChange={setDueDate} granularity="day" className="min-w-0">
                            <Label className="text-xs font-medium text-muted-foreground">Target date</Label>
                            <DateField.Group className="h-9 w-full min-w-0 rounded-lg border border-border bg-surface-secondary px-2 text-sm">
                                <DateField.Input>
                                    {(segment) => <DateField.Segment segment={segment} />}
                                </DateField.Input>
                                <DateField.Suffix>
                                    <DatePicker.Trigger aria-label="Open target date picker" className="ml-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-tertiary hover:text-foreground">
                                        <CalendarDays size={14} />
                                    </DatePicker.Trigger>
                                </DateField.Suffix>
                            </DateField.Group>
                            <DatePicker.Popover className="max-w-[calc(100vw-2rem)]">
                                <Calendar>
                                    <Calendar.Header>
                                        <Button aria-label="Previous month" slot="previous" variant="ghost" isIconOnly size="sm"><ChevronLeft size={16} /></Button>
                                        <Calendar.Heading />
                                        <Button aria-label="Next month" slot="next" variant="ghost" isIconOnly size="sm"><ChevronRight size={16} /></Button>
                                    </Calendar.Header>
                                    <Calendar.Grid className="w-full">
                                        <Calendar.GridHeader>
                                            {(day) => <Calendar.HeaderCell className="pb-1 text-center text-[11px] font-medium text-muted-foreground">{day.slice(0, 2)}</Calendar.HeaderCell>}
                                        </Calendar.GridHeader>
                                        <Calendar.GridBody>
                                            {(date) => <Calendar.Cell date={date} className="mx-auto aspect-square w-full max-w-8 rounded-lg text-xs hover:bg-accent/10 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[today=true]:ring-1 data-[today=true]:ring-accent">{({ formattedDate }) => formattedDate}</Calendar.Cell>}
                                        </Calendar.GridBody>
                                    </Calendar.Grid>
                                </Calendar>
                            </DatePicker.Popover>
                        </DatePicker>
                        <Button type="submit" variant="primary" size="sm" isPending={isAdding} isDisabled={!title.trim()} className="h-9 rounded-lg px-3">
                            <Plus size={14} /> Add
                        </Button>
                    </div>
                </form>
            </Card.Content>
        </Card>
    );
}
