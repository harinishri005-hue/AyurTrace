// server/services/excelService.js - Excel Template, Batch Importer, and Multi-Worksheet Exporter
const XLSX = require('xlsx');
const { evaluatePatient } = require('./editCheckEngine');
const { logAction } = require('./auditService');

const TEMPLATE_HEADERS = [
  'Patient_ID', 'Study_ID', 'Site_ID', 'Gender', 'Age',
  'Enroll_Date', 'Visit_Type', 'Visit_Date',
  'Systolic_BP', 'Pulse_Rate', 'Temperature_C', 'Weight_kg', 'Height_cm',
  'Is_SAE', 'AE_Note',
  'Prakriti_Vata_Pct', 'Prakriti_Pitta_Pct', 'Prakriti_Kapha_Pct',
  'Agni', 'Koshtha', 'Nadi_Note', 'Ayurvedic_Diagnosis', 'Chikitsa'
];

function generateTemplateBuffer() {
  const sampleRows = [
    {
      'Patient_ID': 'PT-AIIA-001',
      'Study_ID': 'AIIA-ASHWA-2025-01',
      'Site_ID': 'SITE-DEL-01',
      'Gender': 'Female',
      'Age': 38,
      'Enroll_Date': '2026-01-15',
      'Visit_Type': 'Baseline',
      'Visit_Date': '2026-01-16',
      'Systolic_BP': 122,
      'Pulse_Rate': 74,
      'Temperature_C': 36.8,
      'Weight_kg': 61.5,
      'Height_cm': 162.0,
      'Is_SAE': 'No',
      'AE_Note': '',
      'Prakriti_Vata_Pct': 45,
      'Prakriti_Pitta_Pct': 35,
      'Prakriti_Kapha_Pct': 20,
      'Agni': 'Sama',
      'Koshtha': 'Madhyama',
      'Nadi_Note': 'Vata-pradhana, moderately rapid, sarpa gati',
      'Ayurvedic_Diagnosis': 'Chittodvega (Generalized Anxiety)',
      'Chikitsa': 'Ashwagandha Churna 3g BD with Ksheera'
    },
    {
      'Patient_ID': 'PT-AIIA-002',
      'Study_ID': 'AIIA-CURC-2024-02',
      'Site_ID': 'SITE-DEL-01',
      'Gender': 'Male',
      'Age': 56,
      'Enroll_Date': '2026-02-01',
      'Visit_Type': 'Baseline',
      'Visit_Date': '2026-02-02',
      'Systolic_BP': 130,
      'Pulse_Rate': 78,
      'Temperature_C': 37.0,
      'Weight_kg': 74.0,
      'Height_cm': 173.0,
      'Is_SAE': 'No',
      'AE_Note': '',
      'Prakriti_Vata_Pct': 50,
      'Prakriti_Pitta_Pct': 30,
      'Prakriti_Kapha_Pct': 20,
      'Agni': 'Vishama',
      'Koshtha': 'Krura',
      'Nadi_Note': 'Vata-Kapha lakshana, manda gati',
      'Ayurvedic_Diagnosis': 'Sandhigata Vata (Osteoarthritis Knee)',
      'Chikitsa': 'Shallaki Extract 500mg + Curcumin 500mg BD'
    }
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleRows, { header: TEMPLATE_HEADERS });
  ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Patients_Template');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function parseExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Excel workbook contains no sheets.');
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return rawRows.map((row) => {
    const normalized = {};
    for (const [header, value] of Object.entries(row)) {
      const key = String(header)
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      normalized[key] = value;
    }

    const aliases = {
      patientid: 'Patient_ID', subjectid: 'Patient_ID', participantid: 'Patient_ID',
      studyid: 'Study_ID', protocolid: 'Study_ID', siteid: 'Site_ID',
      enrolldate: 'Enroll_Date', enrollmentdate: 'Enroll_Date',
      visittype: 'Visit_Type', visitdate: 'Visit_Date',
      systolicbp: 'Systolic_BP', systolicbloodpressure: 'Systolic_BP',
      pulserate: 'Pulse_Rate', heartrate: 'Pulse_Rate',
      temperaturec: 'Temperature_C', temperature: 'Temperature_C',
      weightkg: 'Weight_kg', weight: 'Weight_kg', heightcm: 'Height_cm', height: 'Height_cm',
      issae: 'Is_SAE', seriousadverseevent: 'Is_SAE', aenote: 'AE_Note',
      prakritivatapct: 'Prakriti_Vata_Pct', vata: 'Prakriti_Vata_Pct',
      prakritipittapct: 'Prakriti_Pitta_Pct', pitta: 'Prakriti_Pitta_Pct',
      prakritikaphapct: 'Prakriti_Kapha_Pct', kapha: 'Prakriti_Kapha_Pct',
      agni: 'Agni', koshtha: 'Koshtha', nadinote: 'Nadi_Note',
      ayurvedicdiagnosis: 'Ayurvedic_Diagnosis', chikitsa: 'Chikitsa', gender: 'Gender', age: 'Age'
    };

    return Object.entries(normalized).reduce((mapped, [key, value]) => {
      mapped[aliases[key] || key] = value;
      return mapped;
    }, {});
  });
}

