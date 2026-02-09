'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { ProjectModal } from '@/components/ProjectModal';
import { TaskList } from '@/components/TaskList';
import { db } from '@/lib/db';
import { Project } from '@/types';
import { Button, Spinner, Surface } from "@heroui/react";
import { ArrowLeft, Calendar, Edit, LayoutGrid, ListTodo, Trash } from "lucide-react";
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ProjectDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    useEffect(() => {
        if (id) {
            fetchProject();
        }
    }, [id]);

    const fetchProject = async () => {
        setIsLoading(true);
        try {
            const data = await db.getProject(id as string);
            setProject(data);
        } catch (error) {
            console.error(error);
            router.push('/projects');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdate = async (data: Partial<Project>) => {
        if (project) {
            await db.updateProject(project.$id, data);
            fetchProject();
            setIsProjectModalOpen(false);
        }
    };

    const handleDelete = async () => {
        if (project) {
            await db.deleteProject(project.$id);
            router.push('/projects');
        }
    };

    if (isLoading) {
        return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
    }

    if (!project) return null;

    return (
        <div className="max-w-[1200px] mx-auto p-6 md:p-12 space-y-10">
            <header className="flex flex-col gap-6">
                <Link href="/projects" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-bold text-xs uppercase tracking-widest">
                    <ArrowLeft size={14} />
                    Back to Pipeline
                </Link>
                
                <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-[2rem] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xl shadow-primary/5">
                                <LayoutGrid size={28} />
                            </div>
                            <div>
                                <h1 className="text-4xl font-black tracking-tighter text-foreground">{project.name}</h1>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-bold italic uppercase tracking-widest">
                                    <Calendar size={14} className="text-primary/50" />
                                    <span>Established {new Date(project.$createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                        {project.description && (
                            <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl italic">
                               &quot; {project.description} &quot;
                            </p>
                        )}
                    </div>
                    
                    <div className="flex gap-2">
                        <Button variant="secondary" className="rounded-2xl h-12 px-6 font-bold" onPress={() => setIsProjectModalOpen(true)}>
                            <Edit size={18} className="mr-2" />
                            Edit
                        </Button>
                        <Button variant="ghost" className="rounded-2xl h-12 px-6 font-bold text-danger hover:bg-danger/10" onPress={() => setIsDeleteModalOpen(true)}>
                            <Trash size={18} className="mr-2" />
                            Archive
                        </Button>
                    </div>
                </div>
            </header>

            <Surface className="p-0 rounded-[3rem] border border-border/40 bg-surface shadow-2xl shadow-primary/5 relative overflow-hidden">
                <div className="relative z-10">
                    <div className="p-8 border-b border-border/20 bg-surface-secondary/30">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-3">
                                    <ListTodo size={24} className="text-primary" />
                                    Project Roadmap
                                </h2>
                                <p className="text-muted-foreground text-sm font-medium">Define milestones and track technical execution.</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-8">
                        <TaskList projectId={project.$id} hideHeader />
                    </div>
                </div>
                
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            </Surface>

            <ProjectModal 
                isOpen={isProjectModalOpen} 
                onClose={() => setIsProjectModalOpen(false)} 
                onSubmit={handleUpdate}
                project={project}
            />

            <DeleteModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDelete}
                title="Archive Project"
                message={`Are you sure you want to archive "${project.name}"? This will move it from the active pipeline.`}
            />
        </div>
    );
}
