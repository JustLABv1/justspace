'use client';

import {
    BeforeInstallPromptEvent,
    detectInstallBrowser,
    markAppInstalled,
    setInstallPromptEvent,
    setPwaBrowser,
    setPwaServiceWorkerReady,
    setPwaStandalone,
} from '@/services/frontend/lib/pwa';
import { useEffect } from 'react';

async function unregisterServiceWorkersAndClearCaches() {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ('caches' in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
    }
}

function getStandaloneMode() {
    const standaloneNavigator = window.navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: standalone)').matches || standaloneNavigator.standalone === true;
}

export function PwaBootstrap() {
    useEffect(() => {
        setPwaBrowser(detectInstallBrowser(window.navigator.userAgent));
        setPwaStandalone(getStandaloneMode());

        const displayModeQuery = window.matchMedia('(display-mode: standalone)');
        const handleDisplayModeChange = () => {
            setPwaStandalone(getStandaloneMode());
        };

        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            setInstallPromptEvent(event as BeforeInstallPromptEvent);
        };

        const handleAppInstalled = () => {
            markAppInstalled();
            setPwaStandalone(true);
        };

        displayModeQuery.addEventListener('change', handleDisplayModeChange);
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
        window.addEventListener('appinstalled', handleAppInstalled);

        // Service workers previously cached Next.js chunks under a fixed cache
        // name. That can serve a chunk from an older release alongside the
        // current page and cause runtime errors after a deployment. We no
        // longer ship a service worker, so retire any existing registration
        // and its caches in every environment.
        unregisterServiceWorkersAndClearCaches()
            .catch((error) => {
                console.error('Failed to clear stale service workers:', error);
            })
            .finally(() => {
                setPwaServiceWorkerReady(false);
            });

        return () => {
            displayModeQuery.removeEventListener('change', handleDisplayModeChange);
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    return null;
}
