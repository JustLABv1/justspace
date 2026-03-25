'use client';

import { useSyncExternalStore } from 'react';

export type InstallBrowser = 'chromium' | 'safari' | 'other';

export interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaInstallState {
    browser: InstallBrowser;
    canInstall: boolean;
    isStandalone: boolean;
    serviceWorkerReady: boolean;
    installOutcome: 'accepted' | 'dismissed' | null;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

let state: PwaInstallState = {
    browser: 'other',
    canInstall: false,
    isStandalone: false,
    serviceWorkerReady: false,
    installOutcome: null,
};

const listeners = new Set<() => void>();

function emitChange() {
    listeners.forEach((listener) => listener());
}

function updateState(partial: Partial<PwaInstallState>) {
    state = { ...state, ...partial };
    emitChange();
}

export function detectInstallBrowser(userAgent: string): InstallBrowser {
    const ua = userAgent.toLowerCase();

    if (ua.includes('edg/') || ua.includes('chrome/') || ua.includes('chromium/')) {
        return 'chromium';
    }

    if (ua.includes('safari/') && !ua.includes('chrome/') && !ua.includes('chromium/')) {
        return 'safari';
    }

    return 'other';
}

export function setPwaBrowser(browser: InstallBrowser) {
    updateState({ browser });
}

export function setPwaStandalone(isStandalone: boolean) {
    updateState({ isStandalone });
}

export function setPwaServiceWorkerReady(serviceWorkerReady: boolean) {
    updateState({ serviceWorkerReady });
}

export function setInstallPromptEvent(event: BeforeInstallPromptEvent | null) {
    deferredInstallPrompt = event;
    updateState({ canInstall: !!event });
}

export function markAppInstalled() {
    deferredInstallPrompt = null;
    updateState({ canInstall: false, installOutcome: 'accepted' });
}

export async function promptForPwaInstall() {
    if (!deferredInstallPrompt) {
        return null;
    }

    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;

    if (choice.outcome === 'accepted') {
        deferredInstallPrompt = null;
    }

    updateState({
        canInstall: choice.outcome !== 'accepted',
        installOutcome: choice.outcome,
    });

    return choice.outcome;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot() {
    return state;
}

function getServerSnapshot(): PwaInstallState {
    return {
        browser: 'other',
        canInstall: false,
        isStandalone: false,
        serviceWorkerReady: false,
        installOutcome: null,
    };
}

export function usePwaInstallState() {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}