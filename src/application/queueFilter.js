'use strict';

const { isUuid } = require('../domain/validation/inputValidation');

const OPEN_STATES_SQL = "('Resolved', 'Closed', 'Rejected')";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NO_SUCH_USER = '00000000-0000-0000-0000-000000000000';

/**
 * Turn the staff queue's query string into a parameterised WHERE clause.
 * Pure and dependency-free so it can be unit tested without a database. Every
 * user-supplied value goes into `params`; nothing is concatenated into the SQL.
 */
function buildQueueFilter(query) {
  const clauses = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(sql.replaceAll('?', `$${params.length}`));
  };

  if (query.q) {
    add('(sr.title ILIKE ? OR sr.tracking_code ILIKE ?)', `%${String(query.q).replace(/[\\%_]/g, '\\$&')}%`);
  }
  if (query.status === 'Overdue') {
    clauses.push(`sr.status NOT IN ${OPEN_STATES_SQL} AND sr.sla_due_at < NOW()`);
  } else if (query.status) {
    add('sr.status = ?', String(query.status));
  }
  if (query.category) {
    add('rc.category_name = ?', String(query.category));
  }
  if (query.suburb) {
    add('sr.suburb = ?', String(query.suburb));
  }
  if (query.assignee === 'none') {
    clauses.push('sr.assigned_staff_id IS NULL');
  } else if (query.assignee) {
    add('sr.assigned_staff_id = ?', isUuid(query.assignee) ? query.assignee : NO_SUCH_USER);
  }
  if (DATE_PATTERN.test(query.from || '')) {
    add('sr.created_at >= ?::date', query.from);
  }
  if (DATE_PATTERN.test(query.to || '')) {
    add("sr.created_at < (?::date + INTERVAL '1 day')", query.to);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

module.exports = { buildQueueFilter };
