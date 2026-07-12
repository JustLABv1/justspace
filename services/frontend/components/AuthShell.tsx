'use client';

import { useBranding } from '@/services/frontend/context/BrandingContext';
import { Avatar, Chip } from '@heroui/react';
import { Check, FolderKanban, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

export function AuthShell({ children }: { children: ReactNode }) {
    const { branding, logoUrl } = useBranding();

    return (
        <main className="auth-shell">
            <section className="auth-story" aria-label="Encrypted project management">
                <div className="auth-story__aurora" aria-hidden="true" />
                <div className="auth-story__grid" aria-hidden="true" />

                <div className="auth-story__brand">
                    <Avatar className="size-10 rounded-xl border border-white/15 bg-white/10">
                        <Avatar.Image src={logoUrl ?? undefined} alt="" />
                        <Avatar.Fallback className="rounded-xl bg-white/15 font-bold text-white">
                            {branding.name.charAt(0).toUpperCase()}
                        </Avatar.Fallback>
                    </Avatar>
                    <span>{branding.name}</span>
                </div>

                <div className="auth-story__copy">
                    <Chip size="sm" variant="secondary" className="border border-white/10 bg-white/10 text-white">
                        <ShieldCheck className="size-3.5" />
                        End-to-end encrypted
                    </Chip>
                    <h1>Projects move forward.<br />Your data stays yours.</h1>
                    <p>Plan work, share knowledge and keep every sensitive detail protected inside your encrypted workspace.</p>
                </div>

                <div className="auth-visual" aria-hidden="true">
                    <div className="auth-visual__beam auth-visual__beam--one" />
                    <div className="auth-visual__beam auth-visual__beam--two" />
                    <div className="auth-visual__card auth-visual__card--project">
                        <div className="flex items-center justify-between">
                            <span className="auth-visual__eyebrow"><FolderKanban className="size-3.5" /> Launch plan</span>
                            <span className="auth-visual__dots">•••</span>
                        </div>
                        <div className="mt-5 space-y-3">
                            <div className="auth-task"><span className="auth-task__check"><Check /></span><span><b>Research</b><small>Completed</small></span></div>
                            <div className="auth-task"><span className="auth-task__check"><Check /></span><span><b>Product direction</b><small>Protected update</small></span></div>
                            <div className="auth-task auth-task--muted"><span className="auth-task__dot" /><span><b>Team rollout</b><small>In progress</small></span></div>
                        </div>
                    </div>

                    <div className="auth-visual__card auth-visual__card--vault">
                        <div className="auth-vault__ring"><LockKeyhole className="size-6" /></div>
                        <div><b>Workspace encrypted</b><small>AES-256 · Keys stay with you</small></div>
                        <Sparkles className="auth-vault__sparkle size-4" />
                    </div>
                </div>

                <p className="auth-story__footer"><LockKeyhole className="size-3.5" /> Privacy by design, from the first task.</p>
            </section>

            <section className="auth-form-panel">
                <div className="auth-mobile-brand">
                    <Avatar className="size-9 rounded-xl">
                        <Avatar.Image src={logoUrl ?? undefined} alt="" />
                        <Avatar.Fallback className="rounded-xl bg-accent text-accent-foreground font-bold">{branding.name.charAt(0).toUpperCase()}</Avatar.Fallback>
                    </Avatar>
                    <span>{branding.name}</span>
                </div>
                {children}
            </section>
        </main>
    );
}
