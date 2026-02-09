import { InstallationTarget, Project, Task, WikiGuide } from '@/types';
import { ID, Query, type Models } from 'appwrite';
import { databases } from './appwrite';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;
const TASKS_ID = process.env.NEXT_PUBLIC_APPWRITE_TASKS_COLLECTION_ID!;
const GUIDES_ID = process.env.NEXT_PUBLIC_APPWRITE_GUIDES_COLLECTION_ID!;
const INSTALLATIONS_ID = process.env.NEXT_PUBLIC_APPWRITE_INSTALLATIONS_COLLECTION_ID!;

export const db = {
    // Projects
    async listProjects() {
        return await databases.listDocuments<Project & Models.Document>(DB_ID, PROJECTS_ID);
    },
    async createProject(data: Omit<Project, '$id' | '$createdAt'>) {
        return await databases.createDocument(DB_ID, PROJECTS_ID, ID.unique(), data);
    },
    async updateProject(id: string, data: Partial<Project>) {
        return await databases.updateDocument(DB_ID, PROJECTS_ID, id, data);
    },
    async deleteProject(id: string) {
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
        return await databases.createDocument(DB_ID, GUIDES_ID, ID.unique(), data);
    },
    async updateGuide(id: string, data: Partial<WikiGuide>) {
        return await databases.updateDocument(DB_ID, GUIDES_ID, id, data);
    },
    async deleteGuide(id: string) {
        return await databases.deleteDocument(DB_ID, GUIDES_ID, id);
    },

    // Installations
    async createInstallation(data: Omit<InstallationTarget, '$id' | '$createdAt'>) {
        return await databases.createDocument(DB_ID, INSTALLATIONS_ID, ID.unique(), data);
    },
    async updateInstallation(id: string, data: Partial<InstallationTarget>) {
        return await databases.updateDocument(DB_ID, INSTALLATIONS_ID, id, data);
    },
    async deleteInstallation(id: string) {
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
        return await databases.createDocument(DB_ID, TASKS_ID, ID.unique(), {
            projectId,
            title,
            completed: false,
            order
        });
    },
    async createTasks(projectId: string, titles: string[]) {
        return Promise.all(titles.map((title, index) => 
            databases.createDocument(DB_ID, TASKS_ID, ID.unique(), {
                projectId,
                title,
                completed: false,
                order: index
            })
        ));
    },
    async updateTask(id: string, data: Partial<Task>) {
        return await databases.updateDocument(DB_ID, TASKS_ID, id, data);
    },
    async deleteTask(id: string) {
        return await databases.deleteDocument(DB_ID, TASKS_ID, id);
    }
};
