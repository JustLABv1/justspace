'use client';

import { decryptPrivateKey, generateUserKeyPair } from '@/lib/crypto';
import { db } from '@/lib/db';
import { api, AuthUser } from '@/lib/api';
import { UserKeys } from '@/types';
import { useRouter } from 'next/navigation';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContextType {
    user: AuthUser | null;
    isLoading: boolean;
    privateKey: CryptoKey | null;
    userKeys: UserKeys | null;
    hasVault: boolean;
    login: (email: string, pass: string) => Promise<void>;
    signup: (email: string, pass: string, name: string) => Promise<void>;
    logout: () => Promise<void>;
    unlockVault: (password: string) => Promise<void>;
    setupVault: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
    const [userKeys, setUserKeys] = useState<UserKeys | null>(null);
    const [hasVault, setHasVault] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
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

            // Attempt session restoration if vault exists
            if (keys) {
                const jwkJson = sessionStorage.getItem('vault_session_key');
                if (jwkJson) {
                    try {
                        const jwk = JSON.parse(jwkJson);
                        const pk = await crypto.subtle.importKey(
                            'jwk',
                            jwk,
                            { name: 'RSA-OAEP', hash: 'SHA-256' },
                            true,
                            ['decrypt']
                        );
                        setPrivateKey(pk);
                    } catch (e) {
                        console.error('Failed to restore vault session:', e);
                        sessionStorage.removeItem('vault_session_key');
                    }
                }
            }
        } catch {
            setUser(null);
            setHasVault(false);
            setUserKeys(null);
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (email: string, pass: string) => {
        setIsLoading(true);
        try {
            const authResp = await api.login(email, pass);
            setUser(authResp.user);
            
            try {
                const keys = await db.getUserKeys(authResp.user.id);
                setHasVault(!!keys);
                setUserKeys(keys || null);
            } catch (dbError) {
                console.error('Non-critical login error (fetching vault keys):', dbError);
                setHasVault(false);
                setUserKeys(null);
            }
            
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
            router.push('/');
        } catch (error) {
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        try {
            await api.logout();
            setUser(null);
            setPrivateKey(null);
            setHasVault(false);
            sessionStorage.removeItem('vault_session_key');
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
            const keys = await db.createUserKeys({
                userId: user.id,
                email: user.email,
                ...keyPair
            });
            setHasVault(true);
            setUserKeys(keys as UserKeys);
            // Also unlock it immediately
            await unlockVault(password);
        } catch (error) {
            console.error('Setup vault error:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const unlockVault = async (password: string) => {
        if (!user) return;
        setIsLoading(true);
        try {
            const keys = await db.getUserKeys(user.id);
            if (!keys) throw new Error('No vault found');

            const pk = await decryptPrivateKey(
                keys.encryptedPrivateKey,
                password,
                keys.salt,
                keys.iv
            );
            setPrivateKey(pk);
            setUserKeys(keys);

            // Persist session
            const jwk = await crypto.subtle.exportKey('jwk', pk);
            sessionStorage.setItem('vault_session_key', JSON.stringify(jwk));
        } catch (error) {
            console.error('Unlock vault error:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthContext.Provider value={{ 
            user, 
            isLoading, 
            privateKey, 
            userKeys,
            hasVault, 
            login, 
            signup, 
            logout, 
            unlockVault, 
            setupVault 
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
