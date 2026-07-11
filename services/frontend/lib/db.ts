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
    Notification,
    InstallationTarget,
    PresenceSession,
    Project,
    ProjectMilestone,
    ProjectFile,
    ProjectMember,
    ProjectTaskStatus,
    ResourceVersion,
    Snippet,
    Task,
    TaskAssignee,
    TaskMessage,
    TeamInvitation,
    UserLookup,
    UserKeys,
    WikiGuide
} from '@/services/frontend/types';
import { api } from './api';

export const db = {
    async listWorkspaces() {
        return await api.listWorkspaces();
    },
    async createWorkspace(name: string) {
        return await api.createWorkspace(name);
    },
    async updateWorkspace(id: string, data: { name?: string; autoAddMembersToProjects?: boolean }) {
        return await api.updateWorkspace(id, data);
    },
    async listWorkspaceMembers(workspaceId: string) {
        return await api.listWorkspaceMembers(workspaceId);
    },
    async addWorkspaceMember(workspaceId: string, data: { userId: string; role: string }) {
        return await api.addWorkspaceMember(workspaceId, data);
    },
    async updateWorkspaceMember(workspaceId: string, userId: string, role: string) {
        return await api.updateWorkspaceMember(workspaceId, userId, role);
    },
    async removeWorkspaceMember(workspaceId: string, userId: string) {
        return await api.removeWorkspaceMember(workspaceId, userId);
    },
    async listWorkspaceInvitations(workspaceId: string) {
        return await api.listWorkspaceInvitations(workspaceId);
    },
    async createWorkspaceInvitation(workspaceId: string, data: { email: string; role: string }) {
        return await api.createWorkspaceInvitation(workspaceId, data);
    },
    async cancelWorkspaceInvitation(workspaceId: string, invitationId: string) {
        return await api.cancelWorkspaceInvitation(workspaceId, invitationId);
    },
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
    async listNotifications() {
        return await api.listNotifications<Notification>();
    },
    async getUnreadNotificationCount() {
        return await api.getUnreadNotificationCount();
    },
    async markNotificationRead(id: string) {
        return await api.markNotificationRead<Notification>(id);
    },
    async deleteNotification(id: string) {
        return await api.deleteNotification(id);
    },

    // Snippets
    async listSnippets(workspaceId?: string) {
        return await api.listSnippets<Snippet>(workspaceId);
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
    async listProjects(workspaceId?: string) {
        return await api.listProjects<Project>(workspaceId);
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
    async listGuides(workspaceId?: string) {
        return await api.listGuides<WikiGuide>(workspaceId);
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
    async getTask(id: string) {
        return await api.getTask<Task>(id);
    },
    async getTaskByKey(projectId: string, taskKey: string) {
        return await api.getTaskByKey<Task>(projectId, taskKey);
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
    async reorderTasks(projectId: string, updates: Array<{ id: string; kanbanStatus?: string; completed?: boolean; order?: number }>) {
        return await api.reorderTasks<Task>(projectId, updates as unknown as Record<string, unknown>[]);
    },
    async deleteTask(id: string) {
        return await api.deleteTask(id);
    },
    async listProjectTaskStatuses(projectId: string) {
        return await api.listProjectTaskStatuses<ProjectTaskStatus>(projectId);
    },
    async createProjectTaskStatus(projectId: string, data: Pick<ProjectTaskStatus, 'label' | 'colorToken' | 'isCompletedState'>) {
        return await api.createProjectTaskStatus<ProjectTaskStatus>(projectId, data as Record<string, unknown>);
    },
    async updateProjectTaskStatus(projectId: string, statusId: string, data: Partial<Pick<ProjectTaskStatus, 'label' | 'colorToken' | 'isCompletedState'>>) {
        return await api.updateProjectTaskStatus<ProjectTaskStatus>(projectId, statusId, data as Record<string, unknown>);
    },
    async deleteProjectTaskStatus(projectId: string, statusId: string, replacementStatusId: string) {
        return await api.deleteProjectTaskStatus(projectId, statusId, replacementStatusId);
    },
    async reorderProjectTaskStatuses(projectId: string, statusIds: string[]) {
        return await api.reorderProjectTaskStatuses<ProjectTaskStatus>(projectId, statusIds);
    },
    async listProjectMilestones(projectId: string) {
        return await api.listProjectMilestones<ProjectMilestone>(projectId);
    },
    async createProjectMilestone(projectId: string, data: Partial<ProjectMilestone>) {
        return await api.createProjectMilestone<ProjectMilestone>(projectId, data as Record<string, unknown>);
    },
    async updateMilestone(id: string, data: Partial<ProjectMilestone>) {
        return await api.updateMilestone<ProjectMilestone>(id, data as Record<string, unknown>);
    },
    async deleteMilestone(id: string) {
        return await api.deleteMilestone(id);
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
    },

    // Collaboration
    async searchUsers(query: string) {
        return await api.searchUsers<UserLookup>(query);
    },
    async listProjectMembers(projectId: string) {
        return await api.listProjectMembers<ProjectMember>(projectId);
    },
    async addProjectMember(projectId: string, data: { userId: string; role: ProjectMember['role']; encryptedKey?: string }) {
        return await api.addProjectMember<ProjectMember>(projectId, data as Record<string, unknown>);
    },
    async updateProjectMember(projectId: string, userId: string, data: { role: ProjectMember['role'] }) {
        return await api.updateProjectMember<ProjectMember>(projectId, userId, data as Record<string, unknown>);
    },
    async removeProjectMember(projectId: string, userId: string) {
        return await api.removeProjectMember(projectId, userId);
    },
    async listProjectInvitations(projectId: string) {
        return await api.listProjectInvitations<TeamInvitation>(projectId);
    },
    async createProjectInvitation(projectId: string, data: { email: string; role: TeamInvitation['role']; encryptedKey?: string }) {
        return await api.createProjectInvitation<TeamInvitation>(projectId, data as Record<string, unknown>);
    },
    async cancelProjectInvitation(projectId: string, invitationId: string) {
        return await api.cancelProjectInvitation(projectId, invitationId);
    },
    async acceptInvitation(token: string) {
        return await api.acceptInvitation({ token });
    },
    async listProjectFiles(projectId: string) {
        return await api.listProjectFiles<ProjectFile>(projectId);
    },
    async uploadProjectFile(projectId: string, formData: FormData) {
        return await api.uploadProjectFile<ProjectFile>(projectId, formData);
    },
    async downloadProjectFile(fileId: string) {
        return await api.downloadProjectFile(fileId);
    },
    async deleteProjectFile(fileId: string) {
        return await api.deleteProjectFile(fileId);
    },
    async listTaskFiles(taskId: string) {
        return await api.listTaskFiles<ProjectFile>(taskId);
    },
    async uploadTaskFile(taskId: string, formData: FormData) {
        return await api.uploadTaskFile<ProjectFile>(taskId, formData);
    },
    async listTaskAssignees(taskId: string) {
        return await api.listTaskAssignees<TaskAssignee>(taskId);
    },
    async addTaskAssignee(taskId: string, userId: string) {
        return await api.addTaskAssignee<TaskAssignee>(taskId, { userId });
    },
    async removeTaskAssignee(taskId: string, userId: string) {
        return await api.removeTaskAssignee(taskId, userId);
    },
    async listTaskMessages(taskId: string) {
        return await api.listTaskMessages<TaskMessage>(taskId);
    },
    async createTaskMessage(taskId: string, data: { body: string; mentionedUserIds?: string[]; isEncrypted?: boolean }) {
        return await api.createTaskMessage<TaskMessage>(taskId, data as Record<string, unknown>);
    },
    async deleteTaskMessage(taskId: string, messageId: string) {
        return await api.deleteTaskMessage(taskId, messageId);
    },
    async listTaskActivity(taskId: string) {
        return await api.listTaskActivity<ActivityLog>(taskId);
    },
    async heartbeatProjectPresence(projectId: string) {
        return await api.heartbeatProjectPresence<PresenceSession>(projectId);
    },
    async heartbeatTaskPresence(taskId: string) {
        return await api.heartbeatTaskPresence<PresenceSession>(taskId);
    },
    async listProjectActivity(projectId: string) {
        return await api.listProjectActivity<ActivityLog>(projectId);
    },
};
