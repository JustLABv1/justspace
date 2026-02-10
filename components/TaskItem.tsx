'use client';

import { Task } from '@/types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Checkbox, Input, Surface, Tooltip } from '@heroui/react';
import {
    Calendar,
    AltArrowDown as ChevronDown,
    AltArrowRight as ChevronRight,
    HamburgerMenu as GripVertical,
    History,
    Pause,
    Play,
    AddCircle as Plus,
    TrashBinMinimalistic as Trash
} from '@solar-icons/react';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useState } from 'react';

dayjs.extend(duration);
dayjs.extend(relativeTime);

interface TaskItemProps {
    task: Task;
    onToggle: (id: string, completed: boolean) => void;
    onDelete: (id: string) => void;
    onUpdate: (id: string, data: Partial<Task> & { workDuration?: string }) => void;
    onAddSubtask: (title: string) => void;
    subtasks?: Task[];
    isExpanded?: boolean;
    onToggleExpanded?: () => void;
}

export function TaskItem({ 
    task, 
    onToggle, 
    onDelete, 
    onUpdate, 
    onAddSubtask, 
    subtasks = [],
    isExpanded = false,
    onToggleExpanded
}: TaskItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.$id });
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
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

            onUpdate(task.$id, {
                isTimerRunning: false,
                timeSpent: totalTime,
                timerStartedAt: undefined,
                timeEntries: newEntries,
                workDuration: `Worked ${workDuration}`
            });
        } else {
            onUpdate(task.$id, {
                isTimerRunning: true,
                timerStartedAt: now.toISOString()
            });
        }
    };

    const formatTime = (seconds: number) => {
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

    return (
        <Surface 
            ref={setNodeRef} 
            style={style} 
            className={`group flex flex-col gap-0 rounded-2xl border transition-all duration-300 overflow-hidden ${
                isDragging ? 'border-primary shadow-2xl z-50 bg-surface scale-[1.02]' : 'border-border/40 hover:border-primary/20 bg-surface shadow-sm'
            }`}
        >
            {/* Header / Title Row */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-2">
                <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-primary transition-colors">
                    <GripVertical size={16} weight="Linear" />
                </div>
                
                <div className="flex-shrink-0">
                    <Checkbox 
                        isSelected={task.completed} 
                        onChange={(val: boolean) => onToggle(task.$id, val)}
                    >
                        <Checkbox.Control className="size-6 rounded-lg border-2">
                            <Checkbox.Indicator />
                        </Checkbox.Control>
                    </Checkbox>
                </div>

                <div className="flex-grow min-w-0">
                    <span className={`text-[16px] font-bold tracking-tight leading-tight block truncate transition-all ${
                        task.completed ? 'line-through text-muted-foreground/30' : 'text-foreground'
                    }`}>
                        {task.title}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <Button 
                        variant="ghost" 
                        isIconOnly 
                        className={`h-8 w-8 rounded-xl transition-all ${isExpanded ? 'bg-primary/10 text-primary' : 'text-muted-foreground/30 hover:text-foreground'}`}
                        onPress={onToggleExpanded}
                    >
                        {isExpanded ? <ChevronDown size={18} weight="Bold" /> : <ChevronRight size={18} weight="Bold" />}
                    </Button>
                    <Button 
                        variant="ghost" 
                        isIconOnly 
                        className="h-8 w-8 rounded-xl text-muted-foreground/10 hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100"
                        onPress={() => onDelete(task.$id)}
                    >
                        <Trash size={14} weight="Linear" />
                    </Button>
                </div>
            </div>

            {/* Interaction / Metadata Row */}
            <div className="flex items-center justify-between gap-4 px-4 pb-4 pt-1">
                <div className="flex items-center gap-2 flex-grow overflow-hidden">
                    <div className="flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-foreground/[0.03] border border-border/40 whitespace-nowrap">
                        <Plus size={10} weight="Bold" className="text-primary" />
                        <span className="text-xs uppercase font-bold tracking-widest text-muted-foreground/60">{subtasks.length} sub objectives</span>
                    </div>
                    
                    {task.timeSpent && task.timeSpent > 0 && (
                        <div className="flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-primary/5 border border-primary/20 whitespace-nowrap overflow-hidden">
                            <History size={10} weight="Bold" className="text-primary" />
                            <span className="text-xs uppercase font-bold tracking-widest text-primary truncate">
                                {formatTime(task.timeSpent)} cumulative
                            </span>
                        </div>
                    )}
                </div>

                <div className={`flex items-center gap-2 pl-3 pr-1 py-1 rounded-2xl border transition-all duration-500 shrink-0 ${
                    task.isTimerRunning 
                        ? 'bg-primary border-primary text-white shadow-lg shadow-primary/30' 
                        : 'bg-surface-secondary border-border/20 text-foreground'
                }`}>
                    <span className={`text-xs font-bold tabular-nums tracking-tighter w-12 text-center ${task.isTimerRunning ? 'text-white' : 'text-muted-foreground'}`}>
                        {dayjs.duration(currentTime, 'seconds').format(currentTime >= 3600 ? 'HH:mm:ss' : 'mm:ss')}
                    </span>
                    
                    <Button 
                        variant="ghost" 
                        isIconOnly 
                        className={`h-8 w-8 rounded-xl transition-all active:scale-90 ${
                            task.isTimerRunning 
                                ? 'bg-white/20 text-white hover:bg-white/30 border border-white/10' 
                                : 'bg-foreground/5 text-foreground hover:bg-foreground/10 border border-border/10'
                        }`}
                        onPress={handleToggleTimer}
                    >
                        {task.isTimerRunning ? <Pause size={14} weight="Bold" /> : <Play size={14} weight="Bold" className="ml-0.5" />}
                    </Button>

                    {parsedTimeEntries.length > 0 && (
                        <Tooltip delay={0}>
                            <Tooltip.Trigger>
                                <Button variant="ghost" isIconOnly className={`h-8 w-8 rounded-xl transition-colors ${task.isTimerRunning ? 'text-white/60 hover:text-white' : 'text-muted-foreground/40 hover:text-foreground'}`}>
                                   <History size={14} weight="Linear" />
                                </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content showArrow placement="top">
                                <Tooltip.Arrow />
                                <div className="p-3 space-y-3 min-w-[220px]">
                                    <div className="flex items-center justify-between border-b border-border/20 pb-2">
                                        <p className="text-xs font-bold uppercase tracking-widest text-primary">Time Records</p>
                                        <span className="text-xs font-bold text-muted-foreground/60">{parsedTimeEntries.length} entries</span>
                                    </div>
                                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1 flex flex-col">
                                        {parsedTimeEntries.sort((a, b) => dayjs(b.date).unix() - dayjs(a.date).unix()).map((entry, i) => (
                                            <div key={i} className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-surface-secondary transition-colors">
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={12} weight="Linear" className="text-muted-foreground/40" />
                                                    <span className="text-xs font-bold text-foreground/80">{dayjs(entry.date).format('MMM D, YYYY')}</span>
                                                </div>
                                                <span className="font-bold text-xs tabular-nums text-primary/80">
                                                    {formatTime(entry.seconds)}
                                                </span>
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
                <div className="mx-4 mb-4 mt-2 p-5 bg-surface-secondary/30 rounded-[1.25rem] border border-border/20 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between mb-2">
                        <h5 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/70">Sub-Task Management</h5>
                        <span className="text-xs font-bold text-primary/60 bg-primary/5 px-2 py-0.5 rounded-full">{subtasks.filter(s => s.completed).length}/{subtasks.length} Completed</span>
                    </div>

                    <div className="space-y-2">
                        {subtasks.map((sub) => (
                            <div key={sub.$id} className="flex items-center gap-3 p-2 bg-surface-lowest/50 rounded-xl border border-border/10 hover:border-primary/20 transition-all group/sub">
                                <Checkbox 
                                    isSelected={sub.completed} 
                                    onChange={(val: boolean) => onToggle(sub.$id, val)}
                                >
                                    <Checkbox.Control className="size-4 rounded-md">
                                        <Checkbox.Indicator />
                                    </Checkbox.Control>
                                </Checkbox>
                                <span className={`text-xs font-bold leading-tight flex-grow ${sub.completed ? 'line-through text-muted-foreground/40 font-medium' : 'text-foreground/80'}`}>
                                    {sub.title}
                                </span>
                                <Button 
                                    variant="ghost" 
                                    isIconOnly 
                                    className="h-6 w-6 rounded-lg opacity-0 group-hover/sub:opacity-100 hover:text-danger"
                                    onPress={() => onDelete(sub.$id)}
                                >
                                    <Trash size={12} weight="Linear" />
                                </Button>
                            </div>
                        ))}
                    </div>

                    <form 
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (newSubtaskTitle.trim()) {
                                onAddSubtask(newSubtaskTitle);
                                setNewSubtaskTitle('');
                            }
                        }}
                        className="relative"
                    >
                        <Input 
                            placeholder="Add actionable sub-task..." 
                            value={newSubtaskTitle}
                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                            className="h-11 rounded-xl bg-surface-lowest border-dashed border-2 border-border/30 focus:border-primary/40 transition-all pl-4 pr-12 text-sm font-medium"
                        />
                        <Button type="submit" variant="ghost" isIconOnly className="absolute right-1 top-1 h-9 w-9 rounded-lg hover:bg-primary/10 hover:text-primary">
                            <Plus size={16} weight="Linear" />
                        </Button>
                    </form>
                </div>
            )}
        </Surface>
    );
}
