'use client';

import { WorkspaceTypePicker } from '@/services/frontend/components/WorkspaceTypePicker';
import { useWorkspace } from '@/services/frontend/context/WorkspaceContext';
import { Workspace } from '@/services/frontend/lib/api';
import { Button, Card, Description, Form, Input, Label, TextField, toast } from '@heroui/react';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export default function NewWorkspacePage() {
    const router = useRouter();
    const { createWorkspace } = useWorkspace();
    const [name, setName] = useState('');
    const [type, setType] = useState<Workspace['type']>('project_management');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const workspaceName = name.trim();
        if (!workspaceName || isSaving) return;

        setIsSaving(true);
        try {
            await createWorkspace(workspaceName, type);
            toast.success('Workspace created');
            router.replace('/workspace');
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not create workspace');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="w-full px-6 py-8">
            <Card className="mx-auto max-w-2xl border border-border">
                <Card.Header>
                    <Card.Title>Create workspace</Card.Title>
                    <Card.Description>Set up a dedicated space for projects, knowledge, and collaboration.</Card.Description>
                </Card.Header>
                <Card.Content>
                    <Form onSubmit={handleSubmit} aria-labelledby="new-workspace-title" className="space-y-5">
                        <TextField value={name} onChange={setName} isRequired autoFocus className="flex min-w-0 flex-col gap-1.5">
                            <Label id="new-workspace-title" className="text-xs font-medium text-muted-foreground">Workspace name</Label>
                            <Input name="name" placeholder="e.g. Product Team" variant="secondary" fullWidth />
                            <Description className="text-xs text-muted-foreground">Choose a name your collaborators will recognize.</Description>
                        </TextField>
                        <div className="space-y-2">
                            <Label className="text-xs font-medium text-muted-foreground">Workspace type</Label>
                            <WorkspaceTypePicker value={type} onChange={setType} isDisabled={isSaving} />
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                            <Button type="button" variant="secondary" onPress={() => router.push('/workspace')} isDisabled={isSaving}>
                                Cancel
                            </Button>
                            <Button type="submit" isPending={isSaving} isDisabled={!name.trim()}>
                                <Plus size={15} />
                                Create workspace
                            </Button>
                        </div>
                    </Form>
                </Card.Content>
            </Card>
        </div>
    );
}
