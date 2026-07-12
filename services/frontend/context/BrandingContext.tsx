'use client';

import { api, PlatformBranding } from '@/services/frontend/lib/api';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const FALLBACK_BRANDING: PlatformBranding = { name: 'justspace' };

interface BrandingContextValue {
    branding: PlatformBranding;
    logoUrl: string | null;
    isLoading: boolean;
    refresh: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
    const [branding, setBranding] = useState<PlatformBranding>(FALLBACK_BRANDING);
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const next = await api.getPlatformBranding();
            setBranding({ ...FALLBACK_BRANDING, ...next });
        } catch {
            // The fallback keeps the shell usable while the backend is starting.
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const value = useMemo(() => ({
        branding,
        logoUrl: branding.logoPath ? api.getPlatformBrandingAssetURL(branding.logoPath) : null,
        isLoading,
        refresh,
    }), [branding, isLoading, refresh]);

    return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
    const value = useContext(BrandingContext);
    if (!value) {
        throw new Error('useBranding must be used within a BrandingProvider');
    }
    return value;
}