function processBatchImport(db, rows, { mode, fileName, user, trialId = null }) {
  let importedCount = 0;
  let skippedCount = 0;
  let flaggedCount = 0;
  let cleanCount = 0;
  const skippedRows = [];

  const insertBatchStmt = db.prepare(`
    INSERT INTO batches (batch_name, file_name, imported_by, mode, row_count, flagged_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const batchName = `Batch-${Date.now().toString().slice(-6)}`;
  const batchResult = insertBatchStmt.run(batchName, fileName || 'upload.xlsx', user.display_name, mode, rows.length, 0);
  const batchId = batchResult.lastInsertRowid;

  const checkPatientStmt = db.prepare('SELECT id FROM patients WHERE patient_id = ?');
  const deletePatientStmt = db.prepare('DELETE FROM patients WHERE patient_id = ?');

  const insertPatientStmt = db.prepare(`
    INSERT INTO patients (
      trial_id, patient_id, study_id, site_id, gender, age, enroll_date,
      visit_type, visit_date, systolic_bp, pulse_rate, temperature, weight, height,
      is_sae, ae_note, prakriti_vata, prakriti_pitta, prakriti_kapha,
      agni, koshtha, nadi_note, ayurvedic_diagnosis, chikitsa,
      status, review_status, source, batch_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, 'Unreviewed', 'Excel_Import', ?
    )
  `);

  const updatePatientStmt = db.prepare(`
    UPDATE patients SET
      study_id = ?, site_id = ?, gender = ?, age = ?, enroll_date = ?,
      visit_type = ?, visit_date = ?, systolic_bp = ?, pulse_rate = ?, temperature = ?,
      weight = ?, height = ?, is_sae = ?, ae_note = ?,
      prakriti_vata = ?, prakriti_pitta = ?, prakriti_kapha = ?,
      agni = ?, koshtha = ?, nadi_note = ?, ayurvedic_diagnosis = ?, chikitsa = ?,
      status = ?, batch_id = ?, updated_at = datetime('now')
    WHERE patient_id = ?
  `);

  const insertQueryStmt = db.prepare(`
    INSERT INTO queries (patient_id, field, issue, severity, status, reopen_count)
    VALUES (?, ?, ?, ?, 'Open', 0)
  `);

  const transaction = db.transaction(() => {
    rows.forEach((r, rowIndex) => {
      const pId = String(r.Patient_ID || r.patient_id || '').trim();
      if (!pId) {
        skippedCount++;
        skippedRows.push({ row: rowIndex + 2, reason: 'Patient ID is missing.' });
        return;
      }

      const existing = checkPatientStmt.get(pId);

      if (existing && (mode === 'new-only' || mode === 'new-batch')) {
        skippedCount++;
        skippedRows.push({
          row: rowIndex + 2,
          patientId: pId,
          reason: mode === 'new-batch' ? 'Patient ID already exists in the database.' : 'Patient ID already exists.'
        });
        return;
      }

      const isSaeVal = (String(r.Is_SAE || r.is_sae || '').toLowerCase() === 'yes' ||
                        String(r.Is_SAE || r.is_sae || '').toLowerCase() === 'true' ||
                        Number(r.Is_SAE || r.is_sae) === 1) ? 1 : 0;

      const normalizedPatient = {
        patient_id: pId,
        study_id: String(r.Study_ID || r.study_id || '').trim(),
        site_id: String(r.Site_ID || r.site_id || '').trim(),
        gender: String(r.Gender || r.gender || '').trim(),
        age: r.Age !== '' && r.Age !== undefined ? Number(r.Age) : (r.age !== '' ? Number(r.age) : null),
        enroll_date: String(r.Enroll_Date || r.enroll_date || ''),
        visit_type: String(r.Visit_Type || r.visit_type || 'Baseline'),
        visit_date: String(r.Visit_Date || r.visit_date || ''),
        systolic_bp: r.Systolic_BP !== '' && r.Systolic_BP !== undefined ? Number(r.Systolic_BP) : null,
        pulse_rate: r.Pulse_Rate !== '' && r.Pulse_Rate !== undefined ? Number(r.Pulse_Rate) : null,
        temperature: r.Temperature_C !== '' && r.Temperature_C !== undefined ? Number(r.Temperature_C) : (r.temperature !== '' ? Number(r.temperature) : null),
        weight: r.Weight_kg !== '' && r.Weight_kg !== undefined ? Number(r.Weight_kg) : null,
        height: r.Height_cm !== '' && r.Height_cm !== undefined ? Number(r.Height_cm) : null,
        is_sae: isSaeVal,
        ae_note: String(r.AE_Note || r.ae_note || ''),
        prakriti_vata: r.Prakriti_Vata_Pct !== '' && r.Prakriti_Vata_Pct !== undefined ? Number(r.Prakriti_Vata_Pct) : null,
        prakriti_pitta: r.Prakriti_Pitta_Pct !== '' && r.Prakriti_Pitta_Pct !== undefined ? Number(r.Prakriti_Pitta_Pct) : null,
        prakriti_kapha: r.Prakriti_Kapha_Pct !== '' && r.Prakriti_Kapha_Pct !== undefined ? Number(r.Prakriti_Kapha_Pct) : null,
        agni: String(r.Agni || r.agni || ''),
        koshtha: String(r.Koshtha || r.koshtha || ''),
        nadi_note: String(r.Nadi_Note || r.nadi_note || ''),
        ayurvedic_diagnosis: String(r.Ayurvedic_Diagnosis || r.ayurvedic_diagnosis || ''),
        chikitsa: String(r.Chikitsa || r.chikitsa || '')
      };

      if (!normalizedPatient.study_id || !normalizedPatient.site_id || !normalizedPatient.gender || normalizedPatient.age === null || Number.isNaN(normalizedPatient.age)) {
        skippedCount++;
        skippedRows.push({ row: rowIndex + 2, patientId: pId, reason: 'Study ID, Site ID, Gender, and a numeric Age are required.' });
        return;
      }

      const issues = evaluatePatient(normalizedPatient);
      const isFlagged = issues.length > 0;
      const initialStatus = isFlagged ? 'Flagged' : 'Clean';

      let patientDbId = null;

      if (existing && mode === 'merge') {
        updatePatientStmt.run(
          normalizedPatient.study_id, normalizedPatient.site_id, normalizedPatient.gender, normalizedPatient.age,
          normalizedPatient.enroll_date, normalizedPatient.visit_type, normalizedPatient.visit_date,
          normalizedPatient.systolic_bp, normalizedPatient.pulse_rate, normalizedPatient.temperature,
          normalizedPatient.weight, normalizedPatient.height, normalizedPatient.is_sae, normalizedPatient.ae_note,
          normalizedPatient.prakriti_vata, normalizedPatient.prakriti_pitta, normalizedPatient.prakriti_kapha,
          normalizedPatient.agni, normalizedPatient.koshtha, normalizedPatient.nadi_note,
          normalizedPatient.ayurvedic_diagnosis, normalizedPatient.chikitsa,
          initialStatus, batchId, pId
        );
        patientDbId = existing.id;
      } else if (existing && mode === 'replace') {
        deletePatientStmt.run(pId);
        const ins = insertPatientStmt.run(
          trialId, normalizedPatient.patient_id, normalizedPatient.study_id, normalizedPatient.site_id,
          normalizedPatient.gender, normalizedPatient.age, normalizedPatient.enroll_date, normalizedPatient.visit_type,
          normalizedPatient.visit_date, normalizedPatient.systolic_bp, normalizedPatient.pulse_rate,
          normalizedPatient.temperature, normalizedPatient.weight, normalizedPatient.height,
          normalizedPatient.is_sae, normalizedPatient.ae_note, normalizedPatient.prakriti_vata,
          normalizedPatient.prakriti_pitta, normalizedPatient.prakriti_kapha, normalizedPatient.agni,
          normalizedPatient.koshtha, normalizedPatient.nadi_note, normalizedPatient.ayurvedic_diagnosis,
          normalizedPatient.chikitsa, initialStatus, batchId
        );
        patientDbId = ins.lastInsertRowid;
      } else {
        const ins = insertPatientStmt.run(
          trialId, normalizedPatient.patient_id, normalizedPatient.study_id, normalizedPatient.site_id,
          normalizedPatient.gender, normalizedPatient.age, normalizedPatient.enroll_date, normalizedPatient.visit_type,
          normalizedPatient.visit_date, normalizedPatient.systolic_bp, normalizedPatient.pulse_rate,
          normalizedPatient.temperature, normalizedPatient.weight, normalizedPatient.height,
          normalizedPatient.is_sae, normalizedPatient.ae_note, normalizedPatient.prakriti_vata,
          normalizedPatient.prakriti_pitta, normalizedPatient.prakriti_kapha, normalizedPatient.agni,
          normalizedPatient.koshtha, normalizedPatient.nadi_note, normalizedPatient.ayurvedic_diagnosis,
          normalizedPatient.chikitsa, initialStatus, batchId
        );
        patientDbId = ins.lastInsertRowid;
      }

      // Raise queries for any detected issues
      for (const iss of issues) {
        insertQueryStmt.run(patientDbId, iss.field, iss.issue, iss.severity);
      }

      importedCount++;
      if (isFlagged) flaggedCount++;
      else cleanCount++;
    });

    db.prepare('UPDATE batches SET flagged_count = ? WHERE id = ?').run(flaggedCount, batchId);
  });

  transaction();

  logAction({
    userId: user.id,
    userName: user.display_name,
    action: 'BATCH_IMPORTED',
    details: `Imported ${importedCount} records via mode '${mode}' from file '${fileName}' (${cleanCount} clean, ${flaggedCount} flagged, ${skippedCount} skipped)`
  });

  return {
    batchId,
    batchName,
    imported: importedCount,
    clean: cleanCount,
    flaggedCount,
    skipped: skippedCount,
    skippedRows
  };
}

function exportFullCTMSWorkbook(db) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Patients
  const patients = db.prepare('SELECT * FROM patients ORDER BY id DESC').all();
  const wsPatients = XLSX.utils.json_to_sheet(patients);
  XLSX.utils.book_append_sheet(wb, wsPatients, 'Patients');

  // Sheet 2: Trials
  const trials = db.prepare('SELECT * FROM trials ORDER BY id ASC').all();
  const wsTrials = XLSX.utils.json_to_sheet(trials);
  XLSX.utils.book_append_sheet(wb, wsTrials, 'Trials');

  // Sheet 3: Queries
  const queries = db.prepare(`
    SELECT q.*, p.patient_id as patient_code
    FROM queries q
    JOIN patients p ON p.id = q.patient_id
    ORDER BY q.id DESC
  `).all();
  const wsQueries = XLSX.utils.json_to_sheet(queries);
  XLSX.utils.book_append_sheet(wb, wsQueries, 'Data_Queries');

  // Sheet 4: Deviations
  const deviations = db.prepare(`
    SELECT d.*, p.patient_id as patient_code
    FROM deviations d
    JOIN patients p ON p.id = d.patient_id
    ORDER BY d.id DESC
  `).all();
  const wsDeviations = XLSX.utils.json_to_sheet(deviations);
  XLSX.utils.book_append_sheet(wb, wsDeviations, 'Protocol_Deviations');

  // Sheet 5: Audit Log
  const audit = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 500').all();
  const wsAudit = XLSX.utils.json_to_sheet(audit);
  XLSX.utils.book_append_sheet(wb, wsAudit, 'Audit_Trail');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  generateTemplateBuffer,
  parseExcelBuffer,
  processBatchImport,
  exportFullCTMSWorkbook
};
