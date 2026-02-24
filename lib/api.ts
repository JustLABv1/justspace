/**
 * REST API client for the Go backend.
 * All requests include credentials (httpOnly JWT cookie).
 */
import { getEnv } from './env-config';

const getBaseURL = () => getEnv('NEXT_PUBLIC_API_URL') || 'http://localhost:8080';

interface ListResponse<T> {
    total: number;
    documents: T[];
}

class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${getBaseURL()}${path}`;
    const res = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    if (!res.ok) {
        let message = res.statusText;
        try {
            const body = await res.json();
            message = body.error || message;
        } catch { /* ignore */ }
        throw new ApiError(message, res.status);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
}

// ─── Auth ──────────────────────────────────────

export interface AuthUser {
    id: string;
    email: string;
    name: string;
    preferences: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

export interface AuthResponse {
    token: string;
    user: AuthUser;
}

export const api = {
    // Auth
    async signup(email: string, password: string, name: string): Promise<AuthResponse> {
        return request('/api/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ email, password, name }),
        });
    },

    async login(email: string, password: string): Promise<AuthResponse> {
        return request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    },

    async logout(): Promise<void> {
        return request('/api/auth/logout', { method: 'POST' });
    },

    async getMe(): Promise<AuthUser> {
        return request('/api/auth/me');
    },

    async updateProfile(data: { name?: string; preferences?: Record<string, unknown> }): Promise<AuthUser> {
        return request('/api/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    // Projects
    async listProjects<T>(): Promise<ListResponse<T>> {
        return request('/api/projects');
    },

    async getProject<T>(id: string): Promise<T> {
        return request(`/api/projects/${id}`);
    },

    async createProject<T>(data: Record<string, unknown>): Promise<T> {
        return request(`/api/projects`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async updateProject<T>(id: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    async deleteProject(id: string): Promise<void> {
        return request(`/api/projects/${id}`, { method: 'DELETE' });
    },

    // Tasks
    async listAllTasks<T>(limit?: number): Promise<ListResponse<T>> {
        const q = limit ? `?limit=${limit}` : '';
        return request(`/api/tasks${q}`);
    },

    async listTasks<T>(projectId: string): Promise<ListResponse<T>> {
        return request(`/api/projects/${projectId}/tasks`);
    },

    async createTask<T>(data: Record<string, unknown>): Promise<T> {
        return request('/api/tasks', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async createTasksBatch<T>(data: { projectId: string; titles: string[]; isEncrypted?: boolean }): Promise<T[]> {
        return request('/api/tasks/batch', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async updateTask<T>(id: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    async deleteTask(id: string): Promise<void> {
        return request(`/api/tasks/${id}`, { method: 'DELETE' });
    },

    // Wiki
    async listGuides<T>(): Promise<ListResponse<T>> {
        return request('/api/wiki');
    },

    async getGuide<T>(id: string): Promise<T> {
        return request(`/api/wiki/${id}`);
    },

    async createGuide<T>(data: Record<string, unknown>): Promise<T> {
        return request('/api/wiki', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async updateGuide<T>(id: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/wiki/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    async deleteGuide(id: string): Promise<void> {
        return request(`/api/wiki/${id}`, { method: 'DELETE' });
    },

    // Installations
    async createInstallation<T>(data: Record<string, unknown>): Promise<T> {
        return request('/api/installations', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async updateInstallation<T>(id: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/installations/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    async deleteInstallation(id: string): Promise<void> {
        return request(`/api/installations/${id}`, { method: 'DELETE' });
    },

    // Snippets
    async listSnippets<T>(): Promise<ListResponse<T>> {
        return request('/api/snippets');
    },

    async createSnippet<T>(data: Record<string, unknown>): Promise<T> {
        return request('/api/snippets', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async updateSnippet<T>(id: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/snippets/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    async deleteSnippet(id: string): Promise<void> {
        return request(`/api/snippets/${id}`, { method: 'DELETE' });
    },

    // Activity
    async listActivity<T>(): Promise<ListResponse<T>> {
        return request('/api/activity');
    },

    // Vault
    async getVaultKeys<T>(): Promise<T | null> {
        return request('/api/vault/keys');
    },

    async createVaultKeys<T>(data: Record<string, unknown>): Promise<T> {
        return request('/api/vault/keys', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async updateVaultKeys<T>(id: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/vault/keys/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    // Access Control
    async getAccessKey<T>(resourceId: string): Promise<T | null> {
        return request(`/api/access/${resourceId}`);
    },

    async grantAccess<T>(data: Record<string, unknown>): Promise<T> {
        return request('/api/access', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    // Versions
    async listVersions<T>(resourceId: string): Promise<ListResponse<T>> {
        return request(`/api/versions/${resourceId}`);
    },

    async createVersion<T>(data: Record<string, unknown>): Promise<T> {
        return request('/api/versions', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
};
