'use strict';

/**
 * Input validation for the HTTP boundary. Pure functions that return every
 * violation at once (FR-006 style), so the UI can show them together.
 *
 * Limits mirror the CHECK constraints in db/schema/001_core_schema.sql and the
 * UI copy in frontend/src/services/validation.ts. Change all three together.
 */

const LIMITS = Object.freeze({
  title: [5, 100],
  description: [20, 2000],
  address: [10, 255],
  suburb: [1, 100],
  fullName: [2, 150],
  email: [3, 255],
  password: [8, 128],
});

const DEPARTMENTS = Object.freeze(['Roads', 'Water', 'Electricity', 'Refuse', 'Sanitation']);
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const within = (value, [min, max]) => value.length >= min && value.length <= max;

function validateNewRequest(body = {}) {
  const violations = [];
  if (!within(text(body.title), LIMITS.title)) {
    violations.push(`Title must be ${LIMITS.title[0]}-${LIMITS.title[1]} characters.`);
  }
  if (!text(body.category)) {
    violations.push('Select a category.');
  }
  if (!within(text(body.description), LIMITS.description)) {
    violations.push(`Description must be ${LIMITS.description[0]}-${LIMITS.description[1]} characters.`);
  }
  if (!within(text(body.locationAddress), LIMITS.address)) {
    violations.push(`Street address must be ${LIMITS.address[0]}-${LIMITS.address[1]} characters.`);
  }
  if (!within(text(body.suburb), LIMITS.suburb)) {
    violations.push('Suburb is required.');
  }
  return violations;
}

function validateCredentials({ fullName, email, password }) {
  const violations = [];
  if (!within(text(fullName), LIMITS.fullName)) {
    violations.push('Enter your full name.');
  }
  if (!EMAIL_PATTERN.test(text(email)) || !within(text(email), LIMITS.email)) {
    violations.push('Enter a valid email address.');
  }
  if (typeof password !== 'string' || !within(password, LIMITS.password)) {
    violations.push(`Password must be ${LIMITS.password[0]}-${LIMITS.password[1]} characters.`);
  }
  return violations;
}

function validateStaffSignup(body = {}) {
  const violations = validateCredentials(body);
  if (!DEPARTMENTS.includes(body.department)) {
    violations.push(`Choose a department: ${DEPARTMENTS.join(', ')}.`);
  }
  if (!text(body.staffCode)) {
    violations.push('The staff registration code is required.');
  }
  return violations;
}

const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

module.exports = {
  LIMITS,
  DEPARTMENTS,
  validateNewRequest,
  validateCredentials,
  validateStaffSignup,
  isUuid,
};
