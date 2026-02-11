export interface Project {
    $id: string;
    name: string;
    description: string;
    status: 'todo' | 'in-progress' | 'completed';
    daysPerWeek?: number;
    allocatedDays?: number;
    isEncrypted?: boolean;
    $createdAt: string;
}

export interface Task {
    $id: string;
    projectId: string;
    title: string;
    completed: boolean;
    $createdAt: string;
    parentId?: string;
    timeSpent?: number; // In seconds
    isTimerRunning?: boolean;
    timerStartedAt?: string;
    order?: number;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    timeEntries?: string[]; // Array of JSON stringified entries { date: string, seconds: number }
    kanbanStatus?: 'todo' | 'in-progress' | 'review' | 'waiting' | 'done';
    notes?: string[]; // Array of JSON stringified entries { date: string, text: string, type: 'note' | 'email' | 'call' }
    isEncrypted?: boolean;
}

export interface WikiGuide {
    $id: string;
    title: string;
    description: string;
    isEncrypted?: boolean;
    $createdAt: string;
}

export interface InstallationTarget {
    $id: string;
    guideId: string;
    target: string; // e.g., 'Azure', 'Linux'
    gitRepo?: string;
    documentation?: string;
    notes?: string;
    tasks?: string[];
    isEncrypted?: boolean;
    iv?: string; // IV for AES-GCM if whole document encrypted
    $createdAt: string;
}

export interface EncryptedData {
    ciphertext: string;
    iv: string;
}

export interface UserKeys {
    $id: string;
    userId: string;
    email?: string;
    publicKey: string;
    encryptedPrivateKey: string;
    salt: string;
    iv: string;
}

export interface AccessControl {
    $id: string;
    resourceId: string;
    userId: string;
    encryptedKey: string; // The AES document key encrypted with user's RSA public key
    resourceType: string;
}

export interface ActivityLog {
    $id: string;
    type: 'create' | 'update' | 'delete' | 'complete' | 'work';
    entityType: 'Project' | 'Task' | 'Wiki' | 'Installation' | 'Snippet';
    entityName: string;
    projectId?: string;
    metadata?: string; // For things like "Worked 2h 30m"
    $createdAt: string;
}

export interface SnippetBlock {
    id: string;
    type: 'code' | 'markdown';
    content: string;
    language?: string;
}

export interface Snippet {
    $id: string;
    title: string;
    content: string;
    blocks?: string; // JSON stringified SnippetBlock[]
    language: string;
    tags?: string[];
    description?: string;
    isEncrypted?: boolean;
    $createdAt: string;
}

export interface ResourceVersion {
    $id: string;
    resourceId: string;
    resourceType: 'Wiki' | 'Snippet' | 'Installation';
    content: string; // Full snapshot
    title?: string;
    metadata?: string;
    isEncrypted?: boolean;
    $createdAt: string;
}
