'use client';

import { clsx } from 'clsx';
import 'highlight.js/styles/github.css';
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

export function CodeBlock({ code, language, children, className }: { code: string; language: string; children: ReactNode; className?: string }) {
    const [copied, setCopied] = useState(false);

    const onCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={clsx(
            "not-prose group relative my-4 overflow-hidden rounded-2xl shadow-sm",
            "border border-zinc-200 bg-[#f6f8fa]",
            "dark:border-white/[0.07] dark:bg-[#0d1117] dark:shadow-black/20",
            className
        )}>
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 bg-zinc-100/70 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <div className="flex items-center gap-3">
                    {/* macOS-style traffic lights */}
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/60 dark:bg-[#ff5f57]/50" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/60 dark:bg-[#febc2e]/50" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]/60 dark:bg-[#28c840]/50" />
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-200 text-zinc-500 dark:bg-white/[0.05] dark:text-zinc-500">
                        {language}
                    </span>
                </div>
                <button
                    onClick={onCopy}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all text-[11px] font-medium bg-zinc-200 text-zinc-600 hover:bg-zinc-300 hover:text-zinc-900 dark:bg-white/[0.08] dark:text-zinc-300 dark:hover:bg-white/[0.14] dark:hover:text-white"
                >
                    {copied ? <Check size={11} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={11} />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
            </div>
            {/* Code content */}
            <pre className="overflow-x-auto px-6 py-5 m-0 bg-transparent text-[14px] leading-[1.75]">
                <code className={`language-${language} bg-transparent p-0`}>{children}</code>
            </pre>
        </div>
    );
}
