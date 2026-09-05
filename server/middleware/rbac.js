// server/middleware/rbac.js - Role-based access control middleware
const config = require('../config');

/**
 * Middleware factory requiring that req.user has one of the specified roles.
 * @param  {...string} allowedRoles
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (allowedRoles.includes(req.user.role) || req.user.role === config.roles.ADMIN) {
      return next();
    }

    return res.status(403).json({
      error: `Access denied. Action restricted to: ${allowedRoles.join(', ')}. Current role: ${req.user.role}`
    });
  };
}

module.exports = {
  requireRole
};
