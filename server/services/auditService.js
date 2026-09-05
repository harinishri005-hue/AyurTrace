// server/services/auditService.js - Centralized GCP-aligned audit logging service
const db = require('../db');

function logAction({ userId = null, userName = 'System', action, details = '' }) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_log (user_id, user_name, action, details, timestamp)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    stmt.run(userId, userName, action, details);
  } catch (err) {
    console.error('[AuditService] Failed to record audit log:', err.message);
  }
}

function getRecentLogs(limit = 100) {
  const stmt = db.prepare(`
    SELECT * FROM audit_log ORDER BY id DESC LIMIT ?
  `);
  return stmt.all(limit);
}

function getUserLogs(userId, limit = 50) {
  const stmt = db.prepare(`
    SELECT * FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT ?
  `);
  return stmt.all(userId, limit);
}

module.exports = {
  logAction,
  getRecentLogs,
  getUserLogs
};
