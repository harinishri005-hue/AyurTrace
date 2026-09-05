// server/config/index.js - Centralized configuration & clinical bounds

const path = require('path');

module.exports = {
  port: process.env.PORT || 4000,
  jwtSecret: process.env.JWT_SECRET || 'aiia_ctms_sih_secure_jwt_secret_key_2026_clinical_trials',
  dbPath: path.join(__dirname, '..', 'db', 'ctms.db'),

  // Primary roles recognized by the CTMS
  roles: {
    PI: 'Principal Investigator',
    CRC: 'Clinical Research Coordinator',
    DM: 'Data Manager',
    RAO: 'Regulatory Affairs Officer',
    EC: 'Ethics Committee Member',
    ADMIN: 'Admin'
  },

  allRoles: [
    'Principal Investigator',
    'Clinical Research Coordinator',
    'Data Manager',
    'Regulatory Affairs Officer',
    'Ethics Committee Member',
    'Admin'
  ],

  // Clinical thresholds for the Automated Edit-Check Engine
  clinicalBounds: {
    systolicBP: {
      normalMin: 90,
      normalMax: 140,
      criticalLow: 80,
      criticalHigh: 180
    },
    pulseRate: {
      normalMin: 60,
      normalMax: 100,
      criticalLow: 50,
      criticalHigh: 120
    },
    temperature: {
      normalMin: 36.0,
      normalMax: 37.5,
      criticalLow: 35.0,
      criticalHigh: 38.5
    },
    age: {
      min: 1,
      max: 120
    }
  },

  // Valid Ayurvedic physiological classifications
  ayurveda: {
    agniTypes: ['Manda', 'Sama', 'Tikshna', 'Vishama'],
    koshthaTypes: ['Mridu', 'Madhyama', 'Krura']
  },

  // Regulatory & workflow statuses
  statuses: {
    ethics: ['Pending', 'Approved', 'Rejected', 'Expired'],
    querySeverity: ['Critical', 'Major', 'Minor'],
    queryStatus: ['Open', 'Resolved'],
    deviationSeverity: ['Minor', 'Major', 'Critical'],
    deviationStatus: ['Open', 'Reviewed', 'Closed'],
    patientStatus: ['Clean', 'Flagged']
  }
};
