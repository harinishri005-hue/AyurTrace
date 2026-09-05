const { normalizePrakriti } = require('../services/prakritiService');
// server/tests/verify.js - Automated Comprehensive Test Suite for AIIA CTMS
const http = require('http');
const app = require('../index');
const db = require('../db');

let server;
let baseUrl;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING AIIA CTMS AUTOMATED INTEGRATION TESTS ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ? ${message}`);
      passed++;
    } else {
      console.error(`  ? FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Health check
  const healthRes = await request('/api/health');
  assert(healthRes.status === 200 && healthRes.body.status === 'healthy', 'API Health Check returns 200 Healthy');

  // 2. Login as Admin
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' }
  });
  assert(adminLogin.status === 200 && !!adminLogin.body.token, 'Admin login succeeds with signed JWT');
  const adminToken = adminLogin.body.token;

  // 3. Login with invalid password
  const badLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'wrongpassword' }
  });
  assert(badLogin.status === 401, 'Invalid password correctly rejected with 401');

  // 4. Register new CRC user
  const uniqueCrc = `crc_test_${Date.now()}`;
  const crcSignup = await request('/api/auth/signup', {
    method: 'POST',
    body: {
      displayName: 'Test Coordinator',
      username: uniqueCrc,
      password: 'password123',
      role: 'Clinical Research Coordinator'
    }
  });
  assert(crcSignup.status === 201 && crcSignup.body.user.role === 'Clinical Research Coordinator', 'New CRC user registration succeeds with 201');
  const crcToken = crcSignup.body.token;

  // 5. RBAC test: Ethics approval update
  // Create a trial first
  const trialRes = await request('/api/ctms/trials', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      studyId: `TEST-TRIAL-${Date.now()}`,
      title: 'Automated Test Clinical Trial in Switra',
      phase: 'Phase II'
    }
  });
  assert(trialRes.status === 201 && trialRes.body.study_id.startsWith('TEST-TRIAL-'), 'Admin can register a new trial protocol');
  const testTrialId = trialRes.body.id;

  // Attempt ethics update as CRC (Forbidden)
  const forbiddenEthics = await request(`/api/ctms/trials/${testTrialId}/ethics`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${crcToken}` },
    body: { status: 'Approved', note: 'Attempt by CRC' }
  });
  assert(forbiddenEthics.status === 403, 'RBAC correctly blocks CRC from updating trial ethics status (403)');

  // Update ethics as Admin (Permitted)
  const adminEthics = await request(`/api/ctms/trials/${testTrialId}/ethics`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { status: 'Approved', note: 'IEC formal approval certificate granted' }
  });
  assert(adminEthics.status === 200, 'Admin can update ethics approval status (200)');

  // 6. Automated Edit-Check Engine: Enroll patient with intentional errors
  const testPtId = `PT-VAL-${Date.now()}`;
  const enrollRes = await request('/api/ctms/patients', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      trialId: testTrialId,
      patientId: testPtId,
      studyId: trialRes.body.study_id,
      siteId: 'SITE-TEST-01',
      gender: 'Female',
      age: 40,
      systolicBP: 190, // Critical (>180)
      pulseRate: 125,  // Critical (>120)
      temperature: 36.8,
      prakritiVata: -10, // Invalid negative score (raises Prakriti query)
      prakritiPitta: 40,
      prakritiKapha: 20 // Sum = 110% (Major error)
    }
  });

  assert(enrollRes.status === 201, 'Patient enrolled successfully (201)');
  assert(enrollRes.body.patient.status === 'Flagged', 'Patient status is automatically Flagged due to out-of-bounds vitals');
  assert(enrollRes.body.issuesRaised.length === 3, `Edit-check engine raised 3 queries (BP, Pulse, Prakriti) - got ${enrollRes.body.issuesRaised.length}`);

  const patientDbId = enrollRes.body.patient.id;

  // 7. Test Query Resolution Workflow & Rule Enforcement
  const queriesRes = await request(`/api/ctms/queries?patientId=${patientDbId}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(queriesRes.status === 200 && queriesRes.body.length === 3, 'Queries table contains 3 queries for this patient');

  const bpQuery = queriesRes.body.find(q => q.field === 'systolic_bp');
  assert(bpQuery && bpQuery.severity === 'Critical', 'Critical query raised for Systolic BP 190 mmHg');

  // Attempt to resolve BP query while BP is STILL 190 (Should be blocked!)
  const prematureResolve = await request(`/api/ctms/queries/${bpQuery.id}/resolve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { resolutionNote: 'Trying to resolve without correcting patient data' }
  });
  assert(prematureResolve.status === 400, 'Resolution correctly BLOCKED when underlying vital is still out-of-bounds (400)');

  // Correct the patient's data
  const updatePatientRes = await request(`/api/ctms/patients/${patientDbId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      systolicBP: 120, // corrected to normal
      pulseRate: 72,   // corrected to normal
      prakritiVata: 45,
      prakritiPitta: 35,
      prakritiKapha: 20 // corrected sum = 100%
    }
  });
  assert(updatePatientRes.status === 200, 'Patient data corrected to clinical bounds');

  // Now resolve the BP query (Should succeed!)
  const validResolveBP = await request(`/api/ctms/queries/${bpQuery.id}/resolve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { resolutionNote: 'Re-measurement after resting; verified normal 120 mmHg' }
  });
  assert(validResolveBP.status === 200, 'Query resolution now SUCCEEDS after data correction (200)');

  // Resolve the remaining two queries
  const pulseQuery = queriesRes.body.find(q => q.field === 'pulse_rate');
  const prakritiQuery = queriesRes.body.find(q => q.field === 'prakriti');

  await request(`/api/ctms/queries/${pulseQuery.id}/resolve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { resolutionNote: 'Pulse rate settled to 72 bpm upon repeated rest measurement' }
  });

  const lastResolve = await request(`/api/ctms/queries/${prakritiQuery.id}/resolve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { resolutionNote: 'Corrected dosha proportion transcription error: sums to 100%' }
  });

  // Verify patient status automatically updated to 'Clean'
  assert(lastResolve.body.patientStatus === 'Clean', 'When all queries are resolved, patient status automatically becomes Clean');

  // 8. Protocol Deviations & Close Deviation RBAC
  const devRes = await request('/api/ctms/deviations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      patientId: patientDbId,
      severity: 'Minor',
      description: 'Patient attended Day 14 follow-up 24 hours later due to railway delay'
    }
  });
  assert(devRes.status === 201 && devRes.body.status === 'Open', 'Protocol deviation successfully logged');
  const testDevId = devRes.body.id;

  // CRC cannot close deviation
  const crcCloseDev = await request(`/api/ctms/deviations/${testDevId}/close`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${crcToken}` }
  });
  assert(crcCloseDev.status === 403, 'RBAC correctly blocks CRC from closing protocol deviations (403)');

  // Admin can close deviation
  const adminCloseDev = await request(`/api/ctms/deviations/${testDevId}/close`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(adminCloseDev.status === 200, 'Admin / PI can close protocol deviations (200)');

  // 9. Interoperability Exports (FHIR R4 & CDISC ODM-XML)
  const fhirRes = await request(`/api/ctms/patients/${patientDbId}/export/fhir`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(fhirRes.status === 200 && fhirRes.body.resourceType === 'Bundle' && fhirRes.body.type === 'collection', 'FHIR R4 JSON export returns valid Bundle resource');

  const cdiscRes = await request(`/api/ctms/patients/${patientDbId}/export/cdisc`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(cdiscRes.status === 200 && typeof cdiscRes.body === 'string' && cdiscRes.body.includes('<ODM xmlns="http://www.cdisc.org/ns/odm/v1.3"'), 'CDISC ODM-XML export returns valid XML document');

  // 10. Excel Template & Export
  const templateRes = await request('/api/ctms/import/template', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(templateRes.status === 200 && templateRes.headers['content-type'].includes('spreadsheetml'), 'Excel template endpoint returns formatted .xlsx');

  const excelExportRes = await request('/api/ctms/export/excel', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(excelExportRes.status === 200 && excelExportRes.headers['content-type'].includes('spreadsheetml'), 'Excel full export endpoint returns valid workbook');

  // 11. Audit Log Tracking
  const auditRes = await request('/api/ctms/audit-log?limit=20', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(auditRes.status === 200 && Array.isArray(auditRes.body) && auditRes.body.length > 0, 'Audit trail contains logged events with user attribution');

  
  // 12. Direct Verification of Prakriti Normalization Cases A, B, C, D, E
  console.log('  Testing Prakriti Normalization Engine edge cases A-E...');
  
  // Case A: Vata 40, Pitta 35, Kapha 25
  const caseA = normalizePrakriti(40, 35, 25);
  assert(caseA.valid && caseA.normalized.vataPct === 40 && caseA.normalized.pittaPct === 35 && caseA.normalized.kaphaPct === 25, 'Case A: 40/35/25 -> 40%, 35%, 25%');
  assert(caseA.totalPct === 100, 'Case A total is 100%');

  // Case B: Vata 50, Pitta 50, Kapha 50
  const caseB = normalizePrakriti(50, 50, 50);
  assert(caseB.valid && caseB.normalized.vataPct === 33.33 && caseB.normalized.pittaPct === 33.33 && caseB.normalized.kaphaPct === 33.34, 'Case B: 50/50/50 -> 33.33%, 33.33%, 33.34%');
  assert(caseB.totalPct === 100, 'Case B total is exactly 100%');

  // Case C: Vata 70, Pitta 20, Kapha 10
  const caseC = normalizePrakriti(70, 20, 10);
  assert(caseC.valid && caseC.normalized.vataPct === 70 && caseC.normalized.pittaPct === 20 && caseC.normalized.kaphaPct === 10, 'Case C: 70/20/10 -> 70%, 20%, 10%');
  assert(caseC.totalPct === 100, 'Case C total is 100%');

  // Case D: All values empty/null
  const caseD = normalizePrakriti(null, null, null);
  assert(caseD.valid && caseD.empty && caseD.normalized.vataPct === null, 'Case D: null values return empty without divide-by-zero');

  // Case E: Total raw > 100 without negative values (50, 40, 20) -> valid normalization, no error flag
  const caseE = normalizePrakriti(50, 40, 20);
  assert(caseE.valid && caseE.totalPct === 100, 'Case E: Raw 50/40/20 (Sum 110) normalizes validly without query');

  console.log('-------------------------------------------------------');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('-------------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

// Start test server on dynamic port
server = app.listen(0, async () => {
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  try {
    await runTests();
    server.close(() => process.exit(0));
  } catch (err) {
    console.error('Test run crashed:', err);
    server.close(() => process.exit(1));
  }
});
