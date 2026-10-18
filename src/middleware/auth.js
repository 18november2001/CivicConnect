const jwt = require('jsonwebtoken');
 
const JWT_SECRET = process.env.JWT_SECRET || 'civic-connect-super-secret-key-2026';
 
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
 
  if (!token) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication token required.' }
    });
  }
 
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Token is invalid or expired.' }
      });
    }
    req.user = decoded;
    next();
  });
}
 
module.exports = { authenticateToken };
 