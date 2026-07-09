'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptBytes, decryptData, decryptDocumentKey, encryptBytes, encryptData } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { collectTaskTags, normalizeTaskTags } from '@/services/frontend/lib/task-filters';
import { wsClient, WSEvent } from '@/services/frontend/lib/ws';
import { ActivityLog, PresenceSession, Project, ProjectFile, ProjectMember, Task, TaskAssignee, TaskComment } from '@/services/frontend/types';
import {
    Avatar,
    Button,
    Calendar,
    Checkbox,
    ComboBox,
    DateField,
    DatePicker,
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
    toast,
    useFilter
} from '@heroui/react';
import { parseAbsoluteToLocal } from "@internationalized/date";
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import { saveAs } from 'file-saver';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, FileText, FolderUp, Pencil as Edit, Mail as Email, GitBranch, History, Link2, MessageCircle, Phone, Plus, RefreshCw, Trash2 as Trash, UserPlus, Users, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

dayjs.extend(duration);
dayjs.extend(relativeTime);

interface TaskDetailModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    task: Task;
    projectId: string;
    onUpdate: () => void;
}

export function TaskDetailModal({ isOpen, onOpenChange, task, projectId, onUpdate }: TaskDetailModalProps) {
    const { user, privateKey } = useAuth();
    const { contains } = useFilter({ sensitivity: 'base' });
    const [documentKey, setDocumentKey] = useState<CryptoKey | null>(null);
    const [subtasks, setSubtasks] = useState<Task[]>([]);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const [newNote, setNewNote] = useState('');
    const [tagSearchValue, setTagSearchValue] = useState('');
    const [noteType, setNoteType] = useState<'note' | 'email' | 'call'>('note');
    const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState(task.title);
    const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
    const [editedSubtaskTitle, setEditedSubtaskTitle] = useState('');
    const [projectTasks, setProjectTasks] = useState<Task[]>([]);
    const [projectTags, setProjectTags] = useState<string[]>([]);
    const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
    const [projectRole, setProjectRole] = useState<Project['role'] | null>(null);
    const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
    const [comments, setComments] = useState<TaskComment[]>([]);
    const [taskActivity, setTaskActivity] = useState<ActivityLog[]>([]);
    const [presence, setPresence] = useState<PresenceSession[]>([]);
    const [newComment, setNewComment] = useState('');
    const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
    const [taskFiles, setTaskFiles] = useState<ProjectFile[]>([]);
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const [showDepPicker, setShowDepPicker] = useState(false);
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
                        return { ...st, title: decryptedTitle };
                    } catch {
                        return { ...st, title: 'Decryption Error' };
                    }
                }
                return st;
            }));

            setSubtasks(filteredSubtasks);

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
            const [fileRes, memberRes, assigneeRes, commentRes, activityRes, presenceRes] = await Promise.all([
                db.listTaskFiles(task.id),
                db.listProjectMembers(projectId),
                db.listTaskAssignees(task.id),
                db.listTaskComments(task.id),
                db.listTaskActivity(task.id),
                db.heartbeatTaskPresence(task.id),
            ]);
            setTaskFiles(fileRes.documents);
            setProjectMembers(memberRes.documents);
            setAssignees(assigneeRes.documents);
            setTaskActivity(activityRes.documents);
            setPresence(presenceRes.documents);

            const decryptedComments = await Promise.all(commentRes.documents.map(async (comment) => {
                if (!comment.isEncrypted || !docKey) {
                    return comment;
                }
                try {
                    const decryptedBody = await decryptData(JSON.parse(comment.body), docKey);
                    return { ...comment, body: decryptedBody };
                } catch {
                    return { ...comment, body: 'Secure comment' };
                }
            }));
            setComments(decryptedComments);
        } catch (error) {
            console.error('Failed to fetch task details:', error);
        }
    }, [isOpen, projectId, task.id, task.isEncrypted, privateKey, user, documentKey]);

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
        if (!newSubtaskTitle.trim()) return;

        const originalTitle = newSubtaskTitle;
        const optimisticId = `temp-${Date.now()}`;
        
        // Optimistic update
        const newTask: Task = {
            id: optimisticId,
            createdAt: new Date().toISOString(),
            title: originalTitle,
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
            await db.createEmptyTask(projectId, finalTitle, subtasks.length, !!task.isEncrypted, task.id, 'todo');
            // Realtime will handle the state sync
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleUpdateDeadline = async (val: any) => {
        try {
            const dateStr = val && typeof val.toAbsoluteString === 'function' 
                ? val.toAbsoluteString() 
                : val?.toString();
            await db.updateTask(task.id, { deadline: dateStr });
            onUpdate();
            toast.success('Deadline updated');
        } catch (error) {
            console.error('Failed to update deadline:', error);
            toast.danger('Failed to update deadline');
        }
    };

    const handleAddNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newNote.trim()) return;

        const existingNotes = task.notes || [];

        try {
            if (editingNoteIndex !== null) {
                const updatedNotes = [...existingNotes];
                const parsedNote = JSON.parse(updatedNotes[editingNoteIndex]);
                parsedNote.text = newNote;
                parsedNote.type = noteType;
                updatedNotes[editingNoteIndex] = JSON.stringify(parsedNote);
                await db.updateTask(task.id, { notes: updatedNotes });
                setEditingNoteIndex(null);
                toast.success('Note updated');
            } else {
                const note = {
                    date: new Date().toISOString(),
                    text: newNote,
                    type: noteType
                };
                const updatedNotes = [...existingNotes, JSON.stringify(note)];
                const updateData: Partial<Task> = { notes: updatedNotes };
                
                if (noteType === 'email' || noteType === 'call') {
                    updateData.kanbanStatus = 'waiting';
                }
                await db.updateTask(task.id, updateData);
                toast.success('Note added');
            }
            setNewNote('');
            onUpdate();
        } catch (error) {
            console.error('Failed to handle note:', error);
            toast.danger('Failed to save note');
        }
    };

    const handleDeleteNote = async (index: number) => {
        const existingNotes = task.notes || [];
        const updatedNotes = existingNotes.filter((_, i) => i !== index);
        try {
            await db.updateTask(task.id, { notes: updatedNotes });
            onUpdate();
            toast.success('Note deleted');
        } catch (error) {
            console.error('Failed to delete note:', error);
            toast.danger('Delete failed');
        }
    };

    const handleEditNote = (index: number) => {
        const existingNotes = task.notes || [];
        try {
            const note = JSON.parse(existingNotes[index]);
            setNewNote(note.text);
            setNoteType(note.type);
            setEditingNoteIndex(index);
        } catch (e) {
            console.error('Failed to parse note for editing:', e);
        }
    };

    const formatTime = (seconds: number) => {
        const dur = dayjs.duration(seconds, 'seconds');
        if (seconds >= 3600) {
            return `${Math.floor(dur.asHours())}h ${dur.minutes()}m`;
        }
        return `${dur.minutes()}m ${dur.seconds()}s`;
    };

    const parsedNotes = (task.notes || []).map((n, index) => {
        try {
            return { ...(JSON.parse(n) as { date: string, text: string, type: 'note' | 'email' | 'call' }), originalIndex: index };
        } catch {
            return { date: new Date().toISOString(), text: n, type: 'note' as const, originalIndex: index };
        }
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const currentTags = normalizeTaskTags(task.tags);
    const autocompleteTags = [...new Set([...projectTags, ...currentTags])].sort((left, right) => left.localeCompare(right));
    const filteredAutocompleteTags = autocompleteTags.filter((tag) => !currentTags.includes(tag) && (tagSearchValue.trim() === '' || contains(tag, tagSearchValue.trim())));

    const handleRemoveTags = (keys: Set<React.Key>) => {
        const nextTags = currentTags.filter((tag) => !keys.has(tag));
        void persistTags(nextTags);
    };

    const canEditTask = projectRole === 'owner' || projectRole === 'admin' || projectRole === 'editor';
    const availableAssignees = projectMembers.filter((member) => !assignees.some((assignee) => assignee.userId === member.userId));
    const mentionableMembers = projectMembers.filter((member) => member.userId !== user?.id);

    const toggleMention = (memberId: string) => {
        setMentionedUserIds((current) => current.includes(memberId)
            ? current.filter((id) => id !== memberId)
            : [...current, memberId],
        );
    };

    const handleAssignMember = async (memberId: string) => {
        try {
            const assignee = await db.addTaskAssignee(task.id, memberId);
            setAssignees((current) => [...current.filter((item) => item.userId !== assignee.userId), assignee]);
            toast.success('Assignee added');
        } catch (error) {
            console.error('Failed to assign member:', error);
            toast.danger('Failed to assign teammate');
        }
    };

    const handleRemoveAssignee = async (memberId: string) => {
        try {
            await db.removeTaskAssignee(task.id, memberId);
            setAssignees((current) => current.filter((item) => item.userId !== memberId));
            toast.success('Assignee removed');
        } catch (error) {
            console.error('Failed to remove assignee:', error);
            toast.danger('Failed to remove assignee');
        }
    };

    const handleCreateComment = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!newComment.trim()) return;

        try {
            let body = newComment.trim();
            let isEncrypted = false;
            if (task.isEncrypted && documentKey) {
                const encrypted = await encryptData(body, documentKey);
                body = JSON.stringify(encrypted);
                isEncrypted = true;
            }
            const comment = await db.createTaskComment(task.id, {
                body,
                mentionedUserIds,
                isEncrypted,
            });
            setComments((current) => [...current, { ...comment, body: newComment.trim() }]);
            setNewComment('');
            setMentionedUserIds([]);
            toast.success('Comment added');
        } catch (error) {
            console.error('Failed to create comment:', error);
            toast.danger('Failed to save comment');
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        try {
            await db.deleteTaskComment(task.id, commentId);
            setComments((current) => current.filter((comment) => comment.id !== commentId));
            toast.success('Comment removed');
        } catch (error) {
            console.error('Failed to remove comment:', error);
            toast.danger('Failed to remove comment');
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
                            
                            <div className="w-full space-y-4 pr-8">
                                {isEditingTitle ? (
                                    <form 
                                        onSubmit={(e) => { e.preventDefault(); handleUpdateTitle(); }}
                                        className="w-full flex items-center gap-2"
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
                                    <div className="space-y-3">
                                        <Modal.Heading 
                                            className="text-lg font-semibold text-foreground cursor-pointer hover:text-accent transition-colors flex items-center gap-2 group"
                                            onClick={() => setIsEditingTitle(true)}
                                        >
                                            {task.title}
                                            <Edit size={13} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                                        </Modal.Heading>
                                        {presence.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                <div className="flex -space-x-2">
                                                    {presence.slice(0, 4).map((session) => (
                                                        <Avatar key={session.userId} size="sm" color="accent" variant="soft" className="border border-surface">
                                                            <Avatar.Fallback>{session.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                                        </Avatar>
                                                    ))}
                                                </div>
                                                <span className="text-[11px] text-muted-foreground">{presence.length} viewing now</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Status Pill */}
                                    <div className="flex items-center gap-2 bg-surface-secondary/50 p-1 px-2 rounded-md border border-border">
                                        <div className={`w-1.5 h-1.5 rounded-full ml-1 ${
                                            task.kanbanStatus === 'done' ? 'bg-success' :
                                            task.kanbanStatus === 'review' ? 'bg-warning' :
                                            task.kanbanStatus === 'in-progress' ? 'bg-accent' :
                                            'bg-muted-foreground/40'
                                        }`} />
                                        <span className="text-xs text-foreground/60 pr-1">
                                            {task.kanbanStatus?.replace('-', ' ')}
                                        </span>
                                    </div>

                                    <div className="w-px h-4 bg-border/40" />

                                    {/* Priority Selector */}
                                    <Dropdown>
                                        <Button 
                                            size="sm" 
                                            variant="secondary" 
                                            className={`h-7 px-2 text-xs transition-all rounded-md border border-border ${
                                                task.priority === 'urgent' ? 'text-danger bg-danger/10' :
                                                task.priority === 'high' ? 'text-warning bg-warning/10' :
                                                task.priority === 'medium' ? 'text-accent bg-accent/10' :
                                                'text-muted-foreground/60 bg-surface-secondary/50'
                                            }`}
                                        >
                                            {task.priority || 'Priority'}
                                            <ChevronDown size={12} className="ml-1.5 opacity-40" />
                                        </Button>
                                        <Dropdown.Popover className="rounded-xl border border-border p-1 shadow-lg bg-surface min-w-[120px]">
                                            <Dropdown.Menu 
                                                className="bg-transparent"
                                                onAction={(key) => handleUpdatePriority(key as 'low' | 'medium' | 'high' | 'urgent')}
                                            >
                                                <Dropdown.Item id="low" className="text-xs rounded-md">Low</Dropdown.Item>
                                                <Dropdown.Item id="medium" className="text-xs text-accent rounded-md">Medium</Dropdown.Item>
                                                <Dropdown.Item id="high" className="text-xs text-warning rounded-md">High</Dropdown.Item>
                                                <Dropdown.Item id="urgent" className="text-xs text-danger rounded-md">Urgent</Dropdown.Item>
                                            </Dropdown.Menu>
                                        </Dropdown.Popover>
                                    </Dropdown>

                                    <div className="w-px h-4 bg-border/40" />

                                    {/* Deadline Selector - Redesigned as a prominent pill */}
                                    <div className="flex items-center gap-2 h-8">
                                        <DatePicker 
                                            granularity="minute"
                                            value={task.deadline ? parseAbsoluteToLocal(task.deadline) : undefined}
                                            onChange={handleUpdateDeadline}
                                            className="w-auto"
                                            aria-label="Set deadline"
                                        >
                                            {({ state }) => (
                                                <>
                                                    <DateField.Group className="flex items-center gap-2 px-3 rounded-md h-8 bg-surface-secondary/50 hover:bg-foreground/[0.05] transition-all border border-border group cursor-pointer">
                                                        <CalendarIcon size={14} className="text-muted-foreground/40 group-hover:text-accent transition-colors shrink-0" />
                                                        <DateField.Input className="flex-grow">
                                                            {(segment) => (
                                                                <DateField.Segment 
                                                                    segment={segment} 
                                                                    className="text-xs text-foreground/60 focus:text-accent data-[placeholder=true]:text-muted-foreground/20 selection:bg-accent/20" 
                                                                />
                                                            )}
                                                        </DateField.Input>
                                                        <DateField.Suffix className="ml-2">
                                                            <DatePicker.Trigger className="p-0.5 rounded-xl hover:bg-accent/10 transition-colors">
                                                                <DatePicker.TriggerIndicator className="text-muted-foreground/40 group-hover:text-accent" />
                                                            </DatePicker.Trigger>
                                                        </DateField.Suffix>
                                                    </DateField.Group>
                                                    <DatePicker.Popover className="rounded-xl border border-border p-4 shadow-lg bg-surface min-w-[320px]">
                                                        <Calendar aria-label="Task deadline calendar" className="w-full">
                                                            <Calendar.Header className="flex items-center justify-between mb-4">
                                                                <Calendar.YearPickerTrigger>
                                                                    <div className="flex items-center gap-1 group/trigger px-2 py-1 rounded-xl hover:bg-accent/5 transition-colors cursor-pointer">
                                                                        <Calendar.YearPickerTriggerHeading className="text-xs font-medium text-accent" />
                                                                        <Calendar.YearPickerTriggerIndicator className="opacity-40" />
                                                                    </div>
                                                                </Calendar.YearPickerTrigger>
                                                                <div className="flex gap-2">
                                                                    <Calendar.NavButton slot="previous" className="h-8 w-8 rounded-md bg-surface-secondary hover:bg-accent hover:text-white transition-all flex items-center justify-center">
                                                                        <ChevronLeft size={14} />
                                                                    </Calendar.NavButton>
                                                                    <Calendar.NavButton slot="next" className="h-8 w-8 rounded-md bg-surface-secondary hover:bg-accent hover:text-white transition-all flex items-center justify-center">
                                                                        <ChevronRight size={14} />
                                                                    </Calendar.NavButton>
                                                                </div>
                                                            </Calendar.Header>
                                                            <Calendar.Grid className="w-full">
                                                                <Calendar.GridHeader>
                                                                    {(day) => (
                                                                        <Calendar.HeaderCell className="text-xs text-muted-foreground/50 pb-2">
                                                                            {day.slice(0, 2)}
                                                                        </Calendar.HeaderCell>
                                                                    )}
                                                                </Calendar.GridHeader>
                                                                <Calendar.GridBody>
                                                                    {(date) => (
                                                                        <Calendar.Cell 
                                                                            date={date} 
                                                                            className="text-xs h-8 w-8 rounded-md flex items-center justify-center cursor-pointer transition-all hover:bg-accent/10 data-[selected=true]:bg-accent data-[selected=true]:text-white data-[today=true]:border border-accent/30" 
                                                                            aria-label={date.toString()}
                                                                        />
                                                                    )}
                                                                </Calendar.GridBody>
                                                            </Calendar.Grid>
                                                            <div className="mt-4">
                                                                <Calendar.YearPickerGrid>
                                                                    <Calendar.YearPickerGridBody>
                                                                        {({year}) => (
                                                                            <Calendar.YearPickerCell 
                                                                                year={year} 
                                                                                className="text-xs h-9 rounded-md flex items-center justify-center cursor-pointer transition-all hover:bg-accent/10 data-[selected=true]:bg-accent data-[selected=true]:text-white"
                                                                            />
                                                                        )}
                                                                    </Calendar.YearPickerGridBody>
                                                                </Calendar.YearPickerGrid>
                                                            </div>
                                                        </Calendar>
                                                        <div className="mt-4 pt-4 border-t border-border/10 flex flex-col gap-3">
                                                            <div className="flex items-center justify-between">
                                                                <Label className="text-sm font-medium text-muted-foreground">Set Time</Label>
                                                                <div className="px-2 py-0.5 rounded-md bg-accent/10 text-accent text-xs">24h</div>
                                                            </div>
                                                            <TimeField 
                                                                aria-label="Task deadline time" 
                                                                className="w-full"
                                                                value={state.timeValue}
                                                                onChange={(v) => v && state.setTimeValue(v)}
                                                            >
                                                                <TimeField.Group className="bg-surface-secondary/50 border border-border px-3 py-2 rounded-xl h-9 flex items-center">
                                                                    <TimeField.Input>
                                                                        {(segment) => <TimeField.Segment segment={segment} className="text-xs text-foreground focus:text-accent" />}
                                                                    </TimeField.Input>
                                                                </TimeField.Group>
                                                            </TimeField>
                                                        </div>
                                                    </DatePicker.Popover>
                                                </>
                                            )}
                                        </DatePicker>
                                    </div>

                                    <div className="w-full sm:ml-auto sm:max-w-[320px]">
                                        <div className="flex flex-col gap-2">
                                            <ComboBox
                                                allowsCustomValue
                                                className="w-full"
                                                inputValue={tagSearchValue}
                                                menuTrigger="focus"
                                                onInputChange={setTagSearchValue}
                                            >
                                                <Label className="sr-only">Tags</Label>
                                                <ComboBox.InputGroup className="h-8 rounded-md border border-border bg-surface-secondary/50">
                                                    <Input
                                                        placeholder={currentTags.length > 0 ? 'Add tag' : 'Add or reuse tags'}
                                                        className="text-xs"
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
                                                            <ListBox.Item
                                                                key={tag}
                                                                id={tag}
                                                                textValue={tag}
                                                                onAction={() => {
                                                                    void commitTagDraft(tag);
                                                                }}
                                                            >
                                                                #{tag}
                                                                <ListBox.ItemIndicator />
                                                            </ListBox.Item>
                                                        ))}
                                                    </ListBox>
                                                </ComboBox.Popover>
                                            </ComboBox>

                                            {currentTags.length > 0 && (
                                                <TagGroup size="sm" onRemove={handleRemoveTags}>
                                                    <TagGroup.List>
                                                        {currentTags.map((tag) => (
                                                            <Tag key={tag} id={tag}>
                                                                {tag}
                                                            </Tag>
                                                        ))}
                                                    </TagGroup.List>
                                                </TagGroup>
                                            )}
                                        </div>
                                    </div>
                                            </div>
                            </div>
                        </Modal.Header>
                        <Modal.Body className="min-h-0 flex-1 overflow-hidden p-0">
                            <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
                                {/* Main task work area */}
                                <div className="min-h-0 border-r border-border bg-surface">
                                    <ScrollShadow className="h-full p-5" hideScrollBar>
                                    <div className="h-full flex flex-col gap-6">
                                        <div className="flex-grow flex flex-col gap-4 min-h-0">
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

                                            <ScrollShadow className="flex-1 -mx-2 px-2" hideScrollBar>
                                                <div className="space-y-2">
                                                    {subtasks.length === 0 ? (
                                                        <div className="py-8 text-center border-2 border-dashed border-border/30 rounded-xl">
                                                            <p className="text-xs text-muted-foreground/50">No subtasks yet</p>
                                                        </div>
                                                    ) : (
                                                        [...subtasks].sort((a, b) => Number(a.completed) - Number(b.completed)).map((st) => (
                                                            <div key={st.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-secondary/40 border border-border group hover:border-accent/30 transition-all">
                                                                <Checkbox 
                                                                    isSelected={st.completed} 
                                                                    onChange={(val) => handleUpdateTask(st.id, { completed: val })}
                                                                >
                                                                    <Checkbox.Control className="size-5 rounded-xl border-2">
                                                                        <Checkbox.Indicator />
                                                                    </Checkbox.Control>
                                                                </Checkbox>
                                                                {editingSubtaskId === st.id ? (
                                                                    <Input 
                                                                        autoFocus
                                                                        value={editedSubtaskTitle}
                                                                        onChange={(e) => setEditedSubtaskTitle(e.target.value)}
                                                                        onBlur={() => handleUpdateSubtaskTitle(st)}
                                                                        className="flex-1 bg-surface font-bold text-xs h-8"
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') handleUpdateSubtaskTitle(st);
                                                                            if (e.key === 'Escape') setEditingSubtaskId(null);
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    <span 
                                                                        className={`text-xs transition-all flex-1 cursor-pointer hover:text-accent ${st.completed ? 'line-through text-muted-foreground/40' : 'text-foreground'}`}
                                                                        onClick={() => {
                                                                            setEditingSubtaskId(st.id);
                                                                            setEditedSubtaskTitle(st.title);
                                                                        }}
                                                                    >
                                                                        {st.title}
                                                                    </span>
                                                                )}
                                                                <Button 
                                                                    variant="ghost" 
                                                                    isIconOnly 
                                                                    size="sm" 
                                                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground/30 hover:text-danger hover:bg-danger/10"
                                                                    onPress={() => handleDeleteTask(st.id)}
                                                                >
                                                                    <Trash size={12} />
                                                                </Button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </ScrollShadow>
                                        </div>

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

                                        <div className="pt-6 border-t border-border">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                                    <FileText size={13} className="text-muted-foreground" /> Attachments
                                                </h4>
                                                <input
                                                    ref={attachmentInputRef}
                                                    type="file"
                                                    className="hidden"
                                                    onChange={handleUploadFile}
                                                />
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 px-2 rounded-lg text-[11px] text-accent"
                                                    isPending={isUploadingFile}
                                                    onPress={() => attachmentInputRef.current?.click()}
                                                >
                                                    <FolderUp size={11} className="mr-1" />
                                                    Upload
                                                </Button>
                                            </div>
                                            <div className="space-y-2">
                                                {taskFiles.length === 0 ? (
                                                    <div className="rounded-lg border border-dashed border-border/40 bg-surface-secondary/20 px-3 py-4 text-center text-[11px] text-muted-foreground/60">
                                                        No files attached to this task yet.
                                                    </div>
                                                ) : (
                                                    taskFiles.map((file) => (
                                                        <TaskAttachmentRow
                                                            key={file.id}
                                                            file={file}
                                                            resolveFileName={resolveFileName}
                                                            onDownload={() => handleDownloadFile(file)}
                                                            onDelete={() => handleDeleteFile(file.id)}
                                                        />
                                                    ))
                                                )}
                                            </div>
                                        </div>

                                        <div className="pt-6 border-t border-border">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                                    <Users size={13} className="text-muted-foreground" /> Assignees
                                                </h4>
                                                {canEditTask && availableAssignees.length > 0 && (
                                                    <Dropdown>
                                                        <Dropdown.Trigger>
                                                            <Button size="sm" variant="ghost" className="h-6 px-2 rounded-lg text-[11px] text-accent">
                                                                <UserPlus size={11} className="mr-1" />
                                                                Assign
                                                            </Button>
                                                        </Dropdown.Trigger>
                                                        <Dropdown.Popover placement="bottom end">
                                                            <Dropdown.Menu>
                                                                {availableAssignees.map((member) => (
                                                                    <Dropdown.Item key={member.userId} id={member.userId} textValue={member.name} onAction={() => handleAssignMember(member.userId)}>
                                                                        <div className="flex items-center gap-2">
                                                                            <Avatar size="sm" color="accent" variant="soft">
                                                                                <Avatar.Fallback>{member.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                                                            </Avatar>
                                                                            <div className="min-w-0">
                                                                                <div className="text-sm text-foreground truncate">{member.name}</div>
                                                                                <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                                                                            </div>
                                                                        </div>
                                                                    </Dropdown.Item>
                                                                ))}
                                                            </Dropdown.Menu>
                                                        </Dropdown.Popover>
                                                    </Dropdown>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                {assignees.length === 0 ? (
                                                    <div className="rounded-lg border border-dashed border-border/40 bg-surface-secondary/20 px-3 py-4 text-center text-[11px] text-muted-foreground/60">
                                                        No teammates assigned yet.
                                                    </div>
                                                ) : (
                                                    assignees.map((assignee) => (
                                                        <div key={assignee.userId} className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface-secondary/20 px-3 py-2">
                                                            <Avatar size="sm" color="accent" variant="soft">
                                                                <Avatar.Fallback>{assignee.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
                                                            </Avatar>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-[12px] font-medium text-foreground truncate">{assignee.name}</div>
                                                                <div className="text-[11px] text-muted-foreground truncate">{assignee.email}</div>
                                                            </div>
                                                            {canEditTask && (
                                                                <Button variant="ghost" isIconOnly className="h-7 w-7 rounded-lg text-muted-foreground hover:text-danger" onPress={() => handleRemoveAssignee(assignee.userId)}>
                                                                    <Trash size={12} />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>

                                        {/* Dependencies */}
                                        <div className="pt-6 border-t border-border">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                                    <GitBranch size={13} className="text-muted-foreground" /> Dependencies
                                                </h4>
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
                                                <div className="mb-2 rounded-xl border border-border bg-surface-secondary overflow-hidden max-h-32 overflow-y-auto">
                                                    {projectTasks.filter(t => !(task.dependencies || []).includes(t.id)).length === 0 ? (
                                                        <p className="text-[11px] text-muted-foreground p-3">No other tasks available</p>
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
                                                                    {t.title}
                                                                </Button>
                                                            ))
                                                    )}
                                                </div>
                                            )}
                                            <div className="space-y-1">
                                                {(task.dependencies || []).length === 0 ? (
                                                    <p className="text-[11px] text-muted-foreground/50">No dependencies</p>
                                                ) : (
                                                    (task.dependencies || []).map(depId => {
                                                        const depTask = projectTasks.find(t => t.id === depId);
                                                        return (
                                                            <div key={depId} className="flex items-center gap-2 py-1 px-2 rounded-lg bg-surface-secondary/50 border border-border/60 group">
                                                                <Link2 size={10} className="text-muted-foreground shrink-0" />
                                                                <span className="text-[12px] text-foreground truncate flex-1">{depTask?.title || 'Unknown task'}</span>
                                                                <Button
                                                                    variant="ghost"
                                                                    isIconOnly
                                                                    className="h-5 w-5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-danger"
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

                                        {/* Recurrence */}
                                        <div className="pt-6 border-t border-border">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                                    <RefreshCw size={13} className="text-muted-foreground" /> Recurrence
                                                </h4>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex gap-1 flex-wrap">
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
                                                    <div className="flex items-center gap-2 mt-2">
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
                                    </ScrollShadow>
                                </div>

                                {/* Right Side: properties and communication */}
                                <div className="min-h-0 bg-surface-secondary/25">
                                    <ScrollShadow className="h-full p-5" hideScrollBar>
                                    <div className="h-full flex flex-col gap-6">
                                        <div className="flex-grow flex flex-col gap-4 min-h-0">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-medium text-foreground flex items-center gap-2">
                                                    <MessageCircle size={14} /> Updates
                                                </h4>
                                            </div>

                                            <ScrollShadow className="flex-1 -mx-2 px-2" hideScrollBar>
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
                                                            comments.map((comment) => (
                                                                <div key={comment.id} className="rounded-lg border border-border/60 bg-surface-secondary/30 p-3">
                                                                    <div className="mb-2 flex items-center justify-between gap-3">
                                                                        <div className="min-w-0">
                                                                            <div className="text-[12px] font-medium text-foreground truncate">{comment.userName}</div>
                                                                            <div className="text-[11px] text-muted-foreground">{dayjs(comment.createdAt).fromNow()}</div>
                                                                        </div>
                                                                        {comment.userId === user?.id && (
                                                                            <Button variant="ghost" isIconOnly className="h-6 w-6 rounded-lg text-muted-foreground hover:text-danger" onPress={() => handleDeleteComment(comment.id)}>
                                                                                <Trash size={11} />
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">{comment.body}</p>
                                                                </div>
                                                            ))
                                                        )}
                                                        <form onSubmit={handleCreateComment} className="space-y-2">
                                                            <TextArea
                                                                value={newComment}
                                                                onChange={(e) => setNewComment(e.target.value)}
                                                                placeholder="Add a comment for the team..."
                                                                rows={3}
                                                                variant="secondary"
                                                                className="w-full resize-none rounded-xl text-xs"
                                                            />
                                                            {mentionableMembers.length > 0 && (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {mentionableMembers.map((member) => (
                                                                        <Button
                                                                            key={member.userId}
                                                                            type="button"
                                                                            size="sm"
                                                                            variant={mentionedUserIds.includes(member.userId) ? 'primary' : 'secondary'}
                                                                            className="h-6 rounded-md px-2 text-[11px]"
                                                                            onPress={() => toggleMention(member.userId)}
                                                                        >
                                                                            @{member.name.split(' ')[0]}
                                                                        </Button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div className="flex justify-end">
                                                                <Button type="submit" size="sm" variant="primary" className="h-7 rounded-lg px-3 text-xs">
                                                                    Comment
                                                                </Button>
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
                                                    </div>
                                                </div>
                                            </ScrollShadow>
                                        </div>

                                        <form onSubmit={handleAddNote} className="space-y-3 pt-4 border-t border-border">
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
