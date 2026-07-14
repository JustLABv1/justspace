'use client';

import { ActivityFeed } from '@/components/ActivityFeed';
import { ResourceHeatmap } from '@/components/ResourceHeatmap';
import { TaskCalendar } from '@/components/TaskCalendar';
import { useAuth } from '@/services/frontend/context/AuthContext';
import { useWorkspace } from '@/services/frontend/context/WorkspaceContext';
import { decryptData, decryptDocumentKey } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { getDeadlineDisplay, getScheduleBucket, isOverdue, sortTasksBySchedule, useScheduleNow } from '@/services/frontend/lib/task-schedule';
import { Project, ProjectMilestone, Snippet, Task, WikiGuide } from '@/services/frontend/types';
import { Button, Chip, Spinner, Tooltip } from "@heroui/react";
import dayjs from "dayjs";
import {
    ArrowRight,
    BookOpen,
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
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function Home() {
  const [stats, setStats] = useState({ projects: 0, guides: 0, snippets: 0, tasks: 0 });
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allDecryptedTasks, setAllDecryptedTasks] = useState<Task[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<Task[]>([]);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [recentSnippets, setRecentSnippets] = useState<Snippet[]>([]);
  const [recentGuides, setRecentGuides] = useState<WikiGuide[]>([]);
  const [projectTaskCounts, setProjectTaskCounts] = useState<Record<string, { total: number; completed: number }>>({});
  const [projectHealth, setProjectHealth] = useState<Record<string, { blocked: number; nextMilestone?: ProjectMilestone }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [expandedScheduleGroups, setExpandedScheduleGroups] = useState<Set<string>>(new Set());
  const { user, privateKey } = useAuth();
  const { workspace, workspaceId } = useWorkspace();
  const isConsultingWorkspace = workspace?.type === 'consulting';
  const scheduleNow = useScheduleNow();

  const hours = new Date().getHours();
  useEffect(() => {
    if (hours < 12) setGreeting('Good Morning');
    else if (hours < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, [hours]);

  const fetchData = useCallback(async () => {
    try {
      const [projects, guides, snippets, allTasks, scheduledTasksResponse] = await Promise.all([
        db.listProjects(workspaceId),
        db.listGuides(workspaceId),
        db.listSnippets(workspaceId),
        db.listAllTasks(100),
        db.listAllTasks({ limit: 300, sort: 'deadline', openOnly: true }),
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

      const decryptTasks = async (sourceTasks: Task[]) => Promise.all(sourceTasks.map(async (t) => {
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

      // Decrypt recently created tasks and the separately deadline-sorted dashboard feed.
      const processedTasks = await decryptTasks(allTasks.documents);
      const processedScheduledTasks = (await decryptTasks(scheduledTasksResponse.documents))
        .filter((task) => !task.completed && !!task.deadline);

      // Load missing parents so scheduled subtasks can name their parent even when it is older than the recent-task feed.
      const knownTaskIds = new Set([...processedTasks, ...processedScheduledTasks].map((task) => task.id));
      const missingParentIds = [...new Set(processedScheduledTasks
        .map((task) => task.parentId)
        .filter((parentId): parentId is string => !!parentId && !knownTaskIds.has(parentId)))];
      const missingParents = await Promise.all(missingParentIds.map((parentId) => db.getTask(parentId).catch(() => null)));
      const processedParents = await decryptTasks(missingParents.filter((task): task is Task => !!task));
      const dashboardTasks = [...new Map([...processedTasks, ...processedScheduledTasks, ...processedParents].map((task) => [task.id, task])).values()];

      // Task counts per project (top-level only)
      const tasksByProject: Record<string, { total: number; completed: number }> = {};
      processedTasks.filter(t => !t.parentId).forEach(t => {
        if (!tasksByProject[t.projectId]) tasksByProject[t.projectId] = { total: 0, completed: 0 };
        tasksByProject[t.projectId].total++;
        if (t.completed) tasksByProject[t.projectId].completed++;
      });

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
      setAllDecryptedTasks(dashboardTasks.filter((task) => !task.completed));
      setScheduledTasks(processedScheduledTasks);
      setRecentProjects(processedProjects.filter(p => p.status !== 'completed' && p.status !== 'archived').slice(0, 3));
      setRecentSnippets(processedSnippets);
      setRecentGuides(processedGuides as WikiGuide[]);
      setProjectTaskCounts(tasksByProject);
      const activeProjects = processedProjects.filter((project) => project.status !== 'completed' && project.status !== 'archived');
      const milestoneEntries = await Promise.all(activeProjects.map(async (project) => {
        const milestones = await db.listProjectMilestones(project.id).catch(() => ({ documents: [] as ProjectMilestone[] }));
        const nextMilestone = milestones.documents.filter((milestone) => milestone.status !== 'completed' && milestone.dueDate).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
        const blocked = dashboardTasks.filter((task) => task.projectId === project.id && !task.completed && !task.parentId && (task.dependencies || []).some((dependencyId) => !dashboardTasks.find((dependency) => dependency.id === dependencyId)?.completed)).length;
        return [project.id, { blocked, nextMilestone }] as const;
      }));
      setProjectHealth(Object.fromEntries(milestoneEntries));
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [privateKey, user, workspaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const scheduleGroups = useMemo(() => {
    const parentById = new Map(allDecryptedTasks.map((task) => [task.id, task]));
    const groups = [
      { id: 'overdue', label: 'Overdue', color: 'danger' as const },
      { id: 'today', label: 'Today', color: 'warning' as const },
      { id: 'upcoming', label: 'Next 7 days', color: 'accent' as const },
    ];

    return groups.map((group) => ({
      ...group,
      tasks: sortTasksBySchedule(
        scheduledTasks.filter((task) => getScheduleBucket(task.deadline, scheduleNow) === group.id),
        allDecryptedTasks,
        scheduleNow,
      ).map((task) => ({ task, parent: task.parentId ? parentById.get(task.parentId) : undefined })),
    }));
  }, [allDecryptedTasks, scheduleNow, scheduledTasks]);

  return (
    <div className="w-full px-6 py-8 space-y-6">

      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-lg font-semibold text-foreground">
            {greeting}{user?.name?.split(' ')[0] ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <div className="text-[13px] text-muted-foreground flex items-center gap-1.5">
            {dayjs().format('dddd, MMMM D')}
            <span className="opacity-30">·</span>
            <Tooltip delay={0}>
              <Button
                aria-label="Vault status"
                variant="ghost"
                size="sm"
                className={`h-auto min-w-0 rounded-md p-0 text-[13px] font-normal ${privateKey ? 'text-success' : 'text-warning'}`}
              >
                  {privateKey ? <ShieldCheck size={11} /> : <Lock size={11} />}
                  Vault {privateKey ? 'unlocked' : 'locked'}
              </Button>
              <Tooltip.Content showArrow placement="top">
                <Tooltip.Arrow />
                {privateKey ? 'Encrypted data is accessible.' : 'Unlock vault to see encrypted content.'}
              </Tooltip.Content>
            </Tooltip>
          </div>
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
        const overdueCount = allDecryptedTasks.filter((task) => isOverdue(task.deadline, scheduleNow)).length;
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

          {/* Scheduled work */}
          <section className="bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 size={13} className="text-muted-foreground" />
                Due tasks
              </h2>
              <span className="text-[12px] text-muted-foreground">Next 7 days</span>
            </div>
            {isLoading ? (
              <div className="h-24 flex items-center justify-center"><Spinner color="accent" size="sm" /></div>
            ) : scheduleGroups.some((group) => group.tasks.length > 0) ? (
              <div className="divide-y divide-border">
                {scheduleGroups.filter((group) => group.tasks.length > 0).map((group) => {
                  const isExpanded = expandedScheduleGroups.has(group.id);
                  const visibleTasks = isExpanded ? group.tasks : group.tasks.slice(0, 5);
                  return (
                    <div key={group.id}>
                      <div className="flex items-center gap-2 bg-surface-secondary/30 px-5 py-2">
                        <Chip size="sm" variant="soft" color={group.color} className="h-5 rounded-md">
                          <Chip.Label className="text-[10px] font-semibold">{group.label}</Chip.Label>
                        </Chip>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{group.tasks.length}</span>
                      </div>
                      <div className="divide-y divide-border">
                        {visibleTasks.map(({ task, parent }) => {
                          const project = allProjects.find((candidate) => candidate.id === task.projectId);
                          const deadline = getDeadlineDisplay(task.deadline, scheduleNow);
                          return (
                            <Link key={task.id} href={`/projects/${task.projectId}?taskId=${task.id}`} className="block">
                              <div className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-secondary/40">
                                <span className={`h-2 w-2 shrink-0 rounded-full ${group.color === 'danger' ? 'bg-danger' : group.color === 'warning' ? 'bg-warning' : 'bg-accent'}`} />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[13px] font-medium text-foreground">{task.title}</p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {project?.name || 'Project'}{parent ? ` · Subtask of ${parent.title}` : task.parentId ? ' · Subtask' : ''}
                                  </p>
                                </div>
                                {deadline && (
                                  <Chip size="sm" variant="soft" color={deadline.color} className="h-5 shrink-0 rounded-md">
                                    <Chip.Label className="px-1.5 text-[10px]">{deadline.label}</Chip.Label>
                                  </Chip>
                                )}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                      {group.tasks.length > 5 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-full rounded-none text-[11px] text-muted-foreground"
                          onPress={() => setExpandedScheduleGroups((current) => {
                            const next = new Set(current);
                            if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
                            return next;
                          })}
                        >
                          {isExpanded ? 'Show fewer' : `Show ${group.tasks.length - 5} more`}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <CheckCircle2 size={20} className="mx-auto text-success/50 mb-2" />
                <p className="text-[13px] text-muted-foreground">No scheduled tasks in the next 7 days</p>
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

          {isConsultingWorkspace ? (
            <ResourceHeatmap projects={allProjects} />
          ) : (
            <section className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-foreground">Project progress</h3>
                <div className="flex size-6 items-center justify-center rounded-xl bg-surface-secondary text-muted-foreground">
                  <FolderKanban size={12} />
                </div>
              </div>
              {allProjects.filter((project) => project.status !== 'completed' && project.status !== 'archived').length === 0 ? (
                <p className="py-2 text-[12px] text-muted-foreground">No active projects</p>
              ) : (
                <div className="space-y-3">
                  {allProjects
                    .filter((project) => project.status !== 'completed' && project.status !== 'archived')
                    .slice(0, 4)
                    .map((project) => {
                      const counts = projectTaskCounts[project.id] ?? { total: 0, completed: 0 };
                      const openCount = Math.max(0, counts.total - counts.completed);
                      const overdueCount = allDecryptedTasks.filter((task) => task.projectId === project.id && isOverdue(task.deadline, scheduleNow)).length;
                      const health = projectHealth[project.id];
                      return (
                        <Link key={project.id} href={`/projects/${project.id}`} className="block rounded-lg px-1 py-0.5 hover:bg-surface-secondary/60">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-[12px] text-foreground">{project.name}</span>
                            <span className={`shrink-0 text-[11px] tabular-nums ${overdueCount > 0 ? 'text-danger' : 'text-muted-foreground'}`}>
                              {overdueCount > 0 ? `${overdueCount} overdue` : health?.blocked ? `${health.blocked} blocked` : `${openCount} open`}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                </div>
              )}
              {Object.values(projectHealth).some((health) => health.nextMilestone) && (
                <div className="mt-3 space-y-1 border-t border-border pt-3">
                  {allProjects.filter((project) => projectHealth[project.id]?.nextMilestone).slice(0, 2).map((project) => <p key={project.id} className="truncate text-[11px] text-muted-foreground">Next: {projectHealth[project.id].nextMilestone?.title} · {projectHealth[project.id].nextMilestone?.dueDate}</p>)}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[12px] text-muted-foreground">
                <span>{allProjects.filter((project) => project.status !== 'completed' && project.status !== 'archived').length} active</span>
                <span className="tabular-nums">{allDecryptedTasks.filter((task) => isOverdue(task.deadline, scheduleNow)).length} overdue</span>
              </div>
            </section>
          )}

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
