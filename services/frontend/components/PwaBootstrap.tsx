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

const isProduction = process.env.NODE_ENV === 'production';

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

        if (!isProduction) {
            unregisterServiceWorkersAndClearCaches()
                .catch((error) => {
                    console.error('Failed to clear development service workers:', error);
                })
                .finally(() => {
                    setPwaServiceWorkerReady(false);
                });
        } else if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/sw.js', { updateViaCache: 'none' })
                .then(() => navigator.serviceWorker.ready)
                .then(() => setPwaServiceWorkerReady(true))
                .catch((error) => {
                    console.error('Failed to register service worker:', error);
                    setPwaServiceWorkerReady(false);
                });
        }

        return () => {
            displayModeQuery.removeEventListener('change', handleDisplayModeChange);
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    return null;
}