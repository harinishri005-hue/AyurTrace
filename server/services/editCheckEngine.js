// server/services/editCheckEngine.js - Automated Edit-Check & Data Quality Validation Engine
const config = require('../config');
const { normalizePrakriti } = require('./prakritiService');

/**
 * Validates patient data and returns a list of detected data quality issues.
 * @param {Object} p - Patient record object
 * @returns {Array<{ field: string, issue: string, severity: 'Critical'|'Major'|'Minor' }>}
 */
function evaluatePatient(p) {
  const issues = [];

  // 1. Mandatory Clinical Identifiers
  if (!p.patient_id || !String(p.patient_id).trim()) {
    issues.push({
      field: 'patient_id',
      issue: 'Missing mandatory clinical identifier: Patient ID',
      severity: 'Critical'
    });
  }
  if (!p.study_id || !String(p.study_id).trim()) {
    issues.push({
      field: 'study_id',
      issue: 'Missing mandatory Study Protocol ID',
      severity: 'Major'
    });
  }
  if (!p.site_id || !String(p.site_id).trim()) {
    issues.push({
      field: 'site_id',
      issue: 'Missing mandatory Clinical Trial Site ID',
      severity: 'Major'
    });
  }
  if (!p.gender || !['Female', 'Male', 'Other'].includes(p.gender)) {
    issues.push({
      field: 'gender',
      issue: `Invalid or missing gender value: '${p.gender || ''}' (expected Female, Male, or Other)`,
      severity: 'Major'
    });
  }

  // Age validation
  if (p.age === null || p.age === undefined || p.age === '') {
    issues.push({
      field: 'age',
      issue: 'Missing mandatory patient age',
      severity: 'Major'
    });
  } else {
    const ageNum = Number(p.age);
    if (isNaN(ageNum) || ageNum < 18 || ageNum > 100) {
      issues.push({
        field: 'age',
        issue: `Patient age (${p.age}) outside protocol eligibility criteria (18-100 years)`,
        severity: 'Major'
      });
    }
  }

  // 2. Vital Signs: Systolic Blood Pressure (mmHg)
  if (p.systolic_bp !== null && p.systolic_bp !== undefined && p.systolic_bp !== '') {
    const bp = Number(p.systolic_bp);
    if (isNaN(bp)) {
      issues.push({ field: 'systolic_bp', issue: 'Non-numeric Systolic BP value', severity: 'Major' });
    } else if (bp > 180) {
      issues.push({
        field: 'systolic_bp',
        issue: `Hypertensive Crisis (${bp} mmHg) exceeds safety threshold (>180 mmHg)`,
        severity: 'Critical'
      });
    } else if (bp < 90) {
      issues.push({
        field: 'systolic_bp',
        issue: `Hypotension (${bp} mmHg) below clinical safety limit (<90 mmHg)`,
        severity: 'Critical'
      });
    } else if (bp > 140) {
      issues.push({
        field: 'systolic_bp',
        issue: `Stage 2 Hypertension (${bp} mmHg) above protocol target range (90-140 mmHg)`,
        severity: 'Major'
      });
    } else if (bp < 100) {
      issues.push({
        field: 'systolic_bp',
        issue: `Low-Normal Systolic BP (${bp} mmHg) near lower reference limit (90-140 mmHg)`,
        severity: 'Minor'
      });
    }
  }

  // 3. Vital Signs: Pulse Rate (bpm)
  if (p.pulse_rate !== null && p.pulse_rate !== undefined && p.pulse_rate !== '') {
    const pulse = Number(p.pulse_rate);
    if (isNaN(pulse)) {
      issues.push({ field: 'pulse_rate', issue: 'Non-numeric Pulse Rate value', severity: 'Major' });
    } else if (pulse > 120) {
      issues.push({
        field: 'pulse_rate',
        issue: `Critical Tachycardia (${pulse} bpm) exceeds safety limit (>120 bpm)`,
        severity: 'Critical'
      });
    } else if (pulse < 50) {
      issues.push({
        field: 'pulse_rate',
        issue: `Critical Bradycardia (${pulse} bpm) below safety limit (<50 bpm)`,
        severity: 'Critical'
      });
    } else if (pulse > 100) {
      issues.push({
        field: 'pulse_rate',
        issue: `Elevated Pulse Rate (${pulse} bpm) above normal clinical range (60-100 bpm)`,
        severity: 'Major'
      });
    } else if (pulse < 60) {
      issues.push({
        field: 'pulse_rate',
        issue: `Borderline Pulse Rate (${pulse} bpm) slightly below resting reference range (60-100 bpm)`,
        severity: 'Minor'
      });
    }
  }

  // 4. Vital Signs: Body Temperature (deg C)
  if (p.temperature !== null && p.temperature !== undefined && p.temperature !== '') {
    const temp = Number(p.temperature);
    if (isNaN(temp)) {
      issues.push({ field: 'temperature', issue: 'Non-numeric Temperature value', severity: 'Major' });
    } else if (temp > 38.5) {
      issues.push({
        field: 'temperature',
        issue: `Critical Pyrexia/Fever (${temp} C) exceeds safety threshold (>38.5 C)`,
        severity: 'Critical'
      });
    } else if (temp < 35.0) {
      issues.push({
        field: 'temperature',
        issue: `Hypothermia (${temp} C) below clinical reference range (<35.0 C)`,
        severity: 'Critical'
      });
    } else if (temp > 37.5) {
      issues.push({
        field: 'temperature',
        issue: `Elevated Temperature (${temp} C) above standard range (36.0-37.5 C)`,
        severity: 'Major'
      });
    } else if (temp < 36.0) {
      issues.push({
        field: 'temperature',
        issue: `Subnormal Temperature (${temp} C) slightly below standard range (36.0-37.5 C)`,
        severity: 'Minor'
      });
    }
  }

  // 5. Ayurvedic Intake: Prakriti Proportions (Vata, Pitta, Kapha)
  const prakritiResult = normalizePrakriti(p.prakriti_vata, p.prakriti_pitta, p.prakriti_kapha);
  if (!prakritiResult.valid) {
    issues.push({
      field: 'prakriti',
      issue: prakritiResult.issue,
      severity: prakritiResult.severity || 'Major'
    });
  }

  // 6. Ayurvedic Intake: Agni & Koshtha
  if (p.agni && !config.ayurveda.agniTypes.includes(p.agni)) {
    issues.push({
      field: 'agni',
      issue: `Unrecognized Agni classification: '${p.agni}' (expected Manda, Sama, Tikshna, or Vishama)`,
      severity: 'Minor'
    });
  }
  if (p.koshtha && !config.ayurveda.koshthaTypes.includes(p.koshtha)) {
    issues.push({
      field: 'koshtha',
      issue: `Unrecognized Koshtha classification: '${p.koshtha}' (expected Mridu, Madhyama, or Krura)`,
      severity: 'Minor'
    });
  }

  // 7. Serious Adverse Event (SAE) Pharmacovigilance Escalation
  if (p.is_sae === 1 || p.is_sae === true || String(p.is_sae).toLowerCase() === 'true') {
    issues.push({
      field: 'is_sae',
      issue: `Serious Adverse Event (SAE) reported: mandatory pharmacovigilance expedited review required within 24 hours (NDCT 2019 compliance). Note: ${p.ae_note || 'None'}`,
      severity: 'Critical'
    });
  }

  // 8. Anthropometrics sanity checks
  if (p.weight !== null && p.weight !== undefined && p.weight !== '') {
    const wt = Number(p.weight);
    if (!isNaN(wt) && (wt < 20 || wt > 250)) {
      issues.push({
        field: 'weight',
        issue: `Weight (${wt} kg) is outside customary clinical trial range (20-250 kg)`,
        severity: 'Minor'
      });
    }
  }
  if (p.height !== null && p.height !== undefined && p.height !== '') {
    const ht = Number(p.height);
    if (!isNaN(ht) && (ht < 90 || ht > 230)) {
      issues.push({
        field: 'height',
        issue: `Height (${ht} cm) is outside customary adult clinical trial range (90-230 cm)`,
        severity: 'Minor'
      });
    }
  }

  return issues;
}

