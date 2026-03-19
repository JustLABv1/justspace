'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { Button, Form, toast } from '@heroui/react';
import {
    CheckCircle,
    Database,
    Keyboard,
    Loader2,
    Moon,
    Palette,
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
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'General');
    
    useEffect(() => {
        const tab = searchParams.get('tab');
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

    const { user, hasVault, privateKey, userKeys, setupVault, unlockVault } = useAuth();
    const [vaultPassword, setVaultPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [vaultError, setVaultError] = useState<string | null>(null);
    
    // Core states
    const [userName, setUserName] = useState('');
    const [workspaceName, setWorkspaceName] = useState('');

    useEffect(() => {
        if (user) {
            setUserName(user.name || '');
            const prefs = (user.preferences || {}) as Record<string, string | undefined>;
            setWorkspaceName(prefs?.workspaceName || 'justspace');
        }
    }, [user]);

    // Migration state
    const [isMigrating, setIsMigrating] = useState(false);
    const [stats, setStats] = useState({ projects: 0, wiki: 0, snippets: 0 });
    const [migrationProgress, setMigrationProgress] = useState('');

    const fetchStats = useCallback(async () => {
        if (!user) return;
        try {
            const [projects, guides, snippets] = await Promise.all([
                db.listProjects(),
                db.listGuides(),
                db.listSnippets()
            ]);
            
            setStats({
                projects: projects.documents.filter(p => !p.isEncrypted).length,
                wiki: guides.documents.filter(g => !g.isEncrypted).length,
                snippets: snippets.documents.filter(s => !s.isEncrypted).length
            });
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    }, [user]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    const handleSaveChanges = async () => {
        setIsSubmitting(true);
        try {
            await api.updateProfile({
                ...(userName !== user?.name ? { name: userName } : {}),
                preferences: {
                    ...(user?.preferences || {}),
                    workspaceName,
                },
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
                    await db.updateTask(t.id, {
                        title: JSON.stringify(encTaskTitle),
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

    const menuItems = [
        { id: 'General', label: 'General', icon: Settings },
        { id: 'User', label: 'Account', icon: User },
        { id: 'Security', label: 'Security & Vault', icon: Vault },
        { id: 'Appearance', label: 'Appearance', icon: Palette },
        { id: 'Shortcuts', label: 'Shortcuts', icon: Keyboard },
    ];

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
                        <button 
                            key={item.id}
                            onClick={() => handleTabChange(item.id)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                                activeTab === item.id 
                                    ? 'bg-surface-secondary text-foreground' 
                                    : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                            }`}
                        >
                            <item.icon size={15} />
                            {item.label}
                        </button>
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
                                
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-foreground">Workspace Name</label>
                                    <input 
                                        className="w-full h-9 bg-background rounded-xl border border-border px-3 text-sm outline-none focus:border-accent transition-colors"
                                        value={workspaceName}
                                        onChange={(e) => setWorkspaceName(e.target.value)}
                                        placeholder="Enter workspace name..."
                                    />
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

                        <div className="pt-4 border-t border-border flex justify-end gap-2">
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
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

