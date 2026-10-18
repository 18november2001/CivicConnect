'use strict';

const { errorBody } = require('./auth');

/**
 * Central error mapping. Domain errors become the client errors the front end
 * knows (422 violations, 409 stale write, 404); anything else is a 500 whose
 * detail stays in the server log rather than the response.
 */
function errorHandler(err, req, res, _next) {
  if (err.name === 'IllegalTransitionError') {
    return res
      .status(422)
      .json(errorBody('ILLEGAL_TRANSITION', err.message, err.violations || []));
  }
  if (err.code === 'CONCURRENT_MODIFICATION') {
    return res
      .status(409)
      .json(errorBody('CONCURRENT_MODIFICATION', 'This request was changed by someone else.'));
  }
  if (err.code === 'REQUEST_NOT_FOUND') {
    return res.status(404).json(errorBody('REQUEST_NOT_FOUND', 'Service request not found.'));
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(errorBody('BAD_JSON', 'Request body is not valid JSON.'));
  }

  console.error('[Unhandled Error]:', err);
  return res
    .status(500)
    .json(errorBody('INTERNAL_ERROR', 'An unexpected error occurred.'));
}

module.exports = errorHandler;
