'use client';

import { ActivityFeed } from '@/components/ActivityFeed';
import { db } from '@/lib/db';
import { Button, Card, Spinner, Surface } from "@heroui/react";
import { ArrowRight, Book, CheckSquare, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from 'react';

export default function Home() {
  const [stats, setStats] = useState({ projects: 0, guides: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-12">
        <h1 className="text-4xl font-bold text-foreground">Welcome to justspace</h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Your central hub for project tracking and deployment documentation.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-full bg-accent/20 text-accent">
              <CheckSquare size={24} />
            </div>
            <Card.Header className="p-0">
              <Card.Title>Track Projects</Card.Title>
            </Card.Header>
          </div>
          <Card.Content className="p-0">
            <p className="text-muted-foreground mb-4">
              Keep track of your consulting projects, tasks, and deadlines in one place.
            </p>
            {isLoading ? <Spinner size="sm" /> : (
              <p className="text-sm font-medium">{stats.projects} Active Projects</p>
            )}
          </Card.Content>
          <Card.Footer className="px-0 pb-0 mt-6">
            <Link href="/projects" className="w-full">
              <Button className="w-full">
                Go to Projects
                <ArrowRight size={16} className="ml-2" />
              </Button>
            </Link>
          </Card.Footer>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-full bg-primary/20 text-primary">
              <Book size={24} />
            </div>
            <Card.Header className="p-0">
              <Card.Title>Deployment Wiki</Card.Title>
            </Card.Header>
          </div>
          <Card.Content className="p-0">
            <p className="text-muted-foreground mb-4">
              Document your deployment guides for different stacks like LGTM, Kubernetes, and more.
            </p>
            {isLoading ? <Spinner size="sm" /> : (
              <p className="text-sm font-medium">{stats.guides} Deployment Guides</p>
            )}
          </Card.Content>
          <Card.Footer className="px-0 pb-0 mt-6">
            <Link href="/wiki" className="w-full">
              <Button className="w-full">
                Explore Wiki
                <ArrowRight size={16} className="ml-2" />
              </Button>
            </Link>
          </Card.Footer>
        </Card>
      </div>

      <section className="mt-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                <Surface variant="tertiary" className="p-8 rounded-3xl border border-border h-full">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold">Quick Actions</h2>
                    </div>
                    {/* ... actions content ... */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <Link href="/projects">
                            <Button variant="secondary" className="w-full py-10 flex-col gap-2">
                                <Plus size={24} />
                                New Project
                            </Button>
                        </Link>
                        <Link href="/wiki">
                            <Button variant="secondary" className="w-full py-10 flex-col gap-2">
                                <Book size={24} />
                                New Guide
                            </Button>
                        </Link>
                    </div>
                </Surface>
            </div>
            <div className="lg:col-span-1">
                <ActivityFeed />
            </div>
        </div>
      </section>
            <h2 className="text-2xl font-bold">Quick Start</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href="/projects">
              <Button variant="outline" className="w-full justify-start h-16 px-6 text-lg">
                <Plus size={20} className="mr-4 text-accent" />
                Create a New Project
              </Button>
            </Link>
            <Link href="/wiki">
              <Button variant="outline" className="w-full justify-start h-16 px-6 text-lg">
                <Plus size={20} className="mr-4 text-primary" />
                Write a Deployment Guide
              </Button>
            </Link>
          </div>
        </Surface>
      </section>
    </div>
  );
}
