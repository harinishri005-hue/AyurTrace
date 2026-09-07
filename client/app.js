
function computeClientPrakriti(vInput, pInput, kInput) {
  const isV = vInput !== null && vInput !== undefined && String(vInput).trim() !== '';
  const isP = pInput !== null && pInput !== undefined && String(pInput).trim() !== '';
  const isK = kInput !== null && kInput !== undefined && String(kInput).trim() !== '';

  if (!isV && !isP && !isK) return null;
  if (!isV || !isP || !isK) return { error: 'Incomplete scores (all 3 required)' };

  const v = Number(vInput), p = Number(pInput), k = Number(kInput);
  if (!Number.isFinite(v) || !Number.isFinite(p) || !Number.isFinite(k) || v < 0 || p < 0 || k < 0) {
    return { error: 'Scores must be non-negative numbers' };
  }

  const total = v + p + k;
  if (total === 0) return { vataPct: 0, pittaPct: 0, kaphaPct: 0, total: 0 };

  const scaledV = (v * 10000) / total;
  const scaledP = (p * 10000) / total;
  const scaledK = (k * 10000) / total;

  const floorV = Math.floor(scaledV);
  const floorP = Math.floor(scaledP);
  const floorK = Math.floor(scaledK);

  let remainder = 10000 - (floorV + floorP + floorK);

  const items = [
    { key: 'vata', floor: floorV, frac: scaledV - floorV, order: 0 },
    { key: 'pitta', floor: floorP, frac: scaledP - floorP, order: 1 },
    { key: 'kapha', floor: floorK, frac: scaledK - floorK, order: 2 }
  ];

  items.sort((a, b) => {
    if (Math.abs(b.frac - a.frac) > 1e-9) return b.frac - a.frac;
    return b.order - a.order;
  });

  for (let i = 0; i < remainder; i++) items[i].floor += 1;

  const res = {};
  for (const item of items) res[item.key] = Number((item.floor / 100).toFixed(2));

  return { vataPct: res.vata, pittaPct: res.pitta, kaphaPct: res.kapha, total };
}

function updatePrakritiPreviewInForm(formId, previewId) {
  const form = document.getElementById(formId);
  const preview = document.getElementById(previewId);
  if (!form || !preview) return;

  const v = form.querySelector('[name="prakritiVata"]')?.value;
  const p = form.querySelector('[name="prakritiPitta"]')?.value;
  const k = form.querySelector('[name="prakritiKapha"]')?.value;

  const res = computeClientPrakriti(v, p, k);
  if (!res) {
    preview.innerHTML = '<span style="color:var(--ink-faint);">Prakriti composition preview will calculate when scores are entered.</span>';
  } else if (res.error) {
    preview.innerHTML = '<span style="color:var(--critical); font-weight:500;">Prakriti: ' + res.error + '</span>';
  } else {
    preview.innerHTML = '<strong>Prakriti Composition (%):</strong> Vata: <strong>' + res.vataPct + '%</strong> | Pitta: <strong>' + res.pittaPct + '%</strong> | Kapha: <strong>' + res.kaphaPct + '%</strong> (Total: 100.00% normalized from raw sum: ' + res.total + ')';
  }
}

// client/app.js - Part 1: Core State, API Client, Auth & Navigation
const API = '/api';
let TOKEN = localStorage.getItem('ctms_token') || null;
let CURRENT_USER = JSON.parse(localStorage.getItem('ctms_user') || 'null');

let TRIALS_CACHE = [];
let PATIENTS_CACHE = [];
let QUERIES_CACHE = [];
let PATIENT_BY_ID_CACHE = {};

let patientSearchTerm = '';
let patientStatusFilterValue = 'all';
let patientTrialFilterValue = 'all';

let querySeverityFilterValue = 'all';
let queryStatusFilterValue = 'all';

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
  return data;
}

let toastCounter = 0;
function showToast(message, type = '') {
  const stack = document.getElementById('toastStack');
  const id = 'toast-' + (++toastCounter);
  const icons = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    '': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.id = id;
  el.innerHTML = (icons[type] || icons['']) + '<span>' + escapeHtml(message) + '</span>';
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 250);
  }, 3500);
}

function setButtonLoading(btn, loadingText) {
  const originalHTML = btn.innerHTML;
  const originalDisabled = btn.disabled;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> ' + loadingText;
  return () => { btn.innerHTML = originalHTML; btn.disabled = originalDisabled; };
}

function emptyStateHTML(iconSvg, title, desc, actionHTML = '') {
  return '<div class="empty-state-block"><div class="empty-state-icon">' + iconSvg + '</div><p class="empty-state-title">' + title + '</p><p class="empty-state-desc">' + desc + '</p>' + actionHTML + '</div>';
}

const ICON_PATIENTS = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>';
const ICON_QUERIES = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.38 8.38 0 0 1-4.06 7.19A8.5 8.5 0 0 1 3 15.5l-1 5 5-1a8.5 8.5 0 0 1 14-8z"/></svg>';
const ICON_TRIALS = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 2v6L3.5 18a2 2 0 0 0 1.8 3h13.4a2 2 0 0 0 1.8-3L15 8V2"/><path d="M9 2h6"/></svg>';
const ICON_DEVIATIONS = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>';
const ICON_HISTORY = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>';
const ICON_AUDIT = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeIconSun').classList.toggle('hidden', theme === 'dark');
  document.getElementById('themeIconMoon').classList.toggle('hidden', theme !== 'dark');
  localStorage.setItem('ctms_theme', theme);
}
function initTheme() {
  const saved = localStorage.getItem('ctms_theme');
  const preferred = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(preferred);
}
document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});
initTheme();

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('loginForm').classList.toggle('hidden', tab.dataset.tab !== 'login');
    document.getElementById('signupForm').classList.toggle('hidden', tab.dataset.tab !== 'signup');
  });
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  const btn = e.target.querySelector('button[type="submit"]');
  const restore = setButtonLoading(btn, 'Authenticating...');
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    setSession(data.token, data.user);
    showToast('Welcome, ' + data.user.display_name, 'success');
  } catch (err) {
    document.getElementById('loginError').textContent = err.message;
  } finally { restore(); }
});

document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const displayName = document.getElementById('signupName').value;
  const username = document.getElementById('signupUsername').value;
  const password = document.getElementById('signupPassword').value;
  const role = document.getElementById('signupRole').value;
  const btn = e.target.querySelector('button[type="submit"]');
  const restore = setButtonLoading(btn, 'Creating profile...');
  try {
    const data = await api('/auth/signup', { method: 'POST', body: JSON.stringify({ displayName, username, password, role }) });
    setSession(data.token, data.user);
    showToast('Account created for ' + data.user.display_name, 'success');
  } catch (err) {
    document.getElementById('signupError').textContent = err.message;
  } finally { restore(); }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  TOKEN = null; CURRENT_USER = null;
  localStorage.removeItem('ctms_token'); localStorage.removeItem('ctms_user');
  document.getElementById('appView').classList.add('hidden');
  document.getElementById('authView').classList.remove('hidden');
});