/**
 * Re-validates whether a specific field still violates edit checks against the current patient state.
 * Used before allowing a query to be resolved.
 * @param {Object} query - The query to resolve
 * @param {Object} currentPatient - The current patient row from the database
 * @returns {{ allowed: boolean, reason?: string }}
 */
function verifyQueryResolution(query, currentPatient) {
  // SAE queries are resolved via documented medical safety review
  if (query.field === 'is_sae') {
    return { allowed: true };
  }

  // Re-run validation on the patient's current database state
  const currentIssues = evaluatePatient(currentPatient);
  const matchingIssue = currentIssues.find(i => i.field === query.field);

  if (matchingIssue) {
    return {
      allowed: false,
      reason: `Cannot resolve query Q-${query.id}: field '${query.field}' is still failing clinical validation (${matchingIssue.issue}). Please correct the patient record first.`
    };
  }

  return { allowed: true };
}

/**
 * Executes edit-check validation on a patient, synchronizes open queries,
 * and updates patient status (Clean vs Flagged).
 * @param {Object} db - Database connection
 * @param {number} patientDbId - Internal patient record ID
 * @returns {Array<{ field: string, issue: string, severity: string }>} Newly raised issues
 */
function runEditChecksForPatient(db, patientDbId) {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientDbId);
  if (!patient) return [];

  const detectedIssues = evaluatePatient(patient);
  const newIssuesRaised = [];

  const findOpenQueryStmt = db.prepare(`
    SELECT id FROM queries WHERE patient_id = ? AND field = ? AND status = 'Open'
  `);

  const insertQueryStmt = db.prepare(`
    INSERT INTO queries (patient_id, field, issue, severity, status, reopen_count, created_at)
    VALUES (?, ?, ?, ?, 'Open', 0, datetime('now'))
  `);

  for (const item of detectedIssues) {
    const existing = findOpenQueryStmt.get(patientDbId, item.field);
    if (!existing) {
      insertQueryStmt.run(patientDbId, item.field, item.issue, item.severity);
      newIssuesRaised.push(item);
    }
  }

  // Update patient status based on total open queries
  const openCount = db.prepare(`
    SELECT COUNT(*) as count FROM queries WHERE patient_id = ? AND status = 'Open'
  `).get(patientDbId).count;

  const newStatus = openCount > 0 ? 'Flagged' : 'Clean';
  db.prepare("UPDATE patients SET status = ?, updated_at = datetime('now') WHERE id = ?").run(newStatus, patientDbId);

  return newIssuesRaised;
}

module.exports = {
  evaluatePatient,
  verifyQueryResolution,
  runEditChecksForPatient
};
