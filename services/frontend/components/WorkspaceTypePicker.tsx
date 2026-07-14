'use client';

import { Workspace } from '@/services/frontend/lib/api';
import { Label, Radio, RadioGroup } from '@heroui/react';
import { BriefcaseBusiness, FolderKanban } from 'lucide-react';

const workspaceTypes: Array<{ value: Workspace['type']; label: string; description: string; icon: typeof FolderKanban }> = [
    { value: 'project_management', label: 'Project management', description: 'Focus on projects, tasks, milestones, and delivery progress.', icon: FolderKanban },
    { value: 'consulting', label: 'Consulting', description: 'Adds per-project allocation and weekly capacity planning.', icon: BriefcaseBusiness },
];

export function WorkspaceTypePicker({ value, onChange, isDisabled = false }: {
    value: Workspace['type'];
    onChange: (value: Workspace['type']) => void;
    isDisabled?: boolean;
}) {
    return (
        <RadioGroup value={value} onChange={(nextValue) => onChange(nextValue as Workspace['type'])} isDisabled={isDisabled} aria-label="Workspace type" variant="secondary" className="grid gap-3 sm:grid-cols-2">
            {workspaceTypes.map(({ value: type, label, description, icon: Icon }) => (
                <Radio key={type} value={type} className="group w-full rounded-xl border border-border bg-surface text-left transition-colors hover:border-accent/40 hover:bg-surface-secondary data-[selected=true]:border-accent data-[selected=true]:bg-accent-muted/20">
                    <Radio.Content className="flex min-h-24 w-full items-start gap-3 p-4 text-left">
                        <Radio.Control className="mt-0.5 shrink-0"><Radio.Indicator /></Radio.Control>
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <Label className="flex items-center gap-2 text-sm font-medium text-foreground"><Icon size={15} className="shrink-0 text-muted-foreground" />{label}</Label>
                            <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
                        </div>
                    </Radio.Content>
                </Radio>
            ))}
        </RadioGroup>
    );
}
