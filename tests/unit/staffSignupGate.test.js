'use strict';

/**
 * The staff sign-up gate (NFR-001). Every refusal path returns before the
 * database is touched, so this runs without PostgreSQL.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerStaff } = require('../../src/controllers/authController');
const { safeEqual } = require('../../src/config/security');

function call(body) {
  const out = {};
  const res = {
    status(code) { out.status = code; return res; },
    json(payload) { out.body = payload; return res; },
  };
  return registerStaff({ body }, res, (err) => { throw err; }).then(() => out);
}

const valid = () => ({
  fullName: 'Sipho Staff', email: 'sipho@city.gov', password: 'long-enough-pass',
  department: 'Water', staffCode: 'right-code',
});

function withCode(value, fn) {
  const previous = process.env.STAFF_REGISTRATION_CODE;
  if (value === undefined) {
    delete process.env.STAFF_REGISTRATION_CODE;
  } else {
    process.env.STAFF_REGISTRATION_CODE = value;
  }
  const restore = () => {
    if (previous === undefined) {
      delete process.env.STAFF_REGISTRATION_CODE;
    } else {
      process.env.STAFF_REGISTRATION_CODE = previous;
    }
  };
  return fn().finally(restore);
}

test('SS-01 staff sign-up is closed when no registration code is configured', async () => {
  const out = await withCode(undefined, () => call(valid()));
  assert.equal(out.status, 403);
  assert.equal(out.body.error.code, 'STAFF_SIGNUP_DISABLED');
});

test('SS-02 a wrong code is refused', async () => {
  const out = await withCode('right-code', () => call({ ...valid(), staffCode: 'wrong' }));
  assert.equal(out.status, 403);
  assert.equal(out.body.error.code, 'INVALID_STAFF_CODE');
});

test('SS-03 invalid details are reported together before the code is even checked', async () => {
  const out = await withCode('right-code', () => call({ ...valid(), email: 'bad', password: 'x', department: 'Finance' }));
  assert.equal(out.status, 400);
  assert.equal(out.body.error.violations.length, 3);
});

test('SS-04 code comparison is exact and length-safe', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('', 'abc'), false);
});
