'use client';

import { ActivityFeed } from '@/components/ActivityFeed';
import { ResourceHeatmap } from '@/components/ResourceHeatmap';
import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { Project, WikiGuide } from '@/types';
import { Button, Chip, Spinner, Surface } from "@heroui/react";
import {
    AltArrowRight as ArrowRightAlt,
    Book,
    AddCircle as Plus,
    StarsLine as Sparkles,
    Target
} from "@solar-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from 'react';

export default function Home() {
  const [stats, setStats] = useState({ projects: 0, guides: 0 });
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [recentGuides, setRecentGuides] = useState<WikiGuide[]>([]);
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
      const [projects, guides] = await Promise.all([
        db.listProjects(),
        db.listGuides()
      ]);
      
      setStats({
        projects: projects.total,
        guides: guides.total
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

      const processedGuides = await Promise.all(guides.documents.map(async (g) => {
        if (g.isEncrypted) {
            if (privateKey && user) {
                try {
                    const access = await db.getAccessKey(g.$id, user.$id);
                    if (access) {
                        const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                        const titleData = JSON.parse(g.title);
                        const descData = JSON.parse(g.description);
                        return { 
                            ...g, 
                            title: await decryptData(titleData, docKey),
                            description: await decryptData(descData, docKey)
                        };
                    }
                } catch (e) {
                    console.error('Failed to decrypt guide on dashboard:', g.$id, e);
                }
            }
            return { 
                ...g, 
                title: 'Encrypted Guide',
                description: 'Synchronize vault to access documentation details.'
            };
        }
        return g;
      }));

      setAllProjects(processedProjects);
      setRecentProjects(processedProjects.slice(0, 2));
      setRecentGuides(processedGuides.slice(0, 2));
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
          <div className="flex items-center gap-2 text-primary font-bold tracking-[0.2em] text-[10px] opacity-60 uppercase">
            <Sparkles size={14} weight="Bold" className="animate-pulse" />
            Control Hub
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground leading-tight">
            {greeting}, Justin_
          </h1>
          <p className="text-sm text-muted-foreground font-medium opacity-60">
            Consultant OS status: optimal. <span className="text-foreground font-bold tracking-widest text-[10px] ml-2 uppercase opacity-40">{stats.projects} Projects Active</span>
          </p>
        </div>
        <div className="flex gap-3 bg-surface p-1.5 rounded-2xl border border-border/40 shadow-sm self-stretch md:self-auto">
          <Link href="/wiki">
            <Button variant="ghost" className="rounded-xl h-9 px-5 font-bold tracking-tight opacity-50 hover:opacity-100 transition-all text-xs">
              <Book size={16} weight="Bold" className="mr-2" />
              Wiki
            </Button>
          </Link>
          <Link href="/projects">
            <Button variant="primary" className="rounded-xl h-9 px-5 font-bold tracking-tight shadow-xl shadow-primary/10 text-xs">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Surface className="p-6 rounded-[2rem] border border-border/40 bg-surface group hover:border-primary/30 transition-all duration-500 hover:shadow-lg">
              <div className="flex flex-col h-full justify-between gap-6">
                <div className="w-10 h-10 rounded-xl bg-foreground/5 flex items-center justify-center text-foreground group-hover:scale-110 transition-transform">
                  <Target size={20} weight="Bold" />
                </div>
                <div>
                  <h3 className="text-3xl font-bold tracking-tight">{stats.projects}</h3>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground opacity-40">Active Projects</p>
                </div>
                <Link href="/projects">
                  <Button variant="ghost" size="sm" className="w-fit h-8 rounded-lg text-xs font-bold p-0 hover:text-primary transition-colors">
                    View Pipeline <ArrowRightAlt size={14} className="ml-1" />
                  </Button>
                </Link>
              </div>
            </Surface>

            <Surface className="p-6 rounded-[2rem] border border-border/40 bg-surface group hover:border-primary/30 transition-all duration-500 hover:shadow-lg">
              <div className="flex flex-col h-full justify-between gap-6">
                <div className="w-10 h-10 rounded-xl bg-foreground/5 flex items-center justify-center text-foreground group-hover:scale-110 transition-transform">
                  <Book size={20} weight="Bold" />
                </div>
                <div>
                  <h3 className="text-3xl font-bold tracking-tight">{stats.guides}</h3>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground opacity-40">Knowledge Base</p>
                </div>
                <Link href="/wiki">
                  <Button variant="ghost" size="sm" className="w-fit h-8 rounded-lg text-xs font-bold p-0 hover:text-primary transition-colors">
                    Access Wiki <ArrowRightAlt size={14} className="ml-1" />
                  </Button>
                </Link>
              </div>
            </Surface>
          </div>

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
                  <Surface key={project.$id} className="p-8 rounded-[2rem] border border-border/40 bg-surface/50 backdrop-blur-md hover:border-primary/40 transition-all duration-500 group relative overflow-hidden hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/5">
                    <div className="relative z-10 flex flex-col h-full justify-between gap-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            <Chip size="sm" variant="soft" color={project.status === 'completed' ? 'success' : 'accent'} className="font-bold text-[10px] uppercase tracking-widest px-2.5 h-6 rounded-lg opacity-80">
                                {project.status}
                            </Chip>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
                             {new Date(project.$createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h3 className="text-2xl font-bold tracking-tight group-hover:text-primary transition-colors">{project.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed font-medium opacity-80">{project.description}</p>
                      </div>
                      <Link href={`/projects/${project.$id}`}>
                        <Button variant="secondary" className="w-full rounded-[1.25rem] font-bold h-14 group-hover:bg-foreground group-hover:text-background transition-all border border-border/40 shadow-sm uppercase text-[11px] tracking-widest">
                          Project Details <ArrowRightAlt size={20} weight="Bold" className="ml-2" />
                        </Button>
                      </Link>
                    </div>
                    {/* Abstract background highlight */}
                    <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
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

          {/* Productivity Highlight */}
          <Surface className="p-12 rounded-[2rem] bg-primary text-white border-none overflow-hidden relative group shadow-2xl shadow-primary/10">
            <div className="relative z-10 max-w-lg space-y-8">
              <div className="w-16 h-16 rounded-[1.25rem] bg-white/20 border border-white/30 flex items-center justify-center text-white shadow-inner">
                <Sparkles size={32} weight="Bold" className="animate-pulse" />
              </div>
              <div className="space-y-4">
                <h2 className="text-3xl font-black leading-[1.1] tracking-tighter uppercase">Infrastructure Knowledge_</h2>
                <p className="text-xl text-white/80 leading-relaxed font-medium">
                  Your knowledge base represents the foundation of your practice. Keep guides synced to maximize output.
                </p>
              </div>
              <Link href="/wiki">
                <Button variant="secondary" className="bg-white text-primary hover:bg-white/90 rounded-[1.5rem] px-12 h-16 font-black shadow-2xl tracking-tight uppercase border-none">
                  Open Documentation
                </Button>
              </Link>
            </div>
            {/* Visual element */}
            <div className="absolute -right-20 -top-20 w-[600px] h-[600px] bg-white/10 rounded-full blur-[120px] mix-blend-overlay opacity-50" />
            <div className="absolute right-12 bottom-0 top-0 w-1/3 hidden lg:flex items-center justify-center opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
              <Book size={300} weight="Bold" className="text-white rotate-12" />
            </div>
          </Surface>
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
