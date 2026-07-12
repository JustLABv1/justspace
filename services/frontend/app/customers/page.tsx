'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { useWorkspace } from '@/services/frontend/context/WorkspaceContext';
import { decryptData, decryptDocumentKey } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { Customer, Project, Task } from '@/services/frontend/types';
import { Button, ButtonGroup, Card, Input, Label, Modal, TextArea, TextField, toast } from '@heroui/react';
import { Archive, ArchiveRestore, ArchiveX, Building2, Edit, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type CustomerDraft = Pick<Customer, 'name' | 'contactName' | 'contactEmail' | 'notes'>;

const emptyDraft: CustomerDraft = { name: '', contactName: '', contactEmail: '', notes: '' };

export default function CustomersPage() {
    const { workspace, workspaceId } = useWorkspace();
    const { privateKey } = useAuth();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [hoursByProject, setHoursByProject] = useState<Record<string, number>>({});
    const [draft, setDraft] = useState<CustomerDraft>(emptyDraft);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [customerView, setCustomerView] = useState<'active' | 'archived'>('active');

    const load = useCallback(async () => {
        if (!workspaceId || workspace?.type !== 'consulting') return;
        const [customerResponse, projectResponse] = await Promise.all([db.listCustomers(workspaceId, true), db.listProjects(workspaceId)]);
        const visibleProjects = await Promise.all(projectResponse.documents.map(async (project) => {
            if (!project.isEncrypted) return project;
            if (!privateKey) return { ...project, name: 'Encrypted project' };
            try {
                const access = await db.getAccessKey(project.id);
                if (!access) return { ...project, name: 'Encrypted project' };
                const documentKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                return { ...project, name: await decryptData(JSON.parse(project.name), documentKey) };
            } catch {
                return { ...project, name: 'Encrypted project' };
            }
        }));
        setCustomers(customerResponse.documents);
        setProjects(visibleProjects);
        const entries = await Promise.all(projectResponse.documents.map(async (project) => {
            const tasks = await db.listTasks(project.id);
            return [project.id, (tasks.documents as Task[]).reduce((total, task) => total + (task.timeSpent || 0), 0)] as const;
        }));
        setHoursByProject(Object.fromEntries(entries));
    }, [privateKey, workspace?.type, workspaceId]);

    useEffect(() => { void load(); }, [load]);

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingCustomer(null);
        setDraft(emptyDraft);
    };

    const openCreate = () => {
        setEditingCustomer(null);
        setDraft(emptyDraft);
        setIsModalOpen(true);
    };

    const openEdit = (customer: Customer) => {
        setEditingCustomer(customer);
        setDraft({ name: customer.name, contactName: customer.contactName || '', contactEmail: customer.contactEmail || '', notes: customer.notes });
        setIsModalOpen(true);
    };

    const saveCustomer = async () => {
        if (!workspaceId || !draft.name.trim()) return;
        setIsSaving(true);
        try {
            const data = { name: draft.name.trim(), contactName: draft.contactName || undefined, contactEmail: draft.contactEmail || undefined, notes: draft.notes };
            if (editingCustomer) await db.updateCustomer(workspaceId, editingCustomer.id, data);
            else await db.createCustomer(workspaceId, data);
            toast.success(editingCustomer ? 'Customer updated' : 'Customer created');
            closeModal();
            await load();
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not save customer');
        } finally {
            setIsSaving(false);
        }
    };

    const archiveCustomer = async (customer: Customer) => {
        if (!workspaceId) return;
        try {
            await db.updateCustomer(workspaceId, customer.id, { archived: true });
            await load();
            toast.success('Customer archived');
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not archive customer');
        }
    };

    const restoreCustomer = async (customer: Customer) => {
        if (!workspaceId) return;
        try {
            await db.updateCustomer(workspaceId, customer.id, { archived: false });
            await load();
            setCustomerView('active');
            toast.success('Customer restored');
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Could not restore customer');
        }
    };

    const customerProjects = useMemo(() => new Map(customers.map((customer) => [customer.id, projects.filter((project) => project.clientId === customer.id)])), [customers, projects]);
    const activeCustomers = useMemo(() => customers.filter((customer) => !customer.archivedAt), [customers]);
    const archivedCustomers = useMemo(() => customers.filter((customer) => !!customer.archivedAt), [customers]);

    if (workspace?.type !== 'consulting') return <div className="w-full px-6 py-8"><Card className="border border-border"><Card.Content className="py-12 text-center text-sm text-muted-foreground">Customers are available in Consulting workspaces only.</Card.Content></Card></div>;

    return (
        <div className="w-full space-y-6 px-6 py-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Building2 size={18} /></div>
                    <div>
                        <h1 className="text-lg font-semibold text-foreground">Customers</h1>
                        <p className="mt-0.5 text-[13px] text-muted-foreground">Organize consulting projects and their hour budgets by customer.</p>
                    </div>
                </div>
                {customerView === 'active' && <Button variant="primary" onPress={openCreate}><Plus size={15} /> Add customer</Button>}
            </div>

            <div className="space-y-4">
                <ButtonGroup size="sm" variant="secondary" className="w-fit rounded-xl">
                    <Button variant={customerView === 'active' ? 'primary' : 'secondary'} onPress={() => setCustomerView('active')}>Active ({activeCustomers.length})</Button>
                    <Button variant={customerView === 'archived' ? 'primary' : 'secondary'} onPress={() => setCustomerView('archived')}>Archived ({archivedCustomers.length})</Button>
                </ButtonGroup>
                <CustomerCards customers={customerView === 'active' ? activeCustomers : archivedCustomers} customerProjects={customerProjects} hoursByProject={hoursByProject} onEdit={openEdit} onArchive={archiveCustomer} onRestore={restoreCustomer} />
                {customerView === 'active' && activeCustomers.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><Archive className="mx-auto mb-2" size={18} />No active customers yet.</div>}
                {customerView === 'archived' && archivedCustomers.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><Archive className="mx-auto mb-2" size={18} />No archived customers.</div>}
            </div>

            <CustomerModal
                draft={draft}
                editingCustomer={editingCustomer}
                isOpen={isModalOpen}
                isSaving={isSaving}
                onChange={setDraft}
                onClose={closeModal}
                onSave={() => void saveCustomer()}
            />
        </div>
    );
}

