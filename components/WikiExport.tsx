'use client';

import { Button, Dropdown, Label } from '@heroui/react';
import {
    DownloadMinimalistic as Download,
    FileText
} from '@solar-icons/react';
import { saveAs } from 'file-saver';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

interface WikiExportProps {
    title: string;
    content: string;
    targetRef: React.RefObject<HTMLDivElement | null>;
}

export function WikiExport({ title, content, targetRef }: WikiExportProps) {
    const exportAsMarkdown = () => {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        saveAs(blob, `${title.toLowerCase().replace(/\s+/g, '-')}.md`);
    };

    const exportAsPDF = async () => {
        if (!targetRef.current) return;
        
        try {
            const dataUrl = await toPng(targetRef.current, { backgroundColor: '#000000', quality: 0.95 });
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(dataUrl);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            
            pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`${title.toLowerCase().replace(/\s+/g, '-')}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
        }
    };

    return (
        <Dropdown>
            <Dropdown.Trigger>
                <Button variant="secondary" className="rounded-xl h-9 px-4 font-bold border border-border/40 opacity-50 hover:opacity-100 transition-all uppercase text-xs tracking-wider shadow-sm shrink-0">
                    <Download size={16} weight="Bold" className="mr-2" />
                    Export Document
                </Button>
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom end" className="min-w-[220px] bg-surface border border-border/40 rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in-95 duration-200 z-50">
                <Dropdown.Menu className="outline-none">
                    <Dropdown.Section>
                        <Label className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/60">Output Formats</Label>
                        <Dropdown.Item onPress={exportAsMarkdown} className="rounded-xl hover:bg-foreground/5 transition-all outline-none">
                            <div className="flex items-center gap-3 p-1 font-bold tracking-tight text-sm">
                                <FileText size={18} weight="Bold" className="text-accent" />
                                MARKDOWN (.md)
                            </div>
                        </Dropdown.Item>
                        <Dropdown.Item onPress={exportAsPDF} className="rounded-xl hover:bg-foreground/5 transition-all outline-none">
                            <div className="flex items-center gap-3 p-1 font-bold tracking-tight text-sm">
                                <FileText size={18} weight="Bold" className="text-danger" />
                                PDF DOCUMENT (.pdf)
                            </div>
                        </Dropdown.Item>
                    </Dropdown.Section>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
