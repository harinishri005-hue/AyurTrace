// server/index.js - AyurTrace Server Entry Point
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config');
const authRoutes = require('./routes/auth');
const ctmsRoutes = require('./routes/ctms');

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Rate limiting on sensitive auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'AyurTrace',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Mount modular API routes
app.use('/api/auth', authRoutes);
app.use('/api/ctms', ctmsRoutes);

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '..', 'client')));

// Fallback to index.html for single-page routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Central error handler returning clean JSON
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Server Error on ${req.method} ${req.path}:`, err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'An unexpected server error occurred.' });
});

const PORT = config.port;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  AyurTrace (Ayurveda CTMS)`);
    console.log(`  Running on: http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
