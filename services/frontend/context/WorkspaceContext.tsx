'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { api, Workspace } from '@/services/frontend/lib/api';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface WorkspaceContextValue {
    workspaces: Workspace[];
    workspace?: Workspace;
    workspaceId?: string;
    isLoading: boolean;
    refresh: () => Promise<void>;
    setActiveWorkspace: (id: string) => void;
    createWorkspace: (name: string, type?: Workspace['type']) => Promise<Workspace>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const STORAGE_KEY = 'active-workspace-id';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>();
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async () => {
        if (!user) {
            setWorkspaces([]);
            setActiveWorkspaceId(undefined);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const response = await api.listWorkspaces();
            setWorkspaces(response.documents);
            const storedId = window.localStorage.getItem(STORAGE_KEY);
            const nextId = response.documents.some((item) => item.id === storedId)
                ? storedId ?? undefined
                : response.documents[0]?.id;
            setActiveWorkspaceId(nextId);
            if (nextId) window.localStorage.setItem(STORAGE_KEY, nextId);
        } catch {
            // Keep the existing personal-resource experience usable while an
            // older backend is being restarted and migrations are applied.
            setWorkspaces([]);
            setActiveWorkspaceId(undefined);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const setActiveWorkspace = useCallback((id: string) => {
        setActiveWorkspaceId(id);
        window.localStorage.setItem(STORAGE_KEY, id);
        window.dispatchEvent(new CustomEvent('workspace-change', { detail: id }));
    }, []);

    const createWorkspace = useCallback(async (name: string, type: Workspace['type'] = 'project_management') => {
        const created = await api.createWorkspace(name, type);
        setWorkspaces((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
        setActiveWorkspace(created.id);
        return created;
    }, [setActiveWorkspace]);

    const value = useMemo<WorkspaceContextValue>(() => ({
        workspaces,
        workspace: workspaces.find((item) => item.id === activeWorkspaceId),
        workspaceId: activeWorkspaceId,
        isLoading,
        refresh,
        setActiveWorkspace,
        createWorkspace,
    }), [activeWorkspaceId, createWorkspace, isLoading, refresh, setActiveWorkspace, workspaces]);

    return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
    const context = useContext(WorkspaceContext);
    if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
    return context;
}