function setSession(token, user) {
  TOKEN = token; CURRENT_USER = user;
  localStorage.setItem('ctms_token', token);
  localStorage.setItem('ctms_user', JSON.stringify(user));
  document.getElementById('authView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
  document.getElementById('userName').textContent = user.display_name;
  document.getElementById('userRole').textContent = user.role;

  const initials = user.display_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const sidebarInitials = document.getElementById('sidebarUserInitials');
  sidebarInitials.textContent = initials;
  sidebarInitials.title = user.display_name + ' (' + user.role + ')';

  document.getElementById('adminNavBtn').style.display = (user.role === 'Admin') ? '' : 'none';
  switchView('dashboard');
  maybeShowWelcomeModal(user);
}

function maybeShowWelcomeModal(user) {
  const key = 'ctms_welcome_seen_' + user.username;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, '1');
  openModal('<h3>Welcome to AyurTrace 👋</h3><p style="font-size:13.5px; color:var(--ink-soft); line-height:1.6;">You are logged in as <strong>' + escapeHtml(user.display_name) + '</strong> (<em>' + escapeHtml(user.role) + '</em>).</p><p style="font-size:13px; color:var(--ink-soft); line-height:1.5;">This CTMS platform is designed for institutional Ayurveda clinical trials, offering automated edit-checks, GCP pharmacovigilance tracking, protocol deviations oversight, and FHIR / CDISC interoperability.</p><div class="modal-actions"><button class="btn-primary" onclick="closeModal()">Explore Dashboard</button></div>');
}

