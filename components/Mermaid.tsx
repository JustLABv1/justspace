'use client';

import mermaid from 'mermaid';
import { useEffect, useRef } from 'react';

mermaid.initialize({
    startOnLoad: true,
    theme: 'dark',
    securityLevel: 'loose',
    fontFamily: 'inherit',
});

interface MermaidProps {
    chart: string;
}

export function Mermaid({ chart }: MermaidProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ref.current) {
            mermaid.contentLoaded();
            // Re-render specifically if chart changes
            const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
            mermaid.render(id, chart).then(({ svg }) => {
                if (ref.current) {
                    ref.current.innerHTML = svg;
                }
            });
        }
    }, [chart]);

    return (
        <div 
            ref={ref} 
            className="mermaid overflow-x-auto flex justify-center py-4 bg-secondary/10 rounded-xl my-4" 
        />
    );
}
