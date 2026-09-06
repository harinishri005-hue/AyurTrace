const { normalizePrakriti } = require('../services/prakritiService');
// server/routes/ctms.js - Core CTMS API Routes
const express = require('express');
const multer = require('multer');
const router = express.Router();

const db = require('../db');
const config = require('../config');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAction, getRecentLogs } = require('../services/auditService');
const { runEditChecksForPatient, verifyQueryResolution } = require('../services/editCheckEngine');
const {
  generateTemplateBuffer,
  parseExcelBuffer,
  processBatchImport,
  exportFullCTMSWorkbook
} = require('../services/excelService');
const {
  exportPatientToFHIR,
  exportTrialToFHIR,
  exportToCDISCODM
} = require('../services/interoperabilityService');

// Multer memory storage for Excel files (max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// All CTMS routes require valid JWT authentication
router.use(authenticateToken);

// =====================================================================
// 1. DASHBOARD SUMMARY METRICS
// =====================================================================
router.get('/dashboard', (req, res) => {
  try {
    const totalPatients = db.prepare('SELECT COUNT(*) as count FROM patients').get().count;
    const cleanPatients = db.prepare('SELECT COUNT(*) as count FROM patients WHERE status = \'Clean\'').get().count;
    const flaggedPatients = totalPatients - cleanPatients;

    const totalQueries = db.prepare('SELECT COUNT(*) as count FROM queries').get().count;
    const openQueries = db.prepare('SELECT COUNT(*) as count FROM queries WHERE status = \'Open\'').get().count;
    const resolvedQueries = db.prepare('SELECT COUNT(*) as count FROM queries WHERE status = \'Resolved\'').get().count;

    const openCritical = db.prepare('SELECT COUNT(*) as count FROM queries WHERE status = \'Open\' AND severity = \'Critical\'').get().count;
    const openMajor = db.prepare('SELECT COUNT(*) as count FROM queries WHERE status = \'Open\' AND severity = \'Major\'').get().count;
    const openMinor = db.prepare('SELECT COUNT(*) as count FROM queries WHERE status = \'Open\' AND severity = \'Minor\'').get().count;

    const totalDeviations = db.prepare('SELECT COUNT(*) as count FROM deviations').get().count;
    const openDeviations = db.prepare('SELECT COUNT(*) as count FROM deviations WHERE status = \'Open\'').get().count;

    // Quality metrics
    let qualityScore = 100;
    if (totalPatients > 0) {
      const flaggedDeduction = (flaggedPatients / totalPatients) * 40;
      const queryDeduction = Math.min((openQueries / totalPatients) * 20, 40);
      const criticalDeduction = openCritical * 5;
      qualityScore = Math.max(0, Math.round(100 - flaggedDeduction - queryDeduction - criticalDeduction));
    }

    // Missing vital data rate
    const missingVitals = db.prepare(`
      SELECT COUNT(*) as count FROM patients
      WHERE systolic_bp IS NULL OR pulse_rate IS NULL OR temperature IS NULL
    `).get().count;
    const missingDataRate = totalPatients > 0 ? ((missingVitals / totalPatients) * 100).toFixed(1) : 0;

    // Consent compliance (used by PI/EC/Regulatory role views)
    const consentGaps = db.prepare('SELECT COUNT(*) as count FROM patients WHERE consent_obtained = 0').get().count;

    // Ethics-specific figures
    const pendingEthicsApprovals = db.prepare("SELECT COUNT(*) as count FROM trials WHERE ethics_approval_status = 'Pending'").get().count;
    const rejectedOrExpiredEthics = db.prepare("SELECT COUNT(*) as count FROM trials WHERE ethics_approval_status IN ('Rejected','Expired')").get().count;

    // Regulatory-specific figures
    const trialsMissingCTRI = db.prepare("SELECT COUNT(*) as count FROM trials WHERE ctri_number IS NULL OR TRIM(ctri_number) = ''").get().count;
    const trialsMissingNDCT = db.prepare("SELECT COUNT(*) as count FROM trials WHERE ndct_registration_no IS NULL OR TRIM(ndct_registration_no) = ''").get().count;

    // Role-specific KPI focus: each role sees the handful of numbers most relevant to their job,
    // rather than one identical dashboard for everyone.
    const role = req.user.role;
    let roleFocus = { role, headline: 'General Overview', kpis: [] };

    if (role === config.roles.EC) {
      roleFocus = {
        role,
        headline: 'Ethics Committee Focus',
        kpis: [
          { label: 'Trials Pending Ethics Approval', value: pendingEthicsApprovals },
          { label: 'Rejected / Expired Approvals', value: rejectedOrExpiredEthics },
          { label: 'Patients Missing Documented Consent', value: consentGaps }
        ]
      };
    } else if (role === config.roles.RAO) {
      roleFocus = {
        role,
        headline: 'Regulatory Affairs Focus',
        kpis: [
          { label: 'Trials Missing CTRI Number', value: trialsMissingCTRI },
          { label: 'Trials Missing NDCT Registration', value: trialsMissingNDCT },
          { label: 'Open Protocol Deviations', value: openDeviations }
        ]
      };
    } else if (role === config.roles.PI) {
      roleFocus = {
        role,
        headline: 'Principal Investigator Focus',
        kpis: [
          { label: 'Open Critical Queries', value: openCritical },
          { label: 'Patients Missing Consent Documentation', value: consentGaps },
          { label: 'Open Protocol Deviations', value: openDeviations }
        ]
      };
    } else if (role === config.roles.CRC) {
      roleFocus = {
        role,
        headline: 'Clinical Coordinator Focus',
        kpis: [
          { label: 'Flagged Records Needing Correction', value: flaggedPatients },
          { label: 'Open Data Queries', value: openQueries },
          { label: 'Patients Missing Consent Documentation', value: consentGaps }
        ]
      };
    } else if (role === config.roles.DM) {
      roleFocus = {
        role,
        headline: 'Data Manager Focus',
        kpis: [
          { label: 'Data Quality Score', value: qualityScore + '%' },
          { label: 'Missing Vitals Rate', value: missingDataRate + '%' },
          { label: 'Open Queries (all severities)', value: openQueries }
        ]
      };
    } else {
      roleFocus = {
        role,
        headline: 'Administrator Overview',
        kpis: [
          { label: 'Pending Ethics Approvals', value: pendingEthicsApprovals },
          { label: 'Trials Missing Regulatory Numbers', value: trialsMissingCTRI + trialsMissingNDCT },
          { label: 'Consent Documentation Gaps', value: consentGaps }
        ]
      };
    }

    res.json({
      totalPatients,
      cleanPatients,
      flaggedPatients,
      totalQueries,
      openQueries,
      resolvedQueries,
      openCritical,
      openMajor,
      openMinor,
      totalDeviations,
      openDeviations,
      qualityScore,
      missingDataRate,
      queryRate: totalPatients > 0 ? (totalQueries / totalPatients).toFixed(2) : 0,
      consentGaps,
      roleFocus
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to calculate dashboard metrics: ' + err.message });
  }
});

// =====================================================================
// 2. TRIALS MODULE
// =====================================================================
router.get('/trials', (req, res) => {
  try {
    const trials = db.prepare('SELECT * FROM trials ORDER BY id DESC').all();
    res.json(trials);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trials', (req, res) => {
  try {
    const { title, studyId, phase, ctriNumber, ndctRegistrationNo, ethicsCommitteeNo } = req.body;

    if (!title || !studyId) {
      return res.status(400).json({ error: 'Trial title and Study ID are required.' });
    }

    const trimmedStudyId = studyId.trim();
    const existing = db.prepare('SELECT id FROM trials WHERE study_id = ?').get(trimmedStudyId);
    if (existing) {
      return res.status(409).json({ error: `Trial with Study ID '${trimmedStudyId}' already exists.` });
    }

    const result = db.prepare(`
      INSERT INTO trials (study_id, title, phase, ctri_number, ndct_registration_no, ethics_committee_no, ethics_approval_status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, datetime('now'))
    `).run(trimmedStudyId, title.trim(), phase || '', ctriNumber || '', ndctRegistrationNo || '', ethicsCommitteeNo || '', req.user.display_name);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'TRIAL_CREATED',
      details: `Registered trial: ${title.trim()} (${trimmedStudyId})`
    });

    const newTrial = db.prepare('SELECT * FROM trials WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newTrial);
  } catch (err) {
    res.status(500).json({ error: 'Failed to register trial: ' + err.message });
  }
});

// Update ethics approval status - Ethics Committee Member or Admin only
router.patch('/trials/:id/ethics', requireRole(config.roles.EC, config.roles.ADMIN), (req, res) => {
  try {
    const trialId = Number(req.params.id);
    const { status, note } = req.body;

    if (!config.statuses.ethics.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${config.statuses.ethics.join(', ')}` });
    }

    const trial = db.prepare('SELECT * FROM trials WHERE id = ?').get(trialId);
    if (!trial) return res.status(404).json({ error: 'Trial not found.' });

    db.prepare(`
      UPDATE trials SET
        ethics_approval_status = ?,
        ethics_updated_at = datetime('now'),
        ethics_updated_by = ?
      WHERE id = ?
    `).run(status, req.user.display_name, trialId);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'TRIAL_ETHICS_STATUS_UPDATED',
      details: `Trial '${trial.study_id}' ethics status updated from '${trial.ethics_approval_status}' to '${status}' by ${req.user.role}. Note: ${note || 'None'}`
    });

    res.json({ message: `Trial ethics status updated to '${status}'.`, trialId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// 3. PATIENTS MODULE
// =====================================================================
router.get('/patients', (req, res) => {
  try {
    let sql = 'SELECT * FROM patients WHERE 1=1';
    const params = [];

    if (req.query.trialId) {
      sql += ' AND trial_id = ?';
      params.push(req.query.trialId);
    }
    if (req.query.status && req.query.status !== 'all') {
      sql += ' AND status = ?';
      params.push(req.query.status);
    }
    if (req.query.search) {
      sql += ' AND (patient_id LIKE ? OR study_id LIKE ? OR ayurvedic_diagnosis LIKE ?)';
      const s = `%${req.query.search.trim()}%`;
      params.push(s, s, s);
    }

    sql += ' ORDER BY id DESC';
    const patients = db.prepare(sql).all(...params);
    const enriched = patients.map(p => {
      const norm = normalizePrakriti(p.prakriti_vata, p.prakriti_pitta, p.prakriti_kapha);
      return {
        ...p,
        prakriti_normalized: norm.normalized || null,
        prakriti_display: (norm.valid && norm.normalized) ? `${norm.normalized.vataPct}% / ${norm.normalized.pittaPct}% / ${norm.normalized.kaphaPct}%` : null
      };
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/patients', (req, res) => {
  try {
    const p = req.body;
    const patientId = String(p.patientId || p.patient_id || '').trim();

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required.' });
    }

    const existing = db.prepare('SELECT id FROM patients WHERE patient_id = ?').get(patientId);
    if (existing) {
      return res.status(409).json({ error: `Patient ID '${patientId}' already exists.` });
    }

    const trialId = p.trialId ? Number(p.trialId) : null;
    const isSaeVal = (p.isSAE === true || p.isSAE === 1 || p.is_sae === 1 || String(p.isSAE) === 'true') ? 1 : 0;

    const insertStmt = db.prepare(`
      INSERT INTO patients (
        trial_id, patient_id, study_id, site_id, gender, age, enroll_date,
        visit_type, visit_date, systolic_bp, pulse_rate, temperature, weight, height,
        is_sae, ae_note, prakriti_vata, prakriti_pitta, prakriti_kapha,
        agni, koshtha, nadi_note, ayurvedic_diagnosis, chikitsa,
        consent_obtained, consent_version, consent_date, consent_witness,
        status, review_status, source
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        'Clean', 'Unreviewed', 'Manual'
      )
    `);

    const consentVal = (p.consentObtained === true || p.consentObtained === 1 || p.consent_obtained === 1 || String(p.consentObtained) === 'true') ? 1 : 0;

    const result = insertStmt.run(
      trialId,
      patientId,
      p.studyId || p.study_id || '',
      p.siteId || p.site_id || '',
      p.gender || '',
      p.age !== '' && p.age !== undefined ? Number(p.age) : null,
      p.enrollDate || p.enroll_date || '',
      p.visitType || p.visit_type || 'Baseline',
      p.visitDate || p.visit_date || '',
      p.systolicBP !== '' && p.systolicBP !== undefined ? Number(p.systolicBP) : null,
      p.pulseRate !== '' && p.pulseRate !== undefined ? Number(p.pulseRate) : null,
      p.temperature !== '' && p.temperature !== undefined ? Number(p.temperature) : null,
      p.weight !== '' && p.weight !== undefined ? Number(p.weight) : null,
      p.height !== '' && p.height !== undefined ? Number(p.height) : null,
      isSaeVal,
      p.aeNote || p.ae_note || '',
      p.prakritiVata !== '' && p.prakritiVata !== undefined ? Number(p.prakritiVata) : null,
      p.prakritiPitta !== '' && p.prakritiPitta !== undefined ? Number(p.prakritiPitta) : null,
      p.prakritiKapha !== '' && p.prakritiKapha !== undefined ? Number(p.prakritiKapha) : null,
      p.agni || '',
      p.koshtha || '',
      p.nadiNote || p.nadi_note || '',
      p.ayurvedicDiagnosis || p.ayurvedic_diagnosis || '',
      p.chikitsa || '',
      consentVal,
      p.consentVersion || p.consent_version || '',
      p.consentDate || p.consent_date || '',
      p.consentWitness || p.consent_witness || ''
    );

    const patientDbId = result.lastInsertRowid;

    // Run Edit Checks immediately
    const issuesRaised = runEditChecksForPatient(db, patientDbId);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'PATIENT_ENROLLED',
      details: `Enrolled patient ${patientId} (Trial ID: ${trialId || 'None'}). ${issuesRaised.length} edit check(s) flagged.`
    });

    const savedPatient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientDbId);
    res.status(201).json({ patient: savedPatient, issuesRaised });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add patient: ' + err.message });
  }
});

router.get('/patients/:id', (req, res) => {
  try {
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const queries = db.prepare('SELECT * FROM queries WHERE patient_id = ? ORDER BY id DESC').all(patient.id);
    const deviations = db.prepare('SELECT * FROM deviations WHERE patient_id = ? ORDER BY id DESC').all(patient.id);

    const norm = normalizePrakriti(patient.prakriti_vata, patient.prakriti_pitta, patient.prakriti_kapha);
    patient.prakriti_normalized = norm.normalized || null;
    patient.prakriti_display = (norm.valid && norm.normalized) ? `${norm.normalized.vataPct}% / ${norm.normalized.pittaPct}% / ${norm.normalized.kaphaPct}%` : null;
    res.json({ patient, queries, deviations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/patients/:id', (req, res) => {
  try {
    const patientId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
    if (!existing) return res.status(404).json({ error: 'Patient not found.' });

    const p = req.body;
    const isSaeVal = p.isSAE !== undefined
      ? ((p.isSAE === true || p.isSAE === 1 || String(p.isSAE) === 'true') ? 1 : 0)
      : existing.is_sae;

    db.prepare(`
      UPDATE patients SET
        patient_id = ?, study_id = ?, site_id = ?, gender = ?, age = ?,
        enroll_date = ?, visit_type = ?, visit_date = ?,
        systolic_bp = ?, pulse_rate = ?, temperature = ?, weight = ?, height = ?,
        is_sae = ?, ae_note = ?,
        prakriti_vata = ?, prakriti_pitta = ?, prakriti_kapha = ?,
        agni = ?, koshtha = ?, nadi_note = ?,
        ayurvedic_diagnosis = ?, chikitsa = ?,
        consent_obtained = ?, consent_version = ?, consent_date = ?, consent_witness = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      p.patientId !== undefined ? p.patientId : existing.patient_id,
      p.studyId !== undefined ? p.studyId : existing.study_id,
      p.siteId !== undefined ? p.siteId : existing.site_id,
      p.gender !== undefined ? p.gender : existing.gender,
      p.age !== undefined && p.age !== '' ? Number(p.age) : existing.age,
      p.enrollDate !== undefined ? p.enrollDate : existing.enroll_date,
      p.visitType !== undefined ? p.visitType : existing.visit_type,
      p.visitDate !== undefined ? p.visitDate : existing.visit_date,
      p.systolicBP !== undefined && p.systolicBP !== '' ? Number(p.systolicBP) : (p.systolicBP === '' ? null : existing.systolic_bp),
      p.pulseRate !== undefined && p.pulseRate !== '' ? Number(p.pulseRate) : (p.pulseRate === '' ? null : existing.pulse_rate),
      p.temperature !== undefined && p.temperature !== '' ? Number(p.temperature) : (p.temperature === '' ? null : existing.temperature),
      p.weight !== undefined && p.weight !== '' ? Number(p.weight) : (p.weight === '' ? null : existing.weight),
      p.height !== undefined && p.height !== '' ? Number(p.height) : (p.height === '' ? null : existing.height),
      isSaeVal,
      p.aeNote !== undefined ? p.aeNote : existing.ae_note,
      p.prakritiVata !== undefined && p.prakritiVata !== '' ? Number(p.prakritiVata) : (p.prakritiVata === '' ? null : existing.prakriti_vata),
      p.prakritiPitta !== undefined && p.prakritiPitta !== '' ? Number(p.prakritiPitta) : (p.prakritiPitta === '' ? null : existing.prakriti_pitta),
      p.prakritiKapha !== undefined && p.prakritiKapha !== '' ? Number(p.prakritiKapha) : (p.prakritiKapha === '' ? null : existing.prakriti_kapha),
      p.agni !== undefined ? p.agni : existing.agni,
      p.koshtha !== undefined ? p.koshtha : existing.koshtha,
      p.nadiNote !== undefined ? p.nadiNote : existing.nadi_note,
      p.ayurvedicDiagnosis !== undefined ? p.ayurvedicDiagnosis : existing.ayurvedic_diagnosis,
      p.chikitsa !== undefined ? p.chikitsa : existing.chikitsa,
      p.consentObtained !== undefined ? ((p.consentObtained === true || p.consentObtained === 1 || String(p.consentObtained) === 'true') ? 1 : 0) : existing.consent_obtained,
      p.consentVersion !== undefined ? p.consentVersion : existing.consent_version,
      p.consentDate !== undefined ? p.consentDate : existing.consent_date,
      p.consentWitness !== undefined ? p.consentWitness : existing.consent_witness,
      patientId
    );

    // Re-run edit checks to raise queries if new invalid data was entered
    const newIssuesRaised = runEditChecksForPatient(db, patientId);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'PATIENT_UPDATED',
      details: `Updated patient ${existing.patient_id}. ${newIssuesRaised.length} new issue(s) raised.`
    });

    const updatedPatient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
    res.json({ patient: updatedPatient, newIssuesRaised });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update patient: ' + err.message });
  }
});

