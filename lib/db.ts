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
import { ID, Permission, Query, Role, type Models } from 'appwrite';
import { databases } from './appwrite';
import { getEnv } from './env-config';

export const DB_ID = getEnv('NEXT_PUBLIC_APPWRITE_DATABASE_ID');
export const PROJECTS_ID = getEnv('NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID');
export const TASKS_ID = getEnv('NEXT_PUBLIC_APPWRITE_TASKS_COLLECTION_ID');
export const GUIDES_ID = getEnv('NEXT_PUBLIC_APPWRITE_GUIDES_COLLECTION_ID');
export const INSTALLATIONS_ID = getEnv('NEXT_PUBLIC_APPWRITE_INSTALLATIONS_COLLECTION_ID');
export const ACTIVITY_ID = getEnv('NEXT_PUBLIC_APPWRITE_ACTIVITY_COLLECTION_ID');
export const SNIPPETS_ID = getEnv('NEXT_PUBLIC_APPWRITE_SNIPPETS_COLLECTION_ID');
export const USER_KEYS_ID = getEnv('NEXT_PUBLIC_APPWRITE_USER_KEYS_COLLECTION_ID');
export const ACCESS_CONTROL_ID = getEnv('NEXT_PUBLIC_APPWRITE_ACCESS_CONTROL_COLLECTION_ID');
export const VERSIONS_ID = getEnv('NEXT_PUBLIC_APPWRITE_VERSIONS_COLLECTION_ID');

const getOwnerPermissions = (userId: string) => {
    return [
        Permission.read(Role.user(userId)),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
    ];
};

/**
 * Sanitizes a document object before sending to Appwrite.
 * Ensures only fields present in the schema are sent, and removes any
 * legacy or read-only attributes ($id, $createdAt, etc.) that cause
 * "Unknown attribute" errors.
 */
const sanitizeData = <T extends Record<string, unknown>>(data: Record<string, unknown>, allowedKeys: string[]): T => {
    const sanitized: Record<string, unknown> = {};
    Object.keys(data).forEach(key => {
        if (allowedKeys.includes(key)) {
            sanitized[key] = data[key];
        }
    });
    return sanitized as T;
};

const SCHEMAS = {
    Task: [
        'projectId', 'title', 'completed', 'parentId', 'timeSpent', 
        'isTimerRunning', 'timerStartedAt', 'timeEntries', 'order', 
        'priority', 'kanbanStatus', 'deadline', 'notes', 'isEncrypted'
    ],
    Project: [
        'name', 'description', 'status', 'daysPerWeek', 'allocatedDays', 'isEncrypted'
    ],
    Snippet: [
        'title', 'content', 'blocks', 'language', 'tags', 'description', 'isEncrypted'
    ],
    WikiGuide: [
        'title', 'description', 'isEncrypted'
    ],
    Installation: [
        'guideId', 'target', 'gitRepo', 'documentation', 'notes', 'tasks', 'isEncrypted', 'iv'
    ],
    UserKeys: [
        'userId', 'email', 'publicKey', 'encryptedPrivateKey', 'salt', 'iv'
    ],
    AccessControl: [
        'resourceId', 'userId', 'encryptedKey', 'resourceType'
    ],
    Version: [
        'resourceId', 'resourceType', 'content', 'title', 'metadata', 'isEncrypted'
    ],
    Activity: [
        'type', 'entityType', 'entityName', 'projectId', 'metadata'
    ]
};

