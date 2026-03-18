'use client';

import { Button, Dropdown, Label } from '@heroui/react';
import { saveAs } from 'file-saver';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Download, FileText } from 'lucide-react';

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
                <Button variant="secondary" className="rounded-lg h-8 px-4 border border-border text-xs shrink-0">
                    <Download size={14} className="mr-2" />
                    Export
                </Button>
            </Dropdown.Trigger>
                <Dropdown.Popover placement="bottom end" className="min-w-[200px] bg-surface border border-border rounded-lg p-1 shadow-lg z-50">
                <Dropdown.Menu className="outline-none">
                    <Dropdown.Section>
                        <Label className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Export as</Label>
                        <Dropdown.Item onPress={exportAsMarkdown} className="rounded-md hover:bg-foreground/5 transition-all outline-none">
                            <div className="flex items-center gap-2 p-1 text-sm">
                                <FileText size={14} className="text-accent" />
                                Markdown (.md)
                            </div>
                        </Dropdown.Item>
                        <Dropdown.Item onPress={exportAsPDF} className="rounded-md hover:bg-foreground/5 transition-all outline-none">
                            <div className="flex items-center gap-2 p-1 text-sm">
                                <FileText size={14} className="text-danger" />
                                PDF (.pdf)
                            </div>
                        </Dropdown.Item>
                    </Dropdown.Section>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
