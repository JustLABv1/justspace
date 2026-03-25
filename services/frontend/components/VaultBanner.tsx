'use client';

import { useAuth } from '@/services/frontend/context/AuthContext';
import { Button } from '@heroui/react';
import { KeyRound, Lock, LogOut } from 'lucide-react';
import { useState } from 'react';

export const VaultBanner = () => {
    const { hasVault, privateKey, unlockVault, logout } = useAuth();
    const [password, setPassword] = useState('');
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [error, setError] = useState('');

    if (!hasVault || privateKey) return null;

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsUnlocking(true);
        setError('');
        try {
            await unlockVault(password);
            setPassword('');
        } catch {
            setError('Incorrect password. Please try again.');
        } finally {
            setIsUnlocking(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm bg-background/75">
            <div className="w-full max-w-sm mx-4 bg-surface rounded-2xl border border-border shadow-2xl p-8 flex flex-col items-center gap-6">
                {/* Icon */}
                <div className="w-16 h-16 rounded-2xl bg-warning/10 border border-warning/20 flex items-center justify-center">
                    <Lock size={26} className="text-warning" />
                </div>

                {/* Text */}
                <div className="text-center">
                    <h2 className="text-[16px] font-bold text-foreground">Vault is Locked</h2>
                    <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed max-w-[260px]">
                        Enter your vault password to decrypt and access your protected content.
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleUnlock} className="w-full space-y-3">
                    <div className="relative">
                        <KeyRound size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="password"
                            autoFocus
                            placeholder="Enter vault password"
                            className={`w-full h-10 bg-surface-secondary border rounded-xl pl-10 pr-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/50 ${
                                error ? 'border-danger/50 focus:border-danger/70' : 'border-border focus:border-warning/50'
                            }`}
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                        />
                    </div>

                    {error && (
                        <p className="text-[12px] text-danger text-center">{error}</p>
                    )}

                    <Button
                        type="submit"
                        variant="primary"
                        className="w-full h-10 rounded-xl text-[13px] font-medium shadow-sm"
                        isPending={isUnlocking}
                    >
                        <KeyRound size={14} className="mr-2" />
                        Unlock Vault
                    </Button>
                </form>

                {/* Secondary action */}
                <button
                    onClick={logout}
                    className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                >
                    <LogOut size={12} />
                    Sign out instead
                </button>
            </div>
        </div>
    );
};
