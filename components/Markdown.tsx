'use client';

import { Button } from '@heroui/react';
import { clsx } from 'clsx';
import 'highlight.js/styles/github-dark.css';
import { Check, Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import { isValidElement, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { Mermaid } from './Mermaid';

// rehype-highlight turns code text into React span elements for syntax colouring.
// We need raw text for clipboard — traverse the node tree to collect it.
function extractText(node: ReactNode): string {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (isValidElement(node)) return extractText((node.props as { children?: ReactNode }).children);
    return '';
}

interface MarkdownProps {
    content: string;
    className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
    return (
        <div className={clsx(
            "prose prose-sm dark:prose-invert max-w-none",
            "prose-p:leading-relaxed prose-headings:font-bold prose-headings:tracking-tight",
            "prose-pre:bg-transparent prose-pre:p-0",
            "text-foreground/80 dark:text-foreground/80",
            className
        )}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                    code({ inline, className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { inline?: boolean }) {
                        const match = /language-(\w+)/.exec(className || '');
                        // Extract plain text (children are React nodes after rehype-highlight)
                        const rawText = extractText(children).replace(/\n$/, '');

                        if (!inline && match?.[1] === 'mermaid') {
                            return <Mermaid chart={rawText} />;
                        }

                        if (!inline && match) {
                            // Pass children (already highlighted nodes) for rendering,
                            // rawText only for the copy button
                            return <CodeBlock code={rawText} language={match[1]}>{children}</CodeBlock>;
                        }

                        return (
                            <code className={className} {...props}>
                                {children}
                            </code>
                        );
                    },
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

function CodeBlock({ code, language, children }: { code: string; language: string; children: ReactNode }) {
    const [copied, setCopied] = useState(false);

    const onCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="group relative my-4 overflow-hidden rounded-xl border border-border bg-black/10 dark:bg-black/40">
            <div className="flex items-center justify-between bg-black/5 dark:bg-black/20 px-4 py-2 border-b border-border">
                <span className="text-xs text-muted-foreground font-mono">
                    {language}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    aria-label="Copy code"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onPress={onCopy}
                >
                    {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                </Button>
            </div>
            <pre className="overflow-x-auto p-4 m-0 bg-transparent">
                {/* Render children (already syntax-highlighted React nodes), not the raw string */}
                <code className={`language-${language} bg-transparent p-0`}>{children}</code>
            </pre>
        </div>
    );
}
