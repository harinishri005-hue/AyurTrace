// server/routes/auth.js - Authentication, Profile & Admin User Management Routes
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const db = require('../db');
const config = require('../config');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAction, getUserLogs } = require('../services/auditService');

// POST /api/auth/signup - Register new user
router.post('/signup', async (req, res) => {
  try {
    const { username, password, displayName, role } = req.body;

    if (!username || !password || !displayName || !role) {
      return res.status(400).json({ error: 'All fields (username, password, displayName, role) are required.' });
    }

    const trimmedUsername = String(username).trim().toLowerCase();
    if (trimmedUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    if (!config.allRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${config.allRoles.join(', ')}` });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(trimmedUsername);
    if (existing) {
      return res.status(409).json({ error: 'Username is already taken. Please choose another.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = db.prepare(`
      INSERT INTO users (username, password_hash, display_name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(trimmedUsername, passwordHash, displayName.trim(), role);

    const newUserId = result.lastInsertRowid;
    const user = { id: newUserId, username: trimmedUsername, display_name: displayName.trim(), role };

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, config.jwtSecret, { expiresIn: '7d' });

    logAction({
      userId: user.id,
      userName: user.display_name,
      action: 'USER_REGISTERED',
      details: `New account created with role: ${role}`
    });

    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create account: ' + err.message });
  }
});

// POST /api/auth/login - Log in existing user
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const trimmedUsername = String(username).trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(trimmedUsername);

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const userPayload = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role
    };

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    logAction({
      userId: user.id,
      userName: user.display_name,
      action: 'USER_LOGIN',
      details: `Successful login as ${user.role}`
    });

    res.json({ token, user: userPayload });
  } catch (err) {
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

// GET /api/auth/me - Current user details
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// PATCH /api/auth/me - Update display name
router.patch('/me', authenticateToken, (req, res) => {
  try {
    const { displayName } = req.body;
    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ error: 'Display name cannot be empty.' });
    }

    db.prepare('UPDATE users SET display_name = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(displayName.trim(), req.user.id);

    const updatedUser = { ...req.user, display_name: displayName.trim() };
    const token = jwt.sign(
      { id: updatedUser.id, username: updatedUser.username, role: updatedUser.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    logAction({
      userId: req.user.id,
      userName: updatedUser.display_name,
      action: 'PROFILE_UPDATED',
      details: `Display name changed to: ${displayName.trim()}`
    });

    res.json({ user: updatedUser, token });
  } catch (err) {
    res.status(500).json({ error: 'Could not update profile: ' + err.message });
  }
});

// PATCH /api/auth/me/password - Change password
router.patch('/me/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Current password does not match.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(newHash, req.user.id);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'PASSWORD_CHANGED',
      details: 'User password successfully updated'
    });

    res.json({ message: 'Password successfully updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not change password: ' + err.message });
  }
});

// GET /api/auth/me/activity - User recent activity log
router.get('/me/activity', authenticateToken, (req, res) => {
  try {
    const activity = getUserLogs(req.user.id, 50);
    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/users - Admin user list
router.get('/users', authenticateToken, requireRole(config.roles.ADMIN), (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, display_name, role, created_at FROM users ORDER BY id ASC').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/users/:id/role - Admin change user role
router.patch('/users/:id/role', authenticateToken, requireRole(config.roles.ADMIN), (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    const { role } = req.body;

    if (!config.allRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${config.allRoles.join(', ')}` });
    }

    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    db.prepare('UPDATE users SET role = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(role, targetUserId);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'USER_ROLE_CHANGED',
      details: `Changed role of user ${targetUser.username} from '${targetUser.role}' to '${role}'`
    });

    res.json({ message: `Role updated to ${role} for user ${targetUser.username}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
