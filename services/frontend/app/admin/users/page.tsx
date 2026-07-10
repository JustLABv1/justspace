'use client';

import { Alert, Button, Card, Input, Label, Switch } from '@heroui/react';
import { api, AdminUser } from '@/services/frontend/lib/api';
import { useAuth } from '@/services/frontend/context/AuthContext';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export default function AdminUsersPage() {
    const { user } = useAuth();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const loadUsers = useCallback(async (search = '') => {
        setIsLoading(true);
        setError('');
        try {
            const response = await api.listAdminUsers(search);
            setUsers(response.documents);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load users.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadUsers();
    }, [loadUsers]);

    const updateUser = async (target: AdminUser, field: 'isActive' | 'isPlatformAdmin', value: boolean) => {
        setError('');
        try {
            const updated = await api.updateAdminUser(target.id, { [field]: value });
            setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
            setNotice('User permissions updated.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to update user.');
        }
    };

    return (
        <div className="mx-auto w-full max-w-5xl space-y-6 p-6 md:p-10">
            <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">Admin / Users</p>
                <h1 className="mt-2 text-2xl font-semibold text-foreground">Users</h1>
                <p className="mt-1 text-sm text-muted-foreground">Manage account access and platform administrator privileges.</p>
            </div>

            {error && <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>Action failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Content></Alert>}
            {notice && <Alert status="success"><Alert.Indicator /><Alert.Content><Alert.Title>Saved</Alert.Title><Alert.Description>{notice}</Alert.Description></Alert.Content></Alert>}

            <Card>
                <Card.Header>
                    <Card.Title>Platform users</Card.Title>
                    <Card.Description>Deactivated users lose API, session, and WebSocket access immediately.</Card.Description>
                    <div className="mt-4 flex gap-2">
                        <Label className="sr-only" htmlFor="admin-user-search">Search users</Label>
                        <Input id="admin-user-search" className="min-w-0 flex-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email" onKeyDown={(event) => { if (event.key === 'Enter') void loadUsers(query); }} />
                        <Button variant="secondary" onPress={() => void loadUsers(query)}>Search</Button>
                    </div>
                </Card.Header>
                <Card.Content className="space-y-2">
                    {isLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div> : users.map((target) => (
                        <div key={target.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3">
                            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{target.name || 'Unnamed user'}</p><p className="truncate text-xs text-muted-foreground">{target.email}</p></div>
                            <Switch aria-label={`Active: ${target.email}`} isSelected={target.isActive} isDisabled={target.id === user?.id} onChange={(value) => void updateUser(target, 'isActive', value)}>
                                <Switch.Control><Switch.Thumb /></Switch.Control>
                                <Label className="text-xs">Active</Label>
                            </Switch>
                            <Button size="sm" variant={target.isPlatformAdmin ? 'primary' : 'secondary'} isDisabled={target.id === user?.id} onPress={() => void updateUser(target, 'isPlatformAdmin', !target.isPlatformAdmin)}>
                                <ShieldCheck size={14} />
                                {target.isPlatformAdmin ? 'Admin' : 'Make admin'}
                            </Button>
                        </div>
                    ))}
                    {!isLoading && users.length === 0 && <p className="py-6 text-sm text-muted-foreground">No users found.</p>}
                </Card.Content>
            </Card>
        </div>
    );
}