function CustomerCards({ customers, customerProjects, hoursByProject, onEdit, onArchive, onRestore }: {
    customers: Customer[];
    customerProjects: Map<string, Project[]>;
    hoursByProject: Record<string, number>;
    onEdit: (customer: Customer) => void;
    onArchive: (customer: Customer) => void;
    onRestore: (customer: Customer) => void;
}) {
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            {customers.map((customer) => {
                const linkedProjects = customerProjects.get(customer.id) || [];
                const budget = linkedProjects.reduce((total, project) => total + (project.hourBudget || 0), 0);
                const spent = linkedProjects.reduce((total, project) => total + (hoursByProject[project.id] || 0), 0) / 3600;
                const isArchived = !!customer.archivedAt;
                return (
                    <Card key={customer.id} className={`border border-border ${isArchived ? 'opacity-75' : ''}`}>
                        <Card.Header>
                            <div className="flex w-full items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-3"><Building2 size={16} className="mt-0.5 shrink-0 text-accent" /><div className="min-w-0"><Card.Title className="truncate">{customer.name}</Card.Title><Card.Description className="truncate">{customer.contactName || customer.contactEmail || 'No contact details'}</Card.Description></div></div>
                                <div className="flex shrink-0">{isArchived ? <Button aria-label={`Restore ${customer.name}`} variant="ghost" isIconOnly size="sm" onPress={() => onRestore(customer)}><ArchiveRestore size={14} /></Button> : <><Button aria-label={`Edit ${customer.name}`} variant="ghost" isIconOnly size="sm" onPress={() => onEdit(customer)}><Edit size={14} /></Button><Button aria-label={`Archive ${customer.name}`} variant="ghost" isIconOnly size="sm" onPress={() => onArchive(customer)}><ArchiveX size={14} /></Button></>}</div>
                            </div>
                        </Card.Header>
                        <Card.Content className="space-y-3">
                            {isArchived && <p className="text-xs text-muted-foreground">Archived {new Date(customer.archivedAt!).toLocaleDateString('en-US')}</p>}
                            <div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">Hours</span><span className="shrink-0">{spent.toFixed(1)}h{budget > 0 ? ` / ${budget}h` : ''}</span></div>
                            <div className="space-y-1">{linkedProjects.map((project) => <Link key={project.id} href={`/projects/${project.id}`} title={project.name} className="block min-w-0 truncate rounded-lg bg-surface-secondary px-3 py-2 text-sm hover:text-accent">{project.name}</Link>)}{linkedProjects.length === 0 && <p className="text-sm text-muted-foreground">No projects assigned yet.</p>}</div>
                        </Card.Content>
                    </Card>
                );
            })}
        </div>
    );
}

function CustomerModal({ draft, editingCustomer, isOpen, isSaving, onChange, onClose, onSave }: {
    draft: CustomerDraft;
    editingCustomer: Customer | null;
    isOpen: boolean;
    isSaving: boolean;
    onChange: (draft: CustomerDraft) => void;
    onClose: () => void;
    onSave: () => void;
}) {
    const update = <Key extends keyof CustomerDraft>(key: Key, value: CustomerDraft[Key]) => onChange({ ...draft, [key]: value });
    return (
        <Modal>
            <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()} variant="blur" isDismissable={!isSaving}>
                <Modal.Container size="lg" scroll="inside">
                    <Modal.Dialog className="rounded-xl border border-border bg-surface">
                        <Modal.CloseTrigger />
                        <Modal.Header className="border-b border-border px-6 py-5"><div className="space-y-1"><Modal.Heading>{editingCustomer ? 'Edit customer' : 'Add customer'}</Modal.Heading><p className="text-xs text-muted-foreground">Keep contacts and their consulting projects in one place.</p></div></Modal.Header>
                        <Modal.Body className="grid gap-4 px-6 py-5 sm:grid-cols-2">
                            <TextField isRequired value={draft.name} onChange={(value) => update('name', value)}><Label>Name</Label><Input autoFocus variant="secondary" placeholder="Company name" /></TextField>
                            <TextField value={draft.contactName} onChange={(value) => update('contactName', value)}><Label>Contact person</Label><Input variant="secondary" placeholder="Optional" /></TextField>
                            <TextField value={draft.contactEmail} onChange={(value) => update('contactEmail', value)}><Label>Contact email</Label><Input type="email" variant="secondary" placeholder="Optional" /></TextField>
                            <TextField value={draft.notes} onChange={(value) => update('notes', value)}><Label>Notes</Label><TextArea variant="secondary" placeholder="Optional context" /></TextField>
                        </Modal.Body>
                        <Modal.Footer className="border-t border-border px-6 py-4"><Button variant="ghost" isDisabled={isSaving} onPress={onClose}>Cancel</Button><Button variant="primary" isPending={isSaving} isDisabled={!draft.name.trim()} onPress={onSave}>{editingCustomer ? <Edit size={15} /> : <Plus size={15} />}{editingCustomer ? 'Save customer' : 'Add customer'}</Button></Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
