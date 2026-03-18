'use client';

import { ActivityFeed } from '@/components/ActivityFeed';
import { ResourceHeatmap } from '@/components/ResourceHeatmap';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { Project, Snippet, Task } from '@/types';
import { Button, Chip, Spinner, Tooltip } from "@heroui/react";
import dayjs from "dayjs";
import {
    ArrowRight,
    BookOpen,
    Briefcase,
    CheckSquare,
    Clock,
    Code,
    Lock,
    Plus,
    ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from 'react';

export default function Home() {
  const [stats, setStats] = useState({ projects: 0, guides: 0, snippets: 0, tasks: 0 });
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [recentSnippets, setRecentSnippets] = useState<Snippet[]>([]);
  const [tasksDueThisWeek, setTasksDueThisWeek] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
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
        db.listAllTasks(50)
      ]);
      
      const pendingTasksCount = allTasks.documents.filter(t => !t.completed).length;

      setStats({
        projects: projects.total,
        guides: guides.total,
        snippets: snippets.total,
        tasks: pendingTasksCount
      });
      
      // Decrypt data if possible, or show locked placeholders
      const processedProjects = await Promise.all(projects.documents.map(async (p) => {
        if (p.isEncrypted) {
            if (privateKey && user) {
                try {
                    const access = await db.getAccessKey(p.id);
                    if (access) {
                        const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                        let name = 'Encrypted Project';
                        let description = 'Resource is encrypted with vault key.';
                        
                        try {
                           const nameData = JSON.parse(p.name);
                           name = await decryptData(nameData, docKey);
                        } catch (e) {
                           console.warn('Failed to parse encrypted name for project:', p.id);
                        }

                        if (p.description) {
                            try {
                                const descData = JSON.parse(p.description);
                                description = await decryptData(descData, docKey);
                            } catch (e) {
                                console.warn('Failed to parse encrypted description for project:', p.id);
                            }
                        }
                        
                        return { ...p, name, description };
                    }
                } catch (e) {
                    console.error('Failed to decrypt project on dashboard:', p.id, e);
                }
            }
            return { 
                ...p, 
                name: 'Encrypted Project',
                description: 'Unlock vault to access project details.'
            };
        }
        return p;
      }));

      const processedSnippets = await Promise.all(snippets.documents.slice(0, 3).map(async (s) => {
        if (s.isEncrypted && privateKey && user) {
            try {
                const access = await db.getAccessKey(s.id);
                if (access) {
                    const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    try {
                        const titleData = JSON.parse(s.title);
                        return { ...s, title: await decryptData(titleData, docKey) };
                    } catch (e) {
                        console.warn('Failed to parse snippet title:', s.id);
                    }
                }
            } catch (e) {
                console.error('Failed to decrypt snippet:', s.id, e);
            }
            return { ...s, title: 'Secure Snippet' };
        }
        return s;
      }));

      const processedTasksData = await Promise.all(allTasks.documents.filter(t => !t.completed).map(async (t) => {
        if (t.isEncrypted && privateKey && user) {
            try {
                // Tasks are usually encrypted with the project key
                const access = await db.getAccessKey(t.projectId);
                if (access) {
                    const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    try {
                        const titleData = JSON.parse(t.title);
                        return { ...t, title: await decryptData(titleData, docKey) };
                    } catch (e) {
                        console.warn('Failed to parse task title:', t.id);
                    }
                }
            } catch (e) {
                console.error('Failed to decrypt task:', t.id, e);
            }
            return { ...t, title: 'Secure Task' };
        }
        return t;
      }));

      const now = dayjs();
      const endOfWeek = now.endOf('week');
      const dueThisWeek = processedTasksData
        .filter(t => t.deadline && (dayjs(t.deadline).isSame(now, 'day') || dayjs(t.deadline).isAfter(now)) && dayjs(t.deadline).isBefore(endOfWeek.add(1, 'day')))
        .sort((a, b) => dayjs(a.deadline).unix() - dayjs(b.deadline).unix());

      setAllProjects(processedProjects);
      setRecentProjects(processedProjects.slice(0, 2));
      setRecentSnippets(processedSnippets);
      setRecentTasks(processedTasksData.slice(0, 3));
      setTasksDueThisWeek(dueThisWeek);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [privateKey, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="max-w-[1200px] mx-auto p-6 md:p-8 space-y-6">
      {/* Refined Header */}
      <section className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {greeting}, {user?.name?.split(' ')[0] || 'there'}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">
              {dayjs().format('dddd, MMMM D')}
            </p>
            <Tooltip delay={0}>
                <Tooltip.Trigger aria-label="Vault status">
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium cursor-help ${
                        privateKey
                            ? 'bg-success-muted border-success/20 text-success'
                            : 'bg-warning-muted border-warning/20 text-warning'
                    }`}>
                        {privateKey ? <ShieldCheck size={12} /> : <Lock size={12} />}
                        Vault {privateKey ? 'unlocked' : 'locked'}
                    </div>
                </Tooltip.Trigger>
                <Tooltip.Content showArrow placement="top">
                    <Tooltip.Arrow />
                    {privateKey ? 'Vault is unlocked — encrypted data is accessible.' : 'Vault is locked — unlock to see encrypted content.'}
                </Tooltip.Content>
            </Tooltip>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/snippets">
            <Button variant="ghost" isIconOnly className="rounded-lg h-9 w-9 text-muted-foreground hover:text-foreground">
              <Code size={16} />
            </Button>
          </Link>
          <Link href="/wiki">
            <Button variant="ghost" className="rounded-lg h-9 px-4 text-sm font-medium text-muted-foreground hover:text-foreground">
              <BookOpen size={15} className="mr-2" />
              Wiki
            </Button>
          </Link>
          <Link href="/projects">
            <Button variant="primary" className="rounded-lg h-9 px-4 text-sm font-medium">
              <Plus size={15} className="mr-1.5" />
              New Project
            </Button>
          </Link>
        </div>
      </section>

      {/* Main Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Primary Content */}
        <div className="lg:col-span-8 space-y-8">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Projects', value: stats.projects, icon: Briefcase },
              { label: 'Wiki pages', value: stats.guides, icon: BookOpen },
              { label: 'Snippets', value: stats.snippets, icon: Code },
              { label: 'Pending tasks', value: stats.tasks, icon: CheckSquare },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="p-4 rounded-xl border border-border bg-surface hover:border-accent/30 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <Icon size={15} className="text-muted-foreground" />
                </div>
                <p className="text-2xl font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          {/* Tasks Due This Week */}
          {tasksDueThisWeek.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-warning" />
                  <h2 className="text-sm font-semibold text-foreground">Due this week</h2>
                </div>
              </div>
              <div className="space-y-2">
                {tasksDueThisWeek.map(task => {
                    const project = allProjects.find(p => p.id === task.projectId);
                    return (
                      <Link href={`/projects/${task.projectId}`} key={task.id}>
                        <div className="p-3 rounded-lg border border-border bg-surface hover:border-warning/30 hover:bg-warning-muted/50 transition-colors flex items-center justify-between group">
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <span className="text-sm font-medium text-foreground truncate">{task.title}</span>
                            <div className="flex items-center gap-2">
                                {project && (
                                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">{project.name}</span>
                                )}
                                {task.deadline && (
                                    <span className="text-xs font-medium text-warning">
                                        {dayjs(task.deadline).format('MMM D')}
                                    </span>
                                )}
                                {task.priority && (
                                    <span className={`text-xs font-medium ${
                                        task.priority === 'urgent' ? 'text-danger' :
                                        task.priority === 'high' ? 'text-warning' :
                                        task.priority === 'medium' ? 'text-accent' :
                                        'text-muted-foreground'
                                    }`}>
                                        {task.priority}
                                    </span>
                                )}
                            </div>
                          </div>
                          <ArrowRight size={14} className="text-muted-foreground shrink-0 ml-2" />
                        </div>
                      </Link>
                    );
                })}
              </div>
            </section>
          )}

          {/* Recent Projects Section */}
          <section className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Briefcase size={16} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Active Projects</h2>
              </div>
              <Link href="/projects">
                <Button variant="ghost" className="rounded-lg h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground">
                  View all <ArrowRight size={13} className="ml-1" />
                </Button>
              </Link>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {isLoading ? (
                Array(2).fill(0).map((_, i) => (
                  <div key={i} className="h-44 rounded-xl border border-border flex items-center justify-center bg-surface">
                    <Spinner color="accent" />
                  </div>
                ))
              ) : recentProjects.length > 0 ? (
                recentProjects.map((project) => (
                  <div key={project.id} className="p-5 rounded-xl border border-border bg-surface hover:border-accent/40 transition-colors group">
                    <div className="flex flex-col h-full justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Chip size="sm" variant="soft" color={project.status === 'completed' ? 'success' : 'accent'} className="h-5 px-2 rounded-md">
                              <Chip.Label className="font-medium text-[11px]">
                                  {project.status}
                              </Chip.Label>
                          </Chip>
                          <span className="text-xs text-muted-foreground">
                             {new Date(project.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-foreground group-hover:text-accent transition-colors">{project.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
                      </div>
                      <Link href={`/projects/${project.id}`}>
                        <Button variant="secondary" className="w-full rounded-lg text-sm font-medium h-9">
                          View project <ArrowRight size={14} className="ml-1.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-2 p-10 rounded-xl border border-dashed border-border flex flex-col items-center text-center space-y-3">
                  <Briefcase size={28} className="text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No active projects. Start one to see it here.</p>
                  <Link href="/projects">
                    <Button variant="primary" className="rounded-lg text-sm h-9">New Project</Button>
                  </Link>
                </div>
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Recent Snippets */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">Recent Snippets</h2>
                    <Link href="/snippets" className="text-xs font-medium text-accent hover:underline underline-offset-4">View all</Link>
                </div>
                <div className="space-y-1.5">
                    {recentSnippets.length > 0 ? recentSnippets.map(snippet => (
                        <Link key={snippet.id} href="/snippets">
                            <div className="p-3 rounded-lg border border-border bg-surface hover:border-accent/30 transition-colors flex items-center justify-between group">
                                <div className="flex items-center gap-2.5">
                                    <Code size={14} className="text-muted-foreground shrink-0" />
                                    <span className="text-sm font-medium truncate max-w-[150px]">{snippet.title}</span>
                                </div>
                                <ArrowRight size={13} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </Link>
                    )) : (
                        <p className="text-sm text-muted-foreground">No snippets yet.</p>
                    )}
                </div>
            </section>

            {/* Active Tasks */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">Recent Tasks</h2>
                    <Link href="/projects" className="text-xs font-medium text-accent hover:underline underline-offset-4">View board</Link>
                </div>
                <div className="space-y-1.5">
                    {recentTasks.length > 0 ? recentTasks.map(task => (
                        <Link key={task.id} href={`/projects/${task.projectId}`}>
                            <div className="p-3 rounded-lg border border-border bg-surface hover:border-accent/30 transition-colors flex items-center justify-between group">
                                <div className="flex items-center gap-2.5">
                                    <CheckSquare size={14} className="text-muted-foreground shrink-0" />
                                    <span className="text-sm font-medium truncate max-w-[150px]">{task.title}</span>
                                </div>
                                <ArrowRight size={13} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </Link>
                    )) : (
                        <p className="text-sm text-muted-foreground">All caught up!</p>
                    )}
                </div>
            </section>
          </div>
        </div>

        {/* Right Column: Sidebar Insights */}
        <div className="lg:col-span-4 space-y-10">
          <ResourceHeatmap projects={allProjects} />
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
