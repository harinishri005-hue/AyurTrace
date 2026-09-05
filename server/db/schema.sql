-- AIIA Clinical Trials Dashboard Database Schema (SQLite / Postgres-compatible)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  study_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  phase TEXT,
  ctri_number TEXT,
  ndct_registration_no TEXT,
  ethics_committee_no TEXT,
  ethics_approval_status TEXT NOT NULL DEFAULT 'Pending',
  ethics_updated_at DATETIME,
  ethics_updated_by TEXT,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_name TEXT NOT NULL,
  file_name TEXT,
  import_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  imported_by TEXT NOT NULL,
  mode TEXT NOT NULL,
  row_count INTEGER DEFAULT 0,
  flagged_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id INTEGER REFERENCES trials(id) ON DELETE SET NULL,
  patient_id TEXT UNIQUE NOT NULL,
  study_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  subject_id TEXT,
  gender TEXT NOT NULL,
  age INTEGER NOT NULL,
  enroll_date TEXT,
  visit_type TEXT,
  visit_date TEXT,
  systolic_bp REAL,
  pulse_rate REAL,
  temperature REAL,
  weight REAL,
  height REAL,
  is_sae INTEGER DEFAULT 0,
  ae_note TEXT,
  prakriti_vata REAL,
  prakriti_pitta REAL,
  prakriti_kapha REAL,
  agni TEXT,
  koshtha TEXT,
  nadi_note TEXT,
  ayurvedic_diagnosis TEXT,
  chikitsa TEXT,
  status TEXT NOT NULL DEFAULT 'Clean',
  review_status TEXT DEFAULT 'Unreviewed',
  source TEXT DEFAULT 'Manual',
  batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  issue TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open',
  resolution_note TEXT,
  resolved_by TEXT,
  resolved_at DATETIME,
  reopen_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deviations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open',
  date_logged DATETIME DEFAULT CURRENT_TIMESTAMP,
  logged_by TEXT NOT NULL,
  closed_by TEXT,
  closed_at DATETIME
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patients_study ON patients(study_id);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_trial ON patients(trial_id);
CREATE INDEX IF NOT EXISTS idx_queries_patient ON queries(patient_id);
CREATE INDEX IF NOT EXISTS idx_queries_status ON queries(status);
CREATE INDEX IF NOT EXISTS idx_queries_severity ON queries(severity);
CREATE INDEX IF NOT EXISTS idx_deviations_patient ON deviations(patient_id);
CREATE INDEX IF NOT EXISTS idx_deviations_status ON deviations(status);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
