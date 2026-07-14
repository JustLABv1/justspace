/**
 * REST API client for the Go backend.
 * All requests include credentials (httpOnly JWT cookie).
 */
import { getEnv } from './env-config';

const getBaseURL = () => getEnv('NEXT_PUBLIC_API_URL') || 'http://localhost:8081';

export const resolveApiURL = (path: string) => `${getBaseURL()}${path}`;

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
    isPlatformAdmin: boolean;
    isActive: boolean;
}

export interface AuthResponse {
	 user: AuthUser;
}

export interface AuthConfig {
    localAuthEnabled: boolean;
    oidcProviders: OIDCProvider[];
}

export interface OIDCProvider {
    id: string;
    slug: string;
    name: string;
    issuerUrl: string;
    clientId: string;
    hasSecret: boolean;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface OIDCIdentity {
    id: string;
    providerId: string;
    providerName: string;
    providerSlug: string;
    createdAt: string;
}

export interface AdminUser {
    id: string;
    email: string;
    name: string;
    isPlatformAdmin: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface PlatformBranding {
    name: string;
    logoPath?: string;
    logoVersion?: string;
}

export interface AdminOverview {
    databaseStatus: 'healthy' | 'unhealthy' | string;
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    platformAdmins: number;
    projects: number;
    tasks: number;
    enabledOidcProviders: number;
    totalOidcProviders: number;
    localAuthEnabled: boolean;
}

export interface AdminAuditEvent {
    id: string;
    actorUserId?: string;
    actorName: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId?: string;
    targetLabel: string;
    metadata: Record<string, unknown>;
    createdAt: string;
}

export interface Workspace {
    id: string;
    ownerId: string;
    name: string;
    slug: string;
	 type: 'project_management' | 'consulting';
    role: 'owner' | 'admin' | 'member' | 'guest' | string;
    autoAddMembersToProjects: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface WorkspaceMember {
    workspaceId: string;
    userId: string;
    name: string;
    email: string;
    role: 'owner' | 'admin' | 'member' | 'guest' | string;
    joinedAt: string;
    publicKey?: string;
    hasVault: boolean;
    weeklyCapacityDays: number;
}

export interface WorkspaceInvitation {
    id: string;
    workspaceId: string;
    email: string;
    role: 'admin' | 'member' | 'guest' | string;
    token?: string;
    status: 'pending' | 'accepted' | 'cancelled' | 'expired' | string;
    invitedUserId?: string;
    invitedById: string;
    expiresAt: string;
    acceptedAt?: string;
    createdAt: string;
}

export const api = {
    // Auth
    async signup(email: string, password: string, name: string): Promise<AuthResponse> {
        return request('/api/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ email, password, name }),
        });
    },

    async getAuthConfig(): Promise<AuthConfig> {
        return request('/api/auth/config');
    },

    async getOIDCIdentities(): Promise<{ total: number; documents: OIDCIdentity[] }> {
        return request('/api/auth/oidc/identities');
    },

    async deleteOIDCIdentity(id: string): Promise<void> {
        return request(`/api/auth/oidc/identities/${id}`, { method: 'DELETE' });
    },

    getOIDCStartURL(slug: string): string {
        return `${getBaseURL()}/api/auth/oidc/${encodeURIComponent(slug)}/start`;
    },

