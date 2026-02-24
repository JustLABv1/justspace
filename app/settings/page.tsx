'use client';

import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { encryptData, encryptDocumentKey, generateDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { Button, Form, Surface, toast } from '@heroui/react';
import {
    CheckCircle as CheckCircleIcon,
    Database as DatabaseIcon,
    Keyboard,
    Moon,
    Palette,
    Refresh as RefreshIcon,
    Settings as SettingsIcon,
    Sun,
    Restart as Update,
    User,
    ShieldKeyhole as Vault
} from '@solar-icons/react';
import { useTheme } from 'next-themes';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

export default function SettingsPage() {
    return (
        <Suspense fallback={
            <div className="flex h-screen w-full items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <RefreshIcon size={40} className="animate-spin text-accent opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">Initializing System_</p>
                </div>
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
            setWorkspaceName(prefs?.workspaceName || 'justspace_');
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
        { id: 'General', label: 'General', icon: SettingsIcon },
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
        <div className="max-w-[1200px] mx-auto p-6 md:p-12 space-y-12">
            <header className="space-y-3">
                <div className="flex items-center gap-3 text-accent font-black tracking-[0.2em] text-[10px] opacity-80 uppercase">
                    <SettingsIcon size={14} weight="Bold" className="animate-pulse" />
                    System Configuration
                </div>
                <h1 className="text-3xl font-black tracking-tighter text-foreground leading-tight">
                    Settings_
                </h1>
                <p className="text-sm text-muted-foreground font-medium opacity-60">
                    Configure your workspace, security, and global defaults.
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-10 items-start">
                {/* Sidebar Navigation */}
                <div className="md:col-span-1 space-y-2">
                    {menuItems.map((item) => (
                        <button 
                            key={item.id}
                            onClick={() => handleTabChange(item.id)}
                            className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl font-bold text-sm transition-all duration-300 ${
                                activeTab === item.id 
                                    ? 'bg-foreground text-background shadow-xl shadow-black/10' 
                                    : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                            }`}
                        >
                            <item.icon size={20} weight={activeTab === item.id ? "Bold" : "Linear"} />
                            {item.label}
                        </button>
                    ))}
                </div>

                {/* Main Settings Area */}
                <div className="md:col-span-3">
                    <Surface variant="secondary" className="p-10 rounded-[3rem] border border-border/40 bg-surface/50 backdrop-blur-md space-y-10">
                        {activeTab === 'General' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div>
                                    <h3 className="text-xl font-black tracking-tight mb-2">General Workspace</h3>
                                    <p className="text-xs text-muted-foreground">Global defaults for your consulting environment.</p>
                                </div>
                                
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Workspace Name</label>
                                        <input 
                                            className="w-full h-14 bg-surface rounded-2xl border border-border/50 px-5 font-bold outline-none focus:border-accent transition-all"
                                            value={workspaceName}
                                            onChange={(e) => setWorkspaceName(e.target.value)}
                                            placeholder="Enter workspace name..."
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'User' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div>
                                    <h3 className="text-xl font-black tracking-tight mb-2 uppercase italic">Account Profile</h3>
                                    <p className="text-xs text-muted-foreground">Manage your personal information and identity.</p>
                                </div>
                                
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Full Name</label>
                                        <input 
                                            className="w-full h-14 bg-surface rounded-2xl border border-border/50 px-5 font-bold outline-none focus:border-accent transition-all"
                                            value={userName}
                                            onChange={(e) => setUserName(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2 opacity-50">
                                        <label className="text-[10px] font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Email Address</label>
                                        <div className="w-full h-14 bg-surface/50 rounded-2xl border border-border/50 px-5 font-bold flex items-center cursor-not-allowed">
                                            {user?.email}
                                        </div>
                                    </div>
                                    <div className="pt-4 p-6 rounded-2xl bg-surface-tertiary border border-border/50 space-y-2">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">System Identity</h4>
                                        <p className="text-xs font-mono text-muted-foreground truncate">{user?.id}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'Appearance' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div>
                                    <h3 className="text-xl font-black tracking-tight mb-2">Visual Interface</h3>
                                    <p className="text-xs text-muted-foreground">Customize the lighting and theme of your dashboard.</p>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {[
                                        { id: 'light', label: 'Light Mode', icon: Sun },
                                        { id: 'dark', label: 'Dark Mode', icon: Moon },
                                        { id: 'system', label: 'System Sync', icon: RefreshIcon }
                                    ].map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => setTheme(t.id)}
                                            className={`p-8 rounded-[2rem] border transition-all duration-300 flex flex-col items-center gap-4 group ${
                                                theme === t.id 
                                                    ? 'bg-foreground text-background border-transparent shadow-2xl' 
                                                    : 'bg-surface/50 border-border/50 text-muted-foreground hover:border-accent hover:text-foreground'
                                            }`}
                                        >
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                                                theme === t.id ? 'bg-background/20 text-background' : 'bg-surface text-accent group-hover:bg-accent group-hover:text-white'
                                            }`}>
                                                <t.icon size={24} weight="Bold" />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{t.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'Shortcuts' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div>
                                    <h3 className="text-xl font-black tracking-tight mb-2">Keyboard Shortcuts</h3>
                                    <p className="text-xs text-muted-foreground">Power user commands for rapid navigation.</p>
                                </div>
                                
                                <div className="grid grid-cols-1 gap-4">
                                    {[
                                        { cmd: '⌘ K', action: 'Open Command Palette' },
                                        { cmd: '⌘ P', action: 'Quick Navigation: Projects' },
                                        { cmd: '⌘ W', action: 'Quick Navigation: Wiki' },
                                        { cmd: '⌘ S', action: 'Quick Navigation: Snippets' },
                                        { cmd: '⌘ /', action: 'Toggle Sidebar' },
                                        { cmd: 'ESC', action: 'Close Modals / Deselect' }
                                    ].map((shortcut, i) => (
                                        <div key={i} className="flex items-center justify-between p-4 px-6 rounded-2xl bg-surface/50 border border-border/30">
                                            <span className="text-xs font-bold text-muted-foreground">{shortcut.action}</span>
                                            <kbd className="px-3 py-1 bg-surface border border-border/50 rounded-lg text-[10px] font-black tracking-wider shadow-sm">
                                                {shortcut.cmd}
                                            </kbd>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'Security' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xl font-black tracking-tight mb-2 uppercase italic">Encryption Vault</h3>
                                        <p className="text-xs text-muted-foreground">End-to-end encryption management for sensitive project data.</p>
                                    </div>
                                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border ${
                                        privateKey 
                                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                                            : 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                                    }`}>
                                        <Vault size={14} />
                                        {privateKey ? 'Vault Unlocked' : 'Vault Locked'}
                                    </div>
                                </div>

                                <Surface variant="tertiary" className="p-8 rounded-[2rem] border border-border/20 bg-surface/30 space-y-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
                                            <Vault size={24} weight="Bold" />
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="font-black text-sm uppercase tracking-wider">{hasVault ? 'Unlock your keys' : 'Initialize Vault'}</h4>
                                            <p className="text-xs text-muted-foreground font-medium opacity-60">
                                                {hasVault 
                                                    ? 'Enter your vault password to decrypt your RSA keys. This will enable access to encrypted project data.' 
                                                    : 'Set up a master vault password. This will generate a unique RSA key pair used to secure your most sensitive project data.'}
                                            </p>
                                        </div>
                                    </div>

                                    <Form onSubmit={handleVaultAction} className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black tracking-widest text-muted-foreground ml-1 opacity-60 uppercase">Vault Password</label>
                                            <input 
                                                type="password"
                                                className={`w-full h-14 bg-surface rounded-2xl border ${vaultError ? 'border-danger/50' : 'border-border/50'} px-5 font-bold outline-none focus:border-accent transition-all`}
                                                placeholder="Enter secure vault passphrase..."
                                                value={vaultPassword}
                                                onChange={(e) => setVaultPassword(e.target.value)}
                                                required
                                                disabled={!!privateKey}
                                            />
                                            {vaultError && (
                                                <p className="text-[10px] text-danger font-bold ml-1">{vaultError}</p>
                                            )}
                                        </div>
                                        <Button 
                                            type="submit" 
                                            className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs" 
                                            variant={privateKey ? "secondary" : "primary"}
                                            isPending={isSubmitting}
                                            isDisabled={!!privateKey}
                                        >
                                            {privateKey ? 'Vault Synchronized' : (hasVault ? 'Decrypt Keys' : 'Synthesize Vault')}
                                        </Button>
                                    </Form>

                                    {!hasVault && (
                                        <p className="text-[10px] text-center text-orange-500 font-bold uppercase opacity-60 italic">
                                            Warning: Vault passwords cannot be recovered. Loss of password results in permanent data loss.
                                        </p>
                                    )}

                                    {privateKey && (
                                        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-500 font-bold text-xs uppercase tracking-wider">
                                            <CheckCircleIcon size={20} />
                                            Vault active and keys decrypted_
                                        </div>
                                    )}
                                </Surface>

                                {privateKey && (stats.projects > 0 || stats.wiki > 0 || stats.snippets > 0) && (
                                    <Surface variant="tertiary" className="p-8 rounded-[2rem] border border-orange-500/20 bg-orange-500/5 space-y-6">
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                                                <DatabaseIcon size={24} weight="Bold" />
                                            </div>
                                            <div className="space-y-1">
                                                <h4 className="font-black text-sm uppercase tracking-wider text-orange-500">Legacy Data Migration</h4>
                                                <p className="text-xs text-muted-foreground font-medium opacity-60">
                                                    We detected unencrypted records in your workspace. You can migrate them to your secure vault now.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/10 text-center">
                                                <div className="text-lg font-black text-orange-500">{stats.projects}</div>
                                                <div className="text-[9px] font-bold uppercase tracking-widest opacity-40">Projects</div>
                                            </div>
                                            <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/10 text-center">
                                                <div className="text-lg font-black text-orange-500">{stats.wiki}</div>
                                                <div className="text-[9px] font-bold uppercase tracking-widest opacity-40">Wiki Guides</div>
                                            </div>
                                            <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/10 text-center">
                                                <div className="text-lg font-black text-orange-500">{stats.snippets}</div>
                                                <div className="text-[9px] font-bold uppercase tracking-widest opacity-40">Snippets</div>
                                            </div>
                                        </div>

                                        {isMigrating ? (
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <RefreshIcon size={18} className="animate-spin text-orange-500" />
                                                    <span className="text-xs font-bold text-orange-500 animate-pulse uppercase tracking-wider">{migrationProgress}</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-orange-500/10 rounded-full overflow-hidden">
                                                    <div className="h-full bg-orange-500 animate-[progress_2s_ease-in-out_infinite]" style={{ width: '40%' }} />
                                                </div>
                                            </div>
                                        ) : (
                                            <Button 
                                                className="w-full h-12 rounded-xl font-black uppercase tracking-widest text-[10px] bg-orange-500 text-white border-none shadow-xl shadow-orange-500/20"
                                                onPress={handleMigrate}
                                                isDisabled={isMigrating}
                                            >
                                                Start Migration Phase
                                            </Button>
                                        )}
                                    </Surface>
                                )}

                                {migrationProgress.includes('complete') && !isMigrating && (
                                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-500 font-bold text-xs uppercase tracking-wider">
                                        <CheckCircleIcon size={20} />
                                        Migration completed successfully_
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="pt-8 flex justify-end gap-3 border-t border-border/20">
                            <Button 
                                variant="ghost" 
                                className="rounded-xl font-bold px-6"
                                onPress={() => router.refresh()}
                            >
                                Discard
                            </Button>
                            <Button 
                                variant="primary" 
                                className="rounded-xl font-black px-10 shadow-xl shadow-accent/20 text-[10px] uppercase tracking-widest"
                                onPress={handleSaveChanges}
                                isPending={isSubmitting}
                            >
                                <Update size={18} weight="Bold" className="mr-2" />
                                Save Changes
                            </Button>
                        </div>
                    </Surface>
                </div>
            </div>
        </div>
    );
}