document.querySelectorAll('.sidebar-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function switchView(view) {
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + view));

  const titles = {
    dashboard: 'Dashboard',
    trials: 'Clinical Trials',
    patients: 'Patient Records',
    queries: 'Edit-Check Queries',
    deviations: 'Protocol Deviations',
    history: 'Batch Imports',
    audit: 'Audit Trail',
    admin: 'User Administration',
    settings: 'Settings'
  };
  document.getElementById('activeViewTitle').textContent = titles[view] || 'Dashboard';

  if (view === 'dashboard') { loadDashboard(); renderOnboardingChecklist(); }
  if (view === 'trials') loadTrials();
  if (view === 'patients') { loadTrialsCache(); loadPatients(); }
  if (view === 'queries') loadQueries();
  if (view === 'deviations') loadDeviations();
  if (view === 'history') loadHistory();
  if (view === 'audit') loadAudit();
  if (view === 'admin') loadAdmin();
  if (view === 'settings') loadSettings();
}
// Part 2: Dashboard & Trials Module
async function renderOnboardingChecklist() {
  const container = document.getElementById('onboardingChecklist');
  try {
    const [trials, patients, queries] = await Promise.all([
      api('/ctms/trials'), api('/ctms/patients'), api('/ctms/queries')
    ]);
    const steps = [
      { done: trials.length > 0, label: 'Register your first clinical trial', view: 'trials' },
      { done: patients.length > 0, label: 'Enroll a patient with Ayurvedic Nidana intake', view: 'patients' },
      { done: queries.some(q => q.status === 'Resolved'), label: 'Review and resolve an edit-check query', view: 'queries' },
      { done: localStorage.getItem('ctms_exported_once') === '1', label: 'Generate a FHIR or CDISC export', view: 'patients' }
    ];
    const doneCount = steps.filter(s => s.done).length;
    if (doneCount === steps.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = '<div class="infographic-card" style="align-items:stretch; margin-bottom:16px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><p class="infographic-label" style="margin:0;">Onboarding Checklist (' + doneCount + '/' + steps.length + ' completed)</p></div><div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">' +
      steps.map(s => '<div style="display:flex; align-items:center; gap:9px; font-size:12.5px; cursor:pointer; padding:6px 8px; border-radius:6px; background:var(--surface-2);" onclick="switchView(\'' + s.view + '\')"><div style="width:16px;height:16px;border-radius:50%;border:2px solid ' + (s.done ? 'var(--good)' : 'var(--border)') + ';background:' + (s.done ? 'var(--good)' : 'transparent') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + (s.done ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5"><path d="M20 6 9 17l-5-5"/></svg>' : '') + '</div><span style="' + (s.done ? 'color:var(--ink-faint); text-decoration:line-through;' : 'color:var(--ink); font-weight:500;') + '">' + s.label + '</span></div>').join('') +
      '</div></div>';
  } catch (err) {}
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 48;

function setRingSegment(id, fraction, rotationOffsetDeg) {
  const el = document.getElementById(id);
  if (!el) return;
  const length = Math.max(0, fraction) * RING_CIRCUMFERENCE;
  const remainder = RING_CIRCUMFERENCE - length;
  el.setAttribute('stroke-dasharray', length + ' ' + remainder);
  el.setAttribute('transform', 'rotate(' + (-90 + rotationOffsetDeg) + ' 60 60)');
}

async function loadDashboard() {
  try {
    const m = await api('/ctms/dashboard');

    document.getElementById('statTotal').textContent = m.totalPatients;
    document.getElementById('statCleanCount').textContent = m.cleanPatients + ' Clean (' + m.flaggedPatients + ' Flagged)';
    document.getElementById('statResolved').textContent = m.resolvedQueries;
    document.getElementById('statOpen').textContent = m.openQueries;
    document.getElementById('statQueryRate').textContent = m.queryRate + ' / patient';
    document.getElementById('statCritical').textContent = m.openCritical;
    document.getElementById('statDevCount').textContent = m.openDeviations + ' open deviation(s)';

    document.getElementById('qualityScoreText').textContent = m.qualityScore;
    setRingSegment('qualityRing', m.qualityScore / 100, 0);

    const qRating = m.qualityScore >= 85 ? 'Excellent GCP Compliance' : (m.qualityScore >= 70 ? 'Moderate Data Discrepancies' : 'Immediate Quality Attention Needed');
    document.getElementById('qualityRatingText').textContent = qRating;

    const total = m.totalPatients || 1;
    const cleanFraction = m.cleanPatients / total;
    const flaggedFraction = m.flaggedPatients / total;
    document.getElementById('cleanPctText').textContent = Math.round(cleanFraction * 100) + '%';
    setRingSegment('cleanRing', cleanFraction, 0);
    setRingSegment('flaggedRing', flaggedFraction, cleanFraction * 360);
    document.getElementById('legendClean').textContent = m.cleanPatients;
    document.getElementById('legendFlagged').textContent = m.flaggedPatients;

    const openTotal = m.openQueries || 1;
    const critFraction = m.openCritical / openTotal;
    const majorFraction = m.openMajor / openTotal;
    const minorFraction = m.openMinor / openTotal;
    document.getElementById('severityTotalText').textContent = m.openQueries;
    setRingSegment('critRing', critFraction, 0);
    setRingSegment('majorRing', majorFraction, critFraction * 360);
    setRingSegment('minorRing', minorFraction, (critFraction + majorFraction) * 360);
    document.getElementById('legendCritical').textContent = m.openCritical;
    document.getElementById('legendMajor').textContent = m.openMajor;
    document.getElementById('legendMinor').textContent = m.openMinor;

    document.getElementById('kpiMissingData').textContent = m.missingDataRate + '%';
    document.getElementById('kpiOpenDeviations').textContent = m.openDeviations;

    const banner = document.getElementById('roleFocusBanner');
    if (banner && m.roleFocus) {
      banner.innerHTML = '<span class="role-focus-label">' + escapeHtml(m.roleFocus.headline) + '</span>' +
        m.roleFocus.kpis.map(k =>
          '<div class="role-focus-kpi"><span class="rf-value">' + escapeHtml(String(k.value)) + '</span><span class="rf-label">' + escapeHtml(k.label) + '</span></div>'
        ).join('');
    }
  } catch (err) { showToast(err.message, 'error'); }
}

async function loadTrialsCache() {
  try {
    TRIALS_CACHE = await api('/ctms/trials');
    const select = document.getElementById('patientTrialFilter');
    if (select) {
      select.innerHTML = '<option value="all">All Clinical Trials</option>' +
        TRIALS_CACHE.map(t => '<option value="' + t.id + '">' + escapeHtml(t.study_id) + ' – ' + escapeHtml(t.title) + '</option>').join('');
    }
  } catch (err) {}
}

async function loadTrials() {
  try {
    TRIALS_CACHE = await api('/ctms/trials');
    const list = document.getElementById('trialsList');

    if (TRIALS_CACHE.length === 0) {
      list.innerHTML = emptyStateHTML(ICON_TRIALS, 'No clinical trials registered',
        'Register your first clinical research protocol to start tracking enrollment.',
        '<button class="btn-primary" onclick="document.getElementById(\'newTrialBtn\').click()">+ Register Trial</button>');
      return;
    }

    const canUpdateEthics = CURRENT_USER.role === 'Ethics Committee Member' || CURRENT_USER.role === 'Admin';

    list.innerHTML = TRIALS_CACHE.map(t => {
      const seal = sealClass(t.ethics_approval_status);
      return '<div class="trial-card">' +
        '<div class="seal-badge ' + seal + '" title="Ethics Approval Status">' + t.ethics_approval_status + '</div>' +
        '<div class="trial-card-info" style="flex:1">' +
          '<div class="trial-card-title">' + escapeHtml(t.title) + '</div>' +
          '<div class="trial-card-meta">' +
            t.study_id + ' – ' + (t.phase || 'Phase N/A') +
            (t.ctri_number ? ' – CTRI: ' + escapeHtml(t.ctri_number) : '') +
            (t.ndct_registration_no ? ' – NDCT: ' + escapeHtml(t.ndct_registration_no) : '') +
            (t.ethics_committee_no ? ' – IEC: ' + escapeHtml(t.ethics_committee_no) : '') +
          '</div>' +
        '</div>' +
        '<div class="trial-card-actions">' +
          (canUpdateEthics ? ('<button class="btn-small" onclick="openEthicsModal(' + t.id + ', \'' + t.ethics_approval_status + '\')" title="Update Ethics Status"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Ethics</button>') : '') +
          '<button class="btn-small btn-export" onclick="exportTrial(' + t.id + ', \'fhir\', this)" title="Export FHIR R4 Bundle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> FHIR</button>' +
          '<button class="btn-small btn-export" onclick="exportTrial(' + t.id + ', \'cdisc\', this)" title="Export CDISC ODM-XML"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> CDISC</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

function sealClass(status) {
  return {
    Pending: 'seal-pending',
    Approved: 'seal-approved',
    Rejected: 'seal-rejected',
    Expired: 'seal-expired'
  }[status] || 'seal-pending';
}

document.getElementById('newTrialBtn').addEventListener('click', () => {
  openModal('<h3>Register New Clinical Trial</h3><form id="trialForm" class="form-grid"><label class="full">Trial Protocol Title<input type="text" name="title" required placeholder="e.g. Randomized Study of Guduchi in Post-Viral Fatigue"></label><label>Study Protocol ID<input type="text" name="studyId" required placeholder="AIIA-PROT-2026-01"></label><label>Phase<select name="phase"><option>Phase I</option><option selected>Phase II</option><option>Phase IIb</option><option>Phase III</option><option>Phase IV (Post-marketing)</option></select></label><label>CTRI Registration No.<input type="text" name="ctriNumber" placeholder="CTRI/2026/..."></label><label>NDCT Registration No.<input type="text" name="ndctRegistrationNo" placeholder="NDCT-AIIA-2026-..."></label><label class="full">Ethics Committee Ref No.<input type="text" name="ethicsCommitteeNo" placeholder="IEC/AIIA/2026/..."></label><div class="modal-actions"><button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button><button type="submit" class="btn-primary">Register Protocol</button></div></form>');

  document.getElementById('trialForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type="submit"]');
    const restore = setButtonLoading(btn, 'Registering...');
    try {
      await api('/ctms/trials', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)) });
      closeModal();
      showToast('Clinical trial registered.', 'success');
      loadTrials();
    } catch (err) {
      showToast(err.message, 'error');
      restore();
    }
  });
});

function openEthicsModal(trialId, currentStatus) {
  openModal('<h3>Update Ethics Approval Status</h3><p style="font-size:12.5px; color:var(--ink-soft); margin-bottom:14px;">Ethics oversight review per Indian Good Clinical Practice (GCP) and ICMR ethical guidelines.</p><form id="ethicsForm" class="form-grid"><label class="full">Approval Status<select name="status"><option value="Pending" ' + (currentStatus === 'Pending' ? 'selected' : '') + '>Pending Review</option><option value="Approved" ' + (currentStatus === 'Approved' ? 'selected' : '') + '>Approved</option><option value="Rejected" ' + (currentStatus === 'Rejected' ? 'selected' : '') + '>Rejected</option><option value="Expired" ' + (currentStatus === 'Expired' ? 'selected' : '') + '>Expired</option></select></label><label class="full">Ethics Committee Note / Minute Reference<textarea name="note" rows="3" placeholder="Enter IEC review meeting notes or approval certificate ref..."></textarea></label><div class="modal-actions"><button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button><button type="submit" class="btn-primary">Save Status</button></div></form>');

  document.getElementById('ethicsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type="submit"]');
    const restore = setButtonLoading(btn, 'Updating...');
    try {
      await api('/ctms/trials/' + trialId + '/ethics', { method: 'PATCH', body: JSON.stringify(Object.fromEntries(fd)) });
      closeModal();
      showToast('Ethics status updated.', 'success');
      loadTrials();
    } catch (err) {
      showToast(err.message, 'error');
      restore();
    }
  });
}

async function exportTrial(trialId, format, btn) {
  const restore = btn ? setButtonLoading(btn, '...') : () => {};
  try {
    const res = await fetch(API + '/ctms/trials/' + trialId + '/export/' + format, { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trial-' + trialId + '-export.' + (format === 'fhir' ? 'json' : 'xml');
    a.click();
    localStorage.setItem('ctms_exported_once', '1');
    showToast(format.toUpperCase() + ' export downloaded.', 'success');
  } catch (err) { showToast('Export failed: ' + err.message, 'error'); }
  finally { restore(); }
}
// Part 3: Patients Module & Excel Features
async function loadPatients() {
  try {
    let url = '/ctms/patients';
    const params = new URLSearchParams();
    if (patientStatusFilterValue !== 'all') params.append('status', patientStatusFilterValue);
    if (patientTrialFilterValue !== 'all') params.append('trialId', patientTrialFilterValue);
    if (patientSearchTerm.trim()) params.append('search', patientSearchTerm.trim());
    if (params.toString()) url += '?' + params.toString();

    PATIENTS_CACHE = await api(url);
    renderPatientsTable();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderPatientsTable() {
  const tbody = document.getElementById('patientsTableBody');
  const countEl = document.getElementById('patientResultCount');
  countEl.textContent = 'Showing ' + PATIENTS_CACHE.length + ' record(s)';

  if (PATIENTS_CACHE.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="13">' + emptyStateHTML(ICON_PATIENTS, 'No patient records found',
      'Enroll a patient manually, or import from Excel. Out-of-range vitals will be flagged automatically.',
      '<button class="btn-primary" onclick="document.getElementById(\'newPatientBtn\').click()">+ Enroll Patient</button>') + '</td></tr>';
    return;
  }

  tbody.innerHTML = PATIENTS_CACHE.map(p => {
    const norm = computeClientPrakriti(p.prakriti_vata, p.prakriti_pitta, p.prakriti_kapha);
    const prakriti = (norm && !norm.error)
      ? (norm.vataPct + '% / ' + norm.pittaPct + '% / ' + norm.kaphaPct + '%')
      : (p.prakriti_vata != null ? (p.prakriti_vata + '/' + p.prakriti_pitta + '/' + p.prakriti_kapha) : '-');
    const prakritiTitle = (norm && !norm.error)
      ? ('Normalized Composition: ' + norm.vataPct + '% / ' + norm.pittaPct + '% / ' + norm.kaphaPct + '%\nRaw Entered Scores: V:' + p.prakriti_vata + ' P:' + p.prakriti_pitta + ' K:' + p.prakriti_kapha + ' (Total Raw: ' + norm.total + ')')
      : 'Prakriti Vata / Pitta / Kapha';
    return '<tr>' +
      '<td class="mono" style="font-weight:600;">' + escapeHtml(p.patient_id) + '</td>' +
      '<td>' + escapeHtml(p.study_id || '-') + ' / <span class="mono">' + escapeHtml(p.site_id || '-') + '</span></td>' +
      '<td>' + (p.gender || '-') + '</td>' +
      '<td>' + (p.age != null ? p.age : '-') + '</td>' +
      '<td>' + (p.visit_type || '-') + '</td>' +
      '<td class="mono" title="' + escapeHtml(prakritiTitle) + '">' + prakriti + '</td>' +
      '<td>' + (escapeHtml(p.ayurvedic_diagnosis) || '-') + '</td>' +
      '<td class="mono">' + (p.systolic_bp != null ? (p.systolic_bp + ' mmHg') : '-') + '</td>' +
      '<td class="mono">' + (p.pulse_rate != null ? (p.pulse_rate + ' bpm') : '-') + '</td>' +
      '<td class="mono">' + (p.temperature != null ? (p.temperature + ' °C') : '-') + '</td>' +
      '<td>' + (p.is_sae ? '<span class="sae-flag" title="Serious Adverse Event">⚠️ SAE</span>' : '-') + '</td>' +
      '<td><span class="badge badge-' + p.status.toLowerCase() + '">' + p.status + '</span></td>' +
      '<td><div style="display:flex; gap:4px;">' +
        '<button class="btn-small" onclick="openEditPatientModal(' + p.id + ')" title="Edit record"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg> Edit</button>' +
        '<button class="btn-small btn-export" onclick="exportPatient(' + p.id + ', \'fhir\', this)" title="Export FHIR R4 Bundle">FHIR</button>' +
        '<button class="btn-small btn-export" onclick="exportPatient(' + p.id + ', \'cdisc\', this)" title="Export CDISC ODM-XML">CDISC</button>' +
      '</div></td></tr>';
  }).join('');
}

document.getElementById('patientSearchInput').addEventListener('input', (e) => {
  patientSearchTerm = e.target.value;
  loadPatients();
});
document.getElementById('patientStatusFilter').addEventListener('change', (e) => {
  patientStatusFilterValue = e.target.value;
  loadPatients();
});
document.getElementById('patientTrialFilter').addEventListener('change', (e) => {
  patientTrialFilterValue = e.target.value;
  loadPatients();
});

document.getElementById('newPatientBtn').addEventListener('click', async () => {
  if (TRIALS_CACHE.length === 0) TRIALS_CACHE = await api('/ctms/trials').catch(() => []);
  const trialOptions = TRIALS_CACHE.map(t => '<option value="' + t.id + '">' + escapeHtml(t.title) + ' (' + escapeHtml(t.study_id) + ')</option>').join('');

  openModal('<h3>Enroll Patient &amp; Ayurvedic Assessment</h3>' +
    '<form id="patientForm" class="form-grid">' +
      '<label>Trial Protocol<select name="trialId">' + (trialOptions || '<option value="">No registered trials</option>') + '</select></label>' +
      '<label>Patient ID<input type="text" name="patientId" required placeholder="e.g. PT-ASH-010"></label>' +
      '<label>Study ID<input type="text" name="studyId" placeholder="e.g. AIIA-ASHWA-2025-01"></label>' +
      '<label>Site ID<input type="text" name="siteId" placeholder="e.g. SITE-DEL-01"></label>' +
      '<label>Gender<select name="gender"><option>Female</option><option>Male</option><option>Other</option></select></label>' +
      '<label>Age (years)<input type="number" name="age" min="1" max="120" placeholder="e.g. 45"></label>' +
      '<label>Visit Type<select name="visitType"><option selected>Baseline</option><option>Follow-up 1</option><option>Follow-up 2</option><option>Follow-up 3</option></select></label>' +
      '<label>Enrollment Date<input type="date" name="enrollDate" value="' + new Date().toISOString().split('T')[0] + '"></label>' +
      '<label>Visit Date<input type="date" name="visitDate" value="' + new Date().toISOString().split('T')[0] + '"></label>' +
      '<label class="full" style="border-top: 1px solid var(--border); padding-top: 8px; margin-top: 2px; font-weight: 600; color: var(--ink);">Ayurvedic Nidana Panchaka &amp; Prakriti Assessment</label>' +
      '<label>Prakriti – Vata %<input type="number" name="prakritiVata" min="0" max="100" placeholder="e.g. 45"></label>' +
      '<label>Prakriti – Pitta %<input type="number" name="prakritiPitta" min="0" max="100" placeholder="e.g. 35"></label>' +
      '<label>Prakriti – Kapha %<input type="number" name="prakritiKapha" min="0" max="100" placeholder="e.g. 20"></label>' +
      '<label>Agni<select name="agni"><option value="">Select Agni...</option><option>Sama</option><option>Manda</option><option>Tikshna</option><option>Vishama</option></select></label>' +
      '<label>Koshtha<select name="koshtha"><option value="">Select Koshtha...</option><option>Mridu</option><option>Madhyama</option><option>Krura</option></select></label>' +
      '<label class="full">Nadi Pariksha Note<input type="text" name="nadiNote" placeholder="e.g. Sarpa gati, Vata-dominant pulse"></label>' +
      '<label class="full">Ayurvedic Diagnosis (Vyadhi)<input type="text" name="ayurvedicDiagnosis" placeholder="e.g. Chittodvega (Generalized Anxiety)"></label>' +
      '<label class="full">Chikitsa Protocol (Treatment)<input type="text" name="chikitsa" placeholder="e.g. Ashwagandha Churna 3g BD with Ksheera"></label>' +
      '<label class="full" style="border-top: 1px solid var(--border); padding-top: 8px; margin-top: 2px; font-weight: 600; color: var(--ink);">Informed Consent (NDCT 2019 / GCP Requirement)</label>' +
      '<div class="checkbox-row"><input type="checkbox" name="consentObtained" id="consentObtainedCheck"><label for="consentObtainedCheck" style="font-weight:600;">Signed Informed Consent Form (ICF) Obtained</label></div>' +
      '<label>ICF Version<input type="text" name="consentVersion" placeholder="e.g. v2.1 (2026-01-01)"></label>' +
      '<label>Consent Date<input type="date" name="consentDate"></label>' +
      '<label class="full">Witnessed By<input type="text" name="consentWitness" placeholder="e.g. Dr. Priya Sharma (CRC)"></label>' +
      '<label class="full" style="border-top: 1px solid var(--border); padding-top: 8px; margin-top: 2px; font-weight: 600; color: var(--ink);">Safety Vital Signs (Automated Edit-Check Monitored)</label>' +
      '<label>Systolic BP (mmHg)<input type="number" name="systolicBP" placeholder="Normal: 90–140"></label>' +
      '<label>Pulse Rate (bpm)<input type="number" name="pulseRate" placeholder="Normal: 60–100"></label>' +
      '<label>Body Temp (°C)<input type="number" step="0.1" name="temperature" placeholder="Normal: 36.0–37.5"></label>' +
      '<label>Weight (kg)<input type="number" step="0.1" name="weight" placeholder="e.g. 64.5"></label>' +
      '<label>Height (cm)<input type="number" step="0.1" name="height" placeholder="e.g. 165.0"></label>' +
      '<div class="checkbox-row"><input type="checkbox" name="isSAE" id="isSAECheck"><label for="isSAECheck" style="font-weight:600; color:var(--critical);">Serious Adverse Event (SAE) Escalation</label></div>' +
      '<label class="full">AE / SAE Description<textarea name="aeNote" rows="2" placeholder="Document any adverse symptoms or medical escalation..."></textarea></label>' +
      '<div class="modal-actions"><button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button><button type="submit" class="btn-primary">Save Patient</button></div>' +
    '</form><div id="patientFormPreview"></div>');

  document.getElementById('patientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd);
    payload.isSAE = fd.has('isSAE');
    payload.consentObtained = fd.has('consentObtained');
    const btn = e.target.querySelector('button[type="submit"]');
    const restore = setButtonLoading(btn, 'Validating & saving...');

    try {
      const result = await api('/ctms/patients', { method: 'POST', body: JSON.stringify(payload) });
      const preview = document.getElementById('patientFormPreview');

      if (result.issuesRaised.length > 0) {
        preview.innerHTML = '<div class="issues-preview"><strong>' + result.issuesRaised.length + ' edit check(s) flagged – queries raised:</strong><ul>' +
          result.issuesRaised.map(i => '<li><strong>[' + i.severity + ']</strong> ' + escapeHtml(i.issue) + '</li>').join('') + '</ul></div>';
        showToast('Patient enrolled – ' + result.issuesRaised.length + ' query(ies) raised.', 'error');
      } else {
        preview.innerHTML = '<div class="issues-preview clean">✅ All edit checks passed. Record verified Clean.</div>';
        showToast('Patient enrolled successfully (Clean).', 'success');
      }

      setTimeout(() => {
        closeModal();
        loadPatients();
        loadDashboard();
      }, 1500);
    } catch (err) {
      showToast(err.message, 'error');
      restore();
    }
  });
});

function openEditPatientModal(patientId) {
  const p = PATIENTS_CACHE.find(x => x.id === patientId);
  if (!p) return showToast('Patient record not found in cache.', 'error');

  openModal('<h3>Edit Patient Record: ' + escapeHtml(p.patient_id) + '</h3>' +
    '<form id="editPatientForm" class="form-grid">' +
      '<label>Patient ID<input type="text" name="patientId" value="' + escapeHtml(p.patient_id) + '" required></label>' +
      '<label>Study ID<input type="text" name="studyId" value="' + escapeHtml(p.study_id || '') + '"></label>' +
      '<label>Site ID<input type="text" name="siteId" value="' + escapeHtml(p.site_id || '') + '"></label>' +
      '<label>Gender<select name="gender"><option ' + (p.gender === 'Female' ? 'selected' : '') + '>Female</option><option ' + (p.gender === 'Male' ? 'selected' : '') + '>Male</option><option ' + (p.gender === 'Other' ? 'selected' : '') + '>Other</option></select></label>' +
      '<label>Age<input type="number" name="age" value="' + (p.age != null ? p.age : '') + '"></label>' +
      '<label>Visit Type<select name="visitType">' + ['Baseline','Follow-up 1','Follow-up 2','Follow-up 3'].map(v => '<option ' + (p.visit_type === v ? 'selected' : '') + '>' + v + '</option>').join('') + '</select></label>' +
      '<label>Enrollment Date<input type="date" name="enrollDate" value="' + (p.enroll_date || '') + '"></label>' +
      '<label>Visit Date<input type="date" name="visitDate" value="' + (p.visit_date || '') + '"></label>' +
      '<label class="full" style="border-top: 1px solid var(--border); padding-top: 8px; margin-top: 2px; font-weight: 600; color: var(--ink);">Ayurvedic Assessment</label>' +
      '<label>Prakriti – Vata %<input type="number" name="prakritiVata" min="0" max="100" value="' + (p.prakriti_vata != null ? p.prakriti_vata : '') + '"></label>' +
      '<label>Prakriti – Pitta %<input type="number" name="prakritiPitta" min="0" max="100" value="' + (p.prakriti_pitta != null ? p.prakriti_pitta : '') + '"></label>' +
      '<label>Prakriti – Kapha %<input type="number" name="prakritiKapha" min="0" max="100" value="' + (p.prakriti_kapha != null ? p.prakriti_kapha : '') + '"></label>' +
      '<label>Agni<select name="agni"><option value="">Select Agni...</option>' + ['Sama','Manda','Tikshna','Vishama'].map(v => '<option ' + (p.agni === v ? 'selected' : '') + '>' + v + '</option>').join('') + '</select></label>' +
      '<label>Koshtha<select name="koshtha"><option value="">Select Koshtha...</option>' + ['Mridu','Madhyama','Krura'].map(v => '<option ' + (p.koshtha === v ? 'selected' : '') + '>' + v + '</option>').join('') + '</select></label>' +
      '<label class="full">Nadi Pariksha Note<input type="text" name="nadiNote" value="' + escapeHtml(p.nadi_note || '') + '"></label>' +
      '<label class="full">Ayurvedic Diagnosis<input type="text" name="ayurvedicDiagnosis" value="' + escapeHtml(p.ayurvedic_diagnosis || '') + '"></label>' +
      '<label class="full">Chikitsa Protocol<input type="text" name="chikitsa" value="' + escapeHtml(p.chikitsa || '') + '"></label>' +
      '<label class="full" style="border-top: 1px solid var(--border); padding-top: 8px; margin-top: 2px; font-weight: 600; color: var(--ink);">Informed Consent (NDCT 2019 / GCP Requirement)</label>' +
      '<div class="checkbox-row"><input type="checkbox" name="consentObtained" id="editConsentObtainedCheck" ' + (p.consent_obtained ? 'checked' : '') + '><label for="editConsentObtainedCheck" style="font-weight:600;">Signed Informed Consent Form (ICF) Obtained</label></div>' +
      '<label>ICF Version<input type="text" name="consentVersion" value="' + escapeHtml(p.consent_version || '') + '"></label>' +
      '<label>Consent Date<input type="date" name="consentDate" value="' + (p.consent_date || '') + '"></label>' +
      '<label class="full">Witnessed By<input type="text" name="consentWitness" value="' + escapeHtml(p.consent_witness || '') + '"></label>' +
      '<label class="full" style="border-top: 1px solid var(--border); padding-top: 8px; margin-top: 2px; font-weight: 600; color: var(--ink);">Vital Signs</label>' +
      '<label>Systolic BP (mmHg)<input type="number" name="systolicBP" value="' + (p.systolic_bp != null ? p.systolic_bp : '') + '"></label>' +
      '<label>Pulse Rate (bpm)<input type="number" name="pulseRate" value="' + (p.pulse_rate != null ? p.pulse_rate : '') + '"></label>' +
      '<label>Body Temp (°C)<input type="number" step="0.1" name="temperature" value="' + (p.temperature != null ? p.temperature : '') + '"></label>' +
      '<label>Weight (kg)<input type="number" step="0.1" name="weight" value="' + (p.weight != null ? p.weight : '') + '"></label>' +
      '<label>Height (cm)<input type="number" step="0.1" name="height" value="' + (p.height != null ? p.height : '') + '"></label>' +
      '<div class="checkbox-row"><input type="checkbox" name="isSAE" id="editIsSAECheck" ' + (p.is_sae ? 'checked' : '') + '><label for="editIsSAECheck" style="font-weight:600; color:var(--critical);">Serious Adverse Event (SAE)</label></div>' +
      '<label class="full">AE / SAE Description<textarea name="aeNote" rows="2">' + escapeHtml(p.ae_note || '') + '</textarea></label>' +
      '<div class="modal-actions"><button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button><button type="submit" class="btn-primary">Save Changes</button></div>' +
    '</form><div id="editPatientPreview"></div>');

  document.getElementById('editPatientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd);
    payload.isSAE = fd.has('isSAE');
    payload.consentObtained = fd.has('consentObtained');
    const btn = e.target.querySelector('button[type="submit"]');
    const restore = setButtonLoading(btn, 'Saving...');

    try {
      const result = await api('/ctms/patients/' + patientId, { method: 'PATCH', body: JSON.stringify(payload) });
      const preview = document.getElementById('editPatientPreview');

      if (result.newIssuesRaised.length > 0) {
        preview.innerHTML = '<div class="issues-preview"><strong>' + result.newIssuesRaised.length + ' new issue(s) raised:</strong><ul>' +
          result.newIssuesRaised.map(i => '<li><strong>[' + i.severity + ']</strong> ' + escapeHtml(i.issue) + '</li>').join('') + '</ul></div>';
        showToast('Saved – new issue(s) detected.', 'error');
      } else {
        preview.innerHTML = '<div class="issues-preview clean">✅ Record updated. If this corrected previous queries, navigate to Queries to sign off resolution.</div>';
        showToast('Patient record updated.', 'success');
      }

      setTimeout(() => {
        closeModal();
        loadPatients();
        loadDashboard();
      }, 1500);
    } catch (err) {
      showToast(err.message, 'error');
      restore();
    }
  });
}

async function exportPatient(patientId, format, btn) {
  const restore = btn ? setButtonLoading(btn, '...') : () => {};
  try {
    const res = await fetch(API + '/ctms/patients/' + patientId + '/export/' + format, { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'patient-' + patientId + '-export.' + (format === 'fhir' ? 'json' : 'xml');
    a.click();
    localStorage.setItem('ctms_exported_once', '1');
    showToast(format.toUpperCase() + ' export downloaded.', 'success');
  } catch (err) { showToast('Export failed: ' + err.message, 'error'); }
  finally { restore(); }
}

document.getElementById('downloadTemplateBtn').addEventListener('click', async (e) => {
  const restore = setButtonLoading(e.currentTarget, 'Preparing...');
  try {
    const res = await fetch(API + '/ctms/import/template', { headers: { Authorization: 'Bearer ' + TOKEN } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AIIA_CTMS_Patient_Import_Template.xlsx';
    a.click();
    showToast('Template downloaded.', 'success');
  } catch (err) { showToast('Download failed: ' + err.message, 'error'); }
  finally { restore(); }
});

document.getElementById('exportExcelBtn').addEventListener('click', async (e) => {
  const restore = setButtonLoading(e.currentTarget, 'Exporting...');
  try {
    const res = await fetch(API + '/ctms/export/excel', { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (!res.ok) throw new Error('Excel export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AIIA_CTMS_Export_' + new Date().toISOString().split('T')[0] + '.xlsx';
    a.click();
    showToast('Full Excel workbook downloaded.', 'success');
  } catch (err) { showToast(err.message, 'error'); }
  finally { restore(); }
});

document.getElementById('importExcelBtn').addEventListener('click', async () => {
  if (TRIALS_CACHE.length === 0) TRIALS_CACHE = await api('/ctms/trials').catch(() => []);
  const trialOptions = TRIALS_CACHE.map(t => '<option value="' + t.id + '">' + escapeHtml(t.title) + ' (' + escapeHtml(t.study_id) + ')</option>').join('');

  openModal('<h3>Batch Import Patients from Excel</h3>' +
    '<form id="importForm" class="form-grid">' +
      '<label class="full">Excel Workbook (.xlsx)<input type="file" name="file" accept=".xlsx" required></label>' +
      '<label class="full">Target Trial Protocol<select name="trialId"><option value="">Auto-detect from Study_ID</option>' + trialOptions + '</select></label>' +
      '<label class="full">Ingestion Mode<select name="mode"><option value="new-batch">New batch – preserve existing records and ingest new batch</option><option value="merge">Merge – update matching Patient IDs, insert new ones</option><option value="new-only">New only – skip rows whose Patient ID already exists</option><option value="replace">Replace – overwrite matching patient records completely</option></select></label>' +
      '<div class="modal-actions"><button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button><button type="submit" class="btn-primary">Execute Ingestion</button></div>' +
    '</form><div id="importResultPreview"></div>');

  document.getElementById('importForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type="submit"]');
    const restore = setButtonLoading(btn, 'Ingesting & checking...');

    try {
      const res = await fetch(API + '/ctms/import/excel', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + TOKEN },
        body: fd
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Import failed');

      const skippedDetails = (result.skippedRows || []).slice(0, 5).map(row =>
        'Row ' + row.row + (row.patientId ? ' (' + escapeHtml(row.patientId) + ')' : '') + ': ' + escapeHtml(row.reason)
      ).join('<br>');
      const skippedSummary = result.skipped > 0 ? '<br><small>' + skippedDetails + (result.skipped > 5 ? '<br>...and ' + (result.skipped - 5) + ' more row(s).' : '') + '</small>' : '';
      document.getElementById('importResultPreview').innerHTML = '<div class="issues-preview ' + (result.flaggedCount === 0 && result.skipped === 0 ? 'clean' : '') + '"><strong>Batch Ingestion Completed:</strong> ' + result.imported + ' record(s) processed.<br>✅ Clean: ' + result.clean + ' | ⚠️ Flagged: ' + result.flaggedCount + ' | ⏭️ Skipped: ' + result.skipped + skippedSummary + '</div>';

      showToast('Imported ' + result.imported + ' patient rows.', 'success');
      setTimeout(() => {
        closeModal();
        loadPatients();
        loadDashboard();
      }, 1800);
    } catch (err) {
      showToast(err.message, 'error');
      restore();
    }
  });
});
// Part 4: Queries, Deviations, Audit, Admin, Settings & Helpers
async function loadQueries() {
  try {
    let url = '/ctms/queries';
    const params = new URLSearchParams();
    if (querySeverityFilterValue !== 'all') params.append('severity', querySeverityFilterValue);
    if (queryStatusFilterValue !== 'all') params.append('status', queryStatusFilterValue);
    if (params.toString()) url += '?' + params.toString();

    QUERIES_CACHE = await api(url);
    const patients = await api('/ctms/patients');
    PATIENT_BY_ID_CACHE = Object.fromEntries(patients.map(p => [p.id, p.patient_id]));

    renderQueriesTable();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderQueriesTable() {
  const tbody = document.getElementById('queriesTableBody');
  const countEl = document.getElementById('queryResultCount');
  countEl.textContent = 'Showing ' + QUERIES_CACHE.length + ' query(ies)';

  if (QUERIES_CACHE.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">' + emptyStateHTML(ICON_QUERIES, 'No data queries raised',
      'Clinical validation queries automatically appear here when patients have out-of-bounds vitals or missing fields.') + '</td></tr>';
    return;
  }

  tbody.innerHTML = QUERIES_CACHE.map(q => {
    return '<tr>' +
      '<td class="mono" style="font-weight:600;">Q-' + q.id + '</td>' +
      '<td class="mono">' + (PATIENT_BY_ID_CACHE[q.patient_id] || ('#' + q.patient_id)) + '</td>' +
      '<td><span class="severity-badge severity-' + q.severity + '">' + q.severity + '</span></td>' +
      '<td class="mono">' + escapeHtml(q.field) + '</td>' +
      '<td>' + escapeHtml(q.issue) + '</td>' +
      '<td><span class="badge badge-' + q.status.toLowerCase() + '">' + q.status + '</span></td>' +
      '<td>' +
        (q.status === 'Open'
          ? ('<button class="btn-small btn-resolve" onclick="openResolveModal(' + q.id + ', \'' + escapeHtml(q.field) + '\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Resolve</button>')
          : ('<button class="btn-small" onclick="reopenQuery(' + q.id + ', this)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Reopen</button>')) +
      '</td>' +
    '</tr>';
  }).join('');
}

document.querySelectorAll('#querySeverityFilter .filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#querySeverityFilter .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    querySeverityFilterValue = chip.dataset.severity;
    loadQueries();
  });
});
document.getElementById('queryStatusFilter').addEventListener('change', (e) => {
  queryStatusFilterValue = e.target.value;
  loadQueries();
});

function openResolveModal(id, field) {
  openModal('<h3>Resolve Query Q-' + id + ' (' + field + ')</h3>' +
    '<p style="font-size:12.5px; color:var(--ink-soft); line-height:1.4;"><strong>Quality Requirement:</strong> Before this query can be resolved, the patient record must comply with validation rules. If the underlying field is still out-of-bounds, resolution will be rejected.</p>' +
    '<form id="resolveForm" class="form-grid">' +
      '<label class="full">Mandatory Clinical Resolution Note<textarea name="resolutionNote" rows="3" required placeholder="Describe clinical correction or source document verification..."></textarea></label>' +
      '<div class="modal-actions"><button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button><button type="submit" class="btn-primary">Verify &amp; Resolve</button></div>' +
    '</form><div id="resolveErrorBox"></div>');

  document.getElementById('resolveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type="submit"]');
    const restore = setButtonLoading(btn, 'Re-checking rules...');
    const errBox = document.getElementById('resolveErrorBox');
    errBox.innerHTML = '';

    try {
      const res = await api('/ctms/queries/' + id + '/resolve', {
        method: 'PATCH',
        body: JSON.stringify(Object.fromEntries(fd))
      });
      closeModal();
      showToast(res.message, 'success');
      loadQueries();
      loadPatients();
      loadDashboard();
    } catch (err) {
      errBox.innerHTML = '<div class="issues-preview" style="margin-top:12px;"><strong>Resolution Blocked:</strong> ' + escapeHtml(err.message) + '<br><small style="color:var(--ink-soft); display:block; margin-top:4px;">Tip: Go to Patients tab and click "Edit" on this patient to correct the vital first.</small></div>';
      showToast('Resolution rejected by validation engine.', 'error');
      restore();
    }
  });
}

async function reopenQuery(id, btn) {
  const restore = btn ? setButtonLoading(btn, '...') : () => {};
  try {
    await api('/ctms/queries/' + id + '/reopen', { method: 'PATCH' });
    showToast('Query Q-' + id + ' reopened.', '');
    loadQueries();
    loadPatients();
    loadDashboard();
  } catch (err) { showToast(err.message, 'error'); restore(); }
}

async function loadDeviations() {
  try {
    const deviations = await api('/ctms/deviations');
    const tbody = document.getElementById('deviationsTableBody');

    if (deviations.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8">' + emptyStateHTML(ICON_DEVIATIONS, 'No protocol deviations logged',
        'Protocol non-compliance events, visit window variances, and prohibited medications will appear here.') + '</td></tr>';
      return;
    }

    const canClose = CURRENT_USER.role === 'Principal Investigator' || CURRENT_USER.role === 'Data Manager' || CURRENT_USER.role === 'Admin';

    tbody.innerHTML = deviations.map(d => {
      return '<tr>' +
        '<td class="mono" style="font-weight:600;">DEV-' + d.id + '</td>' +
        '<td class="mono">#' + d.patient_id + '</td>' +
        '<td><span class="severity-badge severity-' + d.severity + '">' + d.severity + '</span></td>' +
        '<td>' + escapeHtml(d.description) + '</td>' +
        '<td class="mono">' + new Date(d.date_logged).toLocaleDateString() + '</td>' +
        '<td>' + escapeHtml(d.logged_by) + '</td>' +
        '<td><span class="badge ' + (d.status === 'Closed' ? 'badge-resolved' : 'badge-open') + '">' + d.status + '</span></td>' +
        '<td>' +
          (d.status !== 'Closed'
            ? (canClose
                ? ('<button class="btn-small btn-resolve" onclick="closeDeviation(' + d.id + ', this)">Close Deviation</button>')
                : '<span style="font-size:11px; color:var(--ink-faint);">PI / DM Sign-off</span>')
            : ('<span style="font-size:11.5px; color:var(--good); font-weight:500;">Closed by ' + escapeHtml(d.closed_by || 'Admin') + '</span>')) +
        '</td>' +
      '</tr>';
    }).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

document.getElementById('newDeviationBtn').addEventListener('click', () => {
  openModal('<h3>Log Protocol Deviation</h3><form id="deviationForm" class="form-grid"><label>Patient ID (or Database ID)<input type="text" name="patientId" required placeholder="e.g. PT-ASH-001 or 1"></label><label>Deviation Severity<select name="severity"><option>Minor</option><option>Major</option><option>Critical</option></select></label><label class="full">Detailed Event Description<textarea name="description" rows="3" required placeholder="Describe non-compliance, visit window breach, prohibited concomitant medicine, etc..."></textarea></label><div class="modal-actions"><button type="button" class="btn-cancel" onclick="closeModal()">Cancel</button><button type="submit" class="btn-primary">Log Deviation</button></div></form>');

  document.getElementById('deviationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type="submit"]');
    const restore = setButtonLoading(btn, 'Logging...');
    try {
      await api('/ctms/deviations', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)) });
      closeModal();
      showToast('Protocol deviation logged.', 'success');
      loadDeviations();
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
      restore();
    }
  });
});

