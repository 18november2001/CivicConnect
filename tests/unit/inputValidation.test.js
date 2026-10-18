'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateNewRequest,
  validateCredentials,
  validateStaffSignup,
  isUuid,
  DEPARTMENTS,
} = require('../../src/domain/validation/inputValidation');

const goodRequest = () => ({
  title: 'Pothole on Church Street',
  category: 'Roads',
  description: 'A large pothole is damaging cars at the junction.',
  locationAddress: '14 Church Street',
  suburb: 'Hatfield',
});
const goodStaff = () => ({
  fullName: 'Sipho Staff',
  email: 'sipho@city.gov',
  password: 'correct horse battery',
  department: 'Water',
  staffCode: 'CODE-1',
});

test('IV-01 a valid request has no violations', () => {
  assert.deepEqual(validateNewRequest(goodRequest()), []);
});

test('IV-02 an empty request reports every violation at once', () => {
  assert.equal(validateNewRequest({}).length, 5);
});

test('IV-03 [BVA] title and description limits mirror the database CHECKs', () => {
  assert.equal(validateNewRequest({ ...goodRequest(), title: 'abcd' }).length, 1);
  assert.equal(validateNewRequest({ ...goodRequest(), title: 'abcde' }).length, 0);
  assert.equal(validateNewRequest({ ...goodRequest(), title: 'a'.repeat(101) }).length, 1);
  assert.equal(validateNewRequest({ ...goodRequest(), description: 'a'.repeat(19) }).length, 1);
  assert.equal(validateNewRequest({ ...goodRequest(), description: 'a'.repeat(2000) }).length, 0);
  assert.equal(validateNewRequest({ ...goodRequest(), description: 'a'.repeat(2001) }).length, 1);
});

test('IV-04 non-string values are rejected rather than thrown on', () => {
  assert.ok(validateNewRequest({ ...goodRequest(), title: { $ne: 1 } }).length > 0);
});

test('IV-05 credentials: bad email and short password are both reported', () => {
  const v = validateCredentials({ fullName: 'Al', email: 'nope', password: 'short' });
  assert.equal(v.length, 2);
});

test('IV-06 staff sign-up needs a known department and a code', () => {
  assert.deepEqual(validateStaffSignup(goodStaff()), []);
  assert.equal(validateStaffSignup({ ...goodStaff(), department: 'Finance' }).length, 1);
  assert.equal(validateStaffSignup({ ...goodStaff(), staffCode: '  ' }).length, 1);
  assert.ok(DEPARTMENTS.includes('Water'));
});

test('IV-07 isUuid accepts UUIDs only', () => {
  assert.equal(isUuid('3f2b8c1e-9d4a-4e6f-8a1b-2c3d4e5f6a7b'), true);
  assert.equal(isUuid('missing-id'), false);
  assert.equal(isUuid(undefined), false);
});
