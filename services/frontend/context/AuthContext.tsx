'use client';

import { api, AuthUser } from '@/services/frontend/lib/api';
import { decryptDocumentKey, decryptPrivateKey, generateUserKeyPair, makePrivateKeyNonExtractable, reencryptPrivateKey } from '@/services/frontend/lib/crypto';
import { db } from '@/services/frontend/lib/db';
import { vaultSession } from '@/services/frontend/lib/vault-session';
import { UserKeys } from '@/services/frontend/types';
import { useRouter } from 'next/navigation';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export type VaultState = 'restoring' | 'locked' | 'unlocked';

interface AuthContextType {
    user: AuthUser | null;
    isLoading: boolean;
    privateKey: CryptoKey | null;
    userKeys: UserKeys | null;
    hasVault: boolean;
	vaultState: VaultState;
	vaultExpiresAt: number | null;
    login: (email: string, pass: string) => Promise<void>;
    signup: (email: string, pass: string, name: string) => Promise<void>;
    logout: () => Promise<void>;
	lockVault: () => Promise<void>;
    unlockVault: (password: string) => Promise<void>;
    setupVault: (password: string) => Promise<void>;
	getResourceKey: (resourceId: string) => Promise<CryptoKey | null>;
    updateProfile: (data: { name?: string; preferences?: Record<string, unknown> }) => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
    const [userKeys, setUserKeys] = useState<UserKeys | null>(null);
    const [hasVault, setHasVault] = useState(false);
	const [vaultState, setVaultState] = useState<VaultState>('restoring');
	const [vaultExpiresAt, setVaultExpiresAt] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
	const resourceKeys = useRef(new Map<string, Promise<CryptoKey | null>>());
    const router = useRouter();

    useEffect(() => {
        checkUser();
    }, []);

    const checkUser = async () => {
        try {
            const currentUser = await api.getMe();
            setUser(currentUser);
            // Check for vault keys
            const keys = await db.getUserKeys(currentUser.id);
            setHasVault(!!keys);
            setUserKeys(keys || null);

            // Ensure vault is discoverable for sharing (fix permissions/email casing)
            if (keys) {
                const migrationKey = `v_migrated_${keys.id}`;
                const needsMigration = !sessionStorage.getItem(migrationKey) || !keys.email || keys.email !== currentUser.email.toLowerCase();
                
                if (needsMigration) {
                    try {
                        const updatedKeys = await db.updateUserKeys(keys.id, { 
                            email: currentUser.email,
                            userId: currentUser.id 
                        });
                        setUserKeys(updatedKeys as UserKeys);
                        sessionStorage.setItem(migrationKey, 'true');
                    } catch (e) {
                        console.error('Vault migration failed:', e);
                    }
                }
            }

            // Restore only a non-extractable, time-limited device session.
            if (keys) {
                try {
                    const session = await vaultSession.load(currentUser.id, keys.id);
                    if (session) {
                        setPrivateKey(session.privateKey);
                        setVaultExpiresAt(session.expiresAt);
                        setVaultState('unlocked');
                    } else {
                        setVaultState('locked');
                    }
                } catch (e) {
                    console.error('Failed to restore vault session:', e);
                    await vaultSession.clear();
                    setVaultState('locked');
                }
            } else {
                setVaultState('locked');
            }
        } catch {
            setUser(null);
            setHasVault(false);
            setUserKeys(null);
            setVaultState('locked');
        } finally {
            setIsLoading(false);
        }
    };

    const lockVault = async () => {
        resourceKeys.current.clear();
        setPrivateKey(null);
        setVaultExpiresAt(null);
        setVaultState('locked');
        await vaultSession.clear();
    };

    const getResourceKey = async (resourceId: string): Promise<CryptoKey | null> => {
        if (!privateKey || vaultState !== 'unlocked') return null;
        const existing = resourceKeys.current.get(resourceId);
        if (existing) return existing;
        const pending = db.getAccessKey(resourceId).then(async (access) => {
            if (!access) return null;
            return decryptDocumentKey(access.encryptedKey, privateKey);
        }).catch((error) => {
            console.error('Failed to resolve resource key:', resourceId, error);
            return null;
        });
        resourceKeys.current.set(resourceId, pending);
        return pending;
    };

    useEffect(() => {
        if (!vaultExpiresAt) return;
        const delay = vaultExpiresAt - Date.now();
        if (delay <= 0) {
            void lockVault();
            return;
        }
        const timer = window.setTimeout(() => void lockVault(), delay);
        return () => window.clearTimeout(timer);
    }, [vaultExpiresAt]);

    const login = async (email: string, pass: string) => {
        setIsLoading(true);
        try {
            const authResp = await api.login(email, pass);
            setUser(authResp.user);
            const keys = await db.getUserKeys(authResp.user.id);
            setHasVault(!!keys);
            setUserKeys(keys || null);
            setVaultState(keys ? 'locked' : 'locked');
            router.push('/');
        } catch (error) {
            console.error('Core authentication failure:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const signup = async (email: string, pass: string, name: string) => {
        setIsLoading(true);
        try {
            const authResp = await api.signup(email, pass, name);
            setUser(authResp.user);
            setVaultState('locked');
            router.push('/');
        } catch (error) {
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        try {
            await lockVault();
            await api.logout();
            setUser(null);
            setHasVault(false);
            setUserKeys(null);
            router.push('/login');
        } catch (error) {
            console.error(error);
        }
    };

    const setupVault = async (password: string) => {
        if (!user) return;
        setIsLoading(true);
        try {
            const keyPair = await generateUserKeyPair(password);
            const keys = await db.createUserKeys({ userId: user.id, email: user.email, ...keyPair });
            setHasVault(true);
            setUserKeys(keys as UserKeys);
            await unlockVault(password);
        } finally {
            setIsLoading(false);
        }
    };

    const unlockVault = async (password: string) => {
        if (!user) return;
        setIsLoading(true);
        try {
            let keys = await db.getUserKeys(user.id);
            if (!keys) throw new Error('No vault found');
            const exportableKey = await decryptPrivateKey(keys.encryptedPrivateKey, password, keys.salt, keys.iv, keys.kdfIterations || 100000);
            if ((keys.kdfIterations || 100000) < 600000) {
                const upgraded = await reencryptPrivateKey(exportableKey, password);
                keys = await db.updateUserKeys(keys.id, upgraded) as UserKeys;
            }
            const runtimeKey = await makePrivateKeyNonExtractable(exportableKey);
            const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
            await vaultSession.save({ userId: user.id, keyId: keys.id, expiresAt, privateKey: runtimeKey });
            resourceKeys.current.clear();
            setPrivateKey(runtimeKey);
            setUserKeys(keys);
            setVaultExpiresAt(expiresAt);
            setVaultState('unlocked');
        } catch (error) {
            await lockVault();
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const updateProfile = async (data: { name?: string; preferences?: Record<string, unknown> }) => {
		const updatedUser = await api.updateProfile(data);
		setUser(updatedUser);
		return updatedUser;
	};

    return (
        <AuthContext.Provider value={{ 
            user, 
            isLoading, 
            privateKey, 
            userKeys,
            hasVault, 
			vaultState,
			vaultExpiresAt,
            login, 
            signup, 
            logout, 
			lockVault,
            unlockVault, 
            setupVault,
			getResourceKey,
			updateProfile,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
