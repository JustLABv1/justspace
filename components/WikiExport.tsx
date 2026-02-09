'use client';

import { Button, Dropdown, Label } from '@heroui/react';
import { saveAs } from 'file-saver';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Download, FileText, Image } from 'lucide-react';

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
            <Button variant="secondary">
                <Download size={18} className="mr-2" />
                Export
            </Button>
            <Dropdown.Popover>
                <Dropdown.Menu className="w-48">
                    <Dropdown.Item onPress={exportAsMarkdown}>
                        <div className="flex items-center gap-2">
                            <FileText size={16} />
                            <Label>Markdown (.md)</Label>
                        </div>
                    </Dropdown.Item>
                    <Dropdown.Item onPress={exportAsPDF}>
                        <div className="flex items-center gap-2">
                            <Image size={16} />
                            <Label>PDF Document</Label>
                        </div>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
