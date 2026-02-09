'use client';

import { Task } from '@/types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Checkbox, Input } from '@heroui/react';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { ChevronDown, ChevronRight, GripVertical, Pause, Play, Trash } from 'lucide-react';
import { useEffect, useState } from 'react';

dayjs.extend(duration);

interface TaskItemProps {
    task: Task;
    onToggle: (id: string, completed: boolean) => void;
    onDelete: (id: string) => void;
    onUpdate: (id: string, data: Partial<Task>) => void;
    onAddSubtask: (title: string) => void;
    subtasks?: Task[];
}

export function TaskItem({ task, onToggle, onDelete, onUpdate, onAddSubtask, subtasks = [] }: TaskItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.$id });
    const [isExpanded, setIsExpanded] = useState(false);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const [currentTime, setCurrentTime] = useState(task.timeSpent || 0);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (task.isTimerRunning && task.timerStartedAt) {
            interval = setInterval(() => {
                const elapsedSinceStart = dayjs().diff(dayjs(task.timerStartedAt), 'second');
                setCurrentTime((task.timeSpent || 0) + elapsedSinceStart);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [task.isTimerRunning, task.timerStartedAt, task.timeSpent]);

    const handleToggleTimer = () => {
        if (task.isTimerRunning) {
            const elapsedSinceStart = dayjs().diff(dayjs(task.timerStartedAt), 'second');
            onUpdate(task.$id, {
                isTimerRunning: false,
                timeSpent: (task.timeSpent || 0) + elapsedSinceStart,
                timerStartedAt: undefined
            });
        } else {
            onUpdate(task.$id, {
                isTimerRunning: true,
                timerStartedAt: dayjs().toISOString()
            });
        }
    };

    const formatTime = (seconds: number) => {
        const dur = dayjs.duration(seconds, 'seconds');
        if (seconds >= 3600) return dur.format('HH:mm:ss');
        return dur.format('mm:ss');
    };

    return (
        <div ref={setNodeRef} style={style} className="group flex flex-col gap-2 p-2 bg-surface border border-border rounded-xl transition-all hover:border-primary/50">
            <div className="flex items-center gap-3">
                <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                    <GripVertical size={16} />
                </div>
                <Checkbox 
                    isSelected={task.completed} 
                    onChange={(val: boolean) => onToggle(task.$id, val)}
                >
                    <Checkbox.Control>
                        <Checkbox.Indicator />
                    </Checkbox.Control>
                </Checkbox>
                <span className={`flex-grow text-sm ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground font-medium'}`}>
                    {task.title}
                </span>
                
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-1 bg-secondary/20 px-2 py-1 rounded-md text-[10px] tabular-nums font-mono">
                        {formatTime(currentTime)}
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            isIconOnly 
                            className="h-5 w-5 ml-1" 
                            onPress={handleToggleTimer}
                        >
                            {task.isTimerRunning ? <Pause size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
                        </Button>
                    </div>
                    
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        isIconOnly 
                        className="h-7 w-7" 
                        onPress={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </Button>
                    
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        isIconOnly 
                        className="h-7 w-7 text-danger" 
                        onPress={() => onDelete(task.$id)}
                    >
                        <Trash size={14} />
                    </Button>
                </div>
            </div>

            {isExpanded && (
                <div className="ml-10 space-y-2 pb-2">
                    {subtasks.map((sub) => (
                        <div key={sub.$id} className="flex items-center gap-2 py-1">
                            <Checkbox 
                                isSelected={sub.completed} 
                                onChange={(val: boolean) => onToggle(sub.$id, val)}
                            >
                                <Checkbox.Control className="size-4">
                                    <Checkbox.Indicator />
                                </Checkbox.Control>
                            </Checkbox>
                            <span className={`text-xs ${sub.completed ? 'line-through text-muted-foreground' : 'text-muted-foreground'}`}>
                                {sub.title}
                            </span>
                        </div>
                    ))}
                    <form 
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (newSubtaskTitle.trim()) {
                                onAddSubtask(newSubtaskTitle);
                                setNewSubtaskTitle('');
                            }
                        }}
                        className="flex gap-2"
                    >
                        <Input 
                            placeholder="Add sub-task..." 
                            value={newSubtaskTitle}
                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                            className="h-7 text-xs bg-transparent border-dashed"
                        />
                    </form>
                </div>
            )}
        </div>
    );
}
