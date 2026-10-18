'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQueueFilter } = require('../../src/application/queueFilter');
const { toServiceRequest, toUser } = require('../../src/presentation/mappers');

test('QF-01 no filters yields no WHERE clause', () => {
  assert.deepEqual(buildQueueFilter({}), { where: '', params: [] });
});

test('QF-02 values are parameterised, never concatenated (SQL injection)', () => {
  const evil = "x'; DROP TABLE users; --";
  const { where, params } = buildQueueFilter({ suburb: evil, category: evil, status: evil });
  assert.ok(!where.includes('DROP'));
  assert.equal(params.length, 3);
  assert.ok(params.every((p) => p === evil));
});

test('QF-03 search escapes LIKE wildcards and reuses one parameter', () => {
  const { where, params } = buildQueueFilter({ q: '50%_off' });
  assert.equal(params[0], '%50\\%\\_off%');
  assert.equal(where.match(/\$1/g).length, 2);
});

test('QF-04 Overdue is a computed filter, not a status value', () => {
  const { where, params } = buildQueueFilter({ status: 'Overdue' });
  assert.match(where, /sla_due_at < NOW\(\)/);
  assert.equal(params.length, 0);
});

test('QF-05 assignee none, bad uuid, and malformed dates are handled safely', () => {
  assert.match(buildQueueFilter({ assignee: 'none' }).where, /IS NULL/);
  assert.equal(buildQueueFilter({ assignee: 'junk' }).params[0], '00000000-0000-0000-0000-000000000000');
  assert.equal(buildQueueFilter({ from: 'yesterday', to: '2026-13' }).params.length, 0);
  assert.equal(buildQueueFilter({ from: '2026-10-01', to: '2026-10-31' }).params.length, 2);
});

test('QF-06 placeholders are numbered in order with all filters combined', () => {
  const { where, params } = buildQueueFilter({ q: 'a', status: 'Assigned', category: 'Water', suburb: 'X' });
  assert.equal(params.length, 4);
  assert.match(where, /\$4/);
  assert.ok(!where.includes('?'));
});

test('MP-01 service request mapper matches the front-end contract', () => {
  const at = new Date('2026-10-01T10:00:00.123Z');
  const out = toServiceRequest(
    {
      request_id: 'r1', tracking_code: 'REQ-1', requester_id: 'u1', category_name: 'Roads',
      title: 't', description: 'd', location_address: 'a', suburb: 's', status: 'Submitted',
      assigned_staff_id: null, resolution_notes: null, rejection_reason: null,
      sla_due_at: at, created_at: at, updated_at: at,
    },
    {
      timeline: [{ created_at: at, status_snapshot: 'Submitted', public_message: 'm', posted_by_department: 'System' }],
      audit: [{ created_at: at, actor_name: 'Sue', action: 'STATUS_CHANGE', previous_state: null, new_state: 'Submitted', handover_notes: null }],
    },
  );
  assert.equal(out.id, 'r1');
  assert.equal(out.category, 'Roads');
  assert.equal(out.address, 'a');
  assert.equal(out.updatedAt, '2026-10-01T10:00:00.123Z');
  assert.ok(!('resolutionNotes' in out));
  assert.deepEqual(out.timeline[0], { at: at.toISOString(), status: 'Submitted', message: 'm', department: 'System' });
  assert.equal(out.audit[0].actor, 'Sue');
});

test('MP-02 audit is omitted unless supplied (citizens never receive it)', () => {
  const out = toServiceRequest({ request_id: 'r', category_name: 'Roads', sla_due_at: 'x', created_at: 'x', updated_at: 'x' }, { timeline: [] });
  assert.ok(!('audit' in out));
});

test('MP-03 user mapper exposes name, never the password hash', () => {
  const out = toUser({ user_id: 'u', full_name: 'A B', email: 'a@b.c', role: 'Staff', department: 'Water', password_hash: 'secret' });
  assert.deepEqual(out, { id: 'u', name: 'A B', email: 'a@b.c', role: 'Staff', department: 'Water' });
});
