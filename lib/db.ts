import { ActivityLog, InstallationTarget, Project, Snippet, Task, WikiGuide } from '@/types';
import { ID, Query, type Models } from 'appwrite';
import { databases } from './appwrite';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;
const TASKS_ID = process.env.NEXT_PUBLIC_APPWRITE_TASKS_COLLECTION_ID!;
const GUIDES_ID = process.env.NEXT_PUBLIC_APPWRITE_GUIDES_COLLECTION_ID!;
const INSTALLATIONS_ID = process.env.NEXT_PUBLIC_APPWRITE_INSTALLATIONS_COLLECTION_ID!;
const ACTIVITY_ID = process.env.NEXT_PUBLIC_APPWRITE_ACTIVITY_COLLECTION_ID!;
const SNIPPETS_ID = process.env.NEXT_PUBLIC_APPWRITE_SNIPPETS_COLLECTION_ID!;

export const db = {
    // Activity
    async listActivity() {
        return await databases.listDocuments<ActivityLog & Models.Document>(DB_ID, ACTIVITY_ID, [
            Query.orderDesc('$createdAt'),
            Query.limit(10)
        ]);
    },
    async logActivity(data: Omit<ActivityLog, '$id' | '$createdAt'>) {
        try {
            return await databases.createDocument(DB_ID, ACTIVITY_ID, ID.unique(), data);
        } catch (e) {
            console.error('Failed to log activity:', e);
        }
    },

    // Snippets
    async listSnippets() {
        return await databases.listDocuments<Snippet & Models.Document>(DB_ID, SNIPPETS_ID, [
            Query.orderDesc('$createdAt')
        ]);
    },
    async createSnippet(data: Omit<Snippet, '$id' | '$createdAt'>) {
        const snippet = await databases.createDocument(DB_ID, SNIPPETS_ID, ID.unique(), data);
        await this.logActivity({
            type: 'create',
            entityType: 'Snippet',
            entityName: data.title
        });
        return snippet;
    },
    async updateSnippet(id: string, data: Partial<Snippet>) {
        const snippet = await databases.updateDocument(DB_ID, SNIPPETS_ID, id, data);
        if (data.title) {
            await this.logActivity({
                type: 'update',
                entityType: 'Snippet',
                entityName: data.title
            });
        }
        return snippet;
    },
    async deleteSnippet(id: string) {
        await this.logActivity({
            type: 'delete',
            entityType: 'Snippet',
            entityName: 'Snippet'
        });
        return await databases.deleteDocument(DB_ID, SNIPPETS_ID, id);
    },

    // Projects
    async listProjects() {
        return await databases.listDocuments<Project & Models.Document>(DB_ID, PROJECTS_ID);
    },
    async getProject(id: string) {
        return await databases.getDocument<Project & Models.Document>(DB_ID, PROJECTS_ID, id);
    },
    async createProject(data: Omit<Project, '$id' | '$createdAt'>) {
        const project = await databases.createDocument(DB_ID, PROJECTS_ID, ID.unique(), data);
        await this.logActivity({
            type: 'create',
            entityType: 'Project',
            entityName: data.name
        });
        return project;
    },
    async updateProject(id: string, data: Partial<Project>) {
        const project = await databases.updateDocument(DB_ID, PROJECTS_ID, id, data);
        if (data.name) {
            await this.logActivity({
                type: 'update',
                entityType: 'Project',
                entityName: data.name
            });
        }
        return project;
    },
    async deleteProject(id: string) {
        // Need name for logging, but we delete it. Let's try to get it first if possible, 
        // or just log that a project was deleted.
        await this.logActivity({
            type: 'delete',
            entityType: 'Project',
            entityName: 'Project'
        });
        return await databases.deleteDocument(DB_ID, PROJECTS_ID, id);
    },

    // Wiki Guides
    async listGuides() {
        return await databases.listDocuments<WikiGuide & Models.Document>(DB_ID, GUIDES_ID);
    },
    async getGuide(id: string) {
        const guide = await databases.getDocument<WikiGuide & Models.Document>(DB_ID, GUIDES_ID, id);
        const installations = await databases.listDocuments<InstallationTarget & Models.Document>(
            DB_ID, 
            INSTALLATIONS_ID,
            [Query.equal('guideId', id)]
        );
        return { ...guide, installations: installations.documents };
    },
    async createGuide(data: Omit<WikiGuide, '$id' | '$createdAt'>) {
        const guide = await databases.createDocument(DB_ID, GUIDES_ID, ID.unique(), data);
        await this.logActivity({
            type: 'create',
            entityType: 'Wiki',
            entityName: data.title
        });
        return guide;
    },
    async updateGuide(id: string, data: Partial<WikiGuide>) {
        const guide = await databases.updateDocument(DB_ID, GUIDES_ID, id, data);
        if (data.title) {
            await this.logActivity({
                type: 'update',
                entityType: 'Wiki',
                entityName: data.title
            });
        }
        return guide;
    },
    async deleteGuide(id: string) {
        await this.logActivity({
            type: 'delete',
            entityType: 'Wiki',
            entityName: 'Guide'
        });
        return await databases.deleteDocument(DB_ID, GUIDES_ID, id);
    },

    // Installations
    async createInstallation(data: Omit<InstallationTarget, '$id' | '$createdAt'>) {
        const inst = await databases.createDocument(DB_ID, INSTALLATIONS_ID, ID.unique(), data);
        await this.logActivity({
            type: 'create',
            entityType: 'Installation',
            entityName: data.target
        });
        return inst;
    },
    async updateInstallation(id: string, data: Partial<InstallationTarget>) {
        const inst = await databases.updateDocument(DB_ID, INSTALLATIONS_ID, id, data);
        if (data.target) {
            await this.logActivity({
                type: 'update',
                entityType: 'Installation',
                entityName: data.target
            });
        }
        return inst;
    },
    async deleteInstallation(id: string) {
        await this.logActivity({
            type: 'delete',
            entityType: 'Installation',
            entityName: 'Installation'
        });
        return await databases.deleteDocument(DB_ID, INSTALLATIONS_ID, id);
    },
    
    // Tasks
    async listTasks(projectId: string) {
        return await databases.listDocuments<Task & Models.Document>(DB_ID, TASKS_ID, [
            Query.equal('projectId', projectId),
            Query.orderAsc('order')
        ]);
    },
    async createEmptyTask(projectId: string, title: string, order: number = 0) {
        const task = await databases.createDocument(DB_ID, TASKS_ID, ID.unique(), {
            projectId,
            title,
            completed: false,
            order,
            kanbanStatus: 'todo'
        });
        await this.logActivity({
            type: 'create',
            entityType: 'Task',
            entityName: title,
            projectId
        });
        return task;
    },
    async createTasks(projectId: string, titles: string[]) {
        const tasks = await Promise.all(titles.map((title, index) => 
            databases.createDocument(DB_ID, TASKS_ID, ID.unique(), {
                projectId,
                title,
                completed: false,
                order: index,
                kanbanStatus: 'todo'
            })
        ));
        await this.logActivity({
            type: 'create',
            entityType: 'Task',
            entityName: `${titles.length} tasks`,
            projectId
        });
        return tasks;
    },
    async updateTask(id: string, data: Partial<Task>) {
        const { workDuration, ...updateData } = data as any;
        const task = await databases.updateDocument(DB_ID, TASKS_ID, id, updateData);
        if (data.completed === true) {
            await this.logActivity({
                type: 'complete',
                entityType: 'Task',
                entityName: (task as any).title || 'Task',
                projectId: (task as any).projectId
            });
        } else if (data.isTimerRunning === false && workDuration) {
            await this.logActivity({
                type: 'work',
                entityType: 'Task',
                entityName: (task as any).title || 'Task',
                projectId: (task as any).projectId,
                metadata: workDuration
            });
        } else if (data.title) {
            await this.logActivity({
                type: 'update',
                entityType: 'Task',
                entityName: data.title,
                projectId: (task as any).projectId
            });
        }
        return task;
    },
    async deleteTask(id: string) {
        await this.logActivity({
            type: 'delete',
            entityType: 'Task',
            entityName: 'Task'
        });
        return await databases.deleteDocument(DB_ID, TASKS_ID, id);
    }
};
