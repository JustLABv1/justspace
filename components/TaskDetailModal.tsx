'use client';

import { useAuth } from '@/context/AuthContext';
import { client } from '@/lib/appwrite';
import { decryptData, decryptDocumentKey, encryptData } from '@/lib/crypto';
import { db, DB_ID, TASKS_ID } from '@/lib/db';
import { Task } from '@/types';
import {
    Button,
    Calendar,
    Checkbox,
    Chip,
    DateField,
    DatePicker,
    Dropdown,
    Input,
    Label,
    Modal,
    ScrollShadow,
    TimeField,
    toast
} from '@heroui/react';
import { parseAbsoluteToLocal, ZonedDateTime } from "@internationalized/date";
import {
    AltArrowDown,
    Calendar as CalendarIcon,
    AltArrowLeft as ChevronLeft,
    AltArrowRight as ChevronRight,
    Pen2 as Edit,
    Letter as Email,
    History,
    ChatRoundDots as MessageCircle,
    PhoneCalling as Phone,
    AddCircle as Plus,
    TrashBinMinimalistic as Trash
} from '@solar-icons/react';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useCallback, useEffect, useState } from 'react';

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
    const [documentKey, setDocumentKey] = useState<CryptoKey | null>(null);
    const [subtasks, setSubtasks] = useState<Task[]>([]);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const [newNote, setNewNote] = useState('');
    const [noteType, setNoteType] = useState<'note' | 'email' | 'call'>('note');
    const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState(task.title);
    const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
    const [editedSubtaskTitle, setEditedSubtaskTitle] = useState('');

    // State sync for editing title
    const [prevTaskTitle, setPrevTaskTitle] = useState(task.title);
    if (task.title !== prevTaskTitle) {
        setPrevTaskTitle(task.title);
        setEditedTitle(task.title);
        setIsEditingTitle(false);
    }

    const fetchDetails = useCallback(async () => {
        if (!isOpen) return;
        try {
            // Get decryption key if project is encrypted
            let docKey = documentKey;
            if (task.isEncrypted && privateKey && user && !docKey) {
                try {
                    const access = await db.getAccessKey(projectId, user.$id);
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
            let filteredSubtasks = allTasks.filter(t => t.parentId === task.$id);

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
        } catch (error) {
            console.error('Failed to fetch subtasks:', error);
        }
    }, [isOpen, projectId, task.$id, task.isEncrypted, privateKey, user, documentKey]);

    useEffect(() => {
        const load = async () => {
            await fetchDetails();
        };
        load();
    }, [fetchDetails]);

    useEffect(() => {
        const unsubscribe = client.subscribe([
            `databases.${DB_ID}.collections.${TASKS_ID}.documents`
        ], async (response) => {
            const payload = response.payload as Task;
            if (payload.parentId !== task.$id && payload.$id !== task.$id) return;

            if (response.events.some(e => e.includes('.delete'))) {
                if (payload.$id === task.$id) {
                    onOpenChange(false);
                } else {
                    setSubtasks(prev => prev.filter(s => s.$id !== payload.$id));
                }
                return;
            }

            await fetchDetails();
        });

        return () => unsubscribe();
    }, [task.$id, fetchDetails, onOpenChange]);

    const handleUpdateTask = async (taskId: string, data: Partial<Task>) => {
        // Optimistic update for subtasks
        const previousSubtasks = [...subtasks];
        if (taskId !== task.$id) {
            setSubtasks(prev => prev.map(s => s.$id === taskId ? { ...s, ...data } : s));
        }

        try {
            await db.updateTask(taskId, data);
            // Realtime will trigger fetchDetails and onUpdate eventually
            if ('completed' in data) {
                toast.success(data.completed ? 'Task completed' : 'Task reopened');
            }
        } catch (error) {
            console.error('Failed to update task:', error);
            if (taskId !== task.$id) {
                setSubtasks(previousSubtasks);
            }
            toast.danger('Sync failed');
        }
    };

    const handleAddSubtask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSubtaskTitle.trim()) return;

        const originalTitle = newSubtaskTitle;
        const optimisticId = `temp-${Date.now()}`;
        
        // Optimistic update
        const newTask: Task = {
            $id: optimisticId,
            $createdAt: new Date().toISOString(),
            title: originalTitle,
            projectId,
            completed: false,
            parentId: task.$id,
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
            await db.createEmptyTask(projectId, finalTitle, subtasks.length, !!task.isEncrypted, task.$id, 'todo', user?.$id);
            // Realtime will handle the state sync
            toast.success('Subtask added');
        } catch (error) {
            console.error('Failed to add subtask:', error);
            setSubtasks(prev => prev.filter(s => s.$id !== optimisticId));
            setNewSubtaskTitle(originalTitle);
            toast.danger('Failed to add subtask');
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        const previousSubtasks = [...subtasks];
        if (taskId !== task.$id) {
            setSubtasks(prev => prev.filter(s => s.$id !== taskId));
        }

        try {
            await db.deleteTask(taskId);
            if (taskId === task.$id) {
                onOpenChange(false);
            }
            // Realtime handles the rest
            onUpdate();
            toast.success('Task deleted');
        } catch (error) {
            console.error('Failed to delete task:', error);
            if (taskId !== task.$id) {
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
            await db.updateTask(task.$id, { title: finalTitle });
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
            if (task.isEncrypted && documentKey) {
                const encrypted = await encryptData(editedSubtaskTitle, documentKey);
                finalTitle = JSON.stringify(encrypted);
            }
            await db.updateTask(subtask.$id, { title: finalTitle });
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
            await db.updateTask(task.$id, { priority });
            onUpdate();
            toast.success('Priority updated');
        } catch (error) {
            console.error('Failed to update priority:', error);
            toast.danger('Failed to update priority');
        }
    };

    const handleUpdateDeadline = async (val: ZonedDateTime | null) => {
        try {
            // Using dayjs with the string representation is more robust for conversion
            const dateStr = val ? dayjs(val.toString()).toISOString() : null;
            await db.updateTask(task.$id, { deadline: dateStr });
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
                await db.updateTask(task.$id, { notes: updatedNotes });
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
                await db.updateTask(task.$id, updateData);
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
            await db.updateTask(task.$id, { notes: updatedNotes });
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

    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
            <Modal.Backdrop variant="blur">
                <Modal.Container size="cover">
                    <Modal.Dialog className="bg-surface border border-border/40 overflow-hidden">
                        <Modal.CloseTrigger />
                        <Modal.Header className="flex flex-col gap-6 items-start pb-8">
                            <div className="flex items-center justify-between w-full border-b border-border/10 pb-6">
                                <div className="flex items-center gap-3">
                                    {/* Status Badge */}
                                    <Chip 
                                        size="sm" 
                                        variant="soft" 
                                        color={
                                            task.kanbanStatus === 'done' ? 'success' :
                                            task.kanbanStatus === 'review' ? 'warning' :
                                            task.kanbanStatus === 'in-progress' ? 'accent' :
                                            task.kanbanStatus === 'waiting' ? 'accent' :
                                            'default'
                                        }
                                        className="h-8 px-3 border border-current/10 rounded-2xl"
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                                            task.kanbanStatus === 'done' ? 'bg-success' :
                                            task.kanbanStatus === 'review' ? 'bg-warning' :
                                            task.kanbanStatus === 'in-progress' ? 'bg-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]' :
                                            'bg-muted-foreground/40'
                                        }`} />
                                        <Chip.Label className="text-[10px] font-black tracking-[0.2em] uppercase">
                                            {task.kanbanStatus?.replace('-', ' ')}
                                        </Chip.Label>
                                    </Chip>

                                    {/* Deadline Selector */}
                                    <div className="flex items-center gap-2 bg-foreground/[0.03] border border-border/40 pl-3 pr-1 py-1 rounded-2xl h-8 min-w-[200px]">
                                        <span className="text-[9px] font-black tracking-[0.15em] text-muted-foreground/40 uppercase whitespace-nowrap">Deadline_</span>
                                        <DatePicker 
                                            granularity="minute"
                                            value={task.deadline ? parseAbsoluteToLocal(task.deadline) : null}
                                            onChange={handleUpdateDeadline}
                                            className="w-full"
                                            aria-label="Set deadline"
                                        >
                                            <DateField.Group className="bg-transparent px-1 flex items-center group cursor-pointer">
                                                <DateField.Input className="flex-grow">
                                                    {(segment) => <DateField.Segment segment={segment} className="text-[10px] font-black uppercase tracking-widest text-foreground focus:text-accent data-[placeholder=true]:text-muted-foreground/30 selection:bg-accent/20" />}
                                                </DateField.Input>
                                                <DatePicker.Trigger className="ml-1 opacity-20 group-hover:opacity-100 transition-opacity">
                                                    <CalendarIcon size={12} className="text-muted-foreground group-hover:text-accent transition-colors" />
                                                </DatePicker.Trigger>
                                            </DateField.Group>
                                            <DatePicker.Popover className="rounded-[2rem] border border-border/40 p-4 shadow-2xl backdrop-blur-xl bg-surface/95 min-w-[300px]">
                                                <Calendar aria-label="Task deadline calendar" className="w-full">
                                                    <Calendar.Header className="flex items-center justify-between mb-4">
                                                        <Calendar.YearPickerTrigger className="text-[10px] font-black uppercase tracking-[0.2em] text-accent" />
                                                        <div className="flex gap-2">
                                                            <Calendar.NavButton slot="previous" className="h-8 w-8 rounded-xl bg-foreground/5 hover:bg-accent hover:text-white transition-all flex items-center justify-center">
                                                                <ChevronLeft size={16} weight="Bold" />
                                                            </Calendar.NavButton>
                                                            <Calendar.NavButton slot="next" className="h-8 w-8 rounded-xl bg-foreground/5 hover:bg-accent hover:text-white transition-all flex items-center justify-center">
                                                                <ChevronRight size={16} weight="Bold" />
                                                            </Calendar.NavButton>
                                                        </div>
                                                    </Calendar.Header>
                                                    <Calendar.Grid className="w-full">
                                                        <Calendar.GridHeader>
                                                            {(day) => <Calendar.HeaderCell className="text-[9px] font-black text-muted-foreground/30 uppercase pb-2">{day}</Calendar.HeaderCell>}
                                                        </Calendar.GridHeader>
                                                        <Calendar.GridBody>
                                                            {(date) => (
                                                                <Calendar.Cell 
                                                                    date={date} 
                                                                    className="text-[10px] font-bold h-9 w-9 rounded-xl flex items-center justify-center cursor-pointer transition-all hover:bg-accent/10 data-[selected=true]:bg-accent data-[selected=true]:text-white data-[today=true]:border border-accent/30" 
                                                                />
                                                            )}
                                                        </Calendar.GridBody>
                                                    </Calendar.Grid>
                                                </Calendar>
                                                <div className="mt-4 pt-4 border-t border-border/10 flex flex-col gap-3">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Set Time_</Label>
                                                        <div className="px-2 py-0.5 rounded-md bg-accent/10 text-accent font-black text-[8px] uppercase tracking-widest">24h Format</div>
                                                    </div>
                                                    <TimeField aria-label="Task deadline time" className="w-full">
                                                        <DateField.Group className="bg-foreground/[0.05] border border-border/20 px-3 py-2 rounded-xl h-10 flex items-center">
                                                            <DateField.Input>
                                                                {(segment) => <DateField.Segment segment={segment} className="text-[11px] font-black uppercase tracking-[0.1em] text-foreground focus:text-accent" />}
                                                            </DateField.Input>
                                                        </DateField.Group>
                                                    </TimeField>
                                                </div>
                                            </DatePicker.Popover>
                                        </DatePicker>
                                    </div>

                                    {/* Priority Selector */}
                                    <div className="flex items-center gap-2 bg-foreground/[0.03] border border-border/40 pl-3 pr-1 py-1 rounded-2xl h-8">
                                        <span className="text-[9px] font-black tracking-[0.15em] text-muted-foreground/40 uppercase">Priority</span>
                                        <Dropdown>
                                            <Button 
                                                size="sm" 
                                                variant="secondary" 
                                                className={`h-6 px-2.5 text-[10px] font-black uppercase tracking-widest border transition-all rounded-xl ${
                                                    task.priority === 'urgent' ? 'text-danger bg-danger/10 border-danger/20' :
                                                    task.priority === 'high' ? 'text-warning bg-warning/10 border-warning/20' :
                                                    task.priority === 'medium' ? 'text-accent bg-accent/10 border-accent/20' :
                                                    'text-muted-foreground/60 bg-muted-foreground/10 border-border/10'
                                                }`}
                                            >
                                                {task.priority || 'NONE'}
                                                <AltArrowDown size={14} className="ml-1 opacity-50" />
                                            </Button>
                                            <Dropdown.Popover>
                                                <Dropdown.Menu 
                                                    className="bg-surface border border-border/40 p-1"
                                                    onAction={(key) => handleUpdatePriority(key as 'low' | 'medium' | 'high' | 'urgent')}
                                                >
                                                    <Dropdown.Item id="low" className="text-[10px] font-black uppercase tracking-widest">Low</Dropdown.Item>
                                                    <Dropdown.Item id="medium" className="text-[10px] font-black uppercase tracking-widest text-accent">Medium</Dropdown.Item>
                                                    <Dropdown.Item id="high" className="text-[10px] font-black uppercase tracking-widest text-warning">High</Dropdown.Item>
                                                    <Dropdown.Item id="urgent" className="text-[10px] font-black uppercase tracking-widest text-danger">Urgent</Dropdown.Item>
                                                </Dropdown.Menu>
                                            </Dropdown.Popover>
                                        </Dropdown>
                                    </div>
                                </div>

                                {/* Task Identity (Right Aligned) */}
                                <div className="flex flex-col items-end pr-10">
                                    <span className="text-[8px] font-black tracking-[0.3em] text-muted-foreground/20 uppercase">Identity Reference</span>
                                    <span className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground/40 tabular-nums">#{task.$id.slice(-8).toUpperCase()}</span>
                                </div>
                            </div>
                            
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
                                        className="text-2xl font-black tracking-tight text-foreground leading-tight bg-surface-secondary"
                                    />
                                </form>
                            ) : (
                                <Modal.Heading 
                                    className="text-2xl font-black tracking-tight text-foreground leading-tight cursor-pointer hover:text-accent transition-colors flex items-center gap-2 group"
                                    onClick={() => setIsEditingTitle(true)}
                                >
                                    {task.title}
                                    <Edit size={18} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                                </Modal.Heading>
                            )}
                        </Modal.Header>
                        <Modal.Body className="p-0">
                            <div className="flex flex-col md:flex-row h-full max-h-[70vh]">
                                {/* Left Side: Subtasks */}
                                <div className="flex-1 p-6 border-r border-border/10 bg-surface-secondary/20 h-full">
                                    <div className="h-full flex flex-col gap-6">
                                        <div className="flex-grow flex flex-col gap-4 min-h-0">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-2">
                                                    <Plus size={14} /> Sub Objectives
                                                </h4>
                                                <span className="text-[10px] font-bold text-muted-foreground/40 tracking-widest">{subtasks.filter(s => s.completed).length}/{subtasks.length} Completed</span>
                                            </div>
                                            
                                            <form onSubmit={handleAddSubtask} className="relative group">
                                                <Input 
                                                    placeholder="Add technical milestone..."
                                                    value={newSubtaskTitle}
                                                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                                    className="w-full bg-surface-secondary"
                                                />
                                                <Button 
                                                    type="submit" 
                                                    isIconOnly 
                                                    size="sm" 
                                                    variant="ghost" 
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg opacity-0 group-focus-within:opacity-100 transition-opacity"
                                                >
                                                    <Plus size={16} />
                                                </Button>
                                            </form>

                                            <ScrollShadow className="flex-1 -mx-2 px-2" hideScrollBar>
                                                <div className="space-y-2">
                                                    {subtasks.length === 0 ? (
                                                        <div className="py-8 text-center border-2 border-dashed border-border/10 rounded-2xl">
                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">No sub-objectives defined</p>
                                                        </div>
                                                    ) : (
                                                        subtasks.map((st) => (
                                                            <div key={st.$id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-secondary/40 border border-border/20 group hover:border-accent/20 transition-all">
                                                                <Checkbox 
                                                                    isSelected={st.completed} 
                                                                    onChange={(val) => handleUpdateTask(st.$id, { completed: val })}
                                                                >
                                                                    <Checkbox.Control className="size-5 rounded-lg border-2">
                                                                        <Checkbox.Indicator />
                                                                    </Checkbox.Control>
                                                                </Checkbox>
                                                                {editingSubtaskId === st.$id ? (
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
                                                                        className={`text-xs font-bold transition-all flex-1 cursor-pointer hover:text-accent ${st.completed ? 'line-through text-muted-foreground/30' : 'text-foreground'}`}
                                                                        onClick={() => {
                                                                            setEditingSubtaskId(st.$id);
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
                                                                    onPress={() => handleDeleteTask(st.$id)}
                                                                >
                                                                    <Trash size={12} />
                                                                </Button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </ScrollShadow>
                                        </div>

                                        {task.timeSpent && task.timeSpent > 0 && (
                                            <div className="pt-6 border-t border-border/10">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-2 mb-4">
                                                    <History size={14} /> Efficiency History
                                                </h4>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="p-3 rounded-xl bg-surface border border-border/20">
                                                        <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest mb-1">Total Effort</p>
                                                        <p className="text-lg font-black tracking-tight text-accent font-mono">{formatTime(task.timeSpent)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Side: Communication Log */}
                                <div className="flex-1 p-6 bg-surface">
                                    <div className="h-full flex flex-col gap-6">
                                        <div className="flex-grow flex flex-col gap-4 min-h-0">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-warning flex items-center gap-2">
                                                    <MessageCircle size={14} /> Communication Log
                                                </h4>
                                            </div>

                                            <ScrollShadow className="flex-1 -mx-2 px-2" hideScrollBar>
                                                <div className="space-y-4">
                                                    {parsedNotes.length === 0 ? (
                                                        <div className="py-12 text-center border-2 border-dashed border-border/10 rounded-2xl">
                                                            <Email size={24} className="mx-auto text-muted-foreground/10 mb-2" />
                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">No logged interactions</p>
                                                        </div>
                                                    ) : (
                                                        parsedNotes.map((note) => (
                                                            <div key={note.originalIndex} className="relative pl-6 pb-4 border-l border-border/20 last:pb-0 group">
                                                                <div className={`absolute left-[-5px] top-1.5 size-2 rounded-full border-2 border-surface ${
                                                                    note.type === 'email' ? 'bg-accent' : note.type === 'call' ? 'bg-success' : 'bg-warning'
                                                                }`} />
                                                                
                                                                <div className="p-3 rounded-xl bg-surface-secondary/40 border border-border/20 group-hover:border-warning/20 transition-all">
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <div className="flex items-center gap-2">
                                                                            {note.type === 'email' && <Email size={10} className="text-accent" />}
                                                                            {note.type === 'call' && <Phone size={10} className="text-success" />}
                                                                            {note.type === 'note' && <MessageCircle size={10} className="text-warning" />}
                                                                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">
                                                                                {dayjs(note.date).fromNow()}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <Button 
                                                                                variant="ghost" 
                                                                                isIconOnly 
                                                                                size="sm" 
                                                                                className="h-6 w-6 rounded-lg text-muted-foreground hover:text-foreground"
                                                                                onPress={() => handleEditNote(note.originalIndex)}
                                                                            >
                                                                                <Edit size={10} />
                                                                            </Button>
                                                                            <Button 
                                                                                variant="ghost" 
                                                                                isIconOnly 
                                                                                size="sm" 
                                                                                className="h-6 w-6 rounded-lg text-muted-foreground hover:text-danger"
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
                                            </ScrollShadow>
                                        </div>

                                        <form onSubmit={handleAddNote} className="space-y-3 pt-4 border-t border-border/10">
                                            <div className="flex gap-2">
                                                <Button 
                                                    size="sm" 
                                                    variant={noteType === 'note' ? 'secondary' : 'ghost'} 
                                                    className="flex-1 font-bold text-[9px] uppercase tracking-widest h-8"
                                                    onPress={() => setNoteType('note')}
                                                >
                                                    Note
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant={noteType === 'email' ? 'secondary' : 'ghost'} 
                                                    className="flex-1 font-bold text-[9px] uppercase tracking-widest h-8"
                                                    onPress={() => setNoteType('email')}
                                                >
                                                    Email
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant={noteType === 'call' ? 'secondary' : 'ghost'} 
                                                    className="flex-1 font-bold text-[9px] uppercase tracking-widest h-8"
                                                    onPress={() => setNoteType('call')}
                                                >
                                                    Call
                                                </Button>
                                            </div>
                                            <div className="relative">
                                                <textarea
                                                    value={newNote}
                                                    onChange={(e) => setNewNote(e.target.value)}
                                                    placeholder={editingNoteIndex !== null ? "Modify entry..." : `Log new ${noteType}...`}
                                                    className="w-full h-24 p-3 rounded-xl bg-surface-secondary border border-border/40 focus:border-warning/40 focus:ring-1 focus:ring-warning/20 outline-none transition-all text-xs font-medium resize-none"
                                                />
                                                <Button 
                                                    type="submit" 
                                                    variant="primary" 
                                                    size="sm" 
                                                    className="absolute bottom-3 right-3 rounded-lg font-bold text-[10px] uppercase tracking-widest h-7"
                                                >
                                                    {editingNoteIndex !== null ? 'Update' : 'Commit'}
                                                </Button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </Modal.Body>
                        <Modal.Footer>
                            <Button slot="close" variant="secondary" className="font-bold text-xs uppercase tracking-widest">
                                Close Terminal
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
