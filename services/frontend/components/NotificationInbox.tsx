'use client';

import { db } from '@/services/frontend/lib/db';
import { useAuth } from '@/services/frontend/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/services/frontend/lib/crypto';
import { wsClient, WSEvent } from '@/services/frontend/lib/ws';
import { Notification } from '@/services/frontend/types';
import { Button, Chip, Popover, ScrollShadow, Spinner } from '@heroui/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { AtSign, Bell, CalendarClock, CheckSquare, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

dayjs.extend(relativeTime);

export function NotificationInbox() {
    const router = useRouter();
    const { privateKey } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [displayNotifications, setDisplayNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [items, unread] = await Promise.all([db.listNotifications(), db.getUnreadNotificationCount()]);
            setNotifications(items.documents);
            setUnreadCount(unread.count);
        } catch (error) {
            console.error('Failed to load notifications:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        return wsClient.subscribe((event: WSEvent) => {
            if (event.collection === 'notifications') void load();
        });
    }, [load]);

    useEffect(() => {
        let cancelled = false;
        const decryptNotifications = async () => {
            const next = await Promise.all(notifications.map(async (notification) => {
                const encrypted = (value: string) => {
                    try { return typeof JSON.parse(value)?.ciphertext === 'string'; } catch { return false; }
                };
                if (!privateKey || (!encrypted(notification.projectName) && !encrypted(notification.taskTitle))) return notification;
                try {
                    const access = await db.getAccessKey(notification.projectId);
                    if (!access) return { ...notification, projectName: 'Encrypted Project', taskTitle: 'Encrypted Task' };
                    const docKey = await decryptDocumentKey(access.encryptedKey, privateKey);
                    return {
                        ...notification,
                        projectName: encrypted(notification.projectName) ? await decryptData(JSON.parse(notification.projectName), docKey) : notification.projectName,
                        taskTitle: encrypted(notification.taskTitle) ? await decryptData(JSON.parse(notification.taskTitle), docKey) : notification.taskTitle,
                    };
                } catch {
                    return { ...notification, projectName: 'Encrypted Project', taskTitle: 'Encrypted Task' };
                }
            }));
            if (!cancelled) setDisplayNotifications(next);
        };
        void decryptNotifications();
        return () => { cancelled = true; };
    }, [notifications, privateKey]);

    const openNotification = async (notification: Notification) => {
        try {
            if (!notification.readAt) {
                await db.markNotificationRead(notification.id);
                setUnreadCount((count) => Math.max(0, count - 1));
                setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
            }
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
        setIsOpen(false);
        router.push(`/projects/${notification.projectId}?taskId=${encodeURIComponent(notification.taskId)}`);
    };

    const deleteNotification = async (notification: Notification) => {
        try {
            await db.deleteNotification(notification.id);
            setNotifications((items) => items.filter((item) => item.id !== notification.id));
            if (!notification.readAt) setUnreadCount((count) => Math.max(0, count - 1));
        } catch (error) {
            console.error('Failed to delete notification:', error);
        }
    };

    return (
        <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
            <Popover.Trigger>
                <Button variant="ghost" size="sm" isIconOnly aria-label="Notifications" className="relative h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground">
                    <Bell size={16} />
                    {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 h-4 rounded-full bg-accent px-1 text-[9px] font-semibold leading-4 text-accent-foreground">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                </Button>
            </Popover.Trigger>
            <Popover.Content placement="bottom end" className="w-[360px] max-w-[calc(100vw-2rem)] p-0">
                <Popover.Dialog>
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
                            <p className="text-[11px] text-muted-foreground">Mentions and task assignments</p>
                        </div>
                        {unreadCount > 0 && <Chip size="sm" color="accent" variant="soft"><Chip.Label>{unreadCount} new</Chip.Label></Chip>}
                    </div>
                    <ScrollShadow hideScrollBar className="max-h-[420px]" size={16}>
                        {loading ? <div className="flex h-32 items-center justify-center"><Spinner size="sm" color="accent" /></div> : notifications.length === 0 ? (
                            <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><Bell size={20} />No notifications yet</div>
                        ) : (
                            <div className="p-1.5">
                                {displayNotifications.map((notification) => {
                                    const isMention = notification.type === 'mention';
                                    const isDeadline = notification.type.startsWith('deadline_');
                                    const deadlineLabel = notification.type === 'deadline_due'
                                        ? 'is now due'
                                        : notification.type === 'deadline_4h'
                                            ? 'is due within 4 hours'
                                            : 'is due within 24 hours';
                                    return <div key={notification.id} className={`group flex items-start rounded-xl ${!notification.readAt ? 'bg-surface-secondary/70' : ''}`}>
                                        <Button variant="ghost" onPress={() => void openNotification(notification)} className="h-auto min-w-0 flex-1 justify-start rounded-xl px-3 py-2.5 text-left">
                                            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isMention ? 'bg-accent/10 text-accent' : isDeadline ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>{isMention ? <AtSign size={14} /> : isDeadline ? <CalendarClock size={14} /> : <CheckSquare size={14} />}</span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[12px] leading-5 text-foreground">{isDeadline ? <><strong>{notification.taskKey}</strong> {deadlineLabel}</> : <><strong>{notification.actorName}</strong>{isMention ? ' mentioned you in' : ' assigned you to'} <strong>{notification.taskKey}</strong></>}</span>
                                                <span className="block truncate text-[11px] text-muted-foreground">{notification.projectName} · {notification.taskTitle}</span>
                                                <span className="block pt-0.5 text-[10px] text-muted-foreground">{dayjs(notification.createdAt).fromNow()}</span>
                                            </span>
                                        </Button>
                                        <Button variant="ghost" size="sm" isIconOnly aria-label="Remove notification" onPress={() => void deleteNotification(notification)} className="mt-2 mr-1 h-7 w-7 shrink-0 rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-foreground">
                                            <X size={13} />
                                        </Button>
                                    </div>;
                                })}
                            </div>
                        )}
                    </ScrollShadow>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}
