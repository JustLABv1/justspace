'use client';

import { useAuth } from '@/context/AuthContext';
import { Button } from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, Lock } from 'lucide-react';
import { useState } from 'react';

export const VaultBanner = () => {
    const { hasVault, privateKey, unlockVault } = useAuth();
    const [password, setPassword] = useState('');
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    if (!hasVault || privateKey) return null;

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsUnlocking(true);
        try {
            await unlockVault(password);
            setPassword('');
        } catch {
            console.error('Unlock failed');
        } finally {
            setIsUnlocking(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full bg-warning-muted border-b border-warning/20 z-[100]"
            >
                <div className="max-w-[1400px] mx-auto px-6 h-12 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <Lock size={14} className="text-warning" />
                        <span className="text-xs font-medium text-warning">
                            Vault Locked
                        </span>
                        <span className="hidden md:inline text-xs text-muted-foreground">
                            Unlock your vault to access protected content.
                        </span>
                    </div>

                    {!isExpanded ? (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 rounded-md text-xs text-warning border border-warning/20 hover:bg-warning/10"
                            onPress={() => setIsExpanded(true)}
                        >
                            Unlock Vault
                        </Button>
                    ) : (
                        <form onSubmit={handleUnlock} className="flex items-center gap-2">
                            <div className="relative">
                                <KeyRound size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input 
                                    type="password"
                                    autoFocus
                                    placeholder="Vault password..."
                                    className="h-7 bg-background border border-border rounded-md pl-7 pr-3 text-xs outline-none focus:border-warning/60 w-44 transition-colors"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                            <Button 
                                type="submit"
                                variant="primary" 
                                size="sm" 
                                className="h-7 rounded-md text-xs px-3"
                                isPending={isUnlocking}
                            >
                                Unlock
                            </Button>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 min-w-0 p-0 rounded-md text-muted-foreground hover:text-foreground"
                                onPress={() => setIsExpanded(false)}
                            >
                                ✕
                            </Button>
                        </form>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
