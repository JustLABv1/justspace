'use client';

import { useAuth } from '@/context/AuthContext';
import { decryptData, decryptDocumentKey } from '@/lib/crypto';
import { db } from '@/lib/db';
import { parseUserPreferences } from '@/lib/preferences';
import { Project, Task } from '@/types';
import { toast } from '@heroui/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

const REMINDER_CHECK_INTERVAL_MS = 60_000;
const REMINDER_GRACE_MINUTES = 5;

dayjs.extend(relativeTime);

function buildReminderKey(task: Task) {
	return `justspace-reminder:${task.id}:${task.deadline || 'none'}`;
}

export function TaskReminderBootstrap() {
	const { user, privateKey } = useAuth();
	const router = useRouter();
	const pathname = usePathname();

	const checkReminders = useCallback(async () => {
		if (!user) {
			return;
		}

		const preferences = parseUserPreferences(user.preferences);
		if (!preferences.reminders.enabled) {
			return;
		}

		try {
			const [projectsRes, tasksRes] = await Promise.all([
				db.listProjects(),
				db.listAllTasks(300),
			]);

			const projectMap = new Map<string, Project>(projectsRes.documents.map((project) => [project.id, project]));
			const accessKeys = new Map<string, CryptoKey | null>();

			const hydratedTasks = await Promise.all(tasksRes.documents.map(async (task) => {
				const project = projectMap.get(task.projectId);
				if (!project?.isEncrypted || !task.isEncrypted || !privateKey) {
					return task;
				}

				let docKey = accessKeys.get(project.id) ?? null;
				if (!accessKeys.has(project.id)) {
					try {
						const access = await db.getAccessKey(project.id, user.id);
						docKey = access ? await decryptDocumentKey(access.encryptedKey, privateKey) : null;
					} catch {
						docKey = null;
					}
					accessKeys.set(project.id, docKey);
				}

				if (!docKey) {
					return task;
				}

				try {
					const titleData = JSON.parse(task.title);
					return { ...task, title: await decryptData(titleData, docKey) };
				} catch {
					return task;
				}
			}));

			const now = dayjs();
			for (const task of hydratedTasks) {
				if (task.completed || !task.deadline) {
					continue;
				}

				const diffMinutes = dayjs(task.deadline).diff(now, 'minute', true);
				if (diffMinutes > preferences.reminders.minutesBefore || diffMinutes < -REMINDER_GRACE_MINUTES) {
					continue;
				}

				const reminderKey = buildReminderKey(task);
				if (localStorage.getItem(reminderKey) === '1') {
					continue;
				}

				localStorage.setItem(reminderKey, '1');
				const route = `/projects/${task.projectId}`;
				const dueLabel = dayjs(task.deadline).fromNow();

				if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
					const notification = new Notification('Task reminder', {
						body: `${task.title} is due ${dueLabel}`,
						tag: reminderKey,
					});
					notification.onclick = () => {
						window.focus();
						if (pathname !== route) {
							router.push(route);
						}
					};
				} else {
					toast.success('Task reminder', {
						description: `${task.title} is due ${dueLabel}`,
					});
				}
			}
		} catch (error) {
			console.error('Reminder check failed:', error);
		}
	}, [pathname, privateKey, router, user]);

	useEffect(() => {
		void checkReminders();
		const intervalId = window.setInterval(() => {
			void checkReminders();
		}, REMINDER_CHECK_INTERVAL_MS);

		return () => window.clearInterval(intervalId);
	}, [checkReminders]);

	return null;
}