'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { useBranding } from '@/services/frontend/context/BrandingContext';
import { api, AuthConfig, OIDCIdentity } from '@/services/frontend/lib/api';
import { encryptData, encryptDocumentKey, generateDocumentKey } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { useWorkspace } from '@/services/frontend/context/WorkspaceContext';
import { DEFAULT_TASK_STATUS_TEMPLATES, mergeUserPreferences, parseUserPreferences, WorkspaceTaskStatusTemplate } from '@/services/frontend/lib/preferences';
import { promptForPwaInstall, usePwaInstallState } from '@/services/frontend/lib/pwa';
import { Button, Checkbox, Form, Input, Label, ListBox, Select, Surface, toast } from '@heroui/react';
import {
    Bell,
    CheckCircle,
    Database,
    Download,
    Keyboard,
    Loader2,
    Moon,
    Palette,
    Plus,
    RefreshCw,
    Save,
    Settings,
    Sun,
    User,
    Vault
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

export default function SettingsPage() {
    return (
        <Suspense fallback={
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
        }>
            <SettingsContent />
        </Suspense>
    );
}

function SettingsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { theme, setTheme } = useTheme();
    const pwa = usePwaInstallState();
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'General');
    
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'Workspace') {
            router.replace('/workspace');
            return;
        }
        if (tab && tab !== activeTab) {
            setActiveTab(tab);
        }
    }, [searchParams, activeTab]);

    const handleTabChange = (tabId: string) => {
        setActiveTab(tabId);
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', tabId);
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const { user, hasVault, privateKey, userKeys, setupVault, unlockVault, updateProfile } = useAuth();
    const { workspaceId } = useWorkspace();
    const { branding } = useBranding();
    const [vaultPassword, setVaultPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [vaultError, setVaultError] = useState<string | null>(null);
    
    // Core states
    const [userName, setUserName] = useState('');
    const [taskStatusTemplates, setTaskStatusTemplates] = useState<WorkspaceTaskStatusTemplate[]>(DEFAULT_TASK_STATUS_TEMPLATES);
    const [remindersEnabled, setRemindersEnabled] = useState(false);
    const [reminderLeadTime, setReminderLeadTime] = useState(15);
    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
    const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
    const [oidcIdentities, setOIDCIdentities] = useState<OIDCIdentity[]>([]);

    useEffect(() => {
        if (user) {
            setUserName(user.name || '');
            const prefs = parseUserPreferences(user.preferences);
            setTaskStatusTemplates(prefs.taskStatusTemplates);
            setRemindersEnabled(prefs.reminders.enabled);
            setReminderLeadTime(prefs.reminders.minutesBefore);
        }
    }, [user]);

    useEffect(() => {
		if (typeof Notification === 'undefined') {
			setNotificationPermission('unsupported');
			return;
		}
		setNotificationPermission(Notification.permission);
	}, []);

    // Migration state
    const [isMigrating, setIsMigrating] = useState(false);
    const [stats, setStats] = useState({ projects: 0, wiki: 0, snippets: 0 });
    const [migrationProgress, setMigrationProgress] = useState('');

    const pwaStatusLabel = pwa.isStandalone
        ? 'Installed'
        : pwa.canInstall
            ? 'Ready to install'
            : pwa.browser === 'safari'
                ? 'Manual install'
                : 'Browser dependent';

    const pwaStatusClass = pwa.isStandalone
        ? 'bg-success-muted text-success border-success/20'
        : pwa.canInstall
            ? 'bg-accent/10 text-accent border-accent/20'
            : pwa.browser === 'safari'
                ? 'bg-warning-muted text-warning border-warning/20'
                : 'bg-surface-secondary text-muted-foreground border-border';

    const pwaDescription = pwa.isStandalone
        ? `${branding.name} is running as an installed app. You can reopen it directly from the Dock.`
        : pwa.canInstall
            ? `This browser can install ${branding.name} as a standalone desktop app with its own Dock entry.`
            : pwa.browser === 'safari'
                ? `Safari on macOS does not expose an install prompt. Use File > Add to Dock to install ${branding.name} manually.`
                : 'Install support depends on the browser. Chrome and Edge will show an install prompt once the app is eligible.';

    const fetchStats = useCallback(async () => {
        if (!user) return;
        try {
            const [projects, guides, snippets] = await Promise.all([
                db.listProjects(workspaceId),
                db.listGuides(workspaceId),
                db.listSnippets(workspaceId)
            ]);
            
            setStats({
                projects: projects.documents.filter(p => !p.isEncrypted).length,
                wiki: guides.documents.filter(g => !g.isEncrypted).length,
                snippets: snippets.documents.filter(s => !s.isEncrypted).length
            });
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    }, [user, workspaceId]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    useEffect(() => {
        if (!user) return;
        Promise.all([api.getAuthConfig(), api.getOIDCIdentities()])
            .then(([config, identities]) => {
                setAuthConfig(config);
                setOIDCIdentities(identities.documents);
            })
            .catch(() => undefined);
    }, [user]);

    const unlinkOIDCIdentity = async (identity: OIDCIdentity) => {
        if (!window.confirm(`Unlink ${identity.providerName}?`)) return;
        try {
            await api.deleteOIDCIdentity(identity.id);
            setOIDCIdentities((current) => current.filter((item) => item.id !== identity.id));
            toast.success('OIDC identity unlinked');
        } catch (error) {
            toast.danger(error instanceof Error ? error.message : 'Unable to unlink identity');
        }
    };

    const handleSaveChanges = async () => {
        setIsSubmitting(true);
        try {
			const preferences = mergeUserPreferences(user?.preferences, {
                taskStatusTemplates,
				reminders: {
					enabled: remindersEnabled,
					minutesBefore: reminderLeadTime,
				},
			});

            await updateProfile({
                ...(userName !== user?.name ? { name: userName } : {}),
                preferences,
            });
            toast.success('Settings synchronized');
        } catch (error) {
            console.error(error);
            toast.danger('Failed to update settings');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleMigrate = async () => {
        if (!user || !userKeys || !privateKey) {
            console.error('Migration blocked: Missing user, keys, or private key.', { user: !!user, userKeys: !!userKeys, privateKey: !!privateKey });
            setMigrationProgress('Error: Vault must be unlocked to migrate.');
            return;
        }
        setIsMigrating(true);
        setMigrationProgress('Initializing migration batch...');
        console.log('Starting migration for user:', user.id);

        try {
            // 1. Migrate Snippets
            setMigrationProgress('Encrypting code snippets...');
            const snippets = await db.listSnippets();
            for (const s of snippets.documents.filter(snip => !snip.isEncrypted)) {
                const docKey = await generateDocumentKey();
                const encTitle = await encryptData(s.title, docKey);
                const encContent = await encryptData(s.content, docKey);
                const encDesc = s.description ? await encryptData(s.description, docKey) : null;
                
                await db.updateSnippet(s.id, {
                    title: JSON.stringify(encTitle),
                    content: JSON.stringify(encContent),
                    description: encDesc ? JSON.stringify(encDesc) : undefined,
                    isEncrypted: true
                });
                
                const encKey = await encryptDocumentKey(docKey, userKeys.publicKey);
                await db.grantAccess({
                    resourceId: s.id,
                    userId: user.id,
                    encryptedKey: encKey,
                    resourceType: 'Snippet'
                });
            }

            // 2. Migrate Wiki & Installations
            setMigrationProgress('Securing files and documentation...');
            const guides = await db.listGuides();
            for (const g of guides.documents.filter(guide => !guide.isEncrypted)) {
                const docKey = await generateDocumentKey();
                const encTitle = await encryptData(g.title, docKey);
                const encDesc = await encryptData(g.description, docKey);
                
                await db.updateGuide(g.id, {
                    title: JSON.stringify(encTitle),
                    description: JSON.stringify(encDesc),
                    isEncrypted: true
                });

                // Wrap key for access control
                const encKey = await encryptDocumentKey(docKey, userKeys.publicKey);
                await db.grantAccess({
                    resourceId: g.id,
                    userId: user.id,
                    encryptedKey: encKey,
                    resourceType: 'Wiki'
                });

                // Also migrate installations
                const fullGuide = await db.getGuide(g.id);
                for (const inst of (fullGuide.installations || [])) {
                    if (inst.notes) {
                        const encNotes = await encryptData(inst.notes, docKey);
                        await db.updateInstallation(inst.id, {
                            notes: JSON.stringify(encNotes),
                            isEncrypted: true
                        });
                    }
                }
            }

            // 3. Migrate Projects & Tasks
            setMigrationProgress('Encrypting project matrix and associated tasks...');
            const projects = await db.listProjects();
            for (const p of projects.documents.filter(proj => !proj.isEncrypted)) {
                const docKey = await generateDocumentKey();
                const encName = await encryptData(p.name, docKey);
                const encDesc = await encryptData(p.description, docKey);
                
                await db.updateProject(p.id, {
                    name: JSON.stringify(encName),
                    description: JSON.stringify(encDesc),
                    isEncrypted: true
                });

                const encKey = await encryptDocumentKey(docKey, userKeys.publicKey);
                await db.grantAccess({
                    resourceId: p.id,
                    userId: user.id,
                    encryptedKey: encKey,
                    resourceType: 'Project'
                });

                // Tasks
                const tasks = await db.listTasks(p.id);
                for (const t of tasks.documents) {
                    const encTaskTitle = await encryptData(t.title, docKey);
                    const encTaskDescription = await encryptData(t.description || '', docKey);
                    await db.updateTask(t.id, {
                        title: JSON.stringify(encTaskTitle),
                        description: JSON.stringify(encTaskDescription),
                        isEncrypted: true
                    });
                }
            }

            setMigrationProgress('Migration complete. Your workspace is now secure.');
            toast.success('Migration successful', {
                description: 'Your workspace is now fully encrypted.'
            });
            await fetchStats();
        } catch (error) {
            console.error('Migration failed:', error);
            setMigrationProgress('Migration error. Please check console.');
            toast.danger('Migration failed');
        } finally {
            setIsMigrating(false);
        }
    };

    const updateTemplate = (index: number, patch: Partial<WorkspaceTaskStatusTemplate>) => {
        setTaskStatusTemplates((current) => current.map((template, currentIndex) => currentIndex === index ? { ...template, ...patch } : template));
    };

    const addStatusTemplate = () => {
        setTaskStatusTemplates((current) => [
            ...current,
            {
                key: `status-${current.length + 1}`,
                label: `Status ${current.length + 1}`,
                colorToken: 'accent',
                isCompletedState: false,
                isBuiltin: false,
            },
        ]);
    };

    const moveStatusTemplate = (index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= taskStatusTemplates.length) {
            return;
        }
        const next = [...taskStatusTemplates];
        const [moved] = next.splice(index, 1);
        next.splice(targetIndex, 0, moved);
        setTaskStatusTemplates(next);
    };

    const removeStatusTemplate = (index: number) => {
        setTaskStatusTemplates((current) => current.filter((_, currentIndex) => currentIndex !== index));
    };

    const menuItems = [
        { id: 'General', label: 'General', icon: Settings },
        { id: 'Notifications', label: 'Notifications', icon: Bell },
        { id: 'User', label: 'Account', icon: User },
        { id: 'Security', label: 'Security & Vault', icon: Vault },
        { id: 'Appearance', label: 'Appearance', icon: Palette },
        { id: 'Shortcuts', label: 'Shortcuts', icon: Keyboard },
    ];

    const handleNotificationPermission = async () => {
        if (typeof Notification === 'undefined') {
            toast.danger('This browser does not support notifications');
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            setNotificationPermission(permission);
            if (permission === 'granted') {
                toast.success('Browser notifications enabled');
            } else {
                toast.danger('Notifications remain blocked for this browser');
            }
        } catch (error) {
            console.error(error);
            toast.danger('Unable to update notification permission');
        }
    };

    const handleVaultAction = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setVaultError(null);
        try {
            if (hasVault) {
                await unlockVault(vaultPassword);
                toast.success('Vault unlocked');
            } else {
                await setupVault(vaultPassword);
                toast.success('Vault setup complete', {
                    description: 'Your security keys have been generated.'
                });
            }
            setVaultPassword('');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Vault operation failed. Please check your connection.';
            console.error(error);
            setVaultError(message);
            toast.danger('Vault operation failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="w-full px-6 py-8 space-y-6">
            <div className="space-y-0.5">
                <h1 className="text-lg font-semibold text-foreground">Settings</h1>
                <p className="text-[13px] text-muted-foreground">Configure your workspace, security, and preferences.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                <div className="md:col-span-1 space-y-0.5">
                    {menuItems.map((item) => (
                        <Button
                            key={item.id}
                            variant="ghost"
                            onPress={() => handleTabChange(item.id)}
                            className={`w-full justify-start gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${
                                activeTab === item.id 
                                    ? 'bg-surface-secondary text-foreground' 
                                    : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                            }`}
                        >
                            <item.icon size={15} />
                            {item.label}
                        </Button>
                    ))}
                </div>

                <div className="md:col-span-3">
                    <div className="rounded-2xl border border-border bg-surface p-6 space-y-6">
                        {activeTab === 'General' && (
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-base font-semibold">General</h3>
                                    <p className="text-sm text-muted-foreground mt-0.5">Global defaults for your workspace.</p>
                                </div>
                                
                                <div className="rounded-xl border border-border bg-surface-secondary/40 p-4 space-y-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h4 className="text-sm font-medium text-foreground">Desktop App</h4>
                                            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">Install {branding.name} in your browser so it opens in a dedicated app window and can live in your Dock.</p>
                                        </div>
                                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${pwaStatusClass}`}>
                                            <Download size={12} />
                                            {pwaStatusLabel}
                                        </span>
                                    </div>

                                    <div className="space-y-2 text-xs text-muted-foreground">
                                        <p>{pwaDescription}</p>
                                        <p>
                                            {pwa.serviceWorkerReady
                                                ? 'Install support is active and static assets can be cached locally for faster relaunches.'
                                                : 'Install support is still initializing in this browser session.'}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        {pwa.canInstall && !pwa.isStandalone && (
                                            <Button
                                                variant="primary"
                                                className="h-8 rounded-xl px-3 text-[12px] font-medium"
                                                onPress={() => {
                                                    void promptForPwaInstall();
                                                }}
                                            >
                                                <Download size={12} className="mr-1.5" />
                                                Install {branding.name}
                                            </Button>
                                        )}

                                        {pwa.browser === 'safari' && !pwa.isStandalone && (
                                            <div className="rounded-lg border border-warning/20 bg-warning-muted px-3 py-2 text-[12px] text-warning">
                                                Safari path: File &gt; Add to Dock
                                            </div>
                                        )}

                                        {pwa.isStandalone && (
                                            <div className="rounded-lg border border-success/20 bg-success-muted px-3 py-2 text-[12px] text-success">
                                                The installed app should be available from your Dock and Applications folder.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-border bg-surface-secondary/40 p-4 space-y-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h4 className="text-sm font-medium text-foreground">Workspace task status template</h4>
                                            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">New projects copy these statuses as their initial workflow.</p>
                                        </div>
                                        <Button variant="secondary" className="h-8 rounded-xl px-3 text-[12px] font-medium" onPress={addStatusTemplate}>
                                            <Plus size={12} className="mr-1.5" />
                                            Add status
                                        </Button>
                                    </div>

                                    <div className="space-y-2">
                                        {taskStatusTemplates.map((template, index) => (
                                            <Surface key={`${template.key}-${index}`} variant="default" className="rounded-xl border border-border p-3">
                                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.55fr)] lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.6fr)_auto_auto] lg:items-end">
                                                    <div className="flex min-w-0 flex-col gap-1.5">
                                                        <Label className="text-xs font-medium text-muted-foreground">Label</Label>
                                                        <Input
                                                            variant="secondary"
                                                            className="h-9 rounded-xl text-sm"
                                                            fullWidth
                                                            value={template.label}
                                                            onChange={(event) => updateTemplate(index, { label: event.target.value })}
                                                        />
                                                    </div>
                                                    <Select
                                                        selectedKey={template.colorToken}
                                                        onSelectionChange={(key) => updateTemplate(index, { colorToken: String(key) as WorkspaceTaskStatusTemplate['colorToken'] })}
                                                        variant="secondary"
                                                        className="flex min-w-0 flex-col gap-1.5"
                                                    >
                                                        <Label className="text-xs font-medium text-muted-foreground">Color</Label>
                                                        <Select.Trigger className="h-9 w-full rounded-xl">
                                                            <Select.Value />
                                                            <Select.Indicator />
                                                        </Select.Trigger>
                                                        <Select.Popover>
                                                            <ListBox>
                                                                <ListBox.Item id="default" textValue="Neutral">Neutral</ListBox.Item>
                                                                <ListBox.Item id="accent" textValue="Accent">Accent</ListBox.Item>
                                                                <ListBox.Item id="warning" textValue="Warning">Warning</ListBox.Item>
                                                                <ListBox.Item id="danger" textValue="Risk">Risk</ListBox.Item>
                                                                <ListBox.Item id="success" textValue="Done">Done</ListBox.Item>
                                                            </ListBox>
                                                        </Select.Popover>
                                                    </Select>
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="text-xs font-medium text-muted-foreground">Completion</span>
                                                        <Checkbox
                                                            isSelected={template.isCompletedState}
                                                            onChange={(isSelected) => updateTemplate(index, { isCompletedState: isSelected })}
                                                            variant="secondary"
                                                            className="h-9 text-xs"
                                                        >
                                                            <Checkbox.Content>
                                                                <Checkbox.Control className="rounded-md">
                                                                    <Checkbox.Indicator />
                                                                </Checkbox.Control>
                                                                <Label className="text-xs text-muted-foreground">Completed</Label>
                                                            </Checkbox.Content>
                                                        </Checkbox>
                                                    </div>
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="text-xs font-medium text-muted-foreground">Order</span>
                                                        <div className="flex h-9 items-center gap-1">
                                                            <Button variant="ghost" isIconOnly className="h-8 w-8 rounded-lg" onPress={() => moveStatusTemplate(index, 'up')} isDisabled={index === 0} aria-label="Move status up">
                                                                ↑
                                                            </Button>
                                                            <Button variant="ghost" isIconOnly className="h-8 w-8 rounded-lg" onPress={() => moveStatusTemplate(index, 'down')} isDisabled={index === taskStatusTemplates.length - 1} aria-label="Move status down">
                                                                ↓
                                                            </Button>
                                                            <Button variant="ghost" className="h-8 rounded-lg px-2 text-[12px] text-danger" onPress={() => removeStatusTemplate(index)} isDisabled={template.isBuiltin}>
                                                                Remove
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Surface>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}


                        {activeTab === 'User' && (
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-base font-semibold">Account</h3>
                                    <p className="text-sm text-muted-foreground mt-0.5">Manage your personal information.</p>
                                </div>
                                
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-foreground">Full Name</label>
                                        <input 
                                            className="w-full h-9 bg-background rounded-xl border border-border px-3 text-sm outline-none focus:border-accent transition-colors"
                                            value={userName}
                                            onChange={(e) => setUserName(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1.5 opacity-60">
                                        <label className="text-sm font-medium text-foreground">Email Address</label>
                                        <div className="w-full h-9 bg-surface-secondary rounded-xl border border-border px-3 text-sm flex items-center cursor-not-allowed">
                                            {user?.email}
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-surface-secondary border border-border">
                                        <p className="text-xs font-medium text-muted-foreground mb-1">User ID</p>
                                        <p className="text-xs font-mono text-muted-foreground truncate">{user?.id}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'Notifications' && (
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-base font-semibold">Notifications</h3>
                                    <p className="text-sm text-muted-foreground mt-0.5">Remind yourself before deadlines while {branding.name} is open in the browser or installed app.</p>
                                </div>

                                <div className="rounded-xl border border-border bg-surface-secondary/40 p-4 space-y-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h4 className="text-sm font-medium text-foreground">Task reminders</h4>
                                            <p className="text-xs text-muted-foreground mt-0.5">Check upcoming deadlines every minute and raise a reminder before they are due.</p>
                                        </div>
                                        <Checkbox isSelected={remindersEnabled} onChange={setRemindersEnabled} variant="secondary">
                                            <Checkbox.Content>
                                                <Checkbox.Control className="rounded-md">
                                                    <Checkbox.Indicator />
                                                </Checkbox.Control>
                                                <Label className="text-sm text-foreground">Enabled</Label>
                                            </Checkbox.Content>
                                        </Checkbox>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-foreground">Lead Time</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={120}
                                            className="w-full h-9 bg-background rounded-xl border border-border px-3 text-sm outline-none focus:border-accent transition-colors"
                                            value={reminderLeadTime}
                                            onChange={(event) => setReminderLeadTime(Math.max(1, Math.min(120, Number(event.target.value) || 1)))}
                                        />
                                        <p className="text-xs text-muted-foreground">Notify me this many minutes before a task deadline.</p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            variant="secondary"
                                            className="h-8 rounded-xl px-3 text-[12px] font-medium"
                                            onPress={() => {
                                                void handleNotificationPermission();
                                            }}
                                        >
                                            <Bell size={12} className="mr-1.5" />
                                            Request browser permission
                                        </Button>

                                        <span className="rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-muted-foreground">
                                            Permission: {notificationPermission}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'Appearance' && (
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-base font-semibold">Appearance</h3>
                                    <p className="text-sm text-muted-foreground mt-0.5">Choose your preferred color theme.</p>
                                </div>
                                
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { id: 'light', label: 'Light', icon: Sun },
                                        { id: 'dark', label: 'Dark', icon: Moon },
                                        { id: 'system', label: 'System', icon: RefreshCw }
                                    ].map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => setTheme(t.id)}
                                            className={`p-4 rounded-xl border transition-colors flex flex-col items-center gap-2 ${
                                                theme === t.id 
                                                    ? 'bg-surface-secondary border-accent text-foreground' 
                                                    : 'bg-background border-border text-muted-foreground hover:border-accent/50 hover:text-foreground'
                                            }`}
                                        >
                                            <t.icon size={16} />
                                            <span className="text-xs font-medium">{t.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'Shortcuts' && (
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-base font-semibold">Keyboard Shortcuts</h3>
                                    <p className="text-sm text-muted-foreground mt-0.5">Power user commands for rapid navigation.</p>
                                </div>
                                
                                <div className="space-y-1">
                                    {[
                                        { cmd: '⌘ K', action: 'Open Command Palette' },
                                        { cmd: '⌘ P', action: 'Quick Navigation: Projects' },
                                        { cmd: '⌘ W', action: 'Quick Navigation: Wiki' },
                                        { cmd: '⌘ S', action: 'Quick Navigation: Snippets' },
                                        { cmd: '⌘ /', action: 'Toggle Sidebar' },
                                        { cmd: 'ESC', action: 'Close Modals / Deselect' }
                                    ].map((shortcut, i) => (
                                        <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-surface-secondary transition-colors">
                                            <span className="text-sm text-muted-foreground">{shortcut.action}</span>
                                            <kbd className="px-2 py-0.5 bg-surface border border-border rounded-md text-xs font-mono">{shortcut.cmd}</kbd>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'Security' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-base font-semibold">Security & Vault</h3>
                                        <p className="text-sm text-muted-foreground mt-0.5">End-to-end encryption management.</p>
                                    </div>
                                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${
                                        privateKey 
                                            ? 'bg-success-muted text-success border-success/20' 
                                            : 'bg-warning-muted text-warning border-warning/20'
                                    }`}>
                                        <Vault size={12} />
                                        {privateKey ? 'Unlocked' : 'Locked'}
                                    </span>
                                </div>

                                <div className="rounded-xl border border-border bg-surface-secondary/40 p-4 space-y-3">
                                    <div>
                                        <h4 className="text-sm font-medium text-foreground">Sign-in identities</h4>
                                        <p className="text-xs text-muted-foreground mt-0.5">Link an organization provider to this account for future sign-ins.</p>
                                    </div>
                                    {oidcIdentities.map((identity) => (
                                        <div key={identity.id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
                                            <div className="min-w-0 flex-1"><p className="text-sm text-foreground">{identity.providerName}</p><p className="text-xs text-muted-foreground">{identity.providerSlug}</p></div>
                                            <Button variant="tertiary" size="sm" onPress={() => void unlinkOIDCIdentity(identity)}>Unlink</Button>
                                        </div>
                                    ))}
                                    {authConfig?.oidcProviders.filter((provider) => provider.enabled && !oidcIdentities.some((identity) => identity.providerId === provider.id)).map((provider) => (
                                        <Button key={provider.id} variant="secondary" className="w-full justify-start" onPress={() => { window.location.href = api.getOIDCLinkURL(provider.slug); }}>
                                            Link {provider.name}
                                        </Button>
                                    ))}
                                    {oidcIdentities.length === 0 && (!authConfig || authConfig.oidcProviders.length === 0) && <p className="text-xs text-muted-foreground">No OIDC providers are configured.</p>}
                                </div>

                                <div className="rounded-xl border border-border bg-surface-secondary p-4 space-y-4">
                                    <div>
                                        <h4 className="text-sm font-medium text-foreground">{hasVault ? 'Unlock Vault' : 'Initialize Vault'}</h4>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {hasVault 
                                                ? 'Enter your vault password to decrypt your RSA keys.' 
                                                : 'Set up a master password to generate your RSA encryption key pair.'}
                                        </p>
                                    </div>

                                    <Form onSubmit={handleVaultAction} className="space-y-3">
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-foreground">Vault Password</label>
                                            <input 
                                                type="password"
                                                className={`w-full h-9 bg-background rounded-xl border ${vaultError ? 'border-danger' : 'border-border'} px-3 text-sm outline-none focus:border-accent transition-colors`}
                                                placeholder="Enter vault passphrase..."
                                                value={vaultPassword}
                                                onChange={(e) => setVaultPassword(e.target.value)}
                                                required
                                                disabled={!!privateKey}
                                            />
                                            {vaultError && (
                                                <p className="text-xs text-danger">{vaultError}</p>
                                            )}
                                        </div>
                                        <Button 
                                            type="submit" 
                                            className="w-full h-9 rounded-xl text-sm font-medium" 
                                            variant={privateKey ? "secondary" : "primary"}
                                            isPending={isSubmitting}
                                            isDisabled={!!privateKey}
                                        >
                                            {privateKey ? 'Vault Active' : (hasVault ? 'Unlock' : 'Create Vault')}
                                        </Button>
                                    </Form>

                                    {!hasVault && (
                                        <p className="text-xs text-warning">
                                            Warning: Vault passwords cannot be recovered. Loss of password results in permanent data loss.
                                        </p>
                                    )}

                                    {privateKey && (
                                        <div className="p-3 rounded-xl bg-success-muted border border-success/20 flex items-center gap-2 text-success text-xs font-medium">
                                            <CheckCircle size={14} />
                                            Vault active and keys decrypted
                                        </div>
                                    )}
                                </div>

                                {privateKey && (stats.projects > 0 || stats.wiki > 0 || stats.snippets > 0) && (
                                    <div className="rounded-xl border border-warning/30 bg-warning-muted p-4 space-y-4">
                                        <div>
                                            <h4 className="text-sm font-medium text-warning">Unencrypted Data</h4>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Unencrypted records detected. Migrate them to your secure vault.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="p-3 rounded-xl bg-background border border-border text-center">
                                                <div className="text-lg font-semibold text-warning">{stats.projects}</div>
                                                <div className="text-xs text-muted-foreground">Projects</div>
                                            </div>
                                            <div className="p-3 rounded-xl bg-background border border-border text-center">
                                                <div className="text-lg font-semibold text-warning">{stats.wiki}</div>
                                                <div className="text-xs text-muted-foreground">Wiki Guides</div>
                                            </div>
                                            <div className="p-3 rounded-xl bg-background border border-border text-center">
                                                <div className="text-lg font-semibold text-warning">{stats.snippets}</div>
                                                <div className="text-xs text-muted-foreground">Snippets</div>
                                            </div>
                                        </div>

                                        {isMigrating ? (
                                            <div className="flex items-center gap-2">
                                                <RefreshCw size={13} className="animate-spin text-warning" />
                                                <span className="text-xs text-warning">{migrationProgress}</span>
                                            </div>
                                        ) : (
                                            <Button 
                                                className="w-full h-8 rounded-xl text-xs font-medium"
                                                variant="primary"
                                                onPress={handleMigrate}
                                                isDisabled={isMigrating}
                                            >
                                                <Database size={12} className="mr-1.5" />
                                                Start Migration
                                            </Button>
                                        )}
                                    </div>
                                )}

                                {migrationProgress.includes('complete') && !isMigrating && (
                                    <div className="p-3 rounded-xl bg-success-muted border border-success/20 flex items-center gap-2 text-success text-xs font-medium">
                                        <CheckCircle size={14} />
                                        Migration completed successfully
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab !== 'Workspace' && <div className="pt-4 border-t border-border flex justify-end gap-2">
                            <Button 
                                variant="ghost" 
                                className="rounded-xl h-8 px-3 text-[12px] font-medium"
                                onPress={() => router.refresh()}
                            >
                                Discard
                            </Button>
                            <Button 
                                variant="primary" 
                                className="rounded-xl h-8 px-3 text-[12px] font-medium shadow-sm"
                                onPress={handleSaveChanges}
                                isPending={isSubmitting}
                            >
                                <Save size={12} className="mr-1.5" />
                                Save Changes
                            </Button>
                        </div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
