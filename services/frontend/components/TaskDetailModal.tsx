'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptBytes, decryptData, decryptDocumentKey, encryptBytes, encryptData } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import {
    getDefaultProjectTaskStatuses,
    getStatusTokenDotClass,
    getTaskStatusForTask,
} from '@/services/frontend/lib/task-statuses';
import { collectTaskTags, normalizeTaskTags } from '@/services/frontend/lib/task-filters';
import { wsClient, WSEvent } from '@/services/frontend/lib/ws';
import { ActivityLog, PresenceSession, Project, ProjectFile, ProjectMember, ProjectTaskStatus, Task, TaskAssignee, TaskMessage } from '@/services/frontend/types';
import {
    Avatar,
    Button,
    Calendar,
    Checkbox,
    ComboBox,
    DateField,
    DatePicker,
    Disclosure,
    Dropdown,
    EmptyState,
    Input,
    Label,
    ListBox,
    Modal,
    ScrollShadow,
    Tag,
    TagGroup,
    TextArea,
    TimeField,
    Tooltip,
    toast,
    useFilter
} from '@heroui/react';
import { getLocalTimeZone, parseAbsoluteToLocal, Time, toZoned } from "@internationalized/date";
import type { DateValue } from "@internationalized/date";
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import { saveAs } from 'file-saver';
import { AtSign, Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, FileText, FolderUp, Pencil as Edit, History, Link2, MessageCircle, Plus, Trash2 as Trash, UserPlus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

dayjs.extend(duration);
dayjs.extend(relativeTime);

interface TaskDetailModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    task: Task;
    projectId: string;
    onUpdate: () => void;
    statusOptions?: ProjectTaskStatus[];
}

