'use client';

import { ActivityFeed } from '@/components/ActivityFeed';
import { db } from '@/lib/db';
import { Button, Card, Chip, Spinner, Surface } from "@heroui/react";
import { ArrowRight, Book, CheckSquare, Plus, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from 'react';

export default function Home() {
  const [stats, setStats] = useState({ projects: 0, guides: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hours = new Date().getHours();
    if (hours < 12) setGreeting('Good Morning');
    else if (hours < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');

    const fetchStats = async () => {
      try {
        const [projects, guides] = await Promise.all([
          db.listProjects(),
          db.listGuides()
        ]);
        setStats({
          projects: projects.total,
          guides: guides.total
        });
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-10 space-y-10">
      {/* Header Section */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <Chip variant="soft" color="accent" className="mb-4">Dashboard Overview</Chip>
          <h1 className="text-5xl font-black tracking-tighter text-foreground mb-3">
            {greeting}, Justin.
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed">
            Welcome back to your central hub. You have <span className="text-foreground font-semibold">{stats.projects} active projects</span> and <span className="text-foreground font-semibold">{stats.guides} guides</span> in your wiki.
          </p>
        </div>
        <div className="flex bg-surface-lowest border border-border p-1 rounded-2xl shadow-sm">
          <Link href="/projects">
            <Button className="rounded-xl shadow-lg shadow-primary/20 h-12 px-6">
              <Plus size={18} className="mr-2" />
              New Project
            </Button>
          </Link>
        </div>
      </section>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Surface variant="secondary" className="p-8 rounded-[2.5rem] border border-border/50 bg-gradient-to-br from-surface to-surface-lowest relative overflow-hidden group">
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform">
              <CheckSquare size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Projects</h3>
              {isLoading ? <Spinner size="sm" /> : (
                <p className="text-4xl font-bold">{stats.projects}</p>
              )}
            </div>
          </div>
          <Zap className="absolute -right-4 -bottom-4 w-32 h-32 text-primary/5 -rotate-12 transition-transform group-hover:rotate-0" />
        </Surface>

        <Surface variant="secondary" className="p-8 rounded-[2.5rem] border border-border/50 bg-gradient-to-br from-surface to-surface-lowest relative overflow-hidden group">
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent mb-6 group-hover:scale-110 transition-transform">
              <Book size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Wiki Guides</h3>
              {isLoading ? <Spinner size="sm" /> : (
                <p className="text-4xl font-bold">{stats.guides}</p>
              )}
            </div>
          </div>
          <Book className="absolute -right-4 -bottom-4 w-32 h-32 text-accent/5 -rotate-12 transition-transform group-hover:rotate-0" />
        </Surface>

        <Surface variant="tertiary" className="p-8 rounded-[2.5rem] border-primary/20 bg-primary/5 relative flex items-center justify-between group cursor-pointer hover:bg-primary/10 transition-colors">
          <div className="space-y-2">
            <h3 className="text-xl font-bold">Quick Start</h3>
            <p className="text-sm text-muted-foreground">Ready to document a new stack?</p>
            <Link href="/wiki" className="inline-flex items-center text-primary font-semibold hover:underline mt-2">
              Create Wiki Guide <ArrowRight size={16} className="ml-1" />
            </Link>
          </div>
        </Surface>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Main Content Area */}
        <div className="lg:col-span-8 space-y-8">
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Recommended for you</h2>
              <Link href="/projects" className="text-sm text-primary hover:underline font-medium">View all</Link>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Card className="p-6 rounded-[2rem] border-none shadow-xl shadow-black/5 hover:translate-y-[-4px] transition-transform">
                <Card.Header className="flex justify-between items-start pt-0 px-0 mb-4">
                  <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500">
                    <Zap size={20} />
                  </div>
                  <Chip size="sm" variant="soft">Recent</Chip>
                </Card.Header>
                <Card.Content className="px-0 py-0">
                  <h3 className="text-lg font-bold mb-2">Internal Hub Setup</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">Complete the initial configuration for the JustSpace internal platform.</p>
                </Card.Content>
                <Card.Footer className="px-0 pb-0 pt-6">
                  <Link href="/projects" className="w-full">
                    <Button variant="ghost" className="w-full rounded-xl">
                      Continue work
                    </Button>
                  </Link>
                </Card.Footer>
              </Card>

              <Card className="p-6 rounded-[2rem] border-none shadow-xl shadow-black/5 hover:translate-y-[-4px] transition-transform">
                <Card.Header className="flex justify-between items-start pt-0 px-0 mb-4">
                  <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-500">
                    <Book size={20} />
                  </div>
                  <Chip size="sm" variant="soft">Featured</Chip>
                </Card.Header>
                <Card.Content className="px-0 py-0">
                  <h3 className="text-lg font-bold mb-2">EKS Best Practices</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">Review and update the Kubernetes deployment guide.</p>
                </Card.Content>
                <Card.Footer className="px-0 pb-0 pt-6">
                  <Link href="/wiki" className="w-full">
                    <Button variant="ghost" className="w-full rounded-xl">
                      Read guide
                    </Button>
                  </Link>
                </Card.Footer>
              </Card>
            </div>
          </section>

          <Surface className="p-10 rounded-[2.5rem] bg-foreground text-background overflow-hidden relative group">
            <div className="relative z-10 max-w-sm space-y-4">
              <h2 className="text-3xl font-black leading-tight italic">Boost your productivity with Markdown.</h2>
              <p className="text-background/70">Use the integrated Mermaid.js support for beautiful architecture diagrams.</p>
              <Button className="bg-background text-foreground rounded-full px-8 hover:bg-background/90 transition-colors">
                Try it now
              </Button>
            </div>
            <div className="absolute top-0 right-0 h-full w-1/2 bg-gradient-to-l from-primary/20 to-transparent pointer-events-none" />
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/30 blur-[100px] rounded-full" />
          </Surface>
        </div>

        {/* Sidebar Area */}
        <div className="lg:col-span-4 h-full">
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
