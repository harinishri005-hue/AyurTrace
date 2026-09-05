// server/db/seed.js - Realistic Demo Data Seeder for AIIA CTMS
const bcrypt = require('bcryptjs');
const db = require('./index');
const config = require('../config');
const { runEditChecksForPatient } = require('../services/editCheckEngine');

async function seed() {
  console.log('Seeding AIIA Clinical Trials Dashboard database...');

  // Disable foreign keys temporarily during table flush and reset sequence
  db.pragma('foreign_keys = OFF');
  db.exec(`
    DELETE FROM audit_log;
    DELETE FROM deviations;
    DELETE FROM queries;
    DELETE FROM patients;
    DELETE FROM batches;
    DELETE FROM trials;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);
  db.pragma('foreign_keys = ON');

  // 1. Seed Users (Password for all is admin123)
  const passwordHash = await bcrypt.hash('admin123', 10);
  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, role, created_at)
    VALUES (?, ?, ?, ?, datetime('now', ?))
  `);

  const users = [
    { username: 'admin', hash: passwordHash, name: 'Dr. Tanuja Nesari', role: 'Admin', offset: '-60 days' },
    { username: 'pi_vaidya', hash: passwordHash, name: 'Prof. Vaidya K. S. Dhiman', role: 'Principal Investigator', offset: '-55 days' },
    { username: 'crc_priya', hash: passwordHash, name: 'Dr. Priya Sharma', role: 'Clinical Research Coordinator', offset: '-50 days' },
    { username: 'datamgr_arun', hash: passwordHash, name: 'Arun Verma', role: 'Data Manager', offset: '-45 days' },
    { username: 'reg_anita', hash: passwordHash, name: 'Anita Desai', role: 'Regulatory Affairs Officer', offset: '-40 days' },
    { username: 'ethics_drsharma', hash: passwordHash, name: 'Dr. R. K. Manchanda', role: 'Ethics Committee Member', offset: '-35 days' }
  ];

  for (const u of users) {
    insertUser.run(u.username, u.hash, u.name, u.role, u.offset);
  }

  // 2. Seed Trials
  const insertTrial = db.prepare(`
    INSERT INTO trials (study_id, title, phase, ctri_number, ndct_registration_no, ethics_committee_no, ethics_approval_status, ethics_updated_at, ethics_updated_by, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?), ?, ?, datetime('now', ?))
  `);

  const trials = [
    {
      study_id: 'AIIA-ASHWA-2025-01',
      title: 'Efficacy and Safety of Standardized Ashwagandha Extract in Generalized Anxiety Disorder (Chittodvega)',
      phase: 'Phase II',
      ctri: 'CTRI/2025/08/045120',
      ndct: 'NDCT-AIIA-2025-01',
      ethics_no: 'IEC/AIIA/2025/09',
      status: 'Approved',
      ethics_by: 'Dr. R. K. Manchanda',
      created_by: 'Prof. Vaidya K. S. Dhiman',
      offset: '-45 days'
    },
    {
      study_id: 'AIIA-CURC-2024-02',
      title: 'Randomized Controlled Trial of Curcumin and Boswellia Serrata Extract in Knee Osteoarthritis (Sandhigata Vata)',
      phase: 'Phase III',
      ctri: 'CTRI/2024/11/038914',
      ndct: 'NDCT-AIIA-2024-18',
      ethics_no: 'IEC/AIIA/2024/44',
      status: 'Approved',
      ethics_by: 'Dr. R. K. Manchanda',
      created_by: 'Prof. Vaidya K. S. Dhiman',
      offset: '-60 days'
    },
    {
      study_id: 'AIIA-GUDU-2026-03',
      title: 'Evaluation of Guduchi-Tulsi Polyherbal Formulation on Immunological Recovery in Post-Viral Fatigue Syndrome',
      phase: 'Phase II',
      ctri: 'CTRI/2026/01/051234',
      ndct: 'NDCT-AIIA-2026-02',
      ethics_no: 'IEC/AIIA/2026/03',
      status: 'Pending',
      ethics_by: null,
      created_by: 'Dr. Priya Sharma',
      offset: '-15 days'
    },
    {
      study_id: 'AIIA-TRIPH-2025-04',
      title: 'Metabolic & Glycemic Effects of Triphala-Shilajit Formulation in Impaired Glucose Tolerance (Medoroga / Prameha Purvaroopa)',
      phase: 'Phase IIb',
      ctri: 'CTRI/2025/05/042890',
      ndct: 'NDCT-AIIA-2025-77',
      ethics_no: 'IEC/AIIA/2025/21',
      status: 'Approved',
      ethics_by: 'Dr. R. K. Manchanda',
      created_by: 'Prof. Vaidya K. S. Dhiman',
      offset: '-30 days'
    }
  ];

  for (const t of trials) {
    insertTrial.run(t.study_id, t.title, t.phase, t.ctri, t.ndct, t.ethics_no, t.status, t.offset, t.ethics_by, t.created_by, t.offset);
  }

  // 3. Seed Patients
  const insertPatient = db.prepare(`
    INSERT INTO patients (
      trial_id, patient_id, study_id, site_id, gender, age, enroll_date,
      visit_type, visit_date, systolic_bp, pulse_rate, temperature, weight, height,
      is_sae, ae_note, prakriti_vata, prakriti_pitta, prakriti_kapha,
      agni, koshtha, nadi_note, ayurvedic_diagnosis, chikitsa,
      status, review_status, source, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      'Clean', 'Unreviewed', 'Manual', datetime('now', ?)
    )
  `);

  const patientsData = [
    // Trial 1: Ashwagandha
    { trial_id: 1, id: 'PT-ASH-001', study: 'AIIA-ASHWA-2025-01', site: 'SITE-DEL-01', gender: 'Female', age: 34, enroll: '2026-01-10', visit: 'Baseline', vdate: '2026-01-10', sbp: 118, pulse: 72, temp: 36.6, wt: 58.0, ht: 160, sae: 0, aen: '', vata: 45, pitta: 35, kapha: 20, agni: 'Vishama', kosh: 'Madhyama', nadi: 'Sarpa gati, Vata-dominant', diag: 'Chittodvega (Mild Anxiety)', chik: 'Ashwagandha Churna 3g BD with lukewarm milk', offset: '-40 days' },
    { trial_id: 1, id: 'PT-ASH-002', study: 'AIIA-ASHWA-2025-01', site: 'SITE-DEL-01', gender: 'Male', age: 42, enroll: '2026-01-12', visit: 'Follow-up 1', vdate: '2026-01-26', sbp: 124, pulse: 76, temp: 36.8, wt: 72.5, ht: 172, sae: 0, aen: '', vata: 35, pitta: 45, kapha: 20, agni: 'Tikshna', kosh: 'Mridu', nadi: 'Manduka gati, Pitta-pradhana', diag: 'Chittodvega with Anidra', chik: 'Ashwagandha + Brahmi Vati 250mg BD', offset: '-38 days' },
    { trial_id: 1, id: 'PT-ASH-003', study: 'AIIA-ASHWA-2025-01', site: 'SITE-DEL-01', gender: 'Female', age: 29, enroll: '2026-01-15', visit: 'Baseline', vdate: '2026-01-15', sbp: 112, pulse: 68, temp: 36.5, wt: 52.0, ht: 158, sae: 0, aen: '', vata: 50, pitta: 30, kapha: 20, agni: 'Vishama', kosh: 'Krura', nadi: 'Vata gati, chapala', diag: 'Chittodvega', chik: 'Ashwagandha Churna 3g BD', offset: '-35 days' },
    { trial_id: 1, id: 'PT-ASH-004', study: 'AIIA-ASHWA-2025-01', site: 'SITE-DEL-01', gender: 'Male', age: 51, enroll: '2026-01-18', visit: 'Follow-up 1', vdate: '2026-02-01', sbp: 132, pulse: 80, temp: 36.7, wt: 78.0, ht: 170, sae: 0, aen: '', vata: 30, pitta: 40, kapha: 30, agni: 'Sama', kosh: 'Madhyama', nadi: 'Sama gati, sthira', diag: 'Chittodvega', chik: 'Ashwagandha Extract 500mg BD', offset: '-32 days' },
    { trial_id: 1, id: 'PT-ASH-005', study: 'AIIA-ASHWA-2025-01', site: 'SITE-DEL-01', gender: 'Female', age: 48, enroll: '2026-01-20', visit: 'Baseline', vdate: '2026-01-20', sbp: 188, pulse: 88, temp: 36.9, wt: 66.0, ht: 161, sae: 0, aen: '', vata: 40, pitta: 40, kapha: 20, agni: 'Tikshna', kosh: 'Madhyama', nadi: 'Tikshna, rapid pulse', diag: 'Chittodvega with Hypertensive Crisis', chik: 'Withheld study drug pending physician clearance', offset: '-30 days' },
    { trial_id: 1, id: 'PT-ASH-006', study: 'AIIA-ASHWA-2025-01', site: 'SITE-DEL-01', gender: 'Male', age: 39, enroll: '2026-01-22', visit: 'Baseline', vdate: '2026-01-22', sbp: 122, pulse: 126, temp: 37.1, wt: 70.0, ht: 168, sae: 0, aen: '', vata: 50, pitta: 35, kapha: 15, agni: 'Vishama', kosh: 'Krura', nadi: 'Extremely rapid tachygati', diag: 'Chittodvega with severe sinus tachycardia', chik: 'Ashwagandha 250mg OD', offset: '-28 days' },
    { trial_id: 1, id: 'PT-ASH-007', study: 'AIIA-ASHWA-2025-01', site: 'SITE-DEL-01', gender: 'Female', age: 44, enroll: '2026-01-25', visit: 'Follow-up 2', vdate: '2026-02-22', sbp: 120, pulse: 74, temp: 37.0, wt: 60.0, ht: 163, sae: 1, aen: 'Severe syncope and hospitalization after accidental polypharmacy at home', vata: 40, pitta: 35, kapha: 25, agni: 'Manda', kosh: 'Mridu', nadi: 'Manda, ksheena', diag: 'Chittodvega (SAE under review)', chik: 'Study drug paused; clinical stabilization', offset: '-25 days' },

    // Trial 2: Curcumin & Boswellia
    { trial_id: 2, id: 'PT-CUR-001', study: 'AIIA-CURC-2024-02', site: 'SITE-DEL-02', gender: 'Female', age: 58, enroll: '2025-12-05', visit: 'Follow-up 3', vdate: '2026-02-15', sbp: 128, pulse: 74, temp: 36.7, wt: 69.0, ht: 155, sae: 0, aen: '', vata: 55, pitta: 25, kapha: 20, agni: 'Manda', kosh: 'Krura', nadi: 'Vata-pradhana, rooksha gati', diag: 'Sandhigata Vata (Bilateral Knee OA)', chik: 'Shallaki 500mg + Curcumin 500mg BD + Janu Basti', offset: '-55 days' },
    { trial_id: 2, id: 'PT-CUR-002', study: 'AIIA-CURC-2024-02', site: 'SITE-DEL-02', gender: 'Male', age: 63, enroll: '2025-12-10', visit: 'Follow-up 2', vdate: '2026-01-20', sbp: 134, pulse: 72, temp: 36.6, wt: 82.0, ht: 174, sae: 0, aen: '', vata: 50, pitta: 30, kapha: 20, agni: 'Vishama', kosh: 'Madhyama', nadi: 'Vata-Kapha gati', diag: 'Sandhigata Vata (Right Knee)', chik: 'Shallaki + Curcumin BD with warm water', offset: '-50 days' },
    { trial_id: 2, id: 'PT-CUR-003', study: 'AIIA-CURC-2024-02', site: 'SITE-DEL-02', gender: 'Female', age: 52, enroll: '2025-12-15', visit: 'Follow-up 2', vdate: '2026-01-25', sbp: 120, pulse: 70, temp: 36.5, wt: 63.5, ht: 157, sae: 0, aen: '', vata: 45, pitta: 35, kapha: 20, agni: 'Sama', kosh: 'Mridu', nadi: 'Madhyama gati', diag: 'Sandhigata Vata', chik: 'Curcumin 500mg BD', offset: '-48 days' },
    { trial_id: 2, id: 'PT-CUR-004', study: 'AIIA-CURC-2024-02', site: 'SITE-DEL-02', gender: 'Male', age: 67, enroll: '2025-12-20', visit: 'Baseline', vdate: '2025-12-20', sbp: 138, pulse: 78, temp: 36.8, wt: 75.0, ht: 169, sae: 0, aen: '', vata: 60, pitta: 20, kapha: 20, agni: 'Manda', kosh: 'Krura', nadi: 'Ksheena, Vata gati', diag: 'Sandhigata Vata Grade III', chik: 'Curcumin-Boswellia formulation BD', offset: '-44 days' },
    { trial_id: 2, id: 'PT-CUR-005', study: 'AIIA-CURC-2024-02', site: 'SITE-DEL-02', gender: 'Female', age: 61, enroll: '2026-01-08', visit: 'Follow-up 1', vdate: '2026-01-22', sbp: 154, pulse: 82, temp: 36.9, wt: 71.0, ht: 158, sae: 0, aen: '', vata: 50, pitta: 30, kapha: 20, agni: 'Manda', kosh: 'Krura', nadi: 'Drava, moderate tension', diag: 'Sandhigata Vata with Stage 1 Hypertension', chik: 'Curcumin-Boswellia BD + Sarpagandha Vati guidance', offset: '-36 days' },
    { trial_id: 2, id: 'PT-CUR-006', study: 'AIIA-CURC-2024-02', site: 'SITE-DEL-02', gender: 'Male', age: 55, enroll: '2026-01-14', visit: 'Baseline', vdate: '2026-01-14', sbp: 126, pulse: 76, temp: 36.8, wt: 80.0, ht: 171, sae: 0, aen: '', vata: 45, pitta: 45, kapha: 25, agni: 'Sama', kosh: 'Madhyama', nadi: 'Vata-Pitta gati', diag: 'Sandhigata Vata', chik: 'Curcumin 500mg BD', offset: '-30 days' },

    // Trial 3: Guduchi-Tulsi
    { trial_id: 3, id: 'PT-GUD-001', study: 'AIIA-GUDU-2026-03', site: 'SITE-DEL-01', gender: 'Male', age: 31, enroll: '2026-02-01', visit: 'Baseline', vdate: '2026-02-01', sbp: 116, pulse: 68, temp: 36.7, wt: 65.0, ht: 175, sae: 0, aen: '', vata: 35, pitta: 35, kapha: 30, agni: 'Sama', kosh: 'Madhyama', nadi: 'Pitta-Vata gati', diag: 'Kshina Bala (Post-viral fatigue)', chik: 'Guduchi-Tulsi Ghanavati 500mg BD', offset: '-14 days' },
    { trial_id: 3, id: 'PT-GUD-002', study: 'AIIA-GUDU-2026-03', site: 'SITE-DEL-01', gender: 'Female', age: 27, enroll: '2026-02-03', visit: 'Baseline', vdate: '2026-02-03', sbp: 110, pulse: 72, temp: 36.6, wt: 54.0, ht: 162, sae: 0, aen: '', vata: 40, pitta: 40, kapha: 20, agni: 'Tikshna', kosh: 'Mridu', nadi: 'Tikshna gati', diag: 'Post-chikungunya Dourbalya', chik: 'Guduchi Kwatha 30ml BD', offset: '-12 days' },
    { trial_id: 3, id: 'PT-GUD-003', study: 'AIIA-GUDU-2026-03', site: 'SITE-DEL-01', gender: 'Male', age: 38, enroll: '2026-02-05', visit: 'Baseline', vdate: '2026-02-05', sbp: 122, pulse: 78, temp: 38.9, wt: 68.0, ht: 170, sae: 0, aen: '', vata: 30, pitta: 50, kapha: 20, agni: 'Tikshna', kosh: 'Madhyama', nadi: 'Pitta-pradhana, pyrexic rapid gati', diag: 'Post-viral relapse with acute Jwara', chik: 'Withheld formulation; evaluated for secondary infection', offset: '-10 days' },
    { trial_id: 3, id: 'PT-GUD-004', study: 'AIIA-GUDU-2026-03', site: 'SITE-DEL-01', gender: 'Female', age: 36, enroll: '2026-02-08', visit: 'Baseline', vdate: '2026-02-08', sbp: 114, pulse: 54, temp: 36.4, wt: 56.0, ht: 159, sae: 0, aen: '', vata: 40, pitta: 30, kapha: 30, agni: 'Manda', kosh: 'Krura', nadi: 'Manda, slow pulse', diag: 'Post-viral fatigue with Sinus Bradycardia', chik: 'Guduchi-Tulsi Ghanavati 500mg BD', offset: '-8 days' },

    // Trial 4: Triphala-Shilajit
    { trial_id: 4, id: 'PT-TRI-001', study: 'AIIA-TRIPH-2025-04', site: 'SITE-DEL-03', gender: 'Male', age: 49, enroll: '2026-01-05', visit: 'Baseline', vdate: '2026-01-05', sbp: 130, pulse: 74, temp: 36.8, wt: 88.0, ht: 172, sae: 0, aen: '', vata: 25, pitta: 35, kapha: 40, agni: 'Manda', kosh: 'Krura', nadi: 'Hamsa gati, Kapha-pradhana', diag: 'Medoroga (Metabolic Syndrome)', chik: 'Triphala Guggulu 1g + Shilajit 250mg BD', offset: '-25 days' },
    { trial_id: 4, id: 'PT-TRI-002', study: 'AIIA-TRIPH-2025-04', site: 'SITE-DEL-03', gender: 'Female', age: 53, enroll: '2026-01-07', visit: 'Baseline', vdate: '2026-01-07', sbp: 126, pulse: 72, temp: 36.6, wt: 79.5, ht: 156, sae: 0, aen: '', vata: 30, pitta: 30, kapha: 40, agni: 'Manda', kosh: 'Madhyama', nadi: 'Kapha gati, guruta', diag: 'Prameha Purvaroopa (Impaired Glucose Tolerance)', chik: 'Triphala-Shilajit capsules BD', offset: '-24 days' },
    { trial_id: 4, id: 'PT-TRI-003', study: 'AIIA-TRIPH-2025-04', site: 'SITE-DEL-03', gender: 'Male', age: 46, enroll: '2026-01-11', visit: 'Follow-up 1', vdate: '2026-01-25', sbp: 128, pulse: 76, temp: 36.7, wt: 84.0, ht: 175, sae: 0, aen: '', vata: 20, pitta: 40, kapha: 40, agni: 'Sama', kosh: 'Mridu', nadi: 'Kapha-Pitta gati', diag: 'Medoroga', chik: 'Triphala-Shilajit capsules BD', offset: '-20 days' },
    { trial_id: 4, id: 'PT-TRI-004', study: 'AIIA-TRIPH-2025-04', site: 'SITE-DEL-03', gender: 'Female', age: 41, enroll: '2026-01-16', visit: 'Baseline', vdate: '2026-01-16', sbp: 86, pulse: 64, temp: 36.5, wt: 55.0, ht: 154, sae: 0, aen: '', vata: 40, pitta: 30, kapha: 30, agni: 'Vishama', kosh: 'Madhyama', nadi: 'Alpa bala, ksheena', diag: 'Mild Dysglycemia with Borderline Hypotension', chik: 'Triphala Churna with honey', offset: '-18 days' },
    { trial_id: 4, id: 'PT-TRI-005', study: 'AIIA-TRIPH-2025-04', site: 'SITE-DEL-03', gender: 'Male', age: 62, enroll: '2026-01-20', visit: 'Follow-up 1', vdate: '2026-02-03', sbp: 132, pulse: 106, temp: 37.0, wt: 91.0, ht: 170, sae: 0, aen: '', vata: 25, pitta: 45, kapha: 30, agni: 'Tikshna', kosh: 'Mridu', nadi: 'Rapid Pitta pulse', diag: 'Medoroga with resting tachycardia', chik: 'Triphala-Shilajit BD', offset: '-15 days' },
    { trial_id: 4, id: 'PT-TRI-006', study: 'AIIA-TRIPH-2025-04', site: 'SITE-DEL-03', gender: 'Female', age: 50, enroll: '2026-01-24', visit: 'Baseline', vdate: '2026-01-24', sbp: 124, pulse: 70, temp: 36.7, wt: 72.0, ht: 158, sae: 0, aen: '', vata: 35, pitta: 35, kapha: 30, agni: 'Sama', kosh: 'Madhyama', nadi: 'Sama gati', diag: 'Medoroga', chik: 'Triphala-Shilajit BD', offset: '-12 days' }
  ];

  for (const p of patientsData) {
    const res = insertPatient.run(
      p.trial_id, p.id, p.study, p.site, p.gender, p.age, p.enroll,
      p.visit, p.vdate, p.sbp, p.pulse, p.temp, p.wt, p.ht,
      p.sae, p.aen, p.vata, p.pitta, p.kapha,
      p.agni, p.kosh, p.nadi, p.diag, p.chik,
      p.offset
    );

    const patientDbId = res.lastInsertRowid;
    runEditChecksForPatient(db, patientDbId);
  }

  // 4. Manually resolve 2 minor queries with clinical resolution notes
  const openQueries = db.prepare('SELECT id, patient_id, field FROM queries WHERE severity = \'Minor\' LIMIT 2').all();
  const resolveStmt = db.prepare(`
    UPDATE queries SET
      status = 'Resolved',
      resolution_note = ?,
      resolved_by = 'Dr. Priya Sharma',
      resolved_at = datetime('now', '-5 days')
    WHERE id = ?
  `);

  for (const q of openQueries) {
    resolveStmt.run(`Verified against source worksheet. Mild biological variation within acceptable clinical discretion. Approved by Study Coordinator.`, q.id);
  }

  // 5. Seed Protocol Deviations linked by patient code
  const getPatientDbId = db.prepare('SELECT id FROM patients WHERE patient_id = ?');

  const deviations = [
    {
      patient_code: 'PT-ASH-001',
      severity: 'Minor',
      description: 'Visit window exceeded by 3 days due to festival holiday transport disruption. Vitals and study medication compliance verified intact.',
      status: 'Closed',
      offset: '-20 days',
      logged_by: 'Dr. Priya Sharma',
      closed_by: 'Prof. Vaidya K. S. Dhiman',
      closed_at: "datetime('now', '-18 days')"
    },
    {
      patient_code: 'PT-CUR-001',
      severity: 'Major',
      description: 'Subject took over-the-counter Diclofenac gel for acute joint strain, which is a prohibited concomitant non-steroidal anti-inflammatory medication per protocol section 6.2.',
      status: 'Open',
      offset: '-12 days',
      logged_by: 'Dr. Priya Sharma',
      closed_by: null,
      closed_at: null
    },
    {
      patient_code: 'PT-GUD-001',
      severity: 'Minor',
      description: 'Follow-up blood collection tube delayed by 45 minutes before centrifuge separation due to lab power backup cycle.',
      status: 'Closed',
      offset: '-7 days',
      logged_by: 'Arun Verma',
      closed_by: 'Dr. Tanuja Nesari',
      closed_at: "datetime('now', '-6 days')"
    },
    {
      patient_code: 'PT-ASH-007',
      severity: 'Critical',
      description: 'Patient admitted to emergency care with syncope. Immediate notification filed to Ethics Committee within 24-hour regulatory window (NDCT 2019).',
      status: 'Open',
      offset: '-4 days',
      logged_by: 'Dr. Priya Sharma',
      closed_by: null,
      closed_at: null
    }
  ];

  for (const d of deviations) {
    const ptRow = getPatientDbId.get(d.patient_code);
    if (ptRow) {
      db.prepare(`
        INSERT INTO deviations (patient_id, severity, description, status, date_logged, logged_by, closed_by, closed_at)
        VALUES (?, ?, ?, ?, datetime('now', ?), ?, ?, ${d.closed_at ? d.closed_at : 'NULL'})
      `).run(ptRow.id, d.severity, d.description, d.status, d.offset, d.logged_by, d.closed_by);
    }
  }

  // 6. Seed Realistic Audit Trail
  const insertAudit = db.prepare(`
    INSERT INTO audit_log (user_id, user_name, action, details, timestamp)
    VALUES (?, ?, ?, ?, datetime('now', ?))
  `);

  const auditLogs = [
    { uid: 1, name: 'Dr. Tanuja Nesari', action: 'SYSTEM_INITIALIZED', details: 'AIIA Clinical Trials Dashboard initialized for GCP trials tracking', offset: '-60 days' },
    { uid: 2, name: 'Prof. Vaidya K. S. Dhiman', action: 'TRIAL_CREATED', details: 'Registered trial: AIIA-CURC-2024-02 (Curcumin & Boswellia in Knee Osteoarthritis)', offset: '-59 days' },
    { uid: 6, name: 'Dr. R. K. Manchanda', action: 'TRIAL_ETHICS_STATUS_UPDATED', details: 'Trial AIIA-CURC-2024-02 ethics approval granted under IEC/AIIA/2024/44', offset: '-58 days' },
    { uid: 2, name: 'Prof. Vaidya K. S. Dhiman', action: 'TRIAL_CREATED', details: 'Registered trial: AIIA-ASHWA-2025-01 (Ashwagandha in Generalized Anxiety)', offset: '-45 days' },
    { uid: 6, name: 'Dr. R. K. Manchanda', action: 'TRIAL_ETHICS_STATUS_UPDATED', details: 'Trial AIIA-ASHWA-2025-01 ethics approval granted under IEC/AIIA/2025/09', offset: '-44 days' },
    { uid: 3, name: 'Dr. Priya Sharma', action: 'PATIENT_ENROLLED', details: 'Enrolled patient PT-ASH-001 at SITE-DEL-01. Baseline visit complete.', offset: '-40 days' },
    { uid: 3, name: 'Dr. Priya Sharma', action: 'PATIENT_ENROLLED', details: 'Enrolled patient PT-ASH-005. Flagged: Hypertensive crisis (BP 188 mmHg).', offset: '-30 days' },
    { uid: 3, name: 'Dr. Priya Sharma', action: 'PATIENT_ENROLLED', details: 'Enrolled patient PT-ASH-007. Flagged: SAE reported (Emergency syncope).', offset: '-25 days' },
    { uid: 3, name: 'Dr. Priya Sharma', action: 'QUERY_RESOLVED', details: 'Resolved query for borderline vitals with clinical note.', offset: '-20 days' },
    { uid: 4, name: 'Arun Verma', action: 'DATA_EXPORT_EXCEL', details: 'Full CTMS database exported to Excel for DSMB quarterly review', offset: '-15 days' },
    { uid: 3, name: 'Dr. Priya Sharma', action: 'EXPORT_FHIR_TRIAL', details: 'Exported trial AIIA-ASHWA-2025-01 to FHIR R4 Bundle for national registry interoperability', offset: '-10 days' },
    { uid: 1, name: 'Dr. Tanuja Nesari', action: 'DEVIATION_CLOSED', details: 'Closed protocol deviation DEV-3 after quality assurance review', offset: '-6 days' }
  ];

  for (const a of auditLogs) {
    insertAudit.run(a.uid, a.name, a.action, a.details, a.offset);
  }

  console.log('Database seeded successfully:');
  console.log(`- ${users.length} Users`);
  console.log(`- ${trials.length} Clinical Trials`);
  console.log(`- ${patientsData.length} Patients`);
  console.log(`- ${deviations.length} Protocol Deviations`);
  console.log(`- ${auditLogs.length} Audit Trail Events`);
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