    getOIDCLinkURL(slug: string): string {
        return `${getBaseURL()}/api/auth/oidc/${encodeURIComponent(slug)}/link`;
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

    async getPlatformBranding(): Promise<PlatformBranding> {
        return request('/api/platform/branding');
    },

    getPlatformBrandingAssetURL(path: string): string {
        return resolveApiURL(path);
    },

    async updateProfile(data: { name?: string; preferences?: Record<string, unknown> }): Promise<AuthUser> {
        return request('/api/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    // Workspaces
    async listWorkspaces(): Promise<ListResponse<Workspace>> {
        return request('/api/workspaces');
    },

    async createWorkspace(name: string, type: Workspace['type'] = 'project_management'): Promise<Workspace> {
        return request('/api/workspaces', { method: 'POST', body: JSON.stringify({ name, type }) });
    },

    async updateWorkspace(id: string, data: { name?: string; type?: Workspace['type']; autoAddMembersToProjects?: boolean }): Promise<Workspace> {
        return request(`/api/workspaces/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },

    async listWorkspaceMembers(workspaceId: string): Promise<ListResponse<WorkspaceMember>> {
        return request(`/api/workspaces/${workspaceId}/members`);
    },

    async addWorkspaceMember(workspaceId: string, data: { userId: string; role: string }): Promise<WorkspaceMember> {
        return request(`/api/workspaces/${workspaceId}/members`, { method: 'POST', body: JSON.stringify(data) });
    },

    async updateWorkspaceMember(workspaceId: string, userId: string, data: { role?: string; weeklyCapacityDays?: number }): Promise<WorkspaceMember> {
        return request(`/api/workspaces/${workspaceId}/members/${userId}`, { method: 'PUT', body: JSON.stringify(data) });
    },

    async removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
        return request(`/api/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' });
    },

    async listWorkspaceInvitations(workspaceId: string): Promise<ListResponse<WorkspaceInvitation>> {
        return request(`/api/workspaces/${workspaceId}/invitations`);
    },

    async createWorkspaceInvitation(workspaceId: string, data: { email: string; role: string }): Promise<WorkspaceInvitation> {
        return request(`/api/workspaces/${workspaceId}/invitations`, { method: 'POST', body: JSON.stringify(data) });
    },

    async cancelWorkspaceInvitation(workspaceId: string, invitationId: string): Promise<void> {
        return request(`/api/workspaces/${workspaceId}/invitations/${invitationId}`, { method: 'DELETE' });
    },

    async listCustomers<T>(workspaceId: string, archived = false): Promise<ListResponse<T>> {
        return request(`/api/workspaces/${workspaceId}/customers${archived ? '?archived=true' : ''}`);
    },

    async createCustomer<T>(workspaceId: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/workspaces/${workspaceId}/customers`, { method: 'POST', body: JSON.stringify(data) });
    },

    async updateCustomer<T>(workspaceId: string, customerId: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/workspaces/${workspaceId}/customers/${customerId}`, { method: 'PUT', body: JSON.stringify(data) });
    },

    // Platform administration
    async getAdminSettings(): Promise<{ settings: { localAuthEnabled: boolean }; oidcProviders: OIDCProvider[] }> {
        return request('/api/admin/settings');
    },

    async getAdminBranding(): Promise<PlatformBranding> {
        return request('/api/admin/branding');
    },

    async updateAdminBranding(data: { brandName: string }): Promise<PlatformBranding> {
        return request('/api/admin/branding', { method: 'PUT', body: JSON.stringify(data) });
    },

    async uploadBrandLogo(file: File): Promise<PlatformBranding> {
        const formData = new FormData();
        formData.append('logo', file);
        const response = await fetch(resolveApiURL('/api/admin/branding/logo'), {
            method: 'POST',
            credentials: 'include',
            body: formData,
        });
        if (!response.ok) {
            let message = response.statusText;
            try {
                const body = await response.json();
                message = body.error || message;
            } catch { /* ignore */ }
            throw new ApiError(message, response.status);
        }
        return response.json();
    },

    async deleteBrandLogo(): Promise<PlatformBranding> {
        return request('/api/admin/branding/logo', { method: 'DELETE' });
    },

    async getAdminOverview(): Promise<AdminOverview> {
        return request('/api/admin/overview');
    },

    async listAdminAudit(limit = 50, offset = 0): Promise<{ total: number; documents: AdminAuditEvent[]; limit: number; offset: number }> {
        return request(`/api/admin/audit?limit=${limit}&offset=${offset}`);
    },

    async updateAdminSettings(data: { localAuthEnabled?: boolean }): Promise<{ localAuthEnabled: boolean }> {
        return request('/api/admin/settings', { method: 'PUT', body: JSON.stringify(data) });
    },

    async listAdminUsers(query = ''): Promise<{ total: number; documents: AdminUser[] }> {
        const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
        return request(`/api/admin/users${suffix}`);
    },

    async updateAdminUser(id: string, data: { isPlatformAdmin?: boolean; isActive?: boolean }): Promise<AdminUser> {
        return request(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    },

    async createOIDCProvider(data: { slug: string; name: string; issuerUrl: string; clientId: string; clientSecret: string; enabled?: boolean }): Promise<OIDCProvider> {
        return request('/api/admin/oidc/providers', { method: 'POST', body: JSON.stringify(data) });
    },

    async updateOIDCProvider(id: string, data: { slug: string; name: string; issuerUrl: string; clientId: string; clientSecret?: string; enabled?: boolean }): Promise<OIDCProvider> {
        return request(`/api/admin/oidc/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },

    async deleteOIDCProvider(id: string): Promise<void> {
        return request(`/api/admin/oidc/providers/${id}`, { method: 'DELETE' });
    },

    // Projects
    async listProjects<T>(workspaceId?: string): Promise<ListResponse<T>> {
        return request(`/api/projects${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`);
    },

    async listProjectAllocations<T>(projectId: string): Promise<ListResponse<T>> {
        return request(`/api/projects/${projectId}/allocations`);
    },

    async updateProjectAllocation<T>(projectId: string, userId: string, daysPerWeek: number): Promise<T> {
        return request(`/api/projects/${projectId}/allocations/${userId}`, { method: 'PUT', body: JSON.stringify({ daysPerWeek }) });
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

    async migrateProjectEncryption<T>(id: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/projects/${id}/encryption/migrate`, { method: 'POST', body: JSON.stringify(data) });
    },

    async repairProjectEncryption(id: string, data: Record<string, unknown>): Promise<void> {
        return request(`/api/projects/${id}/encryption/repair`, { method: 'POST', body: JSON.stringify(data) });
    },

    async deleteProject(id: string): Promise<void> {
        return request(`/api/projects/${id}`, { method: 'DELETE' });
    },

    // Tasks
    async listAllTasks<T>(options: number | { limit?: number; sort?: 'createdAt' | 'deadline'; openOnly?: boolean; workspaceId?: string } = 100): Promise<ListResponse<T>> {
        const normalizedOptions = typeof options === 'number' ? { limit: options } : options;
        const params = new URLSearchParams();
        if (normalizedOptions.limit) params.set('limit', String(normalizedOptions.limit));
        if (normalizedOptions.sort === 'deadline') params.set('sort', 'deadline');
        if (normalizedOptions.openOnly) params.set('openOnly', 'true');
        if (normalizedOptions.workspaceId) params.set('workspaceId', normalizedOptions.workspaceId);
        const query = params.toString();
        return request(`/api/tasks${query ? `?${query}` : ''}`);
    },

    async getTask<T>(id: string): Promise<T> {
        return request(`/api/tasks/${id}`);
    },

    async listTasks<T>(projectId: string): Promise<ListResponse<T>> {
        return request(`/api/projects/${projectId}/tasks`);
    },

    async getTaskByKey<T>(projectId: string, taskKey: string): Promise<{ task: T | null }> {
        return request(`/api/projects/${projectId}/tasks/by-key/${encodeURIComponent(taskKey)}`);
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

    async reorderTasks<T>(projectId: string, updates: Record<string, unknown>[]): Promise<ListResponse<T>> {
        return request(`/api/projects/${projectId}/tasks/reorder`, {
            method: 'PUT',
            body: JSON.stringify({ updates }),
        });
    },

    async deleteTask(id: string): Promise<void> {
        return request(`/api/tasks/${id}`, { method: 'DELETE' });
    },

    async listProjectTaskStatuses<T>(projectId: string): Promise<ListResponse<T>> {
        return request(`/api/projects/${projectId}/task-statuses`);
    },

    async createProjectTaskStatus<T>(projectId: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/projects/${projectId}/task-statuses`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async updateProjectTaskStatus<T>(projectId: string, statusId: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/projects/${projectId}/task-statuses/${statusId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    async deleteProjectTaskStatus(projectId: string, statusId: string, replacementStatusId: string): Promise<void> {
        return request(`/api/projects/${projectId}/task-statuses/${statusId}`, {
            method: 'DELETE',
            body: JSON.stringify({ replacementStatusId }),
        });
    },

    async reorderProjectTaskStatuses<T>(projectId: string, statusIds: string[]): Promise<ListResponse<T>> {
        return request(`/api/projects/${projectId}/task-statuses/reorder`, {
            method: 'PUT',
            body: JSON.stringify({ statusIds }),
        });
    },

    async listProjectMilestones<T>(projectId: string): Promise<ListResponse<T>> {
        return request(`/api/projects/${projectId}/milestones`);
    },

    async createProjectMilestone<T>(projectId: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/projects/${projectId}/milestones`, { method: 'POST', body: JSON.stringify(data) });
    },

    async updateMilestone<T>(id: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/milestones/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },

    async deleteMilestone(id: string): Promise<void> {
        return request(`/api/milestones/${id}`, { method: 'DELETE' });
    },

    // Wiki
    async listGuides<T>(workspaceId?: string): Promise<ListResponse<T>> {
        return request(`/api/wiki${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`);
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
    async listSnippets<T>(workspaceId?: string): Promise<ListResponse<T>> {
        return request(`/api/snippets${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`);
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

    // Notifications
    async listNotifications<T>(): Promise<ListResponse<T>> {
        return request('/api/notifications');
    },

    async getUnreadNotificationCount(): Promise<{ count: number }> {
        return request('/api/notifications/unread-count');
    },

    async markNotificationRead<T>(id: string): Promise<T> {
        return request(`/api/notifications/${id}/read`, { method: 'POST' });
    },

    async deleteNotification(id: string): Promise<void> {
        return request(`/api/notifications/${id}`, { method: 'DELETE' });
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

    // Collaboration
    async searchUsers<T>(query: string): Promise<ListResponse<T>> {
        return request(`/api/users/search?q=${encodeURIComponent(query)}`);
    },

    async listProjectMembers<T>(projectId: string): Promise<ListResponse<T>> {
        return request(`/api/projects/${projectId}/members`);
    },

    async addProjectMember<T>(projectId: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/projects/${projectId}/members`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async updateProjectMember<T>(projectId: string, userId: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/projects/${projectId}/members/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    async removeProjectMember(projectId: string, userId: string): Promise<void> {
        return request(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
    },

    async listProjectInvitations<T>(projectId: string): Promise<ListResponse<T>> {
        return request(`/api/projects/${projectId}/invitations`);
    },

    async createProjectInvitation<T>(projectId: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/projects/${projectId}/invitations`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async cancelProjectInvitation(projectId: string, invitationId: string): Promise<void> {
        return request(`/api/projects/${projectId}/invitations/${invitationId}`, { method: 'DELETE' });
    },

    async acceptInvitation(data: Record<string, unknown>): Promise<{ projectId?: string; workspaceId?: string }> {
        return request('/api/invitations/accept', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async listProjectFiles<T>(projectId: string): Promise<ListResponse<T>> {
        return request(`/api/projects/${projectId}/files`);
    },

    async uploadProjectFile<T>(projectId: string, formData: FormData): Promise<T> {
        const url = `${getBaseURL()}/api/projects/${projectId}/files`;
        const res = await fetch(url, {
            method: 'POST',
            body: formData,
            credentials: 'include',
        });
        if (!res.ok) {
            let message = res.statusText;
            try {
                const body = await res.json();
                message = body.error || message;
            } catch { /* ignore */ }
            throw new ApiError(message, res.status);
        }
        return res.json();
    },

    async downloadProjectFile(fileId: string): Promise<Blob> {
        const url = `${getBaseURL()}/api/files/${fileId}`;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) {
            throw new ApiError(res.statusText, res.status);
        }
        return res.blob();
    },

    async deleteProjectFile(fileId: string): Promise<void> {
        return request(`/api/files/${fileId}`, { method: 'DELETE' });
    },

    async listTaskFiles<T>(taskId: string): Promise<ListResponse<T>> {
        return request(`/api/tasks/${taskId}/files`);
    },

    async uploadTaskFile<T>(taskId: string, formData: FormData): Promise<T> {
        const url = `${getBaseURL()}/api/tasks/${taskId}/files`;
        const res = await fetch(url, {
            method: 'POST',
            body: formData,
            credentials: 'include',
        });
        if (!res.ok) {
            let message = res.statusText;
            try {
                const body = await res.json();
                message = body.error || message;
            } catch { /* ignore */ }
            throw new ApiError(message, res.status);
        }
        return res.json();
    },

    async listTaskAssignees<T>(taskId: string): Promise<ListResponse<T>> {
        return request(`/api/tasks/${taskId}/assignees`);
    },

    async addTaskAssignee<T>(taskId: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/tasks/${taskId}/assignees`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async removeTaskAssignee(taskId: string, userId: string): Promise<void> {
        return request(`/api/tasks/${taskId}/assignees/${userId}`, { method: 'DELETE' });
    },

    async listTaskMessages<T>(taskId: string): Promise<ListResponse<T>> {
        return request(`/api/tasks/${taskId}/comments`);
    },

    async createTaskMessage<T>(taskId: string, data: Record<string, unknown>): Promise<T> {
        return request(`/api/tasks/${taskId}/comments`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    async deleteTaskMessage(taskId: string, messageId: string): Promise<void> {
        return request(`/api/tasks/${taskId}/comments/${messageId}`, { method: 'DELETE' });
    },

    async listTaskActivity<T>(taskId: string): Promise<ListResponse<T>> {
        return request(`/api/tasks/${taskId}/activity`);
    },

    async heartbeatProjectPresence<T>(projectId: string): Promise<ListResponse<T>> {
        return request(`/api/projects/${projectId}/presence`, { method: 'POST' });
    },

    async heartbeatTaskPresence<T>(taskId: string): Promise<ListResponse<T>> {
        return request(`/api/tasks/${taskId}/presence`, { method: 'POST' });
    },

    async listProjectActivity<T>(projectId: string): Promise<ListResponse<T>> {
        return request(`/api/projects/${projectId}/activity`);
    },
};
