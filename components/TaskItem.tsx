'use client';

import { Task } from '@/types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Checkbox, Chip, Input, ScrollShadow, Tooltip } from '@heroui/react';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
    Calendar,
    ChevronDown,
    ChevronRight,
    Clock,
    GripVertical,
    Mail,
    MessageCircle,
    Pause,
    Pen,
    Phone,
    Play,
    Plus,
    Trash2
} from 'lucide-react';
import { useEffect, useState } from 'react';

dayjs.extend(duration);
dayjs.extend(relativeTime);

interface TaskItemProps {
    task: Task;
    onToggle: (id: string, completed: boolean) => void;
    onDelete: (id: string) => void;
    onUpdate: (id: string, data: Partial<Task> & { workDuration?: string }) => void;
    onAddSubtask: (parentId: string, title: string) => void;
    allTasks?: Task[];
    expandedTaskIds?: string[];
    onToggleExpanded?: (id: string) => void;
    onClick?: (task: Task) => void;
    level?: number;
}

export function TaskItem({ 
    task, 
    onToggle, 
    onDelete, 
    onUpdate, 
    onAddSubtask, 
    allTasks = [],
    expandedTaskIds = [],
    onToggleExpanded,
    onClick,
    level = 0
}: TaskItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
    const subtasks = allTasks.filter(t => t.parentId === task.id).sort((a, b) => (a.order || 0) - (b.order || 0));
    const isExpanded = expandedTaskIds.includes(task.id);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const [newNote, setNewNote] = useState('');
    const [noteType, setNoteType] = useState<'note' | 'email' | 'call'>('note');
    const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);
    const [currentTime, setCurrentTime] = useState(task.timeSpent || 0);
    const [prevTaskTime, setPrevTaskTime] = useState(task.timeSpent);

    if (task.timeSpent !== prevTaskTime) {
        setPrevTaskTime(task.timeSpent);
        setCurrentTime(task.timeSpent || 0);
    }

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    useEffect(() => {
        let interval: NodeJS.Timeout | undefined;
        if (task.isTimerRunning && task.timerStartedAt) {
            interval = setInterval(() => {
                const elapsedSinceStart = dayjs().diff(dayjs(task.timerStartedAt), 'second');
                setCurrentTime((task.timeSpent || 0) + elapsedSinceStart);
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [task.isTimerRunning, task.timerStartedAt, task.timeSpent]);

    const handleToggleTimer = () => {
        const now = dayjs();
        if (task.isTimerRunning) {
            const elapsedSinceStart = now.diff(dayjs(task.timerStartedAt), 'second');
            const totalTime = (task.timeSpent || 0) + elapsedSinceStart;
            
            // Record time entry for today
            const today = now.format('YYYY-MM-DD');
            const existingEntries = task.timeEntries || [];
            const newEntries = [...existingEntries];
            
            const todayEntryIndex = newEntries.findIndex(e => JSON.parse(e).date === today);
            if (todayEntryIndex > -1) {
                const entry = JSON.parse(newEntries[todayEntryIndex]);
                entry.seconds += elapsedSinceStart;
                newEntries[todayEntryIndex] = JSON.stringify(entry);
            } else {
                newEntries.push(JSON.stringify({ date: today, seconds: elapsedSinceStart }));
            }

            const dur = dayjs.duration(elapsedSinceStart, 'seconds');
            const workDuration = elapsedSinceStart >= 3600 
                ? `${Math.floor(dur.asHours())}h ${dur.minutes()}m`
                : `${dur.minutes()}m ${dur.seconds()}s`;

            onUpdate(task.id, {
                isTimerRunning: false,
                timeSpent: totalTime,
                timerStartedAt: undefined,
                timeEntries: newEntries,
                workDuration: `Worked ${workDuration}`
            });
        } else {
            onUpdate(task.id, {
                isTimerRunning: true,
                timerStartedAt: now.toISOString()
            });
        }
    };

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const formatLongTime = (seconds: number) => {
        const dur = dayjs.duration(seconds, 'seconds');
        if (seconds >= 3600) {
            return `${Math.floor(dur.asHours())}h ${dur.minutes()}m`;
        }
        return `${dur.minutes()}m ${dur.seconds()}s`;
    };

const parsedTimeEntries = (task.timeEntries || []).map(e => {
        try {
            return JSON.parse(e) as { date: string, seconds: number };
        } catch {
            return { date: dayjs().format('YYYY-MM-DD'), seconds: 0 };
        }
    });

    const handleAddNote = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newNote.trim()) return;

        const existingNotes = task.notes || [];

        if (editingNoteIndex !== null) {
            // Update existing note
            const updatedNotes = [...existingNotes];
            const parsedNote = JSON.parse(updatedNotes[editingNoteIndex]);
            parsedNote.text = newNote;
            parsedNote.type = noteType;
            updatedNotes[editingNoteIndex] = JSON.stringify(parsedNote);
            onUpdate(task.id, { notes: updatedNotes });
            setEditingNoteIndex(null);
        } else {
            // Add new note
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
            onUpdate(task.id, updateData);
        }

        setNewNote('');
    };

    const handleDeleteNote = (index: number) => {
        const existingNotes = task.notes || [];
        const updatedNotes = existingNotes.filter((_, i) => i !== index);
        onUpdate(task.id, { notes: updatedNotes });
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

    const parsedNotes = (task.notes || []).map((n, index) => {
        try {
            return { ...(JSON.parse(n) as { date: string, text: string, type: 'note' | 'email' | 'call' }), originalIndex: index };
        } catch {
            return { date: new Date().toISOString(), text: n, type: 'note' as const, originalIndex: index };
        }
    });

    return (
        <div
            ref={setNodeRef} 
            style={{
                ...style,
                marginLeft: level > 0 ? `${level * 24}px` : '0',
                width: level > 0 ? `calc(100% - ${level * 24}px)` : '100%',
            }} 
            className={`group flex flex-col gap-0 rounded-xl border transition-all overflow-hidden ${
                isDragging ? 'border-accent shadow-lg z-50 bg-surface' : 'border-border hover:shadow-sm bg-surface'
            }`}
        >
            <div className="flex items-center gap-2 px-3 py-2">
                <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground transition-colors">
                    <GripVertical size={14} />
                </div>
                
                <div className="flex-shrink-0">
                    <Checkbox 
                        isSelected={task.completed} 
                        onChange={(val: boolean) => onToggle(task.id, val)}
                    >
                        <Checkbox.Control className="size-6 rounded-xl border-2">
                            <Checkbox.Indicator />
                        </Checkbox.Control>
                    </Checkbox>
                </div>

                <div className="flex-grow min-w-0 cursor-pointer flex items-center gap-2" onClick={() => onClick && onClick(task)}>
                    <span className={`text-sm font-medium leading-tight block truncate transition-all ${
                        task.completed ? 'line-through text-muted-foreground/50' : 'text-foreground'
                    }`}>
                        {task.title}
                    </span>
                </div>

                <div className="flex items-center gap-0.5">
                    <Button 
                        variant="ghost" 
                        isIconOnly 
                        className={`h-6 w-6 rounded-md transition-all ${
                            isExpanded ? 'text-accent' : 'text-muted-foreground/30 hover:text-foreground'
                        }`}
                        onPress={() => onToggleExpanded && onToggleExpanded(task.id)}
                    >
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </Button>
                    <Button 
                        variant="ghost" 
                        isIconOnly 
                        className="h-6 w-6 rounded-md text-muted-foreground/20 hover:text-danger transition-all opacity-0 group-hover:opacity-100"
                        onPress={() => onDelete(task.id)}
                    >
                        <Trash2 size={12} />
                    </Button>
                </div>
            </div>

            <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-0.5">
                <div className="flex items-center gap-1 flex-grow overflow-hidden flex-wrap">
                    {task.deadline && (
                        <Chip
                            size="sm"
                            variant="soft"
                            color={dayjs(task.deadline).isBefore(dayjs(), 'minute') ? 'danger' : dayjs(task.deadline).isSame(dayjs(), 'day') ? 'warning' : 'default'}
                            className="h-5 px-1.5"
                        >
                            <Calendar size={9} className="mr-0.5" />
                            <Chip.Label className="text-[10px] px-0">
                                {dayjs(task.deadline).format('MMM D')}
                            </Chip.Label>
                        </Chip>
                    )}

                    {task.priority && (
                        <Chip
                            size="sm"
                            variant="soft"
                            color={
                                task.priority === 'urgent' ? 'danger' :
                                task.priority === 'high' ? 'warning' :
                                task.priority === 'medium' ? 'accent' :
                                'default'
                            }
                            className="h-5 px-1.5"
                        >
                            <Chip.Label className="text-[10px] px-0">
                                {task.priority}
                            </Chip.Label>
                        </Chip>
                    )}

                    {task.kanbanStatus && task.kanbanStatus !== 'todo' && (
                        <Chip
                            size="sm"
                            variant="soft"
                            color={
                                task.kanbanStatus === 'done' ? 'success' :
                                task.kanbanStatus === 'review' ? 'warning' :
                                'default'
                            }
                            className="h-5 px-1.5"
                        >
                            <Chip.Label className="text-[10px] px-0">
                                {task.kanbanStatus.replace('-', ' ')}
                            </Chip.Label>
                        </Chip>
                    )}

                    {task.tags && task.tags.length > 0 && task.tags.slice(0, 2).map((tag) => (
                        <Chip
                            key={tag}
                            size="sm"
                            variant="soft"
                            color="default"
                            className="h-5 px-1.5"
                        >
                            <Chip.Label className="text-[10px] px-0">#{tag}</Chip.Label>
                        </Chip>
                    ))}

                    {task.tags && task.tags.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">+{task.tags.length - 2} tags</span>
                    )}

                    {subtasks.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                            {subtasks.filter(s => s.completed).length}/{subtasks.length} sub
                        </span>
                    )}
                    
                    {task.notes && task.notes.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <MessageCircle size={10} />
                            {task.notes.length}
                        </span>
                    )}
                    
                    {task.timeSpent !== undefined && task.timeSpent > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Clock size={10} />
                            {formatLongTime(task.timeSpent || 0)}
                        </span>
                    )}
                </div>

                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border transition-colors shrink-0 ${
                    task.isTimerRunning 
                        ? 'bg-accent/10 border-accent/30 text-accent' 
                        : 'bg-surface-secondary border-border text-foreground'
                }`}>
                    <span className="text-xs font-mono tabular-nums w-10 text-center">
                        {formatTime(currentTime)}
                    </span>
                    
                    <Button 
                        variant="ghost" 
                        isIconOnly 
                        className="h-5 w-5 rounded-sm transition-all"
                        onPress={handleToggleTimer}
                    >
                        {task.isTimerRunning ? <Pause size={10} /> : <Play size={10} />}
                    </Button>

                    {parsedTimeEntries.length > 0 && (
                        <Tooltip delay={0}>
                            <Tooltip.Trigger>
                                <Button variant="ghost" isIconOnly className="h-5 w-5 rounded-sm text-muted-foreground/60 hover:text-foreground transition-colors">
                                   <Clock size={10} />
                                </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content showArrow placement="top">
                                <Tooltip.Arrow />
                                <div className="p-3 space-y-2 min-w-[200px]">
                                    <p className="text-xs font-medium text-muted-foreground border-b border-border pb-2">Time Records</p>
                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                        {parsedTimeEntries.sort((a, b) => dayjs(b.date).unix() - dayjs(a.date).unix()).map((entry, i) => (
                                            <div key={i} className="flex items-center justify-between py-1">
                                                <span className="text-xs text-muted-foreground">{dayjs(entry.date).format('MMM D, YYYY')}</span>
                                                <span className="text-xs font-mono tabular-nums">{formatTime(entry.seconds)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Tooltip.Content>
                        </Tooltip>
                    )}
                </div>
            </div>

            {isExpanded && (
                <div className="mx-3 mb-3 mt-0 p-3 bg-surface-secondary/50 rounded-xl border border-border space-y-4">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h5 className="text-xs font-medium text-muted-foreground">Subtasks</h5>
                            <span className="text-xs text-muted-foreground">{subtasks.filter(s => s.completed).length}/{subtasks.length}</span>
                        </div>

                        <div className="space-y-2">
                            {subtasks.map((sub) => (
                                <TaskItem 
                                    key={sub.id}
                                    task={sub}
                                    onToggle={onToggle}
                                    onDelete={onDelete}
                                    onUpdate={onUpdate}
                                    onAddSubtask={onAddSubtask}
                                    allTasks={allTasks}
                                    expandedTaskIds={expandedTaskIds}
                                    level={level + 1}
                                    onToggleExpanded={onToggleExpanded}
                                    onClick={onClick}
                                />
                            ))}
                        </div>
                        </div>

                        <form 
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (newSubtaskTitle.trim()) {
                                    onAddSubtask(task.id, newSubtaskTitle);
                                    setNewSubtaskTitle('');
                                }
                            }}
                            className="relative"
                        >
                            <Input 
                                placeholder="Add subtask..." 
                                value={newSubtaskTitle}
                                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                className="h-8 rounded-xl bg-background border border-border text-sm pl-3 pr-9"
                            />
                            <Button type="submit" variant="ghost" isIconOnly className="absolute right-1 top-1 h-6 w-6 rounded-lg hover:text-accent">
                                <Plus size={12} />
                            </Button>
                        </form>

                    <div className="space-y-2 pt-3 border-t border-border">
                        <div className="flex items-center justify-between">
                            <h5 className="text-xs font-medium text-muted-foreground">Notes</h5>
                        </div>

                        <div className="space-y-1">
                            {parsedNotes.length === 0 ? (
                                <div className="py-4 flex items-center justify-center gap-2 text-muted-foreground/40">
                                    <MessageCircle size={14} />
                                    <p className="text-xs">No notes yet</p>
                                </div>
                            ) : (
                                <ScrollShadow className="space-y-1.5 max-h-52" hideScrollBar>
                                    {parsedNotes.sort((a, b) => dayjs(b.date).unix() - dayjs(a.date).unix()).map((note, i) => (
                                        <div key={i} className={`p-2.5 rounded-xl border flex gap-2 group/note ${
                                            editingNoteIndex === note.originalIndex 
                                                ? 'bg-accent/5 border-accent/30' 
                                                : 'bg-background border-border'
                                        }`}>
                                            <div className={`mt-0.5 shrink-0 w-5 h-5 rounded-md flex items-center justify-center ${
                                                note.type === 'email' ? 'bg-accent/10 text-accent' :
                                                note.type === 'call' ? 'bg-success/10 text-success' : 'bg-surface-secondary text-muted-foreground'
                                            }`}>
                                                {note.type === 'email' ? <Mail size={10} /> :
                                                 note.type === 'call' ? <Phone size={10} /> : <MessageCircle size={10} />}
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {note.type} · {dayjs(note.date).fromNow()}
                                                    </span>
                                                    <div className="flex items-center gap-0.5 opacity-0 group-hover/note:opacity-100 transition-opacity">
                                                        <Button 
                                                            variant="ghost" 
                                                            isIconOnly 
                                                            className="h-5 w-5 rounded-md hover:text-accent transition-colors"
                                                            onPress={() => handleEditNote(note.originalIndex)}
                                                        >
                                                            <Pen size={10} />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            isIconOnly 
                                                            className="h-5 w-5 rounded-md hover:text-danger transition-colors"
                                                            onPress={() => handleDeleteNote(note.originalIndex)}
                                                        >
                                                            <Trash2 size={10} />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-foreground/80 leading-relaxed">{note.text}</p>
                                            </div>
                                        </div>
                                    ))}
                                </ScrollShadow>
                            )}

                            <form onSubmit={handleAddNote} className="space-y-2">
                                <div className="flex items-center gap-1.5">
                                    {(['note', 'email', 'call'] as const).map((type) => (
                                        <button
                                            key={type}
                                            type="button"
                                            className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors capitalize ${
                                                noteType === type 
                                                    ? 'bg-accent text-white' 
                                                    : 'bg-background border border-border text-muted-foreground hover:text-foreground'
                                            }`}
                                            onClick={() => setNoteType(type)}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                    {editingNoteIndex !== null && (
                                        <button 
                                            type="button"
                                            className="ml-auto px-2 py-0.5 rounded-md text-xs text-danger hover:bg-danger/10"
                                            onClick={() => {
                                                setEditingNoteIndex(null);
                                                setNewNote('');
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                                <div className="relative">
                                    <Input 
                                        placeholder={editingNoteIndex !== null ? 'Edit note...' : `Add ${noteType}...`}
                                        value={newNote}
                                        onChange={(e) => setNewNote(e.target.value)}
                                        className="h-8 rounded-xl bg-background border border-border text-sm pl-3 pr-9"
                                    />
                                    <Button type="submit" variant="ghost" isIconOnly className="absolute right-1 top-1 h-6 w-6 rounded-lg hover:text-accent">
                                        <Plus size={12} />
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