export function TaskDetailModal({ isOpen, onOpenChange, task, projectId, onUpdate, statusOptions = [] }: TaskDetailModalProps) {
    const { user, privateKey } = useAuth();
    const { contains } = useFilter({ sensitivity: 'base' });
    const [documentKey, setDocumentKey] = useState<CryptoKey | null>(null);
    const [subtasks, setSubtasks] = useState<Task[]>([]);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const [tagSearchValue, setTagSearchValue] = useState('');
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState(task.title);
    const [editedDescription, setEditedDescription] = useState(task.description || '');
    const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
    const [editedSubtaskTitle, setEditedSubtaskTitle] = useState('');
    const [editedSubtaskDescriptions, setEditedSubtaskDescriptions] = useState<Record<string, string>>({});
    const [projectTasks, setProjectTasks] = useState<Task[]>([]);
    const [projectTags, setProjectTags] = useState<string[]>([]);
    const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
    const [projectRole, setProjectRole] = useState<Project['role'] | null>(null);
    const [parentTask, setParentTask] = useState<Task | null>(null);
    const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
    const [subtaskAssignees, setSubtaskAssignees] = useState<Record<string, TaskAssignee[]>>({});
    const [messages, setMessages] = useState<TaskMessage[]>([]);
    const [taskActivity, setTaskActivity] = useState<ActivityLog[]>([]);
    const [presence, setPresence] = useState<PresenceSession[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
    const [taskFiles, setTaskFiles] = useState<ProjectFile[]>([]);
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const [showDepPicker, setShowDepPicker] = useState(false);
    const [deadlineDraft, setDeadlineDraft] = useState<DateValue | null>(() => task.deadline ? parseAbsoluteToLocal(task.deadline) : null);
    const attachmentInputRef = useRef<HTMLInputElement | null>(null);
    const [recurrence, setRecurrence] = useState<{ type: 'daily' | 'weekly' | 'monthly'; interval: number } | null>(() => {
        try { return task.recurrence ? JSON.parse(task.recurrence) : null; } catch { return null; }
    });

    // State sync for editing title
    const [prevTaskTitle, setPrevTaskTitle] = useState(task.title);
    if (task.title !== prevTaskTitle) {
        setPrevTaskTitle(task.title);
        setEditedTitle(task.title);
        setIsEditingTitle(false);
    }

    const currentTaskDescription = task.description || '';
    const [prevTaskDescription, setPrevTaskDescription] = useState(currentTaskDescription);
    if (currentTaskDescription !== prevTaskDescription) {
        setPrevTaskDescription(currentTaskDescription);
        setEditedDescription(currentTaskDescription);
    }

    const currentTaskRecurrence = task.recurrence || '';
    const [prevTaskRecurrence, setPrevTaskRecurrence] = useState(currentTaskRecurrence);
    if (currentTaskRecurrence !== prevTaskRecurrence) {
        setPrevTaskRecurrence(currentTaskRecurrence);
        try {
            setRecurrence(task.recurrence ? JSON.parse(task.recurrence) : null);
        } catch {
            setRecurrence(null);
        }
    }

    const currentTaskDeadline = task.deadline || '';
    const [prevTaskDeadline, setPrevTaskDeadline] = useState(currentTaskDeadline);
    if (currentTaskDeadline !== prevTaskDeadline) {
        setPrevTaskDeadline(currentTaskDeadline);
        setDeadlineDraft(task.deadline ? parseAbsoluteToLocal(task.deadline) : null);
    }

    const handleAddDependency = async (depId: string) => {
        const current = task.dependencies || [];
        if (current.includes(depId)) return;
        const updated = [...current, depId];
        try {
            await db.updateTask(task.id, { dependencies: updated });
            onUpdate();
            setShowDepPicker(false);
        } catch { /* noop */ }
    };

    const handleRemoveDependency = async (depId: string) => {
        const updated = (task.dependencies || []).filter(id => id !== depId);
        try {
            await db.updateTask(task.id, { dependencies: updated });
            onUpdate();
        } catch { /* noop */ }
    };

    const handleSaveRecurrence = async (rec: typeof recurrence) => {
        try {
            await db.updateTask(task.id, { recurrence: rec ? JSON.stringify(rec) : '' });
            setRecurrence(rec);
            onUpdate();
        } catch (err) {
            console.error('Failed to save recurrence:', err);
            toast.danger('Failed to save recurrence');
        }
    };

    const persistTags = async (nextTags: string[]) => {
        const currentTags = [...normalizeTaskTags(task.tags)].sort();
        const comparableNextTags = [...normalizeTaskTags(nextTags)].sort();

        if (currentTags.join('|') === comparableNextTags.join('|')) {
            return;
        }

        try {
            await db.updateTask(task.id, { tags: comparableNextTags });
            onUpdate();
        } catch (error) {
            console.error('Failed to update tags:', error);
            toast.danger('Failed to update tags');
        }
    };

    const commitTagDraft = async (rawValue: string) => {
        const draftedTags = normalizeTaskTags(rawValue);
        if (draftedTags.length === 0) {
            return;
        }

        await persistTags([...(task.tags || []), ...draftedTags]);
        setTagSearchValue('');
    };

    const fetchDetails = useCallback(async () => {
        if (!isOpen) return;
        try {
            const project = await db.getProject(projectId);
            setProjectRole(project.role);

            // Get decryption key if project is encrypted
            let docKey = documentKey;
            if (task.isEncrypted && privateKey && user && !docKey) {
                try {
                    const access = await db.getAccessKey(projectId);
                    if (access) {
                        docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                        setDocumentKey(docKey);
                    }
                } catch {
                    console.error('Failed to decrypt project key');
                }
            }

            const res = await db.listTasks(projectId);
            const allTasks = res.documents as unknown as Task[];
            let filteredSubtasks = allTasks.filter(t => t.parentId === task.id);

            // Decrypt subtasks if needed
            filteredSubtasks = await Promise.all(filteredSubtasks.map(async (st) => {
                if (st.isEncrypted && docKey) {
                    try {
                        const titleData = JSON.parse(st.title);
                        const decryptedTitle = await decryptData(titleData, docKey);
                        let decryptedDescription = st.description || '';
                        if (st.description) {
                            const descriptionData = JSON.parse(st.description);
                            decryptedDescription = await decryptData(descriptionData, docKey);
                        }
                        return { ...st, title: decryptedTitle, description: decryptedDescription };
                    } catch {
                        return { ...st, title: 'Decryption Error', description: '' };
                    }
                }
                return st;
            }));

            setSubtasks(filteredSubtasks);
            setEditedSubtaskDescriptions(
                Object.fromEntries(filteredSubtasks.map((subtask) => [subtask.id, subtask.description || ''])),
            );
            if (task.parentId) {
                const parentCandidate = allTasks.find((item) => item.id === task.parentId);
                if (parentCandidate) {
                    let resolvedParent = parentCandidate;
                    if (parentCandidate.isEncrypted && docKey) {
                        try {
                            const titleData = JSON.parse(parentCandidate.title);
                            const decryptedTitle = await decryptData(titleData, docKey);
                            resolvedParent = { ...parentCandidate, title: decryptedTitle };
                        } catch {
                            resolvedParent = { ...parentCandidate, title: 'Encrypted parent task' };
                        }
                    }
                    setParentTask(resolvedParent);
                } else {
                    setParentTask(null);
                }
            } else {
                setParentTask(null);
            }

            // Decrypt project tasks for dependency picker
            const depCandidates = allTasks.filter(t => !t.parentId && t.id !== task.id);
            const decryptedDepCandidates = await Promise.all(depCandidates.map(async (t) => {
                if (t.isEncrypted && docKey) {
                    try {
                        const titleData = JSON.parse(t.title);
                        const decryptedTitle = await decryptData(titleData, docKey);
                        return { ...t, title: decryptedTitle };
                    } catch {
                        return { ...t, title: 'Encrypted Task' };
                    }
                }
                return t;
            }));
            setProjectTasks(decryptedDepCandidates);
            setProjectTags(collectTaskTags(allTasks));
            const [fileRes, memberRes, assigneeRes, messageRes, activityRes, presenceRes] = await Promise.all([
                db.listTaskFiles(task.id),
                db.listProjectMembers(projectId),
                db.listTaskAssignees(task.id),
                db.listTaskMessages(task.id),
                db.listTaskActivity(task.id),
                db.heartbeatTaskPresence(task.id),
            ]);
            setTaskFiles(fileRes.documents);
            setProjectMembers(memberRes.documents);
            setAssignees(assigneeRes.documents);
            setTaskActivity(activityRes.documents);
            setPresence(presenceRes.documents);
            const subtaskAssigneeEntries = await Promise.all(
                filteredSubtasks.map(async (subtask) => {
                    try {
                        const response = await db.listTaskAssignees(subtask.id);
                        return [subtask.id, response.documents] as const;
                    } catch {
                        return [subtask.id, []] as const;
                    }
                }),
            );
            setSubtaskAssignees(Object.fromEntries(subtaskAssigneeEntries));

            const decryptedMessages = await Promise.all(messageRes.documents.map(async (message) => {
                if (!message.isEncrypted || !docKey) {
                    return message;
                }
                try {
                    const decryptedBody = await decryptData(JSON.parse(message.body), docKey);
                    return { ...message, body: decryptedBody };
                } catch {
                    return { ...message, body: 'Secure message' };
                }
            }));
            setMessages(decryptedMessages);
        } catch (error) {
            console.error('Failed to fetch task details:', error);
        }
    }, [isOpen, projectId, task.id, task.parentId, task.isEncrypted, privateKey, user, documentKey]);

    useEffect(() => {
        const load = async () => {
            await fetchDetails();
        };
        load();
    }, [fetchDetails]);

    useEffect(() => {
        if (!isOpen) return;
        const tick = () => {
            void db.heartbeatTaskPresence(task.id)
                .then((response) => setPresence(response.documents))
                .catch(console.error);
        };
        tick();
        const timer = window.setInterval(tick, 15000);
        return () => window.clearInterval(timer);
    }, [isOpen, task.id]);

    useEffect(() => {
        const unsub = wsClient.subscribe(async (event: WSEvent) => {
            if (event.collection === 'tasks') {
                const payload = event.document as unknown as Task;
                if (payload.parentId !== task.id && payload.id !== task.id) return;

                if (event.type === 'delete') {
                    if (payload.id === task.id) {
                        onOpenChange(false);
                    } else {
                        setSubtasks(prev => prev.filter(s => s.id !== payload.id));
                    }
                    return;
                }

                await fetchDetails();
            }
            if (event.collection === 'project_files') {
                const payload = event.document as Partial<ProjectFile> & { taskId?: string };
                if (payload.taskId !== task.id) return;
                await fetchDetails();
            }
            if (event.collection === 'task_assignees' || event.collection === 'task_comments') {
                const payload = event.document as { taskId?: string };
                if (payload.taskId !== task.id) return;
                await fetchDetails();
            }
            if (event.collection === 'task_activity') {
                const payload = event.document as { taskId?: string; activity?: ActivityLog[] };
                if (payload.taskId !== task.id) return;
                if (Array.isArray(payload.activity)) {
                    setTaskActivity(payload.activity);
                }
            }
            if (event.collection === 'task_presence') {
                const payload = event.document as { taskId?: string; sessions?: PresenceSession[] };
                if (payload.taskId !== task.id) return;
                if (Array.isArray(payload.sessions)) {
                    setPresence(payload.sessions);
                }
            }
        });

        return () => unsub();
    }, [task.id, fetchDetails, onOpenChange]);

    const handleUpdateTask = async (taskId: string, data: Partial<Task>) => {
        // Optimistic update for subtasks
        const previousSubtasks = [...subtasks];
        if (taskId !== task.id) {
            setSubtasks(prev => prev.map(s => s.id === taskId ? { ...s, ...data } : s));
        }

        try {
            await db.updateTask(taskId, data);
            // Realtime will trigger fetchDetails and onUpdate eventually
            if ('completed' in data) {
                toast.success(data.completed ? 'Task completed' : 'Task reopened');
            }
        } catch (error) {
            console.error('Failed to update task:', error);
            if (taskId !== task.id) {
                setSubtasks(previousSubtasks);
            }
            toast.danger(error instanceof Error ? error.message : 'Sync failed');
        }
    };

    const handleAddSubtask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (task.parentId) {
            toast.warning('Subtasks can only be created on parent tasks');
            return;
        }
        if (!newSubtaskTitle.trim()) return;

        const originalTitle = newSubtaskTitle;
        const optimisticId = `temp-${Date.now()}`;
        
        // Optimistic update
        const newTask: Task = {
            id: optimisticId,
            createdAt: new Date().toISOString(),
            title: originalTitle,
            description: '',
            projectId,
            completed: false,
            parentId: task.id,
            order: subtasks.length,
            isEncrypted: !!task.isEncrypted
        } as Task;

        setSubtasks(prev => [...prev, newTask]);
        setNewSubtaskTitle('');

        try {
            let finalTitle = originalTitle;
            if (task.isEncrypted && documentKey) {
                const encrypted = await encryptData(originalTitle, documentKey);
                finalTitle = JSON.stringify(encrypted);
            }
            const createdSubtask = await db.createEmptyTask(projectId, finalTitle, subtasks.length, !!task.isEncrypted, task.id, 'todo');
            // Replace the local placeholder immediately. Realtime still reconciles the
            // collection, but follow-up edits must never target the temporary ID.
            setSubtasks((current) => current.map((item) => (
                item.id === optimisticId
                    ? { ...createdSubtask, title: originalTitle, description: '' }
                    : item
            )));
            setEditedSubtaskDescriptions((current) => ({
                ...current,
                [createdSubtask.id]: '',
            }));
            onUpdate();
            toast.success('Subtask added');
        } catch (error) {
            console.error('Failed to add subtask:', error);
            setSubtasks(prev => prev.filter(s => s.id !== optimisticId));
            setNewSubtaskTitle(originalTitle);
            toast.danger('Failed to add subtask');
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        const previousSubtasks = [...subtasks];
        if (taskId !== task.id) {
            setSubtasks(prev => prev.filter(s => s.id !== taskId));
        }

        try {
            await db.deleteTask(taskId);
            if (taskId === task.id) {
                onOpenChange(false);
            }
            // Realtime handles the rest
            onUpdate();
            toast.success('Task deleted');
        } catch (error) {
            console.error('Failed to delete task:', error);
            if (taskId !== task.id) {
                setSubtasks(previousSubtasks);
            }
            toast.danger('Delete failed');
        }
    };

    const handleUpdateTitle = async () => {
        if (!editedTitle.trim() || editedTitle === task.title) {
            setIsEditingTitle(false);
            setEditedTitle(task.title);
            return;
        }

        try {
            let finalTitle = editedTitle;
            if (task.isEncrypted && documentKey) {
                const encrypted = await encryptData(editedTitle, documentKey);
                finalTitle = JSON.stringify(encrypted);
            }
            await db.updateTask(task.id, { title: finalTitle });
            setIsEditingTitle(false);
            onUpdate();
            toast.success('Title updated');
        } catch (error) {
            console.error('Failed to update title:', error);
            toast.danger('Failed to update title');
        }
    };

    const handleUpdateDescription = async () => {
        if (editedDescription === (task.description || '')) {
            return;
        }

        try {
            let finalDescription = editedDescription;
            if (task.isEncrypted) {
                if (!documentKey) {
                    toast.danger('Unlock vault before editing secure task details');
                    setEditedDescription(task.description || '');
                    return;
                }
                const encrypted = await encryptData(editedDescription, documentKey);
                finalDescription = JSON.stringify(encrypted);
            }
            await db.updateTask(task.id, { description: finalDescription });
            onUpdate();
        } catch (error) {
            console.error('Failed to update description:', error);
            setEditedDescription(task.description || '');
            toast.danger('Failed to update description');
        }
    };

    const handleUpdateSubtaskTitle = async (subtask: Task) => {
        if (!editedSubtaskTitle.trim() || editedSubtaskTitle === subtask.title) {
            setEditingSubtaskId(null);
            return;
        }

        try {
            let finalTitle = editedSubtaskTitle;
            if (subtask.isEncrypted && documentKey) {
                const encrypted = await encryptData(editedSubtaskTitle, documentKey);
                finalTitle = JSON.stringify(encrypted);
            }
            await db.updateTask(subtask.id, { title: finalTitle });
            setEditingSubtaskId(null);
            fetchDetails();
            onUpdate();
            toast.success('Subtask updated');
        } catch (error) {
            console.error('Failed to update subtask title:', error);
            toast.danger('Failed to update subtask');
        }
    };

    const handleUpdateSubtaskDescription = async (subtask: Task) => {
        const nextDescription = editedSubtaskDescriptions[subtask.id] ?? '';
        if (nextDescription === (subtask.description || '')) {
            return;
        }

        try {
            let finalDescription = nextDescription;
            if (subtask.isEncrypted) {
                if (!documentKey) {
                    toast.danger('Unlock vault before editing secure task details');
                    setEditedSubtaskDescriptions((current) => ({ ...current, [subtask.id]: subtask.description || '' }));
                    return;
                }
                const encrypted = await encryptData(nextDescription, documentKey);
                finalDescription = JSON.stringify(encrypted);
            }
            await db.updateTask(subtask.id, { description: finalDescription });
            setSubtasks((current) => current.map((item) => item.id === subtask.id ? { ...item, description: nextDescription } : item));
            onUpdate();
            toast.success('Subtask description updated');
        } catch (error) {
            console.error('Failed to update subtask description:', error);
            setEditedSubtaskDescriptions((current) => ({ ...current, [subtask.id]: subtask.description || '' }));
            toast.danger('Failed to update subtask description');
        }
    };

    const handleUpdatePriority = async (priority: 'low' | 'medium' | 'high' | 'urgent') => {
        try {
            await db.updateTask(task.id, { priority });
            onUpdate();
            toast.success('Priority updated');
        } catch (error) {
            console.error('Failed to update priority:', error);
            toast.danger('Failed to update priority');
        }
    };

    const handleUpdateStatus = async (statusKey: string) => {
        try {
            const nextStatus = resolvedStatusOptions.find((status) => status.key === statusKey);
            await db.updateTask(task.id, {
                kanbanStatus: statusKey,
                completed: nextStatus?.isCompletedState ?? false,
            });
            onUpdate();
            toast.success('Status updated');
        } catch (error) {
            console.error('Failed to update status:', error);
            toast.danger('Failed to update status');
        }
    };

    const handleUpdateSubtaskStatus = (subtaskId: string, statusKey: string) => {
        const nextStatus = resolvedStatusOptions.find((status) => status.key === statusKey);
        void handleUpdateTask(subtaskId, {
            kanbanStatus: statusKey,
            completed: nextStatus?.isCompletedState ?? false,
        });
    };

    // DatePicker emits a ZonedDateTime for absolute values and a calendar value
    // when the calendar/time segments are edited independently.
    // Persist both forms as one absolute ISO timestamp.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleUpdateDeadline = async (val: any) => {
        try {
            if (!val) return;
            const dateStr = typeof val.toAbsoluteString === 'function'
                ? val.toAbsoluteString()
                : toZoned(val, getLocalTimeZone()).toAbsoluteString();
            await db.updateTask(task.id, { deadline: dateStr });
            onUpdate();
            toast.success('Deadline updated');
        } catch (error) {
            console.error('Failed to update deadline:', error);
            toast.danger('Failed to update deadline');
        }
    };

    const deadlineTime = deadlineDraft
        ? new Time('hour' in deadlineDraft ? deadlineDraft.hour : 0, 'minute' in deadlineDraft ? deadlineDraft.minute : 0)
        : null;

    const handleDeadlineDateChange = (value: DateValue | null) => {
        if (!value) {
            setDeadlineDraft(null);
            return;
        }
        const selected = ('timeZone' in value ? value : toZoned(value, getLocalTimeZone())) as {
            hour: number;
            minute: number;
            second: number;
            millisecond: number;
            set: (values: { hour: number; minute: number; second: number; millisecond: number }) => DateValue;
        };
        setDeadlineDraft(selected.set({
            hour: deadlineTime?.hour ?? selected.hour,
            minute: deadlineTime?.minute ?? selected.minute,
            second: 0,
            millisecond: 0,
        }));
    };

    const handleDeadlineTimeChange = (time: Time | null) => {
        if (!time || !deadlineDraft) return;
        const currentDeadline = deadlineDraft as { set: (values: { hour: number; minute: number; second: number; millisecond: number }) => DateValue };
        setDeadlineDraft(currentDeadline.set({
            hour: time.hour,
            minute: time.minute,
            second: time.second,
            millisecond: time.millisecond,
        }));
    };

    const formatTime = (seconds: number) => {
        const dur = dayjs.duration(seconds, 'seconds');
        if (seconds >= 3600) {
            return `${Math.floor(dur.asHours())}h ${dur.minutes()}m`;
        }
        return `${dur.minutes()}m ${dur.seconds()}s`;
    };

    const timelineItems = [
        ...messages.map((message) => ({ kind: 'message' as const, occurredAt: message.createdAt, value: message })),
        ...taskActivity.map((activity) => ({ kind: 'activity' as const, occurredAt: activity.createdAt, value: activity })),
    ].sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());

    const currentTags = normalizeTaskTags(task.tags);
    const autocompleteTags = [...new Set([...projectTags, ...currentTags])].sort((left, right) => left.localeCompare(right));
    const filteredAutocompleteTags = autocompleteTags.filter((tag) => !currentTags.includes(tag) && (tagSearchValue.trim() === '' || contains(tag, tagSearchValue.trim())));
    const isSubtask = !!task.parentId;

    const handleRemoveTags = (keys: Set<React.Key>) => {
        const nextTags = currentTags.filter((tag) => !keys.has(tag));
        void persistTags(nextTags);
    };

    const canEditTask = projectRole === 'owner' || projectRole === 'admin' || projectRole === 'editor';
    const availableAssignees = projectMembers.filter((member) => !assignees.some((assignee) => assignee.userId === member.userId));
    const mentionableMembers = projectMembers.filter((member) => member.userId !== user?.id);
    const resolvedStatusOptions = statusOptions.length > 0 ? statusOptions : getDefaultProjectTaskStatuses();
    const priorityOptions: { id: NonNullable<Task['priority']>; label: string; className: string }[] = [
        { id: 'low', label: 'Low', className: 'text-success' },
        { id: 'medium', label: 'Medium', className: 'text-accent' },
        { id: 'high', label: 'High', className: 'text-warning' },
        { id: 'urgent', label: 'Urgent', className: 'text-danger' },
    ];
    const currentStatusOption = getTaskStatusForTask(task, resolvedStatusOptions);
    const currentPriorityOption = task.priority ? priorityOptions.find((priority) => priority.id === task.priority) : undefined;

    const toggleMention = (memberId: string) => {
        setMentionedUserIds((current) => current.includes(memberId)
            ? current.filter((id) => id !== memberId)
            : [...current, memberId],
        );
    };

    const handleAssignMemberToTask = async (targetTaskId: string, memberId: string) => {
        try {
            const assignee = await db.addTaskAssignee(targetTaskId, memberId);
            if (targetTaskId === task.id) {
                setAssignees((current) => [...current.filter((item) => item.userId !== assignee.userId), assignee]);
            } else {
                setSubtaskAssignees((current) => ({
                    ...current,
                    [targetTaskId]: [...(current[targetTaskId] || []).filter((item) => item.userId !== assignee.userId), assignee],
                }));
            }
            toast.success('Assignee added');
        } catch (error) {
            console.error('Failed to assign member:', error);
            toast.danger('Failed to assign teammate');
        }
    };

    const handleAssignMember = async (memberId: string) => {
        await handleAssignMemberToTask(task.id, memberId);
    };

    const handleRemoveAssignee = async (memberId: string, targetTaskId: string = task.id) => {
        try {
            await db.removeTaskAssignee(targetTaskId, memberId);
            if (targetTaskId === task.id) {
                setAssignees((current) => current.filter((item) => item.userId !== memberId));
            } else {
                setSubtaskAssignees((current) => ({
                    ...current,
                    [targetTaskId]: (current[targetTaskId] || []).filter((item) => item.userId !== memberId),
                }));
            }
            toast.success('Assignee removed');
        } catch (error) {
            console.error('Failed to remove assignee:', error);
            toast.danger('Failed to remove assignee');
        }
    };

    const handleCreateMessage = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!newMessage.trim()) return;

        try {
            let body = newMessage.trim();
            let isEncrypted = false;
            if (task.isEncrypted && documentKey) {
                const encrypted = await encryptData(body, documentKey);
                body = JSON.stringify(encrypted);
                isEncrypted = true;
            }
            const message = await db.createTaskMessage(task.id, {
                body,
                mentionedUserIds,
                isEncrypted,
            });
            setMessages((current) => [...current, { ...message, body: newMessage.trim() }]);
            setNewMessage('');
            setMentionedUserIds([]);
            toast.success('Message added');
        } catch (error) {
            console.error('Failed to create message:', error);
            toast.danger('Failed to save message');
        }
    };

    const handleDeleteMessage = async (messageId: string) => {
        try {
            await db.deleteTaskMessage(task.id, messageId);
            setMessages((current) => current.filter((message) => message.id !== messageId));
            toast.success('Message removed');
        } catch (error) {
            console.error('Failed to remove message:', error);
            toast.danger('Failed to remove message');
        }
    };

    const handleDownloadFile = async (file: ProjectFile) => {
        try {
            const blob = await db.downloadProjectFile(file.id);
            if (!task.isEncrypted || !documentKey) {
                saveAs(blob, `task-file-${file.id}`);
                return;
            }
            const encryptedBytes = await blob.arrayBuffer();
            const decrypted = await decryptBytes({ ciphertext: encryptedBytes, iv: file.iv || '' }, documentKey);
            const decryptedName = await decryptData(JSON.parse(file.encryptedName), documentKey);
            saveAs(new Blob([decrypted]), decryptedName);
        } catch (error) {
            console.error('Failed to download task file:', error);
            toast.danger('File download failed');
        }
    };

    const handleUploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (task.isEncrypted && !documentKey) {
            toast.danger('Unlock your vault before uploading encrypted files');
            return;
        }

        setIsUploadingFile(true);
        try {
            let uploadBlob = file;
            let encryptedName = file.name;
            const contentType = file.type || 'application/octet-stream';
            let iv = '';

            if (task.isEncrypted && documentKey) {
                const [encryptedFile, encryptedFileName] = await Promise.all([
                    encryptBytes(await file.arrayBuffer(), documentKey),
                    encryptData(file.name, documentKey),
                ]);
                const encryptedBytes = new Uint8Array(encryptedFile.ciphertext.byteLength);
                encryptedBytes.set(encryptedFile.ciphertext);
                uploadBlob = new File([encryptedBytes], 'cipher.bin', { type: 'application/octet-stream' });
                encryptedName = JSON.stringify(encryptedFileName);
                iv = encryptedFile.iv;
            }

            const formData = new FormData();
            formData.append('file', uploadBlob);
            formData.append('encryptedName', encryptedName);
            formData.append('contentType', contentType);
            formData.append('isEncrypted', String(!!task.isEncrypted));
            if (iv) {
                formData.append('iv', iv);
            }
            await db.uploadTaskFile(task.id, formData);
            const response = await db.listTaskFiles(task.id);
            setTaskFiles(response.documents);
            toast.success('Attachment uploaded');
        } catch (error) {
            console.error('Failed to upload task file:', error);
            toast.danger('File upload failed');
        } finally {
            setIsUploadingFile(false);
            if (attachmentInputRef.current) {
                attachmentInputRef.current.value = '';
            }
        }
    };

    const handleDeleteFile = async (fileId: string) => {
        try {
            await db.deleteProjectFile(fileId);
            setTaskFiles((current) => current.filter((file) => file.id !== fileId));
            toast.success('Attachment removed');
        } catch (error) {
            console.error('Failed to delete task file:', error);
            toast.danger('Failed to remove file');
        }
    };

    const resolveFileName = async (file: ProjectFile) => {
        if (!task.isEncrypted || !documentKey) {
            return file.encryptedName;
        }
        try {
            return await decryptData(JSON.parse(file.encryptedName), documentKey);
        } catch {
            return 'Secure attachment';
        }
    };

    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
            <Modal.Backdrop className="bg-background/60 backdrop-blur-sm">
                <Modal.Container size="cover" className="items-stretch justify-end p-0">
                    <Modal.Dialog className="ml-auto flex h-screen w-full max-w-[1120px] flex-col overflow-hidden rounded-none border-l border-border bg-surface shadow-2xl">
                        <Modal.Header className="px-5 pt-4 pb-3 border-b border-border flex flex-col items-start gap-3">
                            <Modal.CloseTrigger className="text-muted-foreground hover:text-foreground hover:bg-surface-secondary transition-colors" />
                            
                            <div className="flex w-full items-start justify-between gap-4 pr-8">
                                {isEditingTitle ? (
                                    <form 
                                        onSubmit={(e) => { e.preventDefault(); handleUpdateTitle(); }}
                                        className="min-w-0 flex-1 flex items-center gap-2"
                                    >
                                        <Input 
                                            autoFocus
                                            value={editedTitle}
                                            onChange={(e) => setEditedTitle(e.target.value)}
                                            onBlur={handleUpdateTitle}
                                            className="text-base font-semibold text-foreground bg-surface-secondary"
                                        />
                                    </form>
                                ) : (
                                    <div className="min-w-0 flex-1">
                                        <div className="space-y-1.5">
                                            <Modal.Heading 
                                                className="text-lg font-semibold text-foreground cursor-pointer hover:text-accent transition-colors flex items-center gap-2 group"
                                                onClick={() => setIsEditingTitle(true)}
                                            >
                                                {task.title}
                                                <Edit size={13} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                                            </Modal.Heading>
                                            {isSubtask && (
                                                <p className="text-[12px] text-muted-foreground">
                                                    Subtask of <span className="text-foreground">{parentTask?.title || 'parent task'}</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {presence.length > 0 && (
                                    <div className="mt-1 flex shrink-0 items-center gap-2 rounded-full bg-surface-secondary/55 px-2 py-1">
                                        <div className="flex -space-x-2">
                                            {presence.slice(0, 4).map((session) => (
                                                <Tooltip key={session.userId}>
                                                    <Tooltip.Trigger>
                                                        <span>
                                                            <Avatar size="sm" color="accent" variant="soft" className="border border-surface">
                                                                <Avatar.Fallback>{session.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                                            </Avatar>
                                                        </span>
                                                    </Tooltip.Trigger>
                                                    <Tooltip.Content showArrow className="rounded-lg bg-surface text-foreground shadow-lg">
                                                        <div className="px-1 py-0.5">
                                                            <div className="text-[12px] font-medium">{session.name}</div>
                                                            {session.email && <div className="text-[11px] text-muted-foreground">{session.email}</div>}
                                                        </div>
                                                    </Tooltip.Content>
                                                </Tooltip>
                                            ))}
                                        </div>
                                        <span className="whitespace-nowrap text-[11px] text-muted-foreground">{presence.length} viewing now</span>
                                    </div>
                                )}

                            </div>
                        </Modal.Header>
                        <Modal.Body className="min-h-0 flex-1 overflow-hidden p-0">
                            <div className="h-full min-h-0 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden">
                                {/* Main task work area */}
                                <div className="min-h-0 bg-surface lg:border-r lg:border-border">
                                    <ScrollShadow className="h-auto p-5 lg:h-full" hideScrollBar>
                                    <div className="flex min-h-[520px] flex-col gap-6 lg:h-full">
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-medium text-foreground flex items-center gap-2">
                                                    <FileText size={14} /> Description
                                                </h4>
                                            </div>
                                            <TextArea
                                                value={editedDescription}
                                                onChange={(event) => setEditedDescription(event.target.value)}
                                                onBlur={handleUpdateDescription}
                                                placeholder="Add context, acceptance criteria, links, or implementation notes..."
                                                variant="secondary"
                                                rows={6}
                                                fullWidth
                                                disabled={!canEditTask}
                                                className="w-full min-h-40 rounded-lg text-sm"
                                                style={{ resize: 'vertical' }}
                                            />
                                        </div>

                                        {!isSubtask && (
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-xs font-medium text-foreground flex items-center gap-2">
                                                        <Plus size={14} /> Subtasks
                                                    </h4>
                                                    <span className="text-xs text-muted-foreground/60">{subtasks.filter(s => s.completed).length}/{subtasks.length} completed</span>
                                                </div>
                                                
                                                <form onSubmit={handleAddSubtask} className="relative group">
                                                    <Input 
                                                        placeholder="Add technical milestone..."
                                                        value={newSubtaskTitle}
                                                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                                        variant="secondary"
                                                        className="w-full rounded-lg"
                                                    />
                                                    <Button 
                                                        type="submit" 
                                                        isIconOnly 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity"
                                                    >
                                                        <Plus size={16} />
                                                    </Button>
                                                </form>

                                                <ScrollShadow className="-mx-2 max-h-[250px] px-2" hideScrollBar>
                                                    <div className="space-y-2">
                                                        {subtasks.length === 0 ? (
                                                            <div className="py-8 text-center border-2 border-dashed border-border/30 rounded-xl">
                                                                <p className="text-xs text-muted-foreground/50">No subtasks yet</p>
                                                            </div>
                                                        ) : (
                                                            [...subtasks].sort((a, b) => Number(a.completed) - Number(b.completed)).map((st) => (
                                                                <div key={st.id} className="rounded-lg border border-border bg-surface-secondary/40 px-2.5 py-2 transition-colors hover:border-accent/30">
                                                                    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-2">
                                                                        <Checkbox
                                                                            isSelected={st.completed}
                                                                            onChange={(val) => handleUpdateTask(st.id, { completed: val })}
                                                                            isDisabled={!canEditTask}
                                                                            className="mt-0"
                                                                        >
                                                                            <Checkbox.Content>
                                                                                <Checkbox.Control className="size-5 rounded-xl border-2">
                                                                                    <Checkbox.Indicator />
                                                                                </Checkbox.Control>
                                                                            </Checkbox.Content>
                                                                        </Checkbox>
                                                                        <div className="min-w-0">
                                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                                <div className="min-w-0 space-y-1">
                                                                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{st.taskKey}</div>
                                                                                    {editingSubtaskId === st.id ? (
                                                                                        <Input
                                                                                            autoFocus
                                                                                            value={editedSubtaskTitle}
                                                                                            onChange={(e) => setEditedSubtaskTitle(e.target.value)}
                                                                                            onBlur={() => handleUpdateSubtaskTitle(st)}
                                                                                            variant="secondary"
                                                                                            className="h-8 rounded-lg text-xs font-semibold"
                                                                                            onKeyDown={(e) => {
                                                                                                if (e.key === 'Enter') handleUpdateSubtaskTitle(st);
                                                                                                if (e.key === 'Escape') setEditingSubtaskId(null);
                                                                                            }}
                                                                                        />
                                                                                    ) : (
                                                                                        <button
                                                                                            type="button"
                                                                                            className={`text-left text-xs font-medium transition-all hover:text-accent ${st.completed ? 'line-through text-muted-foreground/40' : 'text-foreground'}`}
                                                                                            onClick={() => {
                                                                                                setEditingSubtaskId(st.id);
                                                                                                setEditedSubtaskTitle(st.title);
                                                                                            }}
                                                                                        >
                                                                                            {st.title}
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                                <div className="flex flex-wrap items-center justify-end gap-1">
                                                                                    {(() => {
                                                                                        const subtaskStatus = getTaskStatusForTask(st, resolvedStatusOptions);
                                                                                        return (
                                                                                            <Dropdown>
                                                                                                <Dropdown.Trigger>
                                                                                                    <Button
                                                                                                        variant="ghost"
                                                                                                        className="h-7 min-w-[92px] justify-between rounded-md bg-surface-secondary/55 px-2 text-[11px]"
                                                                                                        isDisabled={!canEditTask}
                                                                                                    >
                                                                                                        <span className="flex items-center gap-1.5 truncate">
                                                                                                            <span className={`h-1.5 w-1.5 rounded-full ${getStatusTokenDotClass(subtaskStatus.colorToken)}`} />
                                                                                                            {subtaskStatus.label}
                                                                                                        </span>
                                                                                                        <ChevronDown size={12} />
                                                                                                    </Button>
                                                                                                </Dropdown.Trigger>
                                                                                                <Dropdown.Popover placement="bottom end">
                                                                                                    <Dropdown.Menu>
                                                                                                        {resolvedStatusOptions.map((status) => (
                                                                                                            <Dropdown.Item key={status.id} id={status.id} textValue={status.label} onAction={() => handleUpdateSubtaskStatus(st.id, status.key)}>
                                                                                                                <span className="flex items-center gap-2">
                                                                                                                    <span className={`h-2 w-2 rounded-full ${getStatusTokenDotClass(status.colorToken)}`} />
                                                                                                                    {status.label}
                                                                                                                </span>
                                                                                                            </Dropdown.Item>
                                                                                                        ))}
                                                                                                    </Dropdown.Menu>
                                                                                                </Dropdown.Popover>
                                                                                            </Dropdown>
                                                                                        );
                                                                                    })()}
                                                                                    {(() => {
                                                                                        const subtaskMembers = subtaskAssignees[st.id] || [];
                                                                                        const availableMembers = projectMembers.filter((member) => !subtaskMembers.some((assignee) => assignee.userId === member.userId));
                                                                                        const primaryAssignee = subtaskMembers[0];
                                                                                        return (
                                                                                            <Dropdown>
                                                                                                <Dropdown.Trigger>
                                                                                                    <Button
                                                                                                        variant="secondary"
                                                                                                        className="h-7 max-w-[170px] justify-start rounded-md px-2 text-[11px]"
                                                                                                        isDisabled={!canEditTask}
                                                                                                    >
                                                                                                        {primaryAssignee ? (
                                                                                                            <>
                                                                                                                <Avatar size="sm" color="accent" variant="soft" className="size-5 shrink-0">
                                                                                                                    <Avatar.Fallback>{primaryAssignee.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                                                                                                </Avatar>
                                                                                                                <span className="truncate">{primaryAssignee.name}</span>
                                                                                                                {subtaskMembers.length > 1 && <span className="text-muted-foreground">+{subtaskMembers.length - 1}</span>}
                                                                                                            </>
                                                                                                        ) : (
                                                                                                            <><UserPlus size={12} /><span>Assign</span></>
                                                                                                        )}
                                                                                                        <ChevronDown size={12} className="ml-auto shrink-0" />
                                                                                                    </Button>
                                                                                                </Dropdown.Trigger>
                                                                                                <Dropdown.Popover placement="bottom end" className="min-w-[220px]">
                                                                                                    <Dropdown.Menu>
                                                                                                        {subtaskMembers.map((assignee) => (
                                                                                                            <Dropdown.Item key={`remove-${assignee.userId}`} id={`remove-${assignee.userId}`} textValue={`Unassign ${assignee.name}`} variant="danger" onAction={() => void handleRemoveAssignee(assignee.userId, st.id)}>
                                                                                                                <div className="flex items-center gap-2">
                                                                                                                    <Avatar size="sm" color="accent" variant="soft">
                                                                                                                        <Avatar.Fallback>{assignee.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                                                                                                    </Avatar>
                                                                                                                    <div className="min-w-0"><div className="truncate text-sm">{assignee.name}</div><div className="truncate text-xs text-muted-foreground">Unassign</div></div>
                                                                                                                </div>
                                                                                                            </Dropdown.Item>
                                                                                                        ))}
                                                                                                        {availableMembers.map((member) => (
                                                                                                            <Dropdown.Item key={member.userId} id={member.userId} textValue={member.name} onAction={() => void handleAssignMemberToTask(st.id, member.userId)}>
                                                                                                                <div className="flex items-center gap-2">
                                                                                                                    <Avatar size="sm" color="accent" variant="soft">
                                                                                                                        <Avatar.Fallback>{member.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                                                                                                    </Avatar>
                                                                                                                    <div className="min-w-0"><div className="truncate text-sm text-foreground">{member.userId === user?.id ? 'Assign to me' : member.name}</div><div className="truncate text-xs text-muted-foreground">{member.email}</div></div>
                                                                                                                </div>
                                                                                                            </Dropdown.Item>
                                                                                                        ))}
                                                                                                    </Dropdown.Menu>
                                                                                                </Dropdown.Popover>
                                                                                            </Dropdown>
                                                                                        );
                                                                                    })()}
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        isIconOnly
                                                                                        size="sm"
                                                                                        className="h-7 w-7 text-muted-foreground/50 hover:text-danger hover:bg-danger/10"
                                                                                        onPress={() => handleDeleteTask(st.id)}
                                                                                    >
                                                                                        <Trash size={12} />
                                                                                    </Button>
                                                                                </div>
                                                                            </div>

                                                                        </div>
                                                                        <Disclosure className="col-span-full">
                                                                            <Disclosure.Heading>
                                                                                <Disclosure.Trigger className="flex w-full items-center justify-between rounded-md px-1 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                                                                                    <span>{editedSubtaskDescriptions[st.id] ? 'Details' : 'Add details'}</span>
                                                                                    <Disclosure.Indicator className="size-3 transition-transform data-[expanded=true]:rotate-180" />
                                                                                </Disclosure.Trigger>
                                                                            </Disclosure.Heading>
                                                                            <Disclosure.Content>
                                                                                <Disclosure.Body className="pt-1.5">
                                                                                    <TextArea
                                                                                        value={editedSubtaskDescriptions[st.id] ?? ''}
                                                                                        onChange={(event) => setEditedSubtaskDescriptions((current) => ({ ...current, [st.id]: event.target.value }))}
                                                                                        onBlur={() => { void handleUpdateSubtaskDescription(st); }}
                                                                                        placeholder="Add subtask context or acceptance criteria..."
                                                                                        variant="secondary"
                                                                                        rows={2}
                                                                                        fullWidth
                                                                                        className="min-h-[64px] w-full rounded-lg text-xs"
                                                                                        disabled={!canEditTask}
                                                                                    />
                                                                                </Disclosure.Body>
                                                                            </Disclosure.Content>
                                                                        </Disclosure>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </ScrollShadow>
                                            </div>
                                        )}

                                        {task.timeSpent !== undefined && task.timeSpent > 0 && (
                                                <div className="pt-6 border-t border-border">
                                                <h4 className="text-xs font-medium text-accent flex items-center gap-2 mb-4">
                                                    <History size={14} /> Time Spent
                                                </h4>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="p-3 rounded-xl bg-surface border border-border">
                                                        <p className="text-xs text-muted-foreground mb-1">Total</p>
                                                        <p className="text-lg font-semibold text-accent font-mono">{formatTime(task.timeSpent)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-4 border-t border-border pt-6">
                                            <div className="flex items-center justify-between gap-3">
                                                <h4 className="flex items-center gap-2 text-xs font-medium text-foreground">
                                                    <MessageCircle size={14} /> Messages & activity
                                                </h4>
                                                <span className="text-[11px] text-muted-foreground">{timelineItems.length}</span>
                                            </div>
                                            {timelineItems.length === 0 ? (
                                                <div className="rounded-lg border border-dashed border-border/40 bg-surface-secondary/20 px-3 py-6 text-center text-[11px] text-muted-foreground/60">
                                                    No messages or activity yet.
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {timelineItems.map((entry) => entry.kind === 'message' ? (() => {
                                                        const message = entry.value;
                                                        const mentionedMembers = projectMembers.filter((member) => message.mentionedUserIds?.includes(member.userId));
                                                        return (
                                                            <div key={`message-${message.id}`} className="flex items-start gap-2.5">
                                                                <Avatar size="sm" color="accent" variant="soft" className="mt-0.5 shrink-0">
                                                                    <Avatar.Fallback>{message.userName.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                                                </Avatar>
                                                                <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-surface-secondary/30 px-3 py-2.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="min-w-0 truncate text-[12px] font-medium text-foreground">{message.userName}</span>
                                                                        <span className="shrink-0 text-[11px] text-muted-foreground">{dayjs(message.createdAt).fromNow()}</span>
                                                                        {message.userId === user?.id && (
                                                                            <Button variant="ghost" isIconOnly className="ml-auto h-6 w-6 rounded-md text-muted-foreground hover:text-danger" onPress={() => handleDeleteMessage(message.id)}>
                                                                                <Trash size={11} />
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                    <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">{message.body}</p>
                                                                    {mentionedMembers.length > 0 && (
                                                                        <TagGroup className="mt-2"><TagGroup.List className="flex flex-wrap gap-1">{mentionedMembers.map((member) => <Tag key={member.userId} id={member.userId} className="rounded-md text-[10px]">@{member.name.split(' ')[0]}</Tag>)}</TagGroup.List></TagGroup>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })() : (
                                                        <div key={`activity-${entry.value.id}`} className="ml-9 rounded-lg border border-border/60 bg-surface-secondary/20 px-3 py-2">
                                                            <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-[12px] font-medium text-foreground">{entry.value.userName || 'Teammate'} · {entry.value.type}</div><div className="truncate text-[11px] text-muted-foreground">{entry.value.entityType} {entry.value.metadata ? `· ${entry.value.metadata}` : ''}</div></div><span className="shrink-0 text-[11px] text-muted-foreground">{dayjs(entry.value.createdAt).fromNow()}</span></div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <form onSubmit={handleCreateMessage} className="space-y-2 rounded-lg border border-border bg-surface p-3">
                                                <div className="relative"><TextArea value={newMessage} onChange={(event) => setNewMessage(event.target.value)} placeholder="Add a message for the team..." rows={3} variant="secondary" className="w-full resize-none rounded-xl pb-10 text-xs" /><Button type="submit" size="sm" variant="primary" className="absolute bottom-2 right-2 h-7 rounded-md px-3 text-xs">Send</Button></div>
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {mentionableMembers.length > 0 && <Dropdown><Dropdown.Trigger><Button type="button" size="sm" variant="ghost" className="h-6 rounded-md px-2 text-[11px] text-muted-foreground"><AtSign size={11} /> Mention <ChevronDown size={11} /></Button></Dropdown.Trigger><Dropdown.Popover placement="top start" className="min-w-[220px]"><Dropdown.Menu>{mentionableMembers.map((member) => <Dropdown.Item key={member.userId} id={member.userId} textValue={member.name} onAction={() => toggleMention(member.userId)}><div className="flex items-center gap-2"><Avatar size="sm" color="accent" variant="soft"><Avatar.Fallback>{member.name.slice(0, 1).toUpperCase()}</Avatar.Fallback></Avatar><div className="min-w-0"><div className="truncate text-sm">{member.name}</div><div className="truncate text-xs text-muted-foreground">{member.email}</div></div></div></Dropdown.Item>)}</Dropdown.Menu></Dropdown.Popover></Dropdown>}
                                                    {mentionedUserIds.length > 0 && <TagGroup onRemove={(keys) => setMentionedUserIds((current) => current.filter((userId) => !keys.has(userId)))}><TagGroup.List className="flex flex-wrap gap-1">{mentionableMembers.filter((member) => mentionedUserIds.includes(member.userId)).map((member) => <Tag key={member.userId} id={member.userId} className="rounded-md text-[10px]">@{member.name.split(' ')[0]}</Tag>)}</TagGroup.List></TagGroup>}
                                                </div>
                                            </form>
                                        </div>

                                    </div>
                                    </ScrollShadow>
                                </div>

                                {/* Right Side: properties and communication */}
                                <div className="min-h-0 border-t border-border bg-surface-secondary/25 lg:border-t-0">
                                    <ScrollShadow className="h-full overflow-y-auto p-5" hideScrollBar>
                                    <div className="space-y-6">
                                        <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Properties</h4>
                                                <span className="text-[11px] text-muted-foreground">{taskFiles.length} files</span>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <Label className="text-[11px] font-medium text-muted-foreground">Assignee</Label>
                                                    </div>
                                                    {(() => {
                                                        const primaryAssignee = assignees[0];
                                                        return (
                                                            <Dropdown>
                                                                <Dropdown.Trigger>
                                                                    <Button variant="secondary" className="h-8 w-full justify-start rounded-md px-2.5 text-[11px]" isDisabled={!canEditTask}>
                                                                        {primaryAssignee ? (
                                                                            <>
                                                                                <Avatar size="sm" color="accent" variant="soft" className="size-5 shrink-0">
                                                                                    <Avatar.Fallback>{primaryAssignee.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                                                                </Avatar>
                                                                                <span className="truncate">{primaryAssignee.name}</span>
                                                                                {assignees.length > 1 && <span className="text-muted-foreground">+{assignees.length - 1}</span>}
                                                                            </>
                                                                        ) : (
                                                                            <><UserPlus size={13} /><span>Assign</span></>
                                                                        )}
                                                                        <ChevronDown size={13} className="ml-auto shrink-0" />
                                                                    </Button>
                                                                </Dropdown.Trigger>
                                                                <Dropdown.Popover placement="bottom end" className="min-w-[230px]">
                                                                    <Dropdown.Menu>
                                                                        {assignees.map((assignee) => (
                                                                            <Dropdown.Item key={`remove-${assignee.userId}`} id={`remove-${assignee.userId}`} textValue={`Unassign ${assignee.name}`} variant="danger" onAction={() => void handleRemoveAssignee(assignee.userId)}>
                                                                                <div className="flex items-center gap-2">
                                                                                    <Avatar size="sm" color="accent" variant="soft"><Avatar.Fallback>{assignee.name.slice(0, 1).toUpperCase()}</Avatar.Fallback></Avatar>
                                                                                    <div className="min-w-0"><div className="truncate text-sm">{assignee.name}</div><div className="truncate text-xs text-muted-foreground">Unassign</div></div>
                                                                                </div>
                                                                            </Dropdown.Item>
                                                                        ))}
                                                                        {availableAssignees.map((member) => (
                                                                            <Dropdown.Item key={member.userId} id={member.userId} textValue={member.name} onAction={() => void handleAssignMember(member.userId)}>
                                                                                <div className="flex items-center gap-2">
                                                                                    <Avatar size="sm" color="accent" variant="soft"><Avatar.Fallback>{member.name.slice(0, 1).toUpperCase()}</Avatar.Fallback></Avatar>
                                                                                    <div className="min-w-0"><div className="truncate text-sm text-foreground">{member.userId === user?.id ? 'Assign to me' : member.name}</div><div className="truncate text-xs text-muted-foreground">{member.email}</div></div>
                                                                                </div>
                                                                            </Dropdown.Item>
                                                                        ))}
                                                                    </Dropdown.Menu>
                                                                </Dropdown.Popover>
                                                            </Dropdown>
                                                        );
                                                    })()}
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <Label className="text-[11px] font-medium text-muted-foreground">Status</Label>
                                                        <Dropdown>
                                                            <Dropdown.Trigger>
                                                                <Button variant="ghost" className="h-7 min-w-[88px] justify-between rounded-md bg-surface-secondary/55 px-2 text-[11px]" isDisabled={!canEditTask}>
                                                                    <span className="flex items-center gap-2 truncate">
                                                                        <span className={`h-1.5 w-1.5 rounded-full ${getStatusTokenDotClass(currentStatusOption.colorToken)}`} />
                                                                        {currentStatusOption.label}
                                                                    </span>
                                                                    <ChevronDown size={12} />
                                                                </Button>
                                                            </Dropdown.Trigger>
                                                            <Dropdown.Popover placement="bottom end">
                                                                <Dropdown.Menu>
                                                                    {resolvedStatusOptions.map((status) => (
                                                                        <Dropdown.Item key={status.id} id={status.id} textValue={status.label} onAction={() => handleUpdateStatus(status.key)}>
                                                                            <span className="flex items-center gap-2">
                                                                                <span className={`h-2 w-2 rounded-full ${getStatusTokenDotClass(status.colorToken)}`} />
                                                                                {status.label}
                                                                            </span>
                                                                        </Dropdown.Item>
                                                                    ))}
                                                                </Dropdown.Menu>
                                                            </Dropdown.Popover>
                                                        </Dropdown>
                                                    </div>

                                                    <div className="flex items-center justify-between gap-3">
                                                        <Label className="text-[11px] font-medium text-muted-foreground">Priority</Label>
                                                        <Dropdown>
                                                            <Dropdown.Trigger>
                                                                <Button variant="ghost" className="h-7 min-w-[88px] justify-between rounded-md bg-surface-secondary/55 px-2 text-[11px]" isDisabled={!canEditTask}>
                                                                    <span className={`truncate ${currentPriorityOption?.className || 'text-muted-foreground'}`}>
                                                                        {currentPriorityOption?.label || 'None'}
                                                                    </span>
                                                                    <ChevronDown size={12} />
                                                                </Button>
                                                            </Dropdown.Trigger>
                                                            <Dropdown.Popover placement="bottom end">
                                                                <Dropdown.Menu>
                                                                    {priorityOptions.map((priority) => (
                                                                        <Dropdown.Item key={priority.id} id={priority.id} textValue={priority.label} onAction={() => handleUpdatePriority(priority.id)}>
                                                                            <span className={priority.className}>{priority.label}</span>
                                                                        </Dropdown.Item>
                                                                    ))}
                                                                </Dropdown.Menu>
                                                            </Dropdown.Popover>
                                                        </Dropdown>
                                                    </div>
                                                </div>

                                                <div className="flex min-w-0 flex-col gap-1.5">
                                                    <Label className="text-[11px] font-medium text-muted-foreground">Due date</Label>
                                                    <DatePicker
                                                        value={deadlineDraft}
                                                        onChange={handleDeadlineDateChange}
                                                        granularity="minute"
                                                        isDisabled={!canEditTask}
                                                        className="w-full min-w-0"
                                                    >
                                                        <DateField.Group className="h-8 w-full min-w-0 rounded-md border border-border/70 bg-surface-secondary/55 px-2 text-[11px]">
                                                            <DateField.Prefix>
                                                                <CalendarIcon size={12} className="text-muted-foreground" />
                                                            </DateField.Prefix>
                                                            <DateField.Input>
                                                                {(segment) => <DateField.Segment segment={segment} />}
                                                            </DateField.Input>
                                                            <DateField.Suffix>
                                                                <DatePicker.Trigger aria-label="Open date and time picker" className="ml-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-tertiary hover:text-foreground">
                                                                    <CalendarIcon size={13} />
                                                                </DatePicker.Trigger>
                                                            </DateField.Suffix>
                                                        </DateField.Group>
                                                        <DatePicker.Popover className="max-w-[calc(100vw-2rem)]">
                                                            <Calendar>
                                                                <Calendar.Header>
                                                                    <Button slot="previous" variant="ghost" isIconOnly size="sm"><ChevronLeft size={16} /></Button>
                                                                    <Calendar.Heading />
                                                                    <Button slot="next" variant="ghost" isIconOnly size="sm"><ChevronRight size={16} /></Button>
                                                                </Calendar.Header>
                                                                <Calendar.Grid className="w-full">
                                                                    <Calendar.GridHeader>
                                                                        {(day) => <Calendar.HeaderCell className="pb-1 text-center text-[11px] font-medium text-muted-foreground">{day.slice(0, 2)}</Calendar.HeaderCell>}
                                                                    </Calendar.GridHeader>
                                                                    <Calendar.GridBody>
                                                                        {(date) => (
                                                                            <Calendar.Cell
                                                                                date={date}
                                                                                className="mx-auto aspect-square w-full max-w-8 rounded-lg text-xs hover:bg-accent/10 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[today=true]:ring-1 data-[today=true]:ring-accent"
                                                                            >
                                                                                {({ formattedDate }) => formattedDate}
                                                                            </Calendar.Cell>
                                                                        )}
                                                                    </Calendar.GridBody>
                                                                </Calendar.Grid>
                                                            </Calendar>
                                                            <div className="border-t border-border p-3">
                                                                <TimeField value={deadlineTime} onChange={handleDeadlineTimeChange} className="gap-2">
                                                                    <Label className="text-xs text-muted-foreground">Time</Label>
                                                                    <TimeField.Group variant="secondary">
                                                                        <TimeField.Input>
                                                                            {(segment) => <TimeField.Segment segment={segment} />}
                                                                        </TimeField.Input>
                                                                    </TimeField.Group>
                                                                </TimeField>
                                                                <Button
                                                                    variant="primary"
                                                                    size="sm"
                                                                    className="mt-3 h-8 w-full rounded-lg text-xs"
                                                                    isDisabled={!deadlineDraft}
                                                                    onPress={() => void handleUpdateDeadline(deadlineDraft)}
                                                                >
                                                                    Save due date
                                                                </Button>
                                                            </div>
                                                        </DatePicker.Popover>
                                                    </DatePicker>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <Label className="text-[11px] font-medium text-muted-foreground">Tags</Label>
                                                    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/70 bg-surface-secondary/40 p-1.5">
                                                        {currentTags.length > 0 && (
                                                            <TagGroup size="sm" onRemove={handleRemoveTags}>
                                                                <TagGroup.List className="flex flex-wrap gap-1">
                                                                    {currentTags.map((tag) => (
                                                                        <Tag key={tag} id={tag} className="rounded-md text-[11px]">
                                                                            {tag}
                                                                        </Tag>
                                                                    ))}
                                                                </TagGroup.List>
                                                            </TagGroup>
                                                        )}
                                                        <ComboBox
                                                            allowsCustomValue
                                                            className="min-w-[88px] flex-1"
                                                            inputValue={tagSearchValue}
                                                            menuTrigger="focus"
                                                            onInputChange={setTagSearchValue}
                                                        >
                                                            <Label className="sr-only">Tags</Label>
                                                            <ComboBox.InputGroup className="h-6 border-0 bg-transparent shadow-none">
                                                                <Input
                                                                    placeholder={currentTags.length > 0 ? 'Add tag' : 'Add a tag'}
                                                                    className="h-6 border-0 bg-transparent px-1 text-[11px] shadow-none"
                                                                    onKeyDown={(event) => {
                                                                        if (event.key === 'Enter' || event.key === ',') {
                                                                            event.preventDefault();
                                                                            void commitTagDraft(tagSearchValue);
                                                                        }
                                                                    }}
                                                                />
                                                                <ComboBox.Trigger className="mr-1 text-muted-foreground/60" />
                                                            </ComboBox.InputGroup>
                                                            <ComboBox.Popover className="rounded-xl border border-border bg-surface p-2 shadow-lg">
                                                                <ListBox
                                                                    className="max-h-48"
                                                                    renderEmptyState={() => <EmptyState>No matching tags. Press comma or Enter to create one.</EmptyState>}
                                                                >
                                                                    {filteredAutocompleteTags.map((tag) => (
                                                                        <ListBox.Item key={tag} id={tag} textValue={tag} onAction={() => { void commitTagDraft(tag); }}>
                                                                            #{tag}<ListBox.ItemIndicator />
                                                                        </ListBox.Item>
                                                                    ))}
                                                                </ListBox>
                                                            </ComboBox.Popover>
                                                        </ComboBox>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <Label className="text-[11px] font-medium text-muted-foreground">Dependencies</Label>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-6 px-2 rounded-lg text-[11px] text-accent"
                                                            onPress={() => setShowDepPicker(v => !v)}
                                                        >
                                                            <Plus size={11} className="mr-1" />
                                                            Add
                                                        </Button>
                                                    </div>
                                                    {showDepPicker && (
                                                        <div className="rounded-lg border border-border bg-surface-secondary overflow-hidden max-h-32 overflow-y-auto">
                                                            {projectTasks.filter(t => !(task.dependencies || []).includes(t.id)).length === 0 ? (
                                                                <p className="p-3 text-[11px] text-muted-foreground">No other tasks available</p>
                                                            ) : (
                                                                projectTasks
                                                                    .filter(t => !(task.dependencies || []).includes(t.id))
                                                                    .map(t => (
                                                                        <Button
                                                                            key={t.id}
                                                                            variant="ghost"
                                                                            className="h-auto w-full justify-start gap-2 rounded-none px-3 py-2 text-[12px]"
                                                                            onPress={() => handleAddDependency(t.id)}
                                                                        >
                                                                            <Link2 size={10} className="text-muted-foreground shrink-0" />
                                                                            <span className="truncate">{t.title}</span>
                                                                        </Button>
                                                                    ))
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="space-y-1">
                                                        {(task.dependencies || []).length === 0 ? (
                                                            <p className="text-[11px] text-muted-foreground/60">No dependencies</p>
                                                        ) : (
                                                            (task.dependencies || []).map(depId => {
                                                                const depTask = projectTasks.find(t => t.id === depId);
                                                                return (
                                                                    <div key={depId} className="flex items-center gap-2 rounded-lg border border-border bg-surface-secondary/30 px-2 py-1.5">
                                                                        <Link2 size={10} className="text-muted-foreground shrink-0" />
                                                                        <span className="flex-1 truncate text-[12px] text-foreground">{depTask?.title || 'Unknown task'}</span>
                                                                        <Button
                                                                            variant="ghost"
                                                                            isIconOnly
                                                                            className="h-6 w-6 rounded-md text-muted-foreground hover:text-danger"
                                                                            onPress={() => handleRemoveDependency(depId)}
                                                                        >
                                                                            <X size={10} />
                                                                        </Button>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label className="text-[11px] font-medium text-muted-foreground">Recurrence</Label>
                                                    <div className="space-y-2 rounded-md border border-border/60 bg-surface-secondary/30 p-2.5">
                                                        <div className="flex flex-wrap gap-1">
                                                            {(['none', 'daily', 'weekly', 'monthly'] as const).map(type => (
                                                                <Button
                                                                    key={type}
                                                                    size="sm"
                                                                    variant={(type === 'none' ? !recurrence : recurrence?.type === type) ? 'primary' : 'secondary'}
                                                                    className="h-7 rounded-lg px-2.5 text-[11px] font-medium"
                                                                    onPress={() => {
                                                                        if (type === 'none') { handleSaveRecurrence(null); }
                                                                        else { handleSaveRecurrence({ type, interval: 1 }); }
                                                                    }}
                                                                >
                                                                    {type === 'none' ? 'None' : type.charAt(0).toUpperCase() + type.slice(1)}
                                                                </Button>
                                                            ))}
                                                        </div>
                                                        {recurrence && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[11px] text-muted-foreground">Every</span>
                                                                <Input
                                                                    type="number"
                                                                    min={1}
                                                                    max={99}
                                                                    value={recurrence.interval}
                                                                    onChange={e => {
                                                                        const interval = Math.max(1, parseInt(e.target.value, 10) || 1);
                                                                        const updated = { ...recurrence, interval };
                                                                        setRecurrence(updated);
                                                                        handleSaveRecurrence(updated);
                                                                    }}
                                                                    variant="secondary"
                                                                    className="w-16 rounded-lg text-center text-[12px]"
                                                                />
                                                                <span className="text-[11px] text-muted-foreground">
                                                                    {recurrence.type === 'daily' ? (recurrence.interval === 1 ? 'day' : 'days') :
                                                                     recurrence.type === 'weekly' ? (recurrence.interval === 1 ? 'week' : 'weeks') :
                                                                     recurrence.interval === 1 ? 'month' : 'months'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <h4 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><FileText size={13} /> Attachments</h4>
                                                <input ref={attachmentInputRef} type="file" className="hidden" onChange={handleUploadFile} />
                                                <Button size="sm" variant="ghost" className="h-6 rounded-lg px-2 text-[11px] text-accent" isPending={isUploadingFile} onPress={() => attachmentInputRef.current?.click()}><FolderUp size={11} className="mr-1" />Upload</Button>
                                            </div>
                                            <div className="space-y-2">
                                                {taskFiles.length === 0 ? <div className="rounded-lg border border-dashed border-border/40 bg-surface-secondary/20 px-3 py-4 text-center text-[11px] text-muted-foreground/60">No files attached to this task yet.</div> : taskFiles.map((file) => <TaskAttachmentRow key={file.id} file={file} resolveFileName={resolveFileName} onDownload={() => handleDownloadFile(file)} onDelete={() => handleDeleteFile(file.id)} />)}
                                            </div>
                                        </div>

                                        {/*
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-medium text-foreground flex items-center gap-2">
                                                    <MessageCircle size={14} /> Updates
                                                </h4>
                                            </div>

                                            <div className="space-y-4">
                                                    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
                                                        <div className="flex items-center justify-between">
                                                            <h5 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Comments</h5>
                                                            <span className="text-[11px] text-muted-foreground">{comments.length}</span>
                                                        </div>
                                                        {comments.length === 0 ? (
                                                            <div className="rounded-lg border border-dashed border-border/30 px-3 py-5 text-center text-[11px] text-muted-foreground/60">
                                                                No team comments yet.
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-3">
                                                                {comments.map((comment) => {
                                                                    const mentionedMembers = projectMembers.filter((member) => comment.mentionedUserIds?.includes(member.userId));
                                                                    return (
                                                                        <div key={comment.id} className="flex items-start gap-2.5">
                                                                            <Avatar size="sm" color="accent" variant="soft" className="mt-0.5 shrink-0">
                                                                                <Avatar.Fallback>{comment.userName.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                                                            </Avatar>
                                                                            <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-surface-secondary/30 px-3 py-2.5">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="min-w-0 truncate text-[12px] font-medium text-foreground">{comment.userName}</span>
                                                                                    <span className="shrink-0 text-[11px] text-muted-foreground">{dayjs(comment.createdAt).fromNow()}</span>
                                                                                    {comment.userId === user?.id && (
                                                                                        <Button variant="ghost" isIconOnly className="ml-auto h-6 w-6 rounded-md text-muted-foreground hover:text-danger" onPress={() => handleDeleteComment(comment.id)}>
                                                                                            <Trash size={11} />
                                                                                        </Button>
                                                                                    )}
                                                                                </div>
                                                                                <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">{comment.body}</p>
                                                                                {mentionedMembers.length > 0 && (
                                                                                    <TagGroup className="mt-2">
                                                                                        <TagGroup.List className="flex flex-wrap gap-1">
                                                                                            {mentionedMembers.map((member) => <Tag key={member.userId} id={member.userId} className="rounded-md text-[10px]">@{member.name.split(' ')[0]}</Tag>)}
                                                                                        </TagGroup.List>
                                                                                    </TagGroup>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                        <form onSubmit={handleCreateComment} className="space-y-2">
                                                            <div className="relative">
                                                                <TextArea
                                                                    value={newComment}
                                                                    onChange={(e) => setNewComment(e.target.value)}
                                                                    placeholder="Add a comment for the team..."
                                                                    rows={3}
                                                                    variant="secondary"
                                                                    className="w-full resize-none rounded-xl pb-10 text-xs"
                                                                />
                                                                <Button type="submit" size="sm" variant="primary" className="absolute bottom-2 right-2 h-7 rounded-md px-3 text-xs">
                                                                    Comment
                                                                </Button>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                {mentionableMembers.length > 0 && (
                                                                    <Dropdown>
                                                                        <Dropdown.Trigger>
                                                                            <Button type="button" size="sm" variant="ghost" className="h-6 rounded-md px-2 text-[11px] text-muted-foreground">
                                                                                <AtSign size={11} /> Mention <ChevronDown size={11} />
                                                                            </Button>
                                                                        </Dropdown.Trigger>
                                                                        <Dropdown.Popover placement="top start" className="min-w-[220px]">
                                                                            <Dropdown.Menu>
                                                                                {mentionableMembers.map((member) => (
                                                                                    <Dropdown.Item key={member.userId} id={member.userId} textValue={member.name} onAction={() => toggleMention(member.userId)}>
                                                                                        <div className="flex items-center gap-2">
                                                                                            <Avatar size="sm" color="accent" variant="soft"><Avatar.Fallback>{member.name.slice(0, 1).toUpperCase()}</Avatar.Fallback></Avatar>
                                                                                            <div className="min-w-0"><div className="truncate text-sm">{member.name}</div><div className="truncate text-xs text-muted-foreground">{member.email}</div></div>
                                                                                        </div>
                                                                                    </Dropdown.Item>
                                                                                ))}
                                                                            </Dropdown.Menu>
                                                                        </Dropdown.Popover>
                                                                    </Dropdown>
                                                                )}
                                                                {mentionedUserIds.length > 0 && (
                                                                    <TagGroup onRemove={(keys) => setMentionedUserIds((current) => current.filter((userId) => !keys.has(userId)))}>
                                                                        <TagGroup.List className="flex flex-wrap gap-1">
                                                                            {mentionableMembers.filter((member) => mentionedUserIds.includes(member.userId)).map((member) => <Tag key={member.userId} id={member.userId} className="rounded-md text-[10px]">@{member.name.split(' ')[0]}</Tag>)}
                                                                        </TagGroup.List>
                                                                    </TagGroup>
                                                                )}
                                                            </div>
                                                        </form>
                                                    </div>

                                                    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
                                                        <div className="flex items-center justify-between">
                                                            <h5 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Activity</h5>
                                                            <span className="text-[11px] text-muted-foreground">{taskActivity.length}</span>
                                                        </div>
                                                        {taskActivity.length === 0 ? (
                                                            <div className="rounded-lg border border-dashed border-border/30 px-3 py-5 text-center text-[11px] text-muted-foreground/60">
                                                                No recent task activity yet.
                                                            </div>
                                                        ) : (
                                                            taskActivity.map((item) => (
                                                                <div key={item.id} className="rounded-lg border border-border/60 bg-surface-secondary/30 px-3 py-2">
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <div className="min-w-0">
                                                                            <div className="text-[12px] font-medium text-foreground truncate">
                                                                                {item.userName || 'Teammate'} · {item.type}
                                                                            </div>
                                                                            <div className="text-[11px] text-muted-foreground truncate">
                                                                                {item.entityType} {item.metadata ? `· ${item.metadata}` : ''}
                                                                            </div>
                                                                        </div>
                                                                        <span className="text-[11px] text-muted-foreground shrink-0">{dayjs(item.createdAt).format('MMM D, HH:mm')}</span>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>

                                                    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
                                                        <h5 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Internal notes</h5>
                                                        {parsedNotes.length === 0 ? (
                                                            <div className="py-12 text-center border border-dashed border-border/30 rounded-lg">
                                                                <Email size={24} className="mx-auto text-muted-foreground/20 mb-2" />
                                                                <p className="text-xs text-muted-foreground/50">No notes yet</p>
                                                            </div>
                                                        ) : (
                                                            parsedNotes.map((note) => (
                                                                <div key={note.originalIndex} className="relative pl-6 pb-4 border-l border-border/20 last:pb-0 group">
                                                                    <div className={`absolute left-[-5px] top-1.5 size-2 rounded-full border-2 border-surface ${
                                                                        note.type === 'email' ? 'bg-accent' : note.type === 'call' ? 'bg-success' : 'bg-warning'
                                                                    }`} />
                                                                    
                                                                    <div className="p-3 rounded-xl bg-surface-secondary/40 border border-border group-hover:border-warning/30 transition-all">
                                                                        <div className="flex items-center justify-between mb-2">
                                                                            <div className="flex items-center gap-2">
                                                                                {note.type === 'email' && <Email size={10} className="text-accent" />}
                                                                                {note.type === 'call' && <Phone size={10} className="text-success" />}
                                                                                {note.type === 'note' && <MessageCircle size={10} className="text-warning" />}
                                                                                <span className="text-xs text-muted-foreground/60">
                                                                                    {dayjs(note.date).fromNow()}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                <Button 
                                                                                    variant="ghost" 
                                                                                    isIconOnly 
                                                                                    size="sm" 
                                                                                    className="h-6 w-6 rounded-xl text-muted-foreground hover:text-foreground"
                                                                                    onPress={() => handleEditNote(note.originalIndex)}
                                                                                >
                                                                                    <Edit size={10} />
                                                                                </Button>
                                                                                <Button 
                                                                                    variant="ghost" 
                                                                                    isIconOnly 
                                                                                    size="sm" 
                                                                                    className="h-6 w-6 rounded-xl text-muted-foreground hover:text-danger"
                                                                                    onPress={() => handleDeleteNote(note.originalIndex)}
                                                                                >
                                                                                    <Trash size={10} />
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                        <p className="text-xs font-medium text-foreground leading-relaxed whitespace-pre-wrap">{note.text}</p>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                        <form onSubmit={handleAddNote} className="space-y-3 border-t border-border pt-4">
                                                            <div className="flex gap-2">
                                                                <Button 
                                                                    size="sm" 
                                                                    variant={noteType === 'note' ? 'secondary' : 'ghost'} 
                                                                    className="flex-1 text-xs h-7"
                                                                    onPress={() => setNoteType('note')}
                                                                >
                                                                    Note
                                                                </Button>
                                                                <Button 
                                                                    size="sm" 
                                                                    variant={noteType === 'email' ? 'secondary' : 'ghost'} 
                                                                    className="flex-1 text-xs h-7"
                                                                    onPress={() => setNoteType('email')}
                                                                >
                                                                    Email
                                                                </Button>
                                                                <Button 
                                                                    size="sm" 
                                                                    variant={noteType === 'call' ? 'secondary' : 'ghost'} 
                                                                    className="flex-1 text-xs h-7"
                                                                    onPress={() => setNoteType('call')}
                                                                >
                                                                    Call
                                                                </Button>
                                                            </div>
                                                            <div className="relative">
                                                                <TextArea
                                                                    value={newNote}
                                                                    onChange={(e) => setNewNote(e.target.value)}
                                                                    placeholder={editingNoteIndex !== null ? "Edit note..." : `Add ${noteType}...`}
                                                                    rows={5}
                                                                    variant="secondary"
                                                                    className="w-full resize-none rounded-xl text-xs"
                                                                />
                                                                <Button 
                                                                    type="submit" 
                                                                    variant="primary" 
                                                                    size="sm" 
                                                                    className="absolute bottom-3 right-3 rounded-md text-xs h-7"
                                                                >
                                                                    {editingNoteIndex !== null ? 'Update' : 'Save'}
                                                                </Button>
                                                            </div>
                                                        </form>
                                                    </div>
                                                </div>
                                        </div>
                                        */}
                                    </div>
                                    </ScrollShadow>
                                </div>
                            </div>
                        </Modal.Body>
                        <Modal.Footer className="px-5 py-3 bg-surface border-t border-border">
                            <Button slot="close" variant="secondary" className="rounded-xl h-8 px-4 text-xs">
                                Close
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}

function TaskAttachmentRow({
    file,
    resolveFileName,
    onDownload,
    onDelete,
}: {
    file: ProjectFile;
    resolveFileName: (file: ProjectFile) => Promise<string>;
    onDownload: () => void;
    onDelete: () => void;
}) {
    const [displayName, setDisplayName] = useState(file.encryptedName);

    useEffect(() => {
        let ignore = false;
        const loadName = async () => {
            const nextName = await resolveFileName(file);
            if (!ignore) {
                setDisplayName(nextName);
            }
        };
        void loadName();
        return () => {
            ignore = true;
        };
    }, [file, resolveFileName]);

    return (
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-secondary/20 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-secondary text-muted-foreground">
                <FileText size={14} />
            </div>
            <div className="min-w-0 flex-1">
                <Button
                    type="button"
                    variant="ghost"
                    className="h-auto justify-start truncate px-0 py-0 text-left text-[12px] font-medium text-foreground hover:text-accent"
                    onPress={onDownload}
                >
                    {displayName}
                </Button>
                <div className="text-[11px] text-muted-foreground">
                    {Math.max(1, Math.round(file.sizeBytes / 1024))} KB
                    {file.uploaderName ? ` · ${file.uploaderName}` : ''}
                </div>
            </div>
            <Button
                variant="ghost"
                isIconOnly
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-danger"
                onPress={onDelete}
            >
                <Trash size={12} />
            </Button>
        </div>
    );
}
