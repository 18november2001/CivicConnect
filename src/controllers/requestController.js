const db = require('../config/database');
const { assertTransition } = require('../domain/fsm/requestStateMachine');

function generateTrackingCode() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `REQ-${dateStr}-${randomChars}`;
}

async function createRequest(req, res) {
  const { requesterId, categoryId, title, description, locationAddress, suburb, contactPhone, notifyChannel } = req.body;

  if (!requesterId || !categoryId || !title || !description || !locationAddress || !suburb) {
    return res.status(400).json({ error: 'All core request fields are required.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const catResult = await client.query(
      'SELECT default_sla_hours FROM request_categories WHERE category_id = $1 AND is_active = TRUE',
      [categoryId]
    );

    if (catResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid or inactive municipal category ID.' });
    }

    const slaHours = catResult.rows[0].default_sla_hours;
    const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);
    const trackingCode = generateTrackingCode();

    const insertRequestSql = `
      INSERT INTO service_requests (
        tracking_code, requester_id, category_id, title, description, location_address, suburb, status, sla_due_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Submitted', $8)
      RETURNING *;
    `;
    const requestResult = await client.query(insertRequestSql, [
      trackingCode, requesterId, categoryId, title, description, locationAddress, suburb, slaDueAt
    ]);
    const createdRequest = requestResult.rows[0];

    const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const insertAuditSql = `
      INSERT INTO request_audit_log (
        request_id, actor_id, action, previous_state, new_state, originating_ip
      ) VALUES ($1, $2, 'REQUEST_SUBMITTED', NULL, 'Submitted', $3);
    `;
    await client.query(insertAuditSql, [createdRequest.request_id, requesterId, clientIp]);

    if (contactPhone) {
      const channel = notifyChannel === 'SMS' ? 'SMS' : 'WhatsApp';
      const messageBody = `CivicConnect: Your report '${title}' has been logged. Tracking Code: ${trackingCode}.`;
      await client.query(
        `INSERT INTO outbound_messages (request_id, recipient_phone, channel, message_body)
         VALUES ($1, $2, $3, $4);`,
        [createdRequest.request_id, contactPhone, channel, messageBody]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({ message: 'Request created successfully', data: createdRequest });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating service request:', err);
    return res.status(500).json({ error: 'Internal server error while creating request.' });
  } finally {
    client.release();
  }
}

async function getRequests(req, res) {
  const { status, categoryId, suburb, requesterId, limit = 50, offset = 0 } = req.query;

  let querySql = `
    SELECT 
      sr.request_id, sr.tracking_code, sr.title, sr.status, sr.suburb,
      sr.sla_due_at, sr.created_at, rc.category_name, u.full_name AS requester_name
    FROM service_requests sr
    JOIN request_categories rc ON sr.category_id = rc.category_id
    JOIN users u ON sr.requester_id = u.user_id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    params.push(status);
    querySql += ` AND sr.status = $${params.length}`;
  }
  if (categoryId) {
    params.push(parseInt(categoryId, 10));
    querySql += ` AND sr.category_id = $${params.length}`;
  }
  if (suburb) {
    params.push(suburb);
    querySql += ` AND sr.suburb = $${params.length}`;
  }
  if (requesterId) {
    params.push(requesterId);
    querySql += ` AND sr.requester_id = $${params.length}`;
  }

  params.push(parseInt(limit, 10));
  querySql += ` ORDER BY sr.created_at DESC LIMIT $${params.length}`;

  params.push(parseInt(offset, 10));
  querySql += ` OFFSET $${params.length};`;

  try {
    const result = await db.query(querySql, params);
    return res.status(200).json({ count: result.rows.length, data: result.rows });
  } catch (err) {
    console.error('Error fetching requests:', err);
    return res.status(500).json({ error: 'Failed to retrieve service requests.' });
  }
}

async function getRequestById(req, res) {
  const { id } = req.params;

  try {
    const requestResult = await db.query(
      `SELECT sr.*, rc.category_name, u.full_name AS requester_name
       FROM service_requests sr
       JOIN request_categories rc ON sr.category_id = rc.category_id
       JOIN users u ON sr.requester_id = u.user_id
       WHERE sr.request_id = $1`,
      [id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service request not found.' });
    }

    const timelineResult = await db.query(
      `SELECT update_id, status_snapshot, public_message, posted_by_department, created_at
       FROM request_timeline_updates
       WHERE request_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    return res.status(200).json({
      data: {
        ...requestResult.rows[0],
        timeline: timelineResult.rows
      }
    });
  } catch (err) {
    console.error('Error fetching request by ID:', err);
    return res.status(500).json({ error: 'Failed to retrieve request details.' });
  }
}

async function updateRequestStatus(req, res) {
  const { id } = req.params;
  const { nextStatus, actorId, assignedStaffId, resolutionNotes, rejectionReason, publicMessage } = req.body;

  if (!nextStatus || !actorId) {
    return res.status(400).json({ error: 'nextStatus and actorId are mandatory.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const actorResult = await client.query('SELECT user_id, role, department FROM users WHERE user_id = $1', [actorId]);
    if (actorResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Unrecognized actor ID.' });
    }
    const actor = actorResult.rows[0];

    const reqResult = await client.query(
      'SELECT request_id, status, assigned_staff_id FROM service_requests WHERE request_id = $1 FOR UPDATE',
      [id]
    );
    if (reqResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Service request not found.' });
    }
    const currentRequest = reqResult.rows[0];

    try {
      assertTransition({
        from: currentRequest.status,
        to: nextStatus,
        actorRole: actor.role,
        context: {
          assignedStaffId: assignedStaffId || currentRequest.assigned_staff_id,
          resolutionNotes,
          rejectionReason,
        },
      });
    } catch (fsmError) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        error: 'Illegal state transition',
        violations: fsmError.violations || [fsmError.message]
      });
    }

    const updateSql = `
      UPDATE service_requests
      SET 
        status = $1,
        assigned_staff_id = COALESCE($2, assigned_staff_id),
        resolution_notes = COALESCE($3, resolution_notes),
        rejection_reason = COALESCE($4, rejection_reason),
        updated_at = NOW()
      WHERE request_id = $5
      RETURNING *;
    `;
    const updatedResult = await client.query(updateSql, [
      nextStatus, assignedStaffId || null, resolutionNotes || null, rejectionReason || null, id
    ]);

    const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';
    await client.query(
      `INSERT INTO request_audit_log (
        request_id, actor_id, action, previous_state, new_state, handover_notes, originating_ip
      ) VALUES ($1, $2, 'STATUS_CHANGE', $3, $4, $5, $6)`,
      [id, actorId, currentRequest.status, nextStatus, resolutionNotes || rejectionReason || null, clientIp]
    );

    if (publicMessage) {
      await client.query(
        `INSERT INTO request_timeline_updates (
          request_id, status_snapshot, public_message, posted_by_department
        ) VALUES ($1, $2, $3, $4)`,
        [id, nextStatus, publicMessage, actor.department || 'Municipal Operations']
      );
    }

    await client.query('COMMIT');
    return res.status(200).json({
      message: `Request status transitioned from ${currentRequest.status} to ${nextStatus}`,
      data: updatedResult.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating status:', err);
    return res.status(500).json({ error: 'Internal database error during state transition.' });
  } finally {
    client.release();
  }
}

module.exports = {
  createRequest,
  getRequests,
  getRequestById,
  updateRequestStatus
};