export interface Project {
    $id: string;
    name: string;
    description: string;
    status: 'todo' | 'in-progress' | 'completed';
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
