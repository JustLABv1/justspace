'use client';

import { ActivityFeed } from '@/components/ActivityFeed';
import { db } from '@/lib/db';
import { Project, WikiGuide } from '@/types';
import { Button, Chip, Spinner, Surface } from "@heroui/react";
import { ArrowRight, Book, LayoutDashboard, Plus, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from 'react';

export default function Home() {
  const [stats, setStats] = useState({ projects: 0, guides: 0 });
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [recentGuides, setRecentGuides] = useState<WikiGuide[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hours = new Date().getHours();
    if (hours < 12) setGreeting('Good Morning');
    else if (hours < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');

    const fetchData = async () => {
      try {
        const [projects, guides] = await Promise.all([
          db.listProjects(),
          db.listGuides()
        ]);
        
        setStats({
          projects: projects.total,
          guides: guides.total
        });

        // Get top 2 most recent
        setRecentProjects(projects.documents.slice(0, 2));
        setRecentGuides(guides.documents.slice(0, 2));
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="max-w-[1400px] mx-auto p-6 md:p-12 space-y-12">
      {/* Refined Header */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-8 pb-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary font-bold tracking-widest uppercase text-xs">
            <Sparkles size={14} className="animate-pulse" />
            Workspace Overview
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
            {greeting}, Justin.
          </h1>
          <p className="text-muted-foreground font-medium">
            Everything is looking good. You have <span className="text-foreground">{stats.projects} active projects</span> to focus on.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/wiki">
            <Button variant="secondary" className="rounded-2xl h-12 px-6 font-bold border-border/40">
              <Book size={18} className="mr-2" />
              Wiki
            </Button>
          </Link>
          <Link href="/projects">
            <Button variant="primary" className="rounded-2xl h-12 px-6 font-bold shadow-xl shadow-primary/10">
              <Plus size={18} className="mr-2" />
              New Project
            </Button>
          </Link>
        </div>
      </section>

      {/* Bento Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-12 gap-6">
        <Surface variant="secondary" className="md:col-span-2 lg:col-span-3 p-8 rounded-[2rem] border border-border/50 bg-surface-lowest relative overflow-hidden group hover:border-primary/30 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5">
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="w-12 h-12 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary mb-8 group-hover:scale-110 transition-transform duration-500">
              <Target size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Projects</p>
              {isLoading ? <Spinner size="sm" /> : (
                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-black">{stats.projects}</p>
                  <span className="text-xs font-bold text-success">+1 today</span>
                </div>
              )}
            </div>
          </div>
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-primary/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
        </Surface>

        <Surface variant="secondary" className="md:col-span-2 lg:col-span-3 p-8 rounded-[2rem] border border-border/50 bg-surface-lowest relative overflow-hidden group hover:border-accent/30 transition-all duration-500 hover:shadow-2xl hover:shadow-accent/5">
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="w-12 h-12 rounded-2xl bg-accent/5 border border-accent/10 flex items-center justify-center text-accent mb-8 group-hover:scale-110 transition-transform duration-500">
              <Book size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Guides</p>
              {isLoading ? <Spinner size="sm" /> : (
                <p className="text-4xl font-black">{stats.guides}</p>
              )}
            </div>
          </div>
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-accent/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
        </Surface>

        <Surface variant="tertiary" className="md:col-span-4 lg:col-span-6 p-8 rounded-[2rem] border border-border/50 bg-gradient-to-br from-surface-lowest to-surface-secondary/30 relative flex flex-col justify-center overflow-hidden">
          <div className="relative z-10 space-y-4">
            <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
              <LayoutDashboard size={22} className="text-primary" />
              Focus Mode
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Review your most recent updates and continue your workflow without interruption.
            </p>
            <div className="flex gap-3 pt-2">
              <Link href="/projects" className="flex-1">
                <Button variant="secondary" className="w-full rounded-xl font-bold h-11 border-border/40">Resume Latest</Button>
              </Link>
            </div>
          </div>
          <div className="absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-primary/5 to-transparent flex items-center justify-center opacity-50">
             <Target size={120} className="text-primary/10 rotate-12" />
          </div>
        </Surface>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Main Content Area */}
        <div className="lg:col-span-8 space-y-12">
          {/* Recent Projects Section */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black tracking-tight">Active Continuous</h2>
                <p className="text-sm text-muted-foreground font-medium">Your currently active project pipeline</p>
              </div>
              <Link href="/projects">
                <Button variant="secondary" className="rounded-xl h-10 px-4 font-bold border-border/40">
                  Manage Board
                </Button>
              </Link>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {isLoading ? (
                Array(2).fill(0).map((_, i) => (
                  <Surface key={i} className="h-48 rounded-[2rem] border border-border/40 flex items-center justify-center">
                    <Spinner color="accent" />
                  </Surface>
                ))
              ) : recentProjects.length > 0 ? (
                recentProjects.map((project) => (
                  <Surface key={project.$id} className="p-6 rounded-[2rem] border border-border/40 bg-surface-lowest hover:border-primary/20 transition-all group relative overflow-hidden">
                    <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Chip size="sm" variant="soft" color={project.status === 'completed' ? 'success' : 'accent'} className="font-bold">
                            {project.status.toUpperCase()}
                          </Chip>
                          <span className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground italic">
                            Updated {new Date(project.$createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h3 className="text-lg font-black tracking-tight group-hover:text-primary transition-colors">{project.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{project.description}</p>
                      </div>
                      <Link href="/projects">
                        <Button variant="secondary" className="w-full rounded-xl font-bold italic h-10 group-hover:bg-primary group-hover:text-white transition-all border-border/40">
                          Jump to Tasks <ArrowRight size={14} className="ml-2" />
                        </Button>
                      </Link>
                    </div>
                  </Surface>
                ))
              ) : (
                <Surface className="col-span-2 p-12 rounded-[2rem] border border-dashed border-border flex flex-col items-center text-center space-y-4">
                  <div className="p-4 rounded-2xl bg-surface-secondary text-muted-foreground">
                    <Target size={32} />
                  </div>
                  <p className="text-muted-foreground font-medium">No active projects found. Start one to see it here.</p>
                  <Link href="/projects">
                    <Button variant="primary" className="rounded-xl font-bold">New Project</Button>
                  </Link>
                </Surface>
              )}
            </div>
          </section>

          {/* Productivity Highlight */}
          <Surface className="p-10 rounded-[3rem] bg-surface-lowest border border-border/60 overflow-hidden relative group">
            <div className="relative z-10 max-w-md space-y-6">
              <div className="p-3 w-fit rounded-2xl bg-primary/5 border border-primary/10 text-primary">
                <Sparkles size={24} />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black leading-tight tracking-tight">The Art of Documentation.</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Your Knowledge Base is the brain of your workflow. Keep it sharp, keep it updated, and scale your productivity.
                </p>
              </div>
              <Link href="/wiki">
                <Button variant="primary" className="rounded-2xl px-10 h-14 font-black italic shadow-xl shadow-primary/10">
                  Open Wiki Engine
                </Button>
              </Link>
            </div>
            {/* Visual element */}
            <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/5 rounded-full blur-[100px]" />
            <div className="absolute right-12 bottom-0 top-0 w-1/3 hidden md:flex items-center justify-center opacity-20 pointer-events-none">
              <Book size={200} className="text-primary rotate-12" />
            </div>
          </Surface>
        </div>

        {/* Activity Sidebar */}
        <div className="lg:col-span-4">
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
