import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';
import { Task } from '@/services/frontend/types';
import { compareTasksBySchedule, getEarliestOpenDeadline, getScheduleBucket, isDueSoon } from './task-schedule';

const now = dayjs('2026-07-14T10:00:00');

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
    return {
        id,
        projectId: 'project-1',
        taskKey: id,
        title: id,
        description: '',
        completed: false,
    createdAt: '2026-07-01T10:00:00',
        priority: 'medium',
        order: 0,
        ...overrides,
    };
}

test('classifies deadlines with the exact due timestamp', () => {
    assert.equal(getScheduleBucket('2026-07-14T09:59:00', now), 'overdue');
    assert.equal(getScheduleBucket('2026-07-14T10:00:00', now), 'today');
    assert.equal(getScheduleBucket('2026-07-21T23:59:00', now), 'upcoming');
    assert.equal(getScheduleBucket('2026-07-22T00:00:00', now), 'future');
    assert.equal(getScheduleBucket('not-a-date', now), 'none');
});

test('due soon excludes overdue tasks and includes the seven-day window', () => {
    assert.equal(isDueSoon('2026-07-14T09:00:00', now), false);
    assert.equal(isDueSoon('2026-07-14T16:00:00', now), true);
    assert.equal(isDueSoon('2026-07-21T23:59:00', now), true);
    assert.equal(isDueSoon('2026-07-22T00:00:00', now), false);
});

test('scheduled tasks sort before unscheduled tasks and use priority/order as tie-breakers', () => {
    const early = makeTask('early', { deadline: '2026-07-14T11:00:00' });
    const later = makeTask('later', { deadline: '2026-07-14T12:00:00', priority: 'urgent' });
    const unscheduled = makeTask('unscheduled', { priority: 'urgent' });
    assert.ok(compareTasksBySchedule(early, later, [early, later, unscheduled], now) < 0);
    assert.ok(compareTasksBySchedule(later, unscheduled, [early, later, unscheduled], now) < 0);

    const urgent = makeTask('urgent', { priority: 'urgent', order: 4 });
    const high = makeTask('high', { priority: 'high', order: 1 });
    assert.ok(compareTasksBySchedule(urgent, high, [urgent, high], now) < 0);
});

test('a parent inherits the earliest deadline from an open descendant', () => {
    const parent = makeTask('parent', { deadline: '2026-07-20T12:00:00' });
    const child = makeTask('child', { parentId: parent.id, deadline: '2026-07-14T11:30:00' });
    const completeChild = makeTask('done-child', { parentId: child.id, completed: true, deadline: '2026-07-14T10:30:00' });
    assert.equal(getEarliestOpenDeadline(parent, [parent, child, completeChild]), dayjs('2026-07-14T11:30:00').toISOString());
});
