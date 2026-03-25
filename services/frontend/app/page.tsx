'use client';

import { ActivityFeed } from '@/components/ActivityFeed';
import { ResourceHeatmap } from '@/components/ResourceHeatmap';
import { TaskCalendar } from '@/components/TaskCalendar';
import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { Project, Snippet, Task, WikiGuide } from '@/services/frontend/types';
import { Button, Chip, Spinner, toast, Tooltip } from "@heroui/react";
import dayjs from "dayjs";
import {
    ArrowRight,
    BookOpen,
    Check,
    CheckCircle2,
    Code,
    ExternalLink,
    FileText,
    FolderKanban,
    Lock,
    Plus,
    ShieldCheck,
    Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from 'react';

export default function Home() {
  const [stats, setStats] = useState({ projects: 0, guides: 0, snippets: 0, tasks: 0 });
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allDecryptedTasks, setAllDecryptedTasks] = useState<Task[]>([]);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [recentSnippets, setRecentSnippets] = useState<Snippet[]>([]);
  const [recentGuides, setRecentGuides] = useState<WikiGuide[]>([]);
  const [projectTaskCounts, setProjectTaskCounts] = useState<Record<string, { total: number; completed: number }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [justDoneIds, setJustDoneIds] = useState<Set<string>>(new Set());
  const { user, privateKey } = useAuth();

  const hours = new Date().getHours();
  useEffect(() => {
    if (hours < 12) setGreeting('Good Morning');
    else if (hours < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, [hours]);

  const fetchData = useCallback(async () => {
    try {
      const [projects, guides, snippets, allTasks] = await Promise.all([
        db.listProjects(),
        db.listGuides(),
        db.listSnippets(),
        db.listAllTasks(100)
      ]);

      const pendingTasksCount = allTasks.documents.filter(t => !t.completed && !t.parentId).length;
      setStats({ projects: projects.total, guides: guides.total, snippets: snippets.total, tasks: pendingTasksCount });

      // Decrypt projects
      const processedProjects = await Promise.all(projects.documents.map(async (p) => {
        if (p.isEncrypted) {
          if (privateKey && user) {
            try {
              const access = await db.getAccessKey(p.id);
              if (access) {
                const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                let name = 'Encrypted Project';
                let description = 'Resource is encrypted with vault key.';
                try { const d = JSON.parse(p.name); name = await decryptData(d, docKey); } catch { /* noop */ }
                if (p.description) {
                  try { const d = JSON.parse(p.description); description = await decryptData(d, docKey); } catch { /* noop */ }
                }
                return { ...p, name, description };
              }
            } catch (e) { console.error('Failed to decrypt project:', p.id, e); }
          }
          return { ...p, name: 'Encrypted Project', description: 'Unlock vault to access project details.' };
        }
        return p;
      }));

      // Decrypt snippets
      const processedSnippets = await Promise.all(snippets.documents.slice(0, 4).map(async (s) => {
        if (s.isEncrypted && privateKey && user) {
          try {
            const access = await db.getAccessKey(s.id);
            if (access) {
              const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
              try { const d = JSON.parse(s.title); return { ...s, title: await decryptData(d, docKey) }; } catch { /* noop */ }
            }
          } catch { /* noop */ }
          return { ...s, title: 'Secure Snippet' };
        }
        return s;
      }));

      // Decrypt tasks
      const processedTasks = await Promise.all(allTasks.documents.map(async (t) => {
        if (t.isEncrypted && privateKey && user) {
          try {
            const access = await db.getAccessKey(t.projectId);
            if (access) {
              const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
              try { const d = JSON.parse(t.title); return { ...t, title: await decryptData(d, docKey) }; } catch { /* noop */ }
            }
          } catch { /* noop */ }
          return { ...t, title: 'Secure Task' };
        }
        return t;
      }));

      // Task counts per project (top-level only)
      const tasksByProject: Record<string, { total: number; completed: number }> = {};
      processedTasks.filter(t => !t.parentId).forEach(t => {
        if (!tasksByProject[t.projectId]) tasksByProject[t.projectId] = { total: 0, completed: 0 };
        tasksByProject[t.projectId].total++;
        if (t.completed) tasksByProject[t.projectId].completed++;
      });

      // Priority-sorted open tasks: overdue → has deadline → by priority
      const now = dayjs();
      const sortedOpen = processedTasks
        .filter(t => !t.completed && !t.parentId)
        .sort((a, b) => {
          const aOverdue = a.deadline && dayjs(a.deadline).isBefore(now, 'day');
          const bOverdue = b.deadline && dayjs(b.deadline).isBefore(now, 'day');
          if (aOverdue && !bOverdue) return -1;
          if (!aOverdue && bOverdue) return 1;
          if (a.deadline && b.deadline) return dayjs(a.deadline).unix() - dayjs(b.deadline).unix();
          if (a.deadline) return -1;
          if (b.deadline) return 1;
          const pOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
          return (pOrder[a.priority as keyof typeof pOrder] ?? 4) - (pOrder[b.priority as keyof typeof pOrder] ?? 4);
        })
        .slice(0, 7);

      // Decrypt wiki guides
      const processedGuides = await Promise.all(guides.documents.slice(0, 3).map(async (g) => {
        if (g.isEncrypted && privateKey && user) {
          try {
            const access = await db.getAccessKey(g.id);
            if (access) {
              const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
              let title = g.title;
              try { const d = JSON.parse(g.title); title = await decryptData(d, docKey); } catch { /* noop */ }
              return { ...g, title };
            }
          } catch { /* noop */ }
          return { ...g, title: 'Encrypted Guide' };
        }
        return g;
      }));

      setAllProjects(processedProjects);
      setAllDecryptedTasks(processedTasks.filter(t => !t.completed && !t.parentId));
      setRecentProjects(processedProjects.filter(p => p.status !== 'completed' && p.status !== 'archived').slice(0, 3));
      setRecentSnippets(processedSnippets);
      setRecentGuides(processedGuides as WikiGuide[]);
      setOpenTasks(sortedOpen);
      setProjectTaskCounts(tasksByProject);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [privateKey, user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCompleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If already marked done in this session, undo it
    if (justDoneIds.has(taskId)) {
      try {
        await import('@/services/frontend/lib/db').then(m => m.db.updateTask(taskId, { completed: false, kanbanStatus: 'todo' }));
        setJustDoneIds(prev => { const n = new Set(prev); n.delete(taskId); return n; });
        setStats(prev => ({ ...prev, tasks: prev.tasks + 1 }));
        toast.success('Task reopened');
      } catch (err) { console.error(err); }
      return;
    }

    setCompletingTaskId(taskId);
    try {
      await import('@/services/frontend/lib/db').then(m => m.db.updateTask(taskId, { completed: true, kanbanStatus: 'done' }));
      setJustDoneIds(prev => new Set([...prev, taskId]));
      setStats(prev => ({ ...prev, tasks: prev.tasks - 1 }));
      toast.success('Task completed — click again to undo');
      // Remove from list after 4 seconds
      setTimeout(() => {
        setOpenTasks(prev => prev.filter(t => t.id !== taskId));
        setJustDoneIds(prev => { const n = new Set(prev); n.delete(taskId); return n; });
      }, 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setCompletingTaskId(null);
    }
  };

  const getDeadlineInfo = (deadline?: string | null) => {
    if (!deadline) return null;
    const d = dayjs(deadline);
    const today = dayjs();
    if (d.isBefore(today, 'day')) return { label: 'Overdue', cls: 'text-danger font-medium' };
    if (d.isSame(today, 'day')) return { label: 'Today', cls: 'text-warning font-medium' };
    if (d.isSame(today.add(1, 'day'), 'day')) return { label: 'Tomorrow', cls: 'text-warning' };
    if (d.isBefore(today.endOf('week').add(1, 'day'))) return { label: d.format('ddd'), cls: 'text-muted-foreground' };
    return { label: d.format('MMM D'), cls: 'text-muted-foreground' };
  };

  return (
    <div className="w-full px-6 py-8 space-y-6">

      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-lg font-semibold text-foreground">
            {greeting}{user?.name?.split(' ')[0] ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-[13px] text-muted-foreground flex items-center gap-1.5">
            {dayjs().format('dddd, MMMM D')}
            <span className="opacity-30">·</span>
            <Tooltip delay={0}>
              <Tooltip.Trigger aria-label="Vault status">
                <span className={`inline-flex items-center gap-1 cursor-help ${privateKey ? 'text-success' : 'text-warning'}`}>
                  {privateKey ? <ShieldCheck size={11} /> : <Lock size={11} />}
                  Vault {privateKey ? 'unlocked' : 'locked'}
                </span>
              </Tooltip.Trigger>
              <Tooltip.Content showArrow placement="top">
                <Tooltip.Arrow />
                {privateKey ? 'Encrypted data is accessible.' : 'Unlock vault to see encrypted content.'}
              </Tooltip.Content>
            </Tooltip>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/wiki">
            <Button variant="secondary" className="rounded-xl h-8 px-3.5 text-[13px] font-medium">
              <Plus size={14} className="mr-1" /> New guide
            </Button>
          </Link>
          <Link href="/projects">
            <Button variant="primary" className="rounded-xl h-8 px-3.5 text-[13px] font-medium shadow-sm">
              <Plus size={14} className="mr-1" /> New project
            </Button>
          </Link>
        </div>
      </section>

      {/* Stats — compact one-liner */}
      {(() => {
        const overdueCount = allDecryptedTasks.filter(t =>
          t.deadline && dayjs(t.deadline).isBefore(dayjs(), 'day')
        ).length;
        return (
          <div className="rounded-2xl overflow-hidden border border-border bg-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px">
              {[
                { label: 'Projects',   value: stats.projects, icon: FolderKanban, color: 'text-accent',   bg: 'bg-accent-muted',   href: '/projects'  },
                { label: 'Open tasks', value: stats.tasks,    icon: CheckCircle2, color: 'text-danger',   bg: 'bg-danger-muted',   href: '/projects', showTrend: true },
                { label: 'Wiki pages', value: stats.guides,   icon: BookOpen,     color: 'text-success',  bg: 'bg-success-muted',  href: '/wiki'      },
                { label: 'Snippets',   value: stats.snippets, icon: Code,         color: 'text-warning',  bg: 'bg-warning-muted',  href: '/snippets'  },
              ].map(({ label, value, icon: Icon, color, bg, href, showTrend }) => (
                <Link key={label} href={href}>
                  <div className="bg-surface flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary/50 transition-colors h-full">
                    <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center ${color} shrink-0`}>
                      <Icon size={13} />
                    </div>
                    <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                      <span className="text-[14px] font-bold text-foreground tabular-nums leading-none">
                        {isLoading ? <span className="inline-block w-5 h-4 rounded bg-surface-secondary animate-pulse align-middle" /> : value}
                      </span>
                      <span className="text-[12px] text-muted-foreground truncate">{label}</span>
                    </div>
                    {showTrend && !isLoading && overdueCount > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-danger-muted text-danger shrink-0 tabular-nums">
                        {overdueCount} overdue
                      </span>
                    )}
                    {showTrend && !isLoading && overdueCount === 0 && stats.tasks > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-success-muted text-success shrink-0">
                        on track
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left — 2/3 */}
        <div className="lg:col-span-2 space-y-4">

          {/* Section: Work */}
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">Work</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Projects */}
          <section className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                <FolderKanban size={13} className="text-muted-foreground" />
                Projects
              </h2>
              <Link href="/projects" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                All projects <ArrowRight size={11} />
              </Link>
            </div>
            {isLoading ? (
              <div className="h-28 flex items-center justify-center"><Spinner color="accent" size="sm" /></div>
            ) : recentProjects.length > 0 ? (
              <div className="divide-y divide-border">
                {recentProjects.map((project) => {
                  const counts = projectTaskCounts[project.id] ?? { total: 0, completed: 0 };
                  const progress = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;
                  return (
                    <Link key={project.id} href={`/projects/${project.id}`}>
                      <div className="px-5 py-4 hover:bg-surface-secondary/40 transition-colors group">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-2 h-2 rounded-full shrink-0 mt-[3px] ${
                              project.status === 'completed' ? 'bg-success' :
                              project.status === 'in-progress' ? 'bg-accent' : 'bg-muted-foreground/30'
                            }`} />
                            <p className="text-[13px] font-medium text-foreground truncate group-hover:text-accent transition-colors">
                              {project.name}
                            </p>
                            {project.isEncrypted && <Lock size={11} className="text-muted-foreground/40 shrink-0" />}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {counts.total > 0 && (
                              <span className="text-[12px] text-muted-foreground tabular-nums">
                                {counts.completed}/{counts.total} tasks
                              </span>
                            )}
                            <ExternalLink size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                        {project.description && (
                          <p className="text-[12px] text-muted-foreground truncate ml-4 mb-2.5">{project.description}</p>
                        )}
                        {counts.total > 0 && (
                          <div className="ml-4 flex items-center gap-2">
                            <div className="flex-1 h-1 bg-surface-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-accent/60 rounded-full transition-all" style={{ width: `${progress}%` }} />
                            </div>
                            <span className="text-[11px] text-muted-foreground tabular-nums w-7 text-right">{progress}%</span>
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-10 text-center">
                <Sparkles size={20} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-[13px] text-muted-foreground">No projects yet</p>
                <Link href="/projects">
                  <Button variant="secondary" className="mt-3 rounded-xl h-7 px-3 text-[12px]">
                    <Plus size={12} className="mr-1" /> Create project
                  </Button>
                </Link>
              </div>
            )}
          </section>

          {/* Open Tasks */}
          <section className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 size={13} className="text-muted-foreground" />
                Open tasks
              </h2>
              <span className="text-[12px] text-muted-foreground">{stats.tasks} pending</span>
            </div>
            {isLoading ? (
              <div className="h-24 flex items-center justify-center"><Spinner color="accent" size="sm" /></div>
            ) : openTasks.length > 0 ? (
              <div className="divide-y divide-border">
                {openTasks.map(task => {
                  const project = allProjects.find(p => p.id === task.projectId);
                  const deadline = getDeadlineInfo(task.deadline);
                  const isCompleting = completingTaskId === task.id;
                  const isDone = justDoneIds.has(task.id);
                  return (
                    <div key={task.id} className={`flex items-center gap-3 px-5 py-2.5 hover:bg-surface-secondary/40 transition-all ${isDone ? 'opacity-50' : ''}`}>
                      <button
                        onClick={(e) => handleCompleteTask(task.id, e)}
                        disabled={isCompleting}
                        aria-label={isDone ? 'Undo complete' : 'Complete task'}
                        className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
                          isDone ? 'border-success bg-success text-white' :
                          isCompleting ? 'border-success bg-success/20' :
                          task.priority === 'urgent' ? 'border-danger hover:border-success hover:bg-success/10' :
                          task.priority === 'high' ? 'border-warning hover:border-success hover:bg-success/10' :
                          task.priority === 'medium' ? 'border-accent hover:border-success hover:bg-success/10' : 'border-border hover:border-success hover:bg-success/10'
                        }`}
                      >
                        {(isCompleting || isDone) && <Check size={9} className={isDone ? 'text-white' : 'text-success'} />}
                      </button>
                      <Link href={`/projects/${task.projectId}`} className="flex items-center gap-3 flex-1 min-w-0">
                        <span className={`text-[13px] truncate flex-1 transition-all ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{task.title}</span>
                        <div className="flex items-center gap-2.5 shrink-0">
                          {project && (
                            <span className="hidden sm:block text-[12px] text-muted-foreground max-w-[100px] truncate">{project.name}</span>
                          )}
                          {deadline && (
                            <span className={`text-[12px] ${deadline.cls}`}>{deadline.label}</span>
                          )}
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <CheckCircle2 size={20} className="mx-auto text-success/50 mb-2" />
                <p className="text-[13px] text-muted-foreground">All caught up — no open tasks</p>
              </div>
            )}
          </section>

          {/* Task Calendar */}
          <section className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 size={13} className="text-muted-foreground" />
                Schedule
              </h2>
            </div>
            <div className="px-4 py-4">
              <TaskCalendar tasks={allDecryptedTasks} projects={allProjects} onUpdate={fetchData} />
            </div>
          </section>

          {/* Section: Resources */}
          <div className="flex items-center gap-2.5 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">Resources</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Recent Snippets */}
          <section className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                <Code size={13} className="text-muted-foreground" />
                Code snippets
              </h2>
              <Link href="/snippets" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                View all <ArrowRight size={11} />
              </Link>
            </div>
            {recentSnippets.length > 0 ? (
              <div className="divide-y divide-border">
                {recentSnippets.map(snippet => (
                  <Link key={snippet.id} href="/snippets">
                    <div className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-secondary/40 transition-colors group">
                      <div className="w-5 h-5 rounded bg-warning-muted flex items-center justify-center text-warning shrink-0">
                        <Code size={11} />
                      </div>
                      <span className="text-[13px] text-foreground truncate flex-1 group-hover:text-accent transition-colors">{snippet.title}</span>
                      {snippet.language && (
                        <Chip size="sm" variant="soft" color="default" className="h-4 rounded shrink-0">
                          <Chip.Label className="text-[10px] font-mono px-1">{snippet.language}</Chip.Label>
                        </Chip>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-5 py-6 text-center">
                <p className="text-[13px] text-muted-foreground">No snippets yet</p>
              </div>
            )}
          </section>

          {/* Recent wiki guides */}
          <section className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                <BookOpen size={13} className="text-muted-foreground" />
                Wiki
              </h2>
              <Link href="/wiki" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                All <ArrowRight size={11} />
              </Link>
            </div>
            {isLoading ? (
              <div className="h-16 flex items-center justify-center"><Spinner color="accent" size="sm" /></div>
            ) : recentGuides.length > 0 ? (
              <div className="divide-y divide-border">
                {recentGuides.map(guide => (
                  <Link key={guide.id} href={`/wiki/${guide.id}`}>
                    <div className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-secondary/40 transition-colors group">
                      <div className="w-5 h-5 rounded bg-success-muted flex items-center justify-center text-success shrink-0">
                        <FileText size={11} />
                      </div>
                      <span className="text-[13px] text-foreground truncate flex-1 group-hover:text-accent transition-colors">{guide.title}</span>
                      {guide.isEncrypted && <Lock size={11} className="text-muted-foreground/40 shrink-0" />}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-5 py-5 text-center">
                <p className="text-[13px] text-muted-foreground">No guides yet</p>
                <Link href="/wiki">
                  <Button variant="secondary" className="mt-2 rounded-xl h-7 px-2.5 text-[12px]">
                    <Plus size={11} className="mr-1" /> Create guide
                  </Button>
                </Link>
              </div>
            )}
          </section>
        </div>

        {/* Right sidebar — 1/3 */}
        <div className="space-y-4">

          {/* Section: Planning */}
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">Planning</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <ResourceHeatmap projects={allProjects} />

          {/* Section: Activity */}
          <div className="flex items-center gap-2.5 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">Activity</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
