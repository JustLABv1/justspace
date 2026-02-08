'use client';

import { DeleteModal } from '@/components/DeleteModal';
import { WikiModal } from '@/components/WikiModal';
import { db } from '@/lib/db';
import { WikiGuide } from '@/types';
import { Button, Card, SearchField, Spinner } from "@heroui/react";
import { Edit, ExternalLink, Plus, Trash } from "lucide-react";
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function WikiPage() {
    const [guides, setGuides] = useState<WikiGuide[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isWikiModalOpen, setIsWikiModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedGuide, setSelectedGuide] = useState<WikiGuide | undefined>(undefined);

    useEffect(() => {
        fetchGuides();
    }, []);

    const fetchGuides = async () => {
        setIsLoading(true);
        try {
            const data = await db.listGuides();
            setGuides(data.documents);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateOrUpdate = async (data: Partial<WikiGuide>) => {
        if (selectedGuide) {
            await db.updateGuide(selectedGuide.$id, data);
        } else {
            await db.createGuide(data as Omit<WikiGuide, '$id' | '$createdAt'>);
        }
        fetchGuides();
    };

    const handleDelete = async () => {
        if (selectedGuide) {
            await db.deleteGuide(selectedGuide.$id);
            fetchGuides();
        }
    };

    const filteredGuides = guides.filter(guide => 
        guide.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        guide.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isLoading) {
        return <div className="p-8 flex justify-center"><Spinner size="lg" /></div>;
    }

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-3xl font-bold">Deployment Wiki</h1>
                    <p className="text-muted-foreground mt-1">Share and store deployment guides.</p>
                </div>
                <Button variant="primary" onPress={() => { setSelectedGuide(undefined); setIsWikiModalOpen(true); }}>
                    <Plus size={18} className="mr-2" />
                    New Guide
                </Button>
            </div>

            <div className="mb-8 max-w-md">
                <SearchField 
                    variant="secondary"
                    className="w-full"
                    value={searchTerm}
                    onChange={setSearchTerm}
                    aria-label="Search guides"
                >
                    <SearchField.Group>
                        <SearchField.SearchIcon />
                        <SearchField.Input placeholder="Search guides..." />
                        <SearchField.ClearButton />
                    </SearchField.Group>
                </SearchField>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredGuides.map((guide) => (
                    <Card key={guide.$id} className="p-6">
                        <Card.Header className="flex justify-between items-start">
                            <div className="flex-1">
                                <Card.Title className="text-xl">{guide.title}</Card.Title>
                                <Card.Description className="mt-2 text-muted-foreground line-clamp-2">
                                    {guide.description}
                                </Card.Description>
                            </div>
                        </Card.Header>
                        <Card.Footer className="mt-6 flex justify-between items-center">
                            <Link href={`/wiki/${guide.$id}`} className="flex-1 mr-4">
                                <Button className="w-full" variant="secondary">
                                    View Details
                                    <ExternalLink size={14} className="ml-2" />
                                </Button>
                            </Link>
                            <div className="flex gap-1">
                                <Button 
                                    variant="ghost" 
                                    isIconOnly 
                                    size="sm"
                                    onPress={() => { setSelectedGuide(guide); setIsWikiModalOpen(true); }}
                                >
                                    <Edit size={16} />
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    isIconOnly 
                                    size="sm"
                                    className="text-danger"
                                    onPress={() => { setSelectedGuide(guide); setIsDeleteModalOpen(true); }}
                                >
                                    <Trash size={16} />
                                </Button>
                            </div>
                        </Card.Footer>
                    </Card>
                ))}
            </div>

            <WikiModal 
                isOpen={isWikiModalOpen}
                onClose={() => setIsWikiModalOpen(false)}
                onSubmit={handleCreateOrUpdate}
                guide={selectedGuide}
            />

            <DeleteModal 
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDelete}
                title="Delete Wiki Guide"
                message={`Are you sure you want to delete "${selectedGuide?.title}"? All associated installation targets will also be removed.`}
            />
        </div>
    );
}