export const db = {
    // Versions
    async listVersions(resourceId: string) {
        return await databases.listDocuments<ResourceVersion & Models.Document>(DB_ID, VERSIONS_ID, [
            Query.equal('resourceId', resourceId),
            Query.orderDesc('$createdAt')
        ]);
    },
    async createVersion(data: Omit<ResourceVersion, '$id' | '$createdAt'>, userId?: string) {
        const permissions = userId ? getOwnerPermissions(userId) : [];
        const finalData = sanitizeData(data as Record<string, unknown>, SCHEMAS.Version);
        return await databases.createDocument(DB_ID, VERSIONS_ID, ID.unique(), finalData, permissions);
    },

    // Activity
    async listActivity() {
        return await databases.listDocuments<ActivityLog & Models.Document>(DB_ID, ACTIVITY_ID, [
            Query.orderDesc('$createdAt'),
            Query.limit(10)
        ]);
    },
    async logActivity(data: Omit<ActivityLog, '$id' | '$createdAt'>, userId?: string) {
        try {
            const permissions = userId ? getOwnerPermissions(userId) : [];
            const finalData = sanitizeData(data as Record<string, unknown>, SCHEMAS.Activity);
            return await databases.createDocument(DB_ID, ACTIVITY_ID, ID.unique(), finalData, permissions);
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
    async createSnippet(data: Omit<Snippet, '$id' | '$createdAt'>, userId?: string) {
        const permissions = userId ? getOwnerPermissions(userId) : [];
        const finalData = sanitizeData(data as Record<string, unknown>, SCHEMAS.Snippet);
        const snippet = await databases.createDocument<Snippet & Models.Document>(DB_ID, SNIPPETS_ID, ID.unique(), finalData as unknown as Snippet, permissions);
        await this.logActivity({
            type: 'create',
            entityType: 'Snippet',
            entityName: data.title,
            projectId: snippet.$id // Treat Snippet ID as a segment for access
        }, userId);
        return snippet;
    },
    async updateSnippet(id: string, data: Partial<Snippet>) {
        const finalData = sanitizeData(data as Record<string, unknown>, SCHEMAS.Snippet);
        const snippet = await databases.updateDocument<Snippet & Models.Document>(DB_ID, SNIPPETS_ID, id, finalData);
        if (data.title || data.isEncrypted) {
            await this.logActivity({
                type: 'update',
                entityType: 'Snippet',
                entityName: snippet.title || 'Snippet',
                projectId: snippet.$id
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
    async createProject(data: Omit<Project, '$id' | '$createdAt'>, userId?: string) {
        const permissions = userId ? getOwnerPermissions(userId) : [];
        const finalData = sanitizeData(data as Record<string, unknown>, SCHEMAS.Project);
        const project = await databases.createDocument<Project & Models.Document>(DB_ID, PROJECTS_ID, ID.unique(), finalData as unknown as Project, permissions);
        await this.logActivity({
            type: 'create',
            entityType: 'Project',
            entityName: project.name,
            projectId: project.$id
        }, userId);
        return project;
    },
    async updateProject(id: string, data: Partial<Project>) {
        const finalData = sanitizeData(data as Record<string, unknown>, SCHEMAS.Project);
        const project = await databases.updateDocument<Project & Models.Document>(DB_ID, PROJECTS_ID, id, finalData);
        
        // Log activity
        if (data.name || data.isEncrypted || data.status) {
            await this.logActivity({
                type: 'update',
                entityType: 'Project',
                entityName: project.name || 'Project',
                projectId: project.$id
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
    async createGuide(data: Omit<WikiGuide, '$id' | '$createdAt'>, userId?: string) {
        const permissions = userId ? getOwnerPermissions(userId) : [];
        const finalData = sanitizeData(data as Record<string, unknown>, SCHEMAS.WikiGuide);
        const guide = await databases.createDocument<WikiGuide & Models.Document>(DB_ID, GUIDES_ID, ID.unique(), finalData as unknown as WikiGuide, permissions);
        await this.logActivity({
            type: 'create',
            entityType: 'Wiki',
            entityName: guide.title,
            projectId: guide.$id
        }, userId);
        return guide;
    },
    async updateGuide(id: string, data: Partial<WikiGuide>) {
        const finalData = sanitizeData(data as Record<string, unknown>, SCHEMAS.WikiGuide);
        const guide = await databases.updateDocument<WikiGuide & Models.Document>(DB_ID, GUIDES_ID, id, finalData);
        if (data.title || data.isEncrypted) {
            await this.logActivity({
                type: 'update',
                entityType: 'Wiki',
                entityName: guide.title || 'Guide',
                projectId: guide.$id
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
    async createInstallation(data: Omit<InstallationTarget, '$id' | '$createdAt'>, userId?: string) {
        const permissions = userId ? getOwnerPermissions(userId) : [];
        const finalData = sanitizeData(data as Record<string, unknown>, SCHEMAS.Installation);
        const inst = await databases.createDocument<InstallationTarget & Models.Document>(DB_ID, INSTALLATIONS_ID, ID.unique(), finalData as unknown as InstallationTarget, permissions);
        await this.logActivity({
            type: 'create',
            entityType: 'Installation',
            entityName: data.target
        }, userId);
        return inst;
    },
    async updateInstallation(id: string, data: Partial<InstallationTarget>) {
        const finalData = sanitizeData(data as Record<string, unknown>, SCHEMAS.Installation);
        const inst = await databases.updateDocument<InstallationTarget & Models.Document>(DB_ID, INSTALLATIONS_ID, id, finalData);
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
    async listAllTasks(limit = 100) {
        return await databases.listDocuments<Task & Models.Document>(DB_ID, TASKS_ID, [
            Query.orderDesc('$createdAt'),
            Query.limit(limit)
        ]);
    },
    async listTasks(projectId: string) {
        return await databases.listDocuments<Task & Models.Document>(DB_ID, TASKS_ID, [
            Query.equal('projectId', projectId),
            Query.orderAsc('order')
        ]);
    },
    async createEmptyTask(projectId: string, title: string, order: number = 0, isEncrypted: boolean = false, parentId?: string, kanbanStatus: Task['kanbanStatus'] = 'todo', userId?: string) {
        const permissions = userId ? getOwnerPermissions(userId) : [];
        
        const taskData = sanitizeData({
            projectId,
            title,
            completed: false,
            order,
            priority: 'medium',
            kanbanStatus,
            isEncrypted,
            parentId
        }, SCHEMAS.Task);
        
        const task = await databases.createDocument<Task & Models.Document>(DB_ID, TASKS_ID, ID.unique(), taskData as unknown as Task, permissions);
        await this.logActivity({
            type: 'create',
            entityType: 'Task',
            entityName: task.title,
            projectId
        }, userId);
        return task;
    },
    async createTasks(projectId: string, titles: string[], isEncrypted: boolean = false, userId?: string) {
        // Get existing tasks to determine the starting order
        const existing = await this.listTasks(projectId);
        const startOrder = existing.documents.length;

        const tasksCount = titles.length;
        const permissions = userId ? getOwnerPermissions(userId) : [];
        const tasks = await Promise.all(titles.map((title, index) => {
            const taskData = sanitizeData({
                projectId,
                title,
                completed: false,
                order: startOrder + index,
                priority: 'medium',
                kanbanStatus: 'todo',
                isEncrypted
            }, SCHEMAS.Task);
            return databases.createDocument<Task & Models.Document>(DB_ID, TASKS_ID, ID.unique(), taskData as unknown as Task, permissions);
        }));
        await this.logActivity({
            type: 'create',
            entityType: 'Task',
            entityName: isEncrypted ? JSON.stringify({ ciphertext: "Batch Creation", iv: "N/A" }) : `${tasksCount} tasks`,
            projectId
        }, userId);
        return tasks;
    },
    async updateTask(id: string, data: Partial<Task> & { workDuration?: string }) {
        const { workDuration, ...rest } = data;
        const updateData = sanitizeData(rest as Record<string, unknown>, SCHEMAS.Task);
        
        console.log(`[DB] Updating Task ${id} with:`, updateData);

        const task = await databases.updateDocument<Task & Models.Document>(DB_ID, TASKS_ID, id, updateData);
        if (data.completed === true) {
            await this.logActivity({
                type: 'complete',
                entityType: 'Task',
                entityName: task.title || 'Task',
                projectId: task.projectId
            });
        } else if (data.isTimerRunning === false && workDuration) {
            await this.logActivity({
                type: 'work',
                entityType: 'Task',
                entityName: task.title || 'Task',
                projectId: task.projectId,
                metadata: workDuration
            });
        } else if (data.notes && data.notes.length > (task.notes?.length || 0)) {
            const lastNote = JSON.parse(data.notes[data.notes.length - 1]);
            await this.logActivity({
                type: 'update',
                entityType: 'Task',
                entityName: task.title,
                projectId: task.projectId,
                metadata: `Logged ${lastNote.type}: ${lastNote.text.slice(0, 30)}...`
            });
        } else if (data.title) {
            await this.logActivity({
                type: 'update',
                entityType: 'Task',
                entityName: task.title,
                projectId: task.projectId
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
    },

    // Encryption Keys
    async getUserKeys(userId: string) {
        if (!USER_KEYS_ID) return null;
        const res = await databases.listDocuments<UserKeys & Models.Document>(DB_ID, USER_KEYS_ID, [
            Query.equal('userId', userId)
        ]);
        return res.documents[0];
    },
    async createUserKeys(data: Omit<UserKeys, '$id'>) {
        if (!USER_KEYS_ID) throw new Error('User Keys Collection ID is not configured');
        const sanitized = sanitizeData(data as Record<string, unknown>, SCHEMAS.UserKeys);
        const finalData = {
            ...sanitized,
            email: (sanitized as unknown as UserKeys).email?.toLowerCase()
        };
        const permissions = [
            Permission.read(Role.user(data.userId)),
            Permission.update(Role.user(data.userId)),
            Permission.delete(Role.user(data.userId)),
        ];
        // Permissions are handled at the document level
        return await databases.createDocument(DB_ID, USER_KEYS_ID, ID.unique(), finalData, permissions);
    },
    async updateUserKeys(id: string, data: Partial<UserKeys>) {
        if (!USER_KEYS_ID) throw new Error('User Keys Collection ID is not configured');
        const sanitized = sanitizeData(data as Record<string, unknown>, SCHEMAS.UserKeys);
        const finalData = {
            ...sanitized,
        };
        if (finalData.email) {
            finalData.email = (finalData.email as string).toLowerCase();
        }
        
        // Permissions are handled at the collection level or inherited from creator
        return await databases.updateDocument(DB_ID, USER_KEYS_ID, id, finalData);
    },
    async getAccessKey(resourceId: string, userId: string) {
        if (!ACCESS_CONTROL_ID) return null;
        const res = await databases.listDocuments<AccessControl & Models.Document>(DB_ID, ACCESS_CONTROL_ID, [
            Query.equal('resourceId', resourceId),
            Query.equal('userId', userId)
        ]);
        return res.documents[0];
    },
    async grantAccess(data: Omit<AccessControl, '$id'>) {
        if (!ACCESS_CONTROL_ID) throw new Error('Access Control Collection ID is not configured');
        
        // 1. Check if access already exists
        const existing = await this.getAccessKey(data.resourceId, data.userId);
        const sanitized = sanitizeData(data as Record<string, unknown>, SCHEMAS.AccessControl);
        if (existing) {
            return await databases.updateDocument(DB_ID, ACCESS_CONTROL_ID, existing.$id, {
                encryptedKey: sanitized.encryptedKey
            });
        } else {
            const permissions = [
                Permission.read(Role.user(data.userId)),
                Permission.update(Role.user(data.userId)),
                Permission.delete(Role.user(data.userId)),
            ];
            return await databases.createDocument(DB_ID, ACCESS_CONTROL_ID, ID.unique(), sanitized, permissions);
        }
    }
};