// =====================================================================
// 4. QUERIES MODULE
// =====================================================================
router.get('/queries', (req, res) => {
  try {
    let sql = 'SELECT * FROM queries WHERE 1=1';
    const params = [];

    if (req.query.severity && req.query.severity !== 'all') {
      sql += ' AND severity = ?';
      params.push(req.query.severity);
    }
    if (req.query.status && req.query.status !== 'all') {
      sql += ' AND status = ?';
      params.push(req.query.status);
    }
    if (req.query.patientId) {
      sql += ' AND patient_id = ?';
      params.push(req.query.patientId);
    }

    // Sort with Critical first, then Major, then Minor, then newest
    sql += `
      ORDER BY
        CASE severity WHEN 'Critical' THEN 1 WHEN 'Major' THEN 2 WHEN 'Minor' THEN 3 ELSE 4 END ASC,
        id DESC
    `;

    const queries = db.prepare(sql).all(...params);
    res.json(queries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resolve a query with mandatory resolution note & validation re-check
router.patch('/queries/:id/resolve', (req, res) => {
  try {
    const queryId = Number(req.params.id);
    const { resolutionNote } = req.body;

    if (!resolutionNote || !resolutionNote.trim()) {
      return res.status(400).json({ error: 'A documented clinical resolution note is mandatory.' });
    }

    const query = db.prepare('SELECT * FROM queries WHERE id = ?').get(queryId);
    if (!query) return res.status(404).json({ error: 'Query not found.' });

    if (query.status === 'Resolved') {
      return res.status(400).json({ error: 'Query is already marked as Resolved.' });
    }

    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(query.patient_id);
    if (!patient) return res.status(404).json({ error: 'Linked patient record not found.' });

    // CRITICAL EDIT-CHECK RE-VALIDATION:
    // If the data is still invalid, reject resolution!
    const check = verifyQueryResolution(query, patient);
    if (!check.allowed) {
      return res.status(400).json({ error: check.reason });
    }

    db.prepare(`
      UPDATE queries SET
        status = 'Resolved',
        resolution_note = ?,
        resolved_by = ?,
        resolved_at = datetime('now')
      WHERE id = ?
    `).run(resolutionNote.trim(), req.user.display_name, queryId);

    // If ALL queries for this patient are resolved, mark patient as Clean
    const openCount = db.prepare(`
      SELECT COUNT(*) as count FROM queries WHERE patient_id = ? AND status = 'Open'
    `).get(patient.id).count;

    if (openCount === 0) {
      db.prepare('UPDATE patients SET status = \'Clean\', updated_at = datetime(\'now\') WHERE id = ?').run(patient.id);
    }

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'QUERY_RESOLVED',
      details: `Resolved query Q-${queryId} for patient ${patient.patient_id} on field '${query.field}'. Note: ${resolutionNote.trim()}`
    });

    res.json({ message: `Query Q-${queryId} resolved successfully.`, patientStatus: openCount === 0 ? 'Clean' : 'Flagged' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reopen a query
router.patch('/queries/:id/reopen', (req, res) => {
  try {
    const queryId = Number(req.params.id);
    const query = db.prepare('SELECT * FROM queries WHERE id = ?').get(queryId);
    if (!query) return res.status(404).json({ error: 'Query not found.' });

    db.prepare(`
      UPDATE queries SET
        status = 'Open',
        reopen_count = reopen_count + 1
      WHERE id = ?
    `).run(queryId);

    // Patient becomes Flagged
    db.prepare('UPDATE patients SET status = \'Flagged\', updated_at = datetime(\'now\') WHERE id = ?').run(query.patient_id);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'QUERY_REOPENED',
      details: `Reopened query Q-${queryId} (Patient ID: ${query.patient_id}, Field: ${query.field})`
    });

    res.json({ message: `Query Q-${queryId} reopened.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// 5. PROTOCOL DEVIATIONS MODULE
// =====================================================================
router.get('/deviations', (req, res) => {
  try {
    const deviations = db.prepare('SELECT * FROM deviations ORDER BY id DESC').all();
    res.json(deviations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/deviations', (req, res) => {
  try {
    const { patientId, severity, description } = req.body;

    if (!patientId || !severity || !description) {
      return res.status(400).json({ error: 'Patient ID, severity, and description are required.' });
    }

    if (!config.statuses.deviationSeverity.includes(severity)) {
      return res.status(400).json({ error: `Invalid severity. Must be: ${config.statuses.deviationSeverity.join(', ')}` });
    }

    const patient = db.prepare('SELECT id, patient_id FROM patients WHERE id = ? OR patient_id = ?').get(patientId, patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const result = db.prepare(`
      INSERT INTO deviations (patient_id, severity, description, status, date_logged, logged_by)
      VALUES (?, ?, ?, 'Open', datetime('now'), ?)
    `).run(patient.id, severity, description.trim(), req.user.display_name);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'DEVIATION_LOGGED',
      details: `Logged ${severity} deviation for patient ${patient.patient_id}: ${description.trim()}`
    });

    const newDeviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newDeviation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Close protocol deviation - PI, Data Manager, or Admin only
router.patch('/deviations/:id/close', requireRole(config.roles.PI, config.roles.DM, config.roles.ADMIN), (req, res) => {
  try {
    const devId = Number(req.params.id);
    const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(devId);
    if (!deviation) return res.status(404).json({ error: 'Deviation not found.' });

    db.prepare(`
      UPDATE deviations SET
        status = 'Closed',
        closed_by = ?,
        closed_at = datetime('now')
      WHERE id = ?
    `).run(req.user.display_name, devId);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'DEVIATION_CLOSED',
      details: `Closed protocol deviation DEV-${devId} (Patient ID: ${deviation.patient_id})`
    });

    res.json({ message: `Protocol deviation DEV-${devId} closed.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// 6. EXCEL IMPORT / EXPORT / TEMPLATE
// =====================================================================
router.get('/import/template', (req, res) => {
  try {
    const buffer = generateTemplateBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="AIIA_CTMS_Patient_Import_Template.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate template: ' + err.message });
  }
});

router.post('/import/excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Excel file (.xlsx) is required.' });
    }

    const mode = req.body.mode || 'new-batch';
    if (!['new-batch', 'merge', 'new-only', 'replace'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Must be new-batch, merge, new-only, or replace.' });
    }

    const rows = parseExcelBuffer(req.file.buffer);
    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'Uploaded file contains no rows.' });
    }

    const trialId = req.body.trialId ? Number(req.body.trialId) : null;
    const summary = processBatchImport(db, rows, {
      mode,
      fileName: req.file.originalname,
      user: req.user,
      trialId
    });

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

router.get('/batches', (req, res) => {
  try {
    const batches = db.prepare('SELECT * FROM batches ORDER BY id DESC').all();
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export/excel', (req, res) => {
  try {
    const buffer = exportFullCTMSWorkbook(db);
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="AIIA_CTMS_Export_${dateStr}.xlsx"`);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'DATA_EXPORT_EXCEL',
      details: 'Full CTMS database exported to Excel'
    });

    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Export failed: ' + err.message });
  }
});

// =====================================================================
// 7. INTEROPERABILITY EXPORT (FHIR R4 & CDISC ODM-XML)
// =====================================================================
router.get('/patients/:id/export/fhir', (req, res) => {
  try {
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const trial = patient.trial_id ? db.prepare('SELECT * FROM trials WHERE id = ?').get(patient.trial_id) : null;
    const fhirBundle = exportPatientToFHIR(patient, trial);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'EXPORT_FHIR_PATIENT',
      details: `Exported FHIR R4 Bundle for patient ${patient.patient_id}`
    });

    res.setHeader('Content-Type', 'application/fhir+json');
    res.json(fhirBundle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/patients/:id/export/cdisc', (req, res) => {
  try {
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const trial = patient.trial_id ? db.prepare('SELECT * FROM trials WHERE id = ?').get(patient.trial_id) : null;
    const xml = exportToCDISCODM(trial, [patient]);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'EXPORT_CDISC_PATIENT',
      details: `Exported CDISC ODM-XML for patient ${patient.patient_id}`
    });

    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trials/:id/export/fhir', (req, res) => {
  try {
    const trial = db.prepare('SELECT * FROM trials WHERE id = ?').get(req.params.id);
    if (!trial) return res.status(404).json({ error: 'Trial not found.' });

    const patients = db.prepare('SELECT * FROM patients WHERE trial_id = ?').all(trial.id);
    const bundle = exportTrialToFHIR(trial, patients);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'EXPORT_FHIR_TRIAL',
      details: `Exported FHIR R4 Bundle for trial ${trial.study_id} (${patients.length} patients)`
    });

    res.setHeader('Content-Type', 'application/fhir+json');
    res.json(bundle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trials/:id/export/cdisc', (req, res) => {
  try {
    const trial = db.prepare('SELECT * FROM trials WHERE id = ?').get(req.params.id);
    if (!trial) return res.status(404).json({ error: 'Trial not found.' });

    const patients = db.prepare('SELECT * FROM patients WHERE trial_id = ?').all(trial.id);
    const xml = exportToCDISCODM(trial, patients);

    logAction({
      userId: req.user.id,
      userName: req.user.display_name,
      action: 'EXPORT_CDISC_TRIAL',
      details: `Exported CDISC ODM-XML for trial ${trial.study_id} (${patients.length} patients)`
    });

    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// 8. AUDIT LOG
// =====================================================================
router.get('/audit-log', (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const logs = getRecentLogs(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
