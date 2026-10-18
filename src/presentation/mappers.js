'use strict';

/**
 * Row -> JSON mappers. The front end contract (frontend/src/types/index.ts) is
 * camelCase with `name`, `address` and `category`; the database is snake_case.
 * Keeping the translation in one file means a column rename touches one place.
 */

const iso = (value) => (value instanceof Date ? value.toISOString() : value);

function toUser(row) {
  return {
    id: row.user_id,
    name: row.full_name,
    email: row.email,
    role: row.role,
    ...(row.department ? { department: row.department } : {}),
  };
}

function toTimelineEntry(row) {
  return {
    at: iso(row.created_at),
    status: row.status_snapshot,
    message: row.public_message,
    department: row.posted_by_department,
  };
}

function toAuditEntry(row) {
  return {
    at: iso(row.created_at),
    actor: row.actor_name,
    action: row.action,
    from: row.previous_state,
    to: row.new_state,
    ...(row.handover_notes ? { note: row.handover_notes } : {}),
  };
}

/**
 * @param {object} row  service_requests joined with category_name
 * @param {object} [extras] { timeline, audit } - audit only for staff roles
 */
function toServiceRequest(row, extras = {}) {
  return {
    id: row.request_id,
    trackingCode: row.tracking_code,
    requesterId: row.requester_id,
    category: row.category_name,
    title: row.title,
    description: row.description,
    address: row.location_address,
    suburb: row.suburb,
    status: row.status,
    assignedStaffId: row.assigned_staff_id,
    ...(row.resolution_notes ? { resolutionNotes: row.resolution_notes } : {}),
    ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {}),
    slaDueAt: iso(row.sla_due_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    ...(extras.timeline ? { timeline: extras.timeline.map(toTimelineEntry) } : {}),
    ...(extras.audit ? { audit: extras.audit.map(toAuditEntry) } : {}),
  };
}

module.exports = { toUser, toServiceRequest, toTimelineEntry, toAuditEntry };
