export interface Project {
    $id: string;
    name: string;
    description: string;
    status: 'todo' | 'in-progress' | 'completed';
    daysPerWeek?: number;
    allocatedDays?: number;
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
    timeEntries?: string[]; // Array of JSON stringified entries { date: string, seconds: number }
    kanbanStatus?: 'todo' | 'in-progress' | 'review' | 'done';
}

export interface WikiGuide {
    $id: string;
    title: string;
    description: string;
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
    $createdAt: string;
}

export interface ActivityLog {
    $id: string;
    type: 'create' | 'update' | 'delete' | 'complete';
    entityType: 'Project' | 'Task' | 'Wiki' | 'Installation' | 'Snippet';
    entityName: string;
    projectId?: string;
    $createdAt: string;
}

export interface Snippet {
    $id: string;
    title: string;
    content: string;
    language: string;
    tags?: string[];
    description?: string;
    $createdAt: string;
}
