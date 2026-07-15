export interface Project {
    id: string;
    workspaceId?: string;
    userId?: string;
    name: string;
    description: string;
    status: 'todo' | 'in-progress' | 'completed' | 'archived';
    taskKeyPrefix: string;
    taskKeyPrefixLocked?: boolean;
    daysPerWeek?: number;
    allocatedDays?: number;
    clientId?: string;
    hourBudget?: number;
    isEncrypted?: boolean;
    role?: 'owner' | 'admin' | 'editor' | 'viewer';
    createdAt: string;
    updatedAt: string;
}

export interface ProjectTaskStatus {
    id: string;
    projectId: string;
    key: string;
    label: string;
    colorToken: 'default' | 'accent' | 'warning' | 'danger' | 'success';
    position: number;
    isCompletedState: boolean;
    isBuiltin: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ProjectMilestone {
    id: string;
    projectId: string;
    createdBy: string;
    title: string;
    description: string;
    status: 'open' | 'completed';
    dueDate?: string;
    position: number;
    createdAt: string;
    updatedAt: string;
}

export interface ProjectMember {
    id: string;
    projectId: string;
    userId: string;
    email: string;
    name: string;
    role: 'owner' | 'admin' | 'editor' | 'viewer';
    joinedAt: string;
}

export interface Customer {
    id: string;
    workspaceId: string;
    name: string;
    contactName?: string;
    contactEmail?: string;
    notes: string;
    archivedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ProjectMemberAllocation {
    projectId: string;
    userId: string;
    daysPerWeek: number;
}

export interface TeamInvitation {
    id: string;
    projectId: string;
    email: string;
    role: 'admin' | 'editor' | 'viewer';
    workspaceRole?: 'admin' | 'member' | 'guest';
    token?: string;
    status: 'pending' | 'accepted' | 'cancelled' | 'expired';
    invitedUserId?: string;
    invitedById: string;
    expiresAt: string;
    acceptedAt?: string;
    createdAt: string;
}

export interface UserLookup {
    userId: string;
    email: string;
    name: string;
    publicKey?: string;
    hasVault: boolean;
}

export interface ProjectFile {
    id: string;
    projectId: string;
    taskId?: string;
    uploaderId: string;
    encryptedName: string;
    contentType: string;
    iv?: string;
    sizeBytes: number;
    storagePath: string;
    isEncrypted: boolean;
    createdAt: string;
    uploaderName?: string;
}

export interface Task {
    id: string;
    projectId: string;
    taskNumber?: number;
    taskKey: string;
    title: string;
    description: string;
    completed: boolean;
    createdAt: string;
    parentId?: string;
    timeSpent?: number; // In seconds
    isTimerRunning?: boolean;
    timerStartedAt?: string;
    order?: number;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    timeEntries?: string[]; // Array of JSON stringified entries { date: string, seconds: number }
    kanbanStatus?: string;
    tags?: string[];
    deadline?: string | null; // ISO date string
    isEncrypted?: boolean;
    dependencies?: string[]; // Array of task IDs this task depends on
    recurrence?: string | null; // JSON: { type: 'daily'|'weekly'|'monthly', interval: number, endDate?: string }
}

export interface TaskAssignee {
    taskId: string;
    userId: string;
    name: string;
    email: string;
    assignedBy: string;
    createdAt: string;
}

export interface TaskMessage {
    id: string;
    taskId: string;
    userId: string;
    userName: string;
    userEmail: string;
    body: string;
    mentionedUserIds: string[];
    isEncrypted: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface PresenceSession {
    userId: string;
    name: string;
    email: string;
    lastSeen: string;
}

export interface CollaborationDocument {
    id: string;
    projectId: string;
    taskId: string;
    isEncrypted: boolean;
    createdById: string;
    createdAt: string;
    updatedAt: string;
}

export interface CollaborationUpdate {
    documentId: string;
    sequence: number;
    clientUpdateId: string;
    authorId: string;
    payload: string;
    iv?: string;
    createdAt: string;
}

export interface CollaborationSyncResponse {
    document?: CollaborationDocument;
    updates: CollaborationUpdate[];
}

export interface WikiGuide {
    id: string;
    workspaceId?: string;
    projectId?: string;
    parentId?: string;
    title: string;
    description: string;
    isEncrypted?: boolean;
    installations?: InstallationTarget[];
    createdAt: string;
}

export interface InstallationTarget {
    id: string;
    guideId: string;
    target: string; // e.g., 'Azure', 'Linux'
    gitRepo?: string;
    documentation?: string;
    notes?: string;
    tasks?: string[];
    isEncrypted?: boolean;
    iv?: string; // IV for AES-GCM if whole document encrypted
    createdAt: string;
}

export interface EncryptedData {
    ciphertext: string;
    iv: string;
}

export interface UserKeys {
    id: string;
    userId: string;
    email?: string;
    publicKey: string;
    encryptedPrivateKey: string;
    salt: string;
    iv: string;
    kdfIterations: number;
}

export interface AccessControl {
    id: string;
    resourceId: string;
    userId: string;
    encryptedKey: string; // The AES document key encrypted with owner's public key
    resourceType: string;
}

export interface ActivityLog {
    id: string;
    type: 'create' | 'update' | 'delete' | 'complete' | 'work';
    entityType: 'Project' | 'Task' | 'Wiki' | 'Installation' | 'Snippet' | 'File';
    entityName: string;
    userId: string;
    userName?: string;
    projectId?: string;
    taskId?: string;
    metadata?: string; // For things like "Worked 2h 30m"
    createdAt: string;
}

export interface Notification {
    id: string;
    recipientUserId: string;
    actorUserId: string;
    actorName: string;
    type: 'mention' | 'task_assigned' | 'deadline_24h' | 'deadline_4h' | 'deadline_due';
    projectId: string;
    projectName: string;
    taskId: string;
    taskKey: string;
    taskTitle: string;
    commentId?: string;
    deadlineAt?: string;
    readAt?: string;
    createdAt: string;
}

export interface SnippetBlock {
    id: string;
    type: 'code' | 'markdown';
    content: string;
    language?: string;
}

export interface Snippet {
    id: string;
    workspaceId?: string;
    projectId?: string;
    title: string;
    content: string;
    blocks?: string; // JSON stringified SnippetBlock[]
    language: string;
    tags?: string[];
    description?: string;
    isEncrypted?: boolean;
    createdAt: string;
    collection?: string; // Folder/collection grouping
}

export interface ResourceVersion {
    id: string;
    resourceId: string;
    resourceType: 'Wiki' | 'Snippet' | 'Installation';
    content: string; // Full snapshot
    title?: string;
    metadata?: string;
    isEncrypted?: boolean;
    createdAt: string;
}
