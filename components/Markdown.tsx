'use client';

import { Button } from '@heroui/react';
import { CheckRead as Check, Copy } from '@solar-icons/react';
import { clsx } from 'clsx';
import 'highlight.js/styles/github-dark.css';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { Mermaid } from './Mermaid';

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
                        const codeString = String(children).replace(/\n$/, '');

                        if (!inline && match?.[1] === 'mermaid') {
                            return <Mermaid chart={codeString} />;
                        }

                        if (!inline && match) {
                            return <CodeBlock code={codeString} language={match[1]} />;
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

function CodeBlock({ code, language }: { code: string; language: string }) {
    const [copied, setCopied] = useState(false);

    const onCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="group relative my-4 overflow-hidden rounded-xl border border-border bg-black/10 dark:bg-black/40">
            <div className="flex items-center justify-between bg-black/5 dark:bg-black/20 px-4 py-2 border-b border-border">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
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
                <code className={`language-${language} bg-transparent p-0`}>{code}</code>
            </pre>
        </div>
    );
}
