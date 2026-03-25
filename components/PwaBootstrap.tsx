'use client';

import {
    BeforeInstallPromptEvent,
    detectInstallBrowser,
    markAppInstalled,
    setInstallPromptEvent,
    setPwaBrowser,
    setPwaServiceWorkerReady,
    setPwaStandalone,
} from '@/lib/pwa';
import { useEffect } from 'react';

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

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/sw.js')
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