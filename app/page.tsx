'use client';

import { ActivityFeed } from '@/components/ActivityFeed';
import { ResourceHeatmap } from '@/components/ResourceHeatmap';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { Project, Snippet, Task } from '@/types';
import { Button, Chip, Spinner, Surface, Tooltip } from "@heroui/react";
import {
    AltArrowRight as ArrowRightAlt,
    Book,
    CodeCircle as Code,
    LockPassword as LockIcon,
    AddCircle as Plus,
    StarsLine as Sparkles,
    Target,
    Checklist as TaskIcon,
    ShieldKeyhole as VaultIcon
} from "@solar-icons/react";
import dayjs from "dayjs";
import Link from "next/link";
import { useCallback, useEffect, useState } from 'react';

export default function Home() {
  const [stats, setStats] = useState({ projects: 0, guides: 0, snippets: 0, tasks: 0 });
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [recentSnippets, setRecentSnippets] = useState<Snippet[]>([]);
  const [tasksDueToday, setTasksDueToday] = useState<Task[]>([]);
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
                    const access = await db.getAccessKey(p.$id, user.$id);
                    if (access) {
                        const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                        const nameData = JSON.parse(p.name);
                        const descData = JSON.parse(p.description);
                        return { 
                            ...p, 
                            name: await decryptData(nameData, docKey),
                            description: await decryptData(descData, docKey)
                        };
                    }
                } catch (e) {
                    console.error('Failed to decrypt project on dashboard:', p.$id, e);
                }
            }
            return { 
                ...p, 
                name: 'Encrypted Project',
                description: 'Synchronize vault to access project details.'
            };
        }
        return p;
      }));

      const processedSnippets = await Promise.all(snippets.documents.slice(0, 3).map(async (s) => {
        if (s.isEncrypted && privateKey && user) {
            try {
                const access = await db.getAccessKey(s.$id, user.$id);
                if (access) {
                    const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    const titleData = JSON.parse(s.title);
                    return { ...s, title: await decryptData(titleData, docKey) };
                }
            } catch (e) {
                console.error('Failed to decrypt snippet:', s.$id, e);
            }
            return { ...s, title: 'Secure Snippet' };
        }
        return s;
      }));

      const processedTasksData = await Promise.all(allTasks.documents.filter(t => !t.completed).map(async (t) => {
        if (t.isEncrypted && privateKey && user) {
            try {
                const access = await db.getAccessKey(t.projectId, user.$id);
                if (access) {
                    const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    const titleData = JSON.parse(t.title);
                    return { ...t, title: await decryptData(titleData, docKey) };
                }
            } catch (e) {
                console.error('Failed to decrypt task:', t.$id, e);
            }
            return { ...t, title: 'Secure Task' };
        }
        return t;
      }));

      const dueToday = processedTasksData.filter(t => t.deadline && dayjs(t.deadline).isSame(dayjs(), 'day'));

      setAllProjects(processedProjects);
      setRecentProjects(processedProjects.slice(0, 2));
      setRecentSnippets(processedSnippets);
      setRecentTasks(processedTasksData.slice(0, 3));
      setTasksDueToday(dueToday);
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
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-accent font-bold tracking-[0.2em] text-[10px] opacity-60 uppercase">
            <Sparkles size={14} weight="Bold" className="animate-pulse" />
            Control Hub
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground leading-tight">
            {greeting}, {user?.name || 'Justin'}_
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground font-medium opacity-60">
              Consultant OS status: optimal. 
            </p>
            <Tooltip delay={0}>
                <Tooltip.Trigger aria-label="Vault status">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-sm transition-all cursor-help ${privateKey ? 'bg-success/5 border-success/20 text-success' : 'bg-warning/5 border-warning/20 text-warning'}`}>
                        {privateKey ? <VaultIcon size={12} weight="Bold" /> : <LockIcon size={12} weight="Bold" />}
                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                            Vault {privateKey ? 'Active' : 'Locked'}
                        </span>
                    </div>
                </Tooltip.Trigger>
                <Tooltip.Content showArrow placement="top" className="font-bold">
                    <Tooltip.Arrow />
                    {privateKey ? "Vault Unlocked" : "Vault Locked - Some data hidden"}
                </Tooltip.Content>
            </Tooltip>
            <span className="text-foreground font-bold tracking-widest text-[10px] uppercase opacity-40">{stats.projects} Projects Active</span>
          </div>
        </div>
        <div className="flex gap-3 bg-surface p-1.5 rounded-2xl border border-border/40 shadow-sm self-stretch md:self-auto">
          <Link href="/snippets">
            <Button variant="ghost" isIconOnly className="rounded-xl h-9 w-9 opacity-50 hover:opacity-100 transition-all">
              <Code size={18} weight="Bold" />
            </Button>
          </Link>
          <Link href="/wiki">
            <Button variant="ghost" className="rounded-xl h-9 px-5 font-bold tracking-tight opacity-50 hover:opacity-100 transition-all text-xs">
              <Book size={16} weight="Bold" className="mr-2" />
              Wiki
            </Button>
          </Link>
          <Link href="/projects">
            <Button variant="primary" className="rounded-xl h-9 px-5 font-bold tracking-tight shadow-xl shadow-accent/10 text-xs text-white">
              <Plus size={16} weight="Bold" className="mr-2" />
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Surface className="p-4 rounded-[1.5rem] border border-border/40 bg-surface group hover:border-accent/30 transition-all duration-500 hover:shadow-lg">
              <div className="flex flex-col justify-between gap-3">
                <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center text-foreground group-hover:scale-110 transition-transform">
                  <Target size={16} weight="Bold" />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight">{stats.projects}</h3>
                  <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground opacity-40">Projects</p>
                </div>
              </div>
            </Surface>

            <Surface className="p-4 rounded-[1.5rem] border border-border/40 bg-surface group hover:border-accent/30 transition-all duration-500 hover:shadow-lg">
              <div className="flex flex-col justify-between gap-3">
                <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center text-foreground group-hover:scale-110 transition-transform">
                  <Book size={16} weight="Bold" />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight">{stats.guides}</h3>
                  <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground opacity-40">Wiki Pages</p>
                </div>
              </div>
            </Surface>

            <Surface className="p-4 rounded-[1.5rem] border border-border/40 bg-surface group hover:border-accent/30 transition-all duration-500 hover:shadow-lg">
              <div className="flex flex-col justify-between gap-3">
                <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center text-foreground group-hover:scale-110 transition-transform">
                  <Code size={16} weight="Bold" />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight">{stats.snippets}</h3>
                  <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground opacity-40">Snippets</p>
                </div>
              </div>
            </Surface>

            <Surface className="p-4 rounded-[1.5rem] border border-border/40 bg-surface group hover:border-accent/30 transition-all duration-500 hover:shadow-lg">
              <div className="flex flex-col justify-between gap-3">
                <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center text-foreground group-hover:scale-110 transition-transform">
                  <TaskIcon size={16} weight="Bold" />
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight">{stats.tasks}</h3>
                  <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground opacity-40">Pending</p>
                </div>
              </div>
            </Surface>
          </div>

          {/* Tasks Due Today */}
          {tasksDueToday.length > 0 && (
            <section className="space-y-4 mb-8">
              <div className="flex items-center gap-3 pb-2 border-b border-border/20">
                <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center text-warning shadow-sm border border-warning/20">
                  <TaskIcon size={16} weight="Bold" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground">Due Today</h2>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] opacity-60">Action Required</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tasksDueToday.map(task => {
                    const project = allProjects.find(p => p.$id === task.projectId);
                    return (
                      <Link href={`/projects/${task.projectId}`} key={task.$id}>
                        <Surface className="p-4 rounded-2xl border border-warning/20 bg-warning/5 hover:bg-warning/10 transition-all group cursor-pointer flex items-center justify-between">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-sm font-bold text-foreground">{task.title}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] text-foreground/40 font-black uppercase tracking-widest bg-foreground/5 px-1.5 py-0.5 rounded">
                                    {project ? project.name : 'Unknown Project'}
                                </span>
                                {task.priority && (
                                    <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                                        task.priority === 'urgent' ? 'text-danger bg-danger/10' :
                                        task.priority === 'high' ? 'text-warning bg-warning/10' :
                                        'text-accent bg-accent/10'
                                    }`}>
                                        {task.priority}
                                    </span>
                                )}
                            </div>
                          </div>
                          <div className="h-8 w-8 rounded-full bg-surface border border-border/10 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                            <ArrowRightAlt size={16} className="text-foreground/40 group-hover:text-warning transition-colors" />
                          </div>
                        </Surface>
                      </Link>
                    )
                  })}
              </div>
            </section>
          )}

          {/* Recent Projects Section */}
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-border/20 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-foreground/5 flex items-center justify-center text-foreground/40">
                  <Target size={20} weight="Bold" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Active Projects</h2>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] opacity-40 mt-0.5">Project overview</p>
                </div>
              </div>
              <Link href="/projects">
                <Button variant="ghost" className="rounded-xl h-10 px-4 font-bold tracking-tight opacity-50 hover:opacity-100 transition-all border border-border/40 text-xs">
                  Full Board <ArrowRightAlt size={16} weight="Bold" className="ml-2" />
                </Button>
              </Link>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {isLoading ? (
                Array(2).fill(0).map((_, i) => (
                  <Surface key={i} className="h-48 rounded-[2rem] border border-border/40 flex items-center justify-center bg-surface">
                    <Spinner color="accent" />
                  </Surface>
                ))
              ) : recentProjects.length > 0 ? (
                recentProjects.map((project) => (
                  <Surface key={project.$id} className="p-8 rounded-[2rem] border border-border/40 bg-surface/50 backdrop-blur-md hover:border-accent/40 transition-all duration-500 group relative overflow-hidden hover:-translate-y-1 hover:shadow-2xl hover:shadow-accent/5">
                    <div className="relative z-10 flex flex-col h-full justify-between gap-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-accent" />
                            <Chip size="sm" variant="soft" color={project.status === 'completed' ? 'success' : 'accent'} className="h-6 px-2.5 rounded-lg opacity-80 border border-current/10">
                                <Chip.Label className="font-bold text-[10px] uppercase tracking-widest">
                                    {project.status}
                                </Chip.Label>
                            </Chip>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
                             {new Date(project.$createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h3 className="text-2xl font-bold tracking-tight group-hover:text-accent transition-colors">{project.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed font-medium opacity-80">{project.description}</p>
                      </div>
                      <Link href={`/projects/${project.$id}`}>
                        <Button variant="secondary" className="w-full rounded-[1.25rem] font-bold h-14 group-hover:bg-foreground group-hover:text-background transition-all border border-border/40 shadow-sm uppercase text-[11px] tracking-widest">
                          Project Details <ArrowRightAlt size={20} weight="Bold" className="ml-2" />
                        </Button>
                      </Link>
                    </div>
                    {/* Abstract background highlight */}
                    <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-accent/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Surface>
                ))
              ) : (
                <Surface className="col-span-2 p-12 rounded-[2rem] border border-dashed border-border flex flex-col items-center text-center space-y-4">
                  <div className="p-4 rounded-2xl bg-surface-secondary text-muted-foreground">
                    <Target size={32} weight="Linear" />
                  </div>
                  <p className="text-muted-foreground font-medium">No active projects found. Start one to see it here.</p>
                  <Link href="/projects">
                    <Button variant="primary" className="rounded-xl font-bold">New Project</Button>
                  </Link>
                </Surface>
              )}
            </div>
          </section>

          {/* New Quick Glance Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Recent Snippets */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-widest opacity-40">Recent Snippets</h2>
                    <Link href="/snippets" className="text-[10px] font-bold text-accent">View all</Link>
                </div>
                <div className="space-y-2">
                    {recentSnippets.length > 0 ? recentSnippets.map(snippet => (
                        <Link key={snippet.$id} href="/snippets">
                            <Surface className="p-3 rounded-xl border border-border/40 hover:border-accent/40 bg-surface/50 transition-all flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-foreground/5 flex items-center justify-center">
                                        <Code size={14} className="text-muted-foreground" />
                                    </div>
                                    <span className="text-xs font-semibold truncate max-w-[150px]">{snippet.title}</span>
                                </div>
                                <ArrowRightAlt size={14} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                            </Surface>
                        </Link>
                    )) : (
                        <p className="text-[10px] text-muted-foreground italic">No snippets available.</p>
                    )}
                </div>
            </section>

            {/* Active Tasks */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-widest opacity-40">Top Tasks</h2>
                    <Link href="/projects" className="text-[10px] font-bold text-accent">Go to board</Link>
                </div>
                <div className="space-y-2">
                    {recentTasks.length > 0 ? recentTasks.map(task => (
                        <Link key={task.$id} href={`/projects/${task.projectId}`}>
                            <Surface className="p-3 rounded-xl border border-border/40 hover:border-accent/40 bg-surface/50 transition-all flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-foreground/5 flex items-center justify-center">
                                        <div className="w-2 h-2 rounded-full bg-accent/40" />
                                    </div>
                                    <span className="text-xs font-semibold truncate max-w-[150px]">{task.title}</span>
                                </div>
                                <ArrowRightAlt size={14} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                            </Surface>
                        </Link>
                    )) : (
                        <p className="text-[10px] text-muted-foreground italic">All caught up!</p>
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
