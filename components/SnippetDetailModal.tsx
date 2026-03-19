'use client';

import { Markdown } from '@/components/Markdown';
import { Snippet, SnippetBlock } from '@/types';
import { Button, Checkbox, CheckboxGroup, Chip, Modal, ScrollShadow, Tooltip } from "@heroui/react";
import { Check, Code, Copy, FileText, Layers, Lock } from 'lucide-react';
import { useState } from 'react';

interface SnippetDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    snippet?: Snippet;
}

export const SnippetDetailModal = ({ isOpen, onClose, snippet }: SnippetDetailModalProps) => {
    const [selectedBlocks, setSelectedBlocks] = useState<string[]>([]);
    const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);
    const [copiedAll, setCopiedAll] = useState(false);

    if (!snippet) return null;

    let blocks: SnippetBlock[] = [];
    try {
        blocks = snippet.blocks ? JSON.parse(snippet.blocks) : [{ id: '1', type: 'code', content: snippet.content, language: snippet.language }];
    } catch {
        blocks = [{ id: '1', type: 'code', content: snippet.content, language: snippet.language }];
    }

    const copyBlock = (content: string, id: string) => {
        navigator.clipboard.writeText(content);
        setCopiedBlockId(id);
        setTimeout(() => setCopiedBlockId(null), 2000);
    };

    const copySelected = () => {
        const selectedContent = blocks
            .filter(b => selectedBlocks.includes(b.id))
            .map(b => b.content)
            .join('\n\n');
        
        navigator.clipboard.writeText(selectedContent);
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
    };

    const copyEverything = () => {
        const allContent = blocks.map(b => b.content).join('\n\n');
        navigator.clipboard.writeText(allContent);
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
    };

    return (
        <Modal>
            <Modal.Backdrop isOpen={isOpen} onOpenChange={onClose} variant="blur">
                <Modal.Container size="cover">
                    <Modal.Dialog className="bg-surface border border-border shadow-lg rounded-xl overflow-hidden">
                        <Modal.CloseTrigger className="absolute right-6 top-6 z-50 bg-surface-secondary/50 hover:bg-surface-secondary transition-colors" />
                        
                        <div className="flex flex-col h-full max-h-[90vh]">
                            <Modal.Header className="flex flex-col gap-3 px-6 pt-5 pb-4 border-b border-border">
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground">
                                        <Layers size={14} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <Chip size="sm" variant="soft" color="accent" className="text-xs px-2">
                                                {snippet.language}
                                            </Chip>
                                            {snippet.isEncrypted && (
                                                <div className="flex items-center gap-1 text-muted-foreground text-xs">
                                                    <Lock size={11} />
                                                    Encrypted
                                                </div>
                                            )}
                                        </div>
                                        <Modal.Heading className="text-base font-semibold leading-none">
                                            {snippet.title}
                                        </Modal.Heading>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button 
                                            variant="secondary" 
                                            className="rounded-xl text-xs font-medium px-3 h-8"
                                            onPress={copyEverything}
                                        >
                                            {copiedAll ? <Check size={13} className="mr-1.5" /> : <Copy size={13} className="mr-1.5" />}
                                            Copy All
                                        </Button>
                                        {selectedBlocks.length > 0 && (
                                            <Button 
                                                variant="primary" 
                                                className="rounded-xl text-xs font-medium px-3 h-8"
                                                onPress={copySelected}
                                            >
                                                <Copy size={13} className="mr-1.5" />
                                                Copy ({selectedBlocks.length})
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                {snippet.description && (
                                    <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
                                        {snippet.description}
                                    </p>
                                )}
                                {snippet.tags && snippet.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {snippet.tags.map(tag => (
                                            <span key={tag} className="text-xs text-muted-foreground">
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </Modal.Header>

                            <Modal.Body className="px-6 py-4 flex-1 overflow-hidden">
                                <ScrollShadow className="h-full pr-4 -mr-4">
                                    <CheckboxGroup 
                                        value={selectedBlocks} 
                                        onChange={(vals) => setSelectedBlocks(vals as string[])}
                                        className="gap-8"
                                    >
                                        {blocks.map((block) => (
                                            <div key={block.id} className="relative group/block animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                <div className="absolute -left-12 top-4 opacity-0 group-hover/block:opacity-100 transition-opacity duration-300">
                                                    <Checkbox value={block.id} aria-label={`Select block ${block.id}`} />
                                                </div>
                                                
                                                <div className={`rounded-xl border transition-all ${selectedBlocks.includes(block.id) ? 'border-accent bg-accent/5' : 'border-border bg-surface/50'}`}>
                                                    <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-md bg-surface-secondary flex items-center justify-center text-muted-foreground">
                                                                {block.type === 'code' ? <Code size={13} /> : <FileText size={13} />}
                                                            </div>
                                                            <span className="text-xs text-muted-foreground">
                                                                {block.type}{block.language && ` · ${block.language}`}
                                                            </span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Tooltip delay={0}>
                                                                <Button 
                                                                    variant="ghost" 
                                                                    isIconOnly 
                                                                    size="sm" 
                                                                    className="h-8 w-8 rounded-xl"
                                                                    onPress={() => copyBlock(block.content, block.id)}
                                                                >
                                                                    {copiedBlockId === block.id ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                                                                </Button>
                                                                <Tooltip.Content>
                                                                    <p>Copy this block</p>
                                                                </Tooltip.Content>
                                                            </Tooltip>
                                                        </div>
                                                    </div>
                                                    <div className="p-4 font-mono text-sm overflow-x-auto min-h-[80px]">
                                                        {block.type === 'code' ? (
                                                            <pre className="text-foreground/90 whitespace-pre leading-relaxed">
                                                                <code>{block.content}</code>
                                                            </pre>
                                                        ) : (
                                                            <Markdown content={block.content} />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </CheckboxGroup>
                                </ScrollShadow>
                            </Modal.Body>

                            <Modal.Footer className="px-6 py-4 bg-surface-secondary/50 border-t border-border flex justify-between items-center">
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1.5">
                                        <Layers size={13} />
                                        {blocks.length} block{blocks.length !== 1 ? 's' : ''}
                                    </div>
                                    <div className="w-1 h-1 rounded-full bg-border" />
                                    <div>Created {new Date(snippet.createdAt).toLocaleDateString()}</div>
                                </div>
                                <Button slot="close" variant="secondary" className="rounded-xl text-xs font-medium px-4 h-8">Close</Button>
                            </Modal.Footer>
                        </div>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
