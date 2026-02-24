/**
 * Data access layer – talks to the Go backend via lib/api.ts.
 * Drop-in replacement for the old Appwrite-based db.ts.
 *
 * Activity logging is now handled server-side, so the frontend no longer
 * needs to manually log activity after every mutation.
 */
import {
    AccessControl,
    ActivityLog,
    InstallationTarget,
    Project,
    ResourceVersion,
    Snippet,
    Task,
    UserKeys,
    WikiGuide
} from '@/types';
import { api } from './api';

interface ListResponse<T> {
    total: number;
    documents: T[];
}

export const db = {
    // Versions
    async listVersions(resourceId: string) {
        return await api.listVersions<ResourceVersion>(resourceId);
    },
    async createVersion(data: Omit<ResourceVersion, 'id' | 'createdAt'>) {
        return await api.createVersion<ResourceVersion>(data as Record<string, unknown>);
    },

    // Activity
    async listActivity() {
        return await api.listActivity<ActivityLog>();
    },

    // Snippets
    async listSnippets() {
        return await api.listSnippets<Snippet>();
    },
    async createSnippet(data: Omit<Snippet, 'id' | 'createdAt'>) {
        return await api.createSnippet<Snippet>(data as Record<string, unknown>);
    },
    async updateSnippet(id: string, data: Partial<Snippet>) {
        return await api.updateSnippet<Snippet>(id, data as Record<string, unknown>);
    },
    async deleteSnippet(id: string) {
        return await api.deleteSnippet(id);
    },

    // Projects
    async listProjects() {
        return await api.listProjects<Project>();
    },
    async getProject(id: string) {
        return await api.getProject<Project>(id);
    },
    async createProject(data: Omit<Project, 'id' | 'createdAt'>) {
        return await api.createProject<Project>(data as Record<string, unknown>);
    },
    async updateProject(id: string, data: Partial<Project>) {
        return await api.updateProject<Project>(id, data as Record<string, unknown>);
    },
    async deleteProject(id: string) {
        return await api.deleteProject(id);
    },

    // Wiki Guides
    async listGuides() {
        return await api.listGuides<WikiGuide>();
    },
    async getGuide(id: string) {
        return await api.getGuide<WikiGuide>(id);
    },
    async createGuide(data: Omit<WikiGuide, 'id' | 'createdAt'>) {
        return await api.createGuide<WikiGuide>(data as Record<string, unknown>);
    },
    async updateGuide(id: string, data: Partial<WikiGuide>) {
        return await api.updateGuide<WikiGuide>(id, data as Record<string, unknown>);
    },
    async deleteGuide(id: string) {
        return await api.deleteGuide(id);
    },

    // Installations
    async createInstallation(data: Omit<InstallationTarget, 'id' | 'createdAt'>) {
        return await api.createInstallation<InstallationTarget>(data as Record<string, unknown>);
    },
    async updateInstallation(id: string, data: Partial<InstallationTarget>) {
        return await api.updateInstallation<InstallationTarget>(id, data as Record<string, unknown>);
    },
    async deleteInstallation(id: string) {
        return await api.deleteInstallation(id);
    },

    // Tasks
    async listAllTasks(limit = 100) {
        return await api.listAllTasks<Task>(limit);
    },
    async listTasks(projectId: string) {
        return await api.listTasks<Task>(projectId);
    },
    async createEmptyTask(projectId: string, title: string, order: number = 0, isEncrypted: boolean = false, parentId?: string, kanbanStatus: Task['kanbanStatus'] = 'todo') {
        return await api.createTask<Task>({
            projectId,
            title,
            order,
            isEncrypted,
            parentId,
            kanbanStatus,
        });
    },
    async createTasks(projectId: string, titles: string[], isEncrypted: boolean = false) {
        return await api.createTasksBatch<Task>({
            projectId,
            titles,
            isEncrypted,
        });
    },
    async updateTask(id: string, data: Partial<Task> & { workDuration?: string }) {
        return await api.updateTask<Task>(id, data as Record<string, unknown>);
    },
    async deleteTask(id: string) {
        return await api.deleteTask(id);
    },

    // Encryption Keys
    async getUserKeys(_userId?: string) {
        return await api.getVaultKeys<UserKeys>();
    },
    async createUserKeys(data: Omit<UserKeys, 'id'>) {
        return await api.createVaultKeys<UserKeys>(data as Record<string, unknown>);
    },
    async updateUserKeys(id: string, data: Partial<UserKeys>) {
        return await api.updateVaultKeys<UserKeys>(id, data as Record<string, unknown>);
    },
    async getAccessKey(resourceId: string, _userId?: string) {
        return await api.getAccessKey<AccessControl>(resourceId);
    },
    async grantAccess(data: Omit<AccessControl, 'id'>) {
        return await api.grantAccess<AccessControl>(data as Record<string, unknown>);
    }
};