async function closeDeviation(id, btn) {
  const restore = btn ? setButtonLoading(btn, '...') : () => {};
  try {
    await api('/ctms/deviations/' + id + '/close', { method: 'PATCH' });
    showToast('Deviation DEV-' + id + ' closed.', 'success');
    loadDeviations();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
    restore();
  }
}

async function loadHistory() {
  try {
    const batches = await api('/ctms/batches');
    const tbody = document.getElementById('historyTableBody');

    if (batches.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">' + emptyStateHTML(ICON_HISTORY, 'No Excel batches imported',
        'Use the Patients view to import your first batch.') + '</td></tr>';
      return;
    }

    tbody.innerHTML = batches.map(b => {
      return '<tr>' +
        '<td style="font-weight:600;">' + escapeHtml(b.batch_name) + '</td>' +
        '<td class="mono">' + escapeHtml(b.file_name || '-') + '</td>' +
        '<td class="mono">' + new Date(b.import_date).toLocaleString() + '</td>' +
        '<td>' + escapeHtml(b.imported_by) + '</td>' +
        '<td><span class="badge" style="background:var(--accent-tint); color:var(--accent);">' + b.mode + '</span></td>' +
        '<td class="mono">' + b.row_count + '</td>' +
        '<td class="mono" style="' + (b.flagged_count > 0 ? 'color:var(--critical); font-weight:600;' : '') + '">' + b.flagged_count + '</td>' +
      '</tr>';
    }).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

function auditDotClass(action) {
  const a = (action || '').toLowerCase();
  if (a.includes('resolved') || a.includes('created') || a.includes('approved') || a.includes('enrolled')) return 'good';
  if (a.includes('deviation') || a.includes('reopen') || a.includes('rejected')) return 'critical';
  return 'saffron';
}

async function loadAudit() {
  try {
    const log = await api('/ctms/audit-log');
    const timeline = document.getElementById('auditTimeline');

    if (log.length === 0) {
      timeline.innerHTML = emptyStateHTML(ICON_AUDIT, 'No audit records yet', 'All subsequent clinical and system activities will be recorded here.');
      return;
    }

    timeline.innerHTML = log.map(a => {
      return '<div class="timeline-item">' +
        '<div class="timeline-dot ' + auditDotClass(a.action) + '"></div>' +
        '<div class="timeline-card">' +
          '<div class="timeline-time">' + new Date(a.timestamp).toLocaleString() + '</div>' +
          '<div class="timeline-action">' + escapeHtml(a.action) + '</div>' +
          '<div class="timeline-details">' + escapeHtml(a.details || '') + '</div>' +
          '<div class="timeline-user">User: <strong>' + escapeHtml(a.user_name || 'System') + '</strong></div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

const VALID_ROLES = [
  'Principal Investigator', 'Clinical Research Coordinator',
  'Data Manager', 'Regulatory Affairs Officer', 'Ethics Committee Member', 'Admin'
];

async function loadAdmin() {
  try {
    const users = await api('/auth/users');
    const tbody = document.getElementById('usersTableBody');

    tbody.innerHTML = users.map(u => {
      return '<tr>' +
        '<td class="mono">' + escapeHtml(u.username) + '</td>' +
        '<td style="font-weight:500;">' + escapeHtml(u.display_name) + '</td>' +
        '<td>' +
          '<select class="filter-select" style="font-size:12px; padding:5px 8px;" ' +
            (u.id === CURRENT_USER.id ? 'disabled title="You cannot alter your own role"' : '') +
            ' onchange="changeUserRole(' + u.id + ', this.value)">' +
            VALID_ROLES.map(r => '<option ' + (u.role === r ? 'selected' : '') + '>' + r + '</option>').join('') +
          '</select>' +
        '</td>' +
        '<td class="mono">' + new Date(u.created_at).toLocaleDateString() + '</td>' +
        '<td>' +
          (u.id === CURRENT_USER.id ? '<span style="font-size:11.5px; color:var(--ink-faint);">Current User</span>' : '<span style="font-size:11.5px; color:var(--good);">Editable</span>') +
        '</td>' +
      '</tr>';
    }).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

async function changeUserRole(userId, role) {
  try {
    await api('/auth/users/' + userId + '/role', { method: 'PATCH', body: JSON.stringify({ role }) });
    showToast('User role updated successfully.', 'success');
    loadAdmin();
  } catch (err) {
    showToast(err.message, 'error');
    loadAdmin();
  }
}

async function loadSettings() {
  document.getElementById('profileDisplayName').value = CURRENT_USER.display_name;
  document.getElementById('profileUsername').value = CURRENT_USER.username;
  document.getElementById('profileRole').value = CURRENT_USER.role;

  try {
    const activity = await api('/auth/me/activity');
    const timeline = document.getElementById('myActivityTimeline');

    if (activity.length === 0) {
      timeline.innerHTML = emptyStateHTML(ICON_AUDIT, 'No activity recorded yet', 'Actions performed by your account will appear here.');
      return;
    }

    timeline.innerHTML = activity.map(a => {
      return '<div class="timeline-item">' +
        '<div class="timeline-dot saffron"></div>' +
        '<div class="timeline-card">' +
          '<div class="timeline-time">' + new Date(a.timestamp).toLocaleString() + '</div>' +
          '<div class="timeline-action">' + escapeHtml(a.action) + '</div>' +
          '<div class="timeline-details">' + escapeHtml(a.details || '') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const displayName = document.getElementById('profileDisplayName').value;
  const btn = e.target.querySelector('button[type="submit"]');
  const restore = setButtonLoading(btn, 'Saving...');
  try {
    const data = await api('/auth/me', { method: 'PATCH', body: JSON.stringify({ displayName }) });
    TOKEN = data.token; CURRENT_USER = data.user;
    localStorage.setItem('ctms_token', data.token);
    localStorage.setItem('ctms_user', JSON.stringify(data.user));
    document.getElementById('userName').textContent = data.user.display_name;
    const initials = data.user.display_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    document.getElementById('sidebarUserInitials').textContent = initials;
    showToast('Profile updated.', 'success');
  } catch (err) { showToast(err.message, 'error'); }
  finally { restore(); }
});

document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button[type="submit"]');
  const restore = setButtonLoading(btn, 'Updating...');
  try {
    await api('/auth/me/password', { method: 'PATCH', body: JSON.stringify(Object.fromEntries(fd)) });
    showToast('Password updated successfully.', 'success');
    e.target.reset();
  } catch (err) { showToast(err.message, 'error'); }
  finally { restore(); }
});

function openModal(html) {
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalOverlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
}
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

if (TOKEN && CURRENT_USER) {
  setSession(TOKEN, CURRENT_USER);
}
