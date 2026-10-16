'use strict';

function errorHandler(err, req, res, next) {
  if (err.name === 'IllegalTransitionError') {
    return res.status(422).json({
      error: 'Unprocessable Entity',
      message: err.message,
      violations: err.violations || [],
    });
  }

  console.error('[Unhandled Error]:', err);
  return res.status(err.status || 500).json({
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred',
  });
}

module.exports = errorHandler;