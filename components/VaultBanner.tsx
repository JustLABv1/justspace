'use client';

import { useAuth } from '@/context/AuthContext';
import { Button } from '@heroui/react';
import { LockPassword as Lock, ShieldKeyhole as Vault } from '@solar-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
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
                className="w-full bg-orange-500/10 border-b border-orange-500/20 backdrop-blur-md z-[100]"
            >
                <div className="max-w-[1400px] mx-auto px-6 h-12 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Vault size={18} className="text-orange-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">
                            Vault Locked_
                        </span>
                        <span className="hidden md:inline text-[10px] text-orange-500/60 font-bold uppercase tracking-widest ml-2">
                            Synchronize vault to access protected archives.
                        </span>
                    </div>

                    {!isExpanded ? (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 rounded-lg text-orange-500 border-orange-500/20 hover:bg-orange-500/10 font-black uppercase tracking-widest text-[9px]"
                            onPress={() => setIsExpanded(true)}
                        >
                            Unlock Vault
                        </Button>
                    ) : (
                        <form onSubmit={handleUnlock} className="flex items-center gap-2">
                            <div className="relative">
                                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-500/40" />
                                <input 
                                    type="password"
                                    autoFocus
                                    placeholder="Enter vault password..."
                                    className="h-8 bg-surface border border-orange-500/20 rounded-lg pl-8 pr-3 text-[10px] font-bold outline-none focus:border-orange-500/40 w-48 transition-all"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                            <Button 
                                type="submit"
                                variant="primary" 
                                size="sm" 
                                className="h-8 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-black uppercase tracking-widest text-[9px] px-4"
                                isPending={isUnlocking}
                            >
                                Unlock
                            </Button>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 w-8 min-w-0 p-0 rounded-lg text-orange-500/40 hover:text-orange-500"
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
