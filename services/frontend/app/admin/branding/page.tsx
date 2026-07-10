'use client';

import { useBranding } from '@/services/frontend/context/BrandingContext';
import { api, PlatformBranding } from '@/services/frontend/lib/api';
import { Alert, Avatar, Button, Card, Input, Label, TextField } from '@heroui/react';
import { ImagePlus, Loader2, Save, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function AdminBrandingPage() {
    const { refresh: refreshGlobalBranding } = useBranding();
    const [branding, setBranding] = useState<PlatformBranding>({ name: 'justspace' });
    const [brandName, setBrandName] = useState('justspace');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const currentLogoUrl = useMemo(() => branding.logoPath ? api.getPlatformBrandingAssetURL(branding.logoPath) : null, [branding.logoPath]);

    const load = useCallback(async () => {
        try {
            const next = await api.getAdminBranding();
            setBranding(next);
            setBrandName(next.name);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load branding.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    const chooseFile = (file: File | undefined) => {
        if (!file) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setError('');
        setNotice('');
    };

    const saveName = async () => {
        setIsSaving(true); setError(''); setNotice('');
        try {
            const next = await api.updateAdminBranding({ brandName });
            setBranding(next); setBrandName(next.name); await refreshGlobalBranding();
            setNotice('App name saved.');
        } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save app name.'); }
        finally { setIsSaving(false); }
    };

    const uploadLogo = async () => {
        if (!selectedFile) return;
        setIsSaving(true); setError(''); setNotice('');
        try {
            const next = await api.uploadBrandLogo(selectedFile);
            setBranding(next); setSelectedFile(null); setPreviewUrl(null); await refreshGlobalBranding();
            setNotice('Logo uploaded. New web and PWA icons are active.');
        } catch (err) { setError(err instanceof Error ? err.message : 'Unable to upload logo.'); }
        finally { setIsSaving(false); }
    };

    const removeLogo = async () => {
        setIsSaving(true); setError(''); setNotice('');
        try {
            const next = await api.deleteBrandLogo();
            setBranding(next); await refreshGlobalBranding();
            setNotice('Logo removed.');
        } catch (err) { setError(err instanceof Error ? err.message : 'Unable to remove logo.'); }
        finally { setIsSaving(false); }
    };

    if (isLoading) return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>;

    const logo = previewUrl || currentLogoUrl;
    return (
        <div className="mx-auto w-full max-w-4xl space-y-6 p-6 md:p-10">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Admin / Branding</p><h1 className="mt-2 text-2xl font-semibold">Branding</h1><p className="mt-1 text-sm text-muted-foreground">Set the global app name and logo used across the web app and installed PWA.</p></div>
            {error && <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>Action failed</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Content></Alert>}
            {notice && <Alert status="success"><Alert.Indicator /><Alert.Content><Alert.Title>Saved</Alert.Title><Alert.Description>{notice}</Alert.Description></Alert.Content></Alert>}

            <Card>
                <Card.Header><Card.Title>App name</Card.Title><Card.Description>This name replaces the old per-user workspace name for every user.</Card.Description></Card.Header>
                <Card.Content className="space-y-4">
                    <TextField><Label>Name</Label><Input value={brandName} onChange={(event) => setBrandName(event.target.value)} maxLength={80} /></TextField>
                    <Button variant="primary" onPress={() => void saveName()} isPending={isSaving}><Save size={15} />Save name</Button>
                </Card.Content>
            </Card>

            <Card>
                <Card.Header><Card.Title>App logo</Card.Title><Card.Description>Upload one square PNG, at least 512 × 512 px and up to 2 MB. Smaller web and PWA variants are generated automatically.</Card.Description></Card.Header>
                <Card.Content className="space-y-5">
                    <div className="flex flex-wrap items-center gap-4">
                        <Avatar className="size-24 rounded-2xl"><Avatar.Image src={logo ?? undefined} alt="App logo preview" /><Avatar.Fallback className="rounded-2xl bg-accent text-2xl font-bold text-accent-foreground">{branding.name.charAt(0).toUpperCase()}</Avatar.Fallback></Avatar>
                        <div className="flex flex-wrap gap-2">
                            <input id="brand-logo" type="file" accept="image/png" className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0])} />
                            <Button variant="secondary" onPress={() => document.getElementById('brand-logo')?.click()}><ImagePlus size={15} />Choose PNG</Button>
                            {selectedFile && <Button variant="primary" onPress={() => void uploadLogo()} isPending={isSaving}><Upload size={15} />Upload</Button>}
                            {branding.logoPath && <Button variant="danger" onPress={() => void removeLogo()} isPending={isSaving}><Trash2 size={15} />Remove</Button>}
                        </div>
                    </div>
                    {selectedFile && <p className="text-xs text-muted-foreground">Selected: {selectedFile.name}</p>}
                </Card.Content>
            </Card>
        </div>
    );
}
