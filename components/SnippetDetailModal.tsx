'use client';

import { Markdown } from '@/components/Markdown';
import { Snippet, SnippetBlock } from '@/types';
import { Button, Checkbox, CheckboxGroup, Chip, Modal, ScrollShadow, Tooltip } from "@heroui/react";
import {
  CheckRead as Check,
  CodeCircle as CodeIcon,
  Widget as ComponentsIcon,
  Copy,
  SettingsMinimalistic as Gear,
  SidebarCode as LayoutIcon,
  Notes as MarkdownIcon
} from '@solar-icons/react';
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
                    <Modal.Dialog className="bg-surface/95 dark:bg-surface/90 backdrop-blur-xl border border-border/40 shadow-2xl rounded-[2.5rem] overflow-hidden">
                        <Modal.CloseTrigger className="absolute right-6 top-6 z-50 bg-surface-secondary/50 hover:bg-surface-secondary transition-colors" />
                        
                        <div className="flex flex-col h-full max-h-[90vh]">
                            <Modal.Header className="flex flex-col gap-6 p-8 pb-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center text-accent shadow-inner border border-accent/20">
                                        <ComponentsIcon size={28} weight="Bold" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-1">
                                            <Chip size="sm" variant="soft" color="accent" className="font-bold text-[10px] uppercase tracking-widest px-3">
                                                {snippet.language}
                                            </Chip>
                                            {snippet.isEncrypted && (
                                                <div className="flex items-center gap-1.5 text-accent/60 text-[10px] font-bold uppercase tracking-widest bg-accent/5 px-2 py-0.5 rounded-md border border-accent/10">
                                                    <Gear size={12} />
                                                    Encrypted
                                                </div>
                                            )}
                                        </div>
                                        <Modal.Heading className="text-3xl font-black tracking-tight leading-none uppercase">
                                            {snippet.title}
                                        </Modal.Heading>
                                    </div>
                                    <div className="flex gap-3">
                                        <Button 
                                            variant="secondary" 
                                            className="rounded-xl font-bold px-6 h-12 shadow-lg"
                                            onPress={copyEverything}
                                        >
                                            {copiedAll ? <Check size={18} className="mr-2" /> : <Copy size={18} className="mr-2" />}
                                            Bundle All
                                        </Button>
                                        {selectedBlocks.length > 0 && (
                                            <Button 
                                                variant="primary" 
                                                className="rounded-xl font-bold px-6 h-12 shadow-xl shadow-accent/20 animate-in fade-in zoom-in slide-in-from-right-4"
                                                onPress={copySelected}
                                            >
                                                <Copy size={18} className="mr-2" />
                                                Copy Selection ({selectedBlocks.length})
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                {snippet.description && (
                                    <p className="text-sm text-muted-foreground font-medium leading-relaxed max-w-3xl opacity-80 italic">
                                        &ldquo; {snippet.description} &rdquo;
                                    </p>
                                )}
                                {snippet.tags && snippet.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {snippet.tags.map(tag => (
                                            <span key={tag} className="text-[10px] font-black uppercase tracking-[0.2em] text-accent/50 hover:text-accent transition-colors">
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </Modal.Header>

                            <Modal.Body className="p-8 pt-0 flex-1 overflow-hidden">
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
                                                
                                                <div className={`p-1 rounded-[2rem] border transition-all duration-500 ${selectedBlocks.includes(block.id) ? 'border-accent shadow-xl bg-accent/5' : 'border-border/40 bg-surface/50 hover:border-accent/40'}`}>
                                                    <div className="flex items-center justify-between px-6 py-4 border-b border-border/10">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-surface-secondary flex items-center justify-center text-muted-foreground">
                                                                {block.type === 'code' ? <CodeIcon size={18} /> : <MarkdownIcon size={18} />}
                                                            </div>
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                                {block.type} component {block.language && `| ${block.language}`}
                                                            </span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Tooltip delay={0}>
                                                                <Button 
                                                                    variant="ghost" 
                                                                    isIconOnly 
                                                                    size="sm" 
                                                                    className="h-8 w-8 rounded-lg"
                                                                    onPress={() => copyBlock(block.content, block.id)}
                                                                >
                                                                    {copiedBlockId === block.id ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                                                                </Button>
                                                                <Tooltip.Content>
                                                                    <p>Copy this block</p>
                                                                </Tooltip.Content>
                                                            </Tooltip>
                                                        </div>
                                                    </div>
                                                    <div className="p-6 font-mono text-sm overflow-x-auto min-h-[100px]">
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

                            <Modal.Footer className="px-8 py-6 bg-surface-secondary/30 border-t border-border/10 flex justify-between items-center">
                                <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground/60">
                                    <div className="flex items-center gap-1.5">
                                        <LayoutIcon size={14} />
                                        {blocks.length} Components
                                    </div>
                                    <div className="w-1 h-1 rounded-full bg-border" />
                                    <div>Created {new Date(snippet.createdAt).toLocaleDateString()}</div>
                                </div>
                                <Button slot="close" variant="secondary" className="rounded-xl font-bold px-8">Close</Button>
                            </Modal.Footer>
                        </div>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};
