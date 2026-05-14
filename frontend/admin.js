const API = '/api';

// Auth Check & Setup
fetch(`${API}/me`, { credentials: 'include' })
  .then(r => r.json())
  .then(d => {
    if (!d.loggedIn || d.user.role !== 'admin') {
      location.href = 'index.html';
      return;
    }
    document.getElementById('adminName').textContent = d.user.name;
    document.getElementById('adminInitial').textContent = (d.user.name || 'A')[0].toUpperCase();
    loadOverview();
    document.getElementById('logsDate').value = today();
  });

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fmtTime(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

async function apiFetch(url, options = {}) {
  options.credentials = 'include';
  try {
    const res = await fetch(url, options);
    return await res.json();
  } catch (err) {
    console.error(err);
    return {};
  }
}

// Layout & Panels
const panels = ['overview', 'logs', 'students', 'simulator', 'schedules', 'instructors', 'live', 'audit'];
const titles = {
  overview: 'System Overview', logs: 'Attendance Logs', students: 'Student Management',
  simulator: 'RFID Tap Simulator', schedules: 'Schedule Manager', instructors: 'Instructor Directory',
  live: 'Live Class Sessions', audit: 'System Audit Trail'
};

function showPanel(name) {
  panels.forEach(p => {
    const el = document.getElementById('panel-' + p);
    if (el) el.classList.toggle('active', p === name);
  });
  document.querySelectorAll('.nav-item').forEach((b, i) => b.classList.toggle('active', panels[i] === name));
  document.getElementById('panelTitle').textContent = titles[name];

  if (name === 'overview') loadOverview();
  if (name === 'logs') loadLogs();
  if (name === 'students') { if (currentStudentTab === 'active') loadStudents(); else loadPendingStudents(); }
  if (name === 'simulator') loadReaders();
  if (name === 'schedules') { loadScheduleDropdowns(); loadScheduleList(); }
  if (name === 'instructors') loadInstructors();
  if (name === 'live') { loadLiveSessions(); startLivePolling(); }
  if (name === 'audit') loadAudit();

  if (name === 'simulator') setTimeout(rfidFocusLock, 100);
}

// Clock
setInterval(() => {
  document.getElementById('liveClock').textContent = new Date().toLocaleString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}, 1000);

// OVERVIEW
let feedLog = [];
async function loadOverview() {
  const d = await apiFetch(`${API}/dashboard/stats?date=${today()}`);
  if (d.stats) {
    document.getElementById('stat-total').textContent = d.stats.total_students || 0;
    document.getElementById('stat-present').textContent = d.stats.present_today || 0;
    document.getElementById('stat-late').textContent = d.stats.late_today || 0;
    document.getElementById('stat-sessions').textContent = d.stats.sessions_today || 0;
  }
  if (d.weekly) {
    const max = Math.max(...d.weekly.map(w => Number(w.present) + Number(w.late)), 1);
    document.getElementById('weeklyChart').innerHTML = d.weekly.map(w => {
      const p = Number(w.present), l = Number(w.late), t = p + l;
      const hp = (p / max) * 100;
      const hl = (l / max) * 100;
      return `
        <div class="bar-group" title="${w.date}: ${p} present, ${l} late">
          <div class="bars">
            <div class="bar present" style="height:${hp}%"></div>
            <div class="bar late" style="height:${hl}%"></div>
          </div>
          <div class="bar-label">${new Date(w.date).toLocaleDateString('en-US', { weekday: 'short' })}</div>
        </div>`;
    }).join('');
  }
  const ld = await apiFetch(`${API}/dashboard/logs?date=${today()}&limit=8`);
  document.getElementById('todayCount').textContent = ld.total ?? 0;
  const tbody = document.getElementById('recentLogs');
  if (!ld.logs?.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--dim);padding:20px">No taps today yet.</td></tr>'; return; }
  tbody.innerHTML = ld.logs.map(l => `
    <tr>
      <td>${l.first_name} ${l.last_name}</td>
      <td><span style="font-size:11px;color:var(--muted)">${l.subject_code}</span></td>
      <td style="font-size:12px;color:var(--muted)">${fmtTime(l.tap_time)}</td>
      <td><span class="status-pill ${l.status}"><span class="status-dot ${l.status}"></span>${l.status}</span></td>
    </tr>`).join('');
}

// LOGS
async function loadLogs() {
  const date = document.getElementById('logsDate').value || today();
  const d = await apiFetch(`${API}/dashboard/logs?date=${date}&limit=100`);
  document.getElementById('logTotal').textContent = `${d.total ?? 0} records`;
  const tbody = document.getElementById('logsBody');
  if (!d.logs?.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--dim);padding:20px">No records for this date.</td></tr>'; return; }
  tbody.innerHTML = d.logs.map(l => `
    <tr>
      <td style="font-size:12px;color:var(--muted)">${l.student_id}</td>
      <td>${l.first_name} ${l.last_name}</td>
      <td>${l.subject_code} — ${l.subject_name}</td>
      <td>${l.section_name}</td>
      <td>${fmtTime(l.tap_time)}</td>
      <td><span class="status-pill ${l.status}"><span class="status-dot ${l.status}"></span>${l.status}</span></td>
      <td style="font-size:11px;color:var(--muted)">${l.recorded_by}</td>
    </tr>`).join('');
}

// STUDENTS
let currentStudentTab = 'active';
function switchStudentTab(tab) {
  currentStudentTab = tab;
  document.getElementById('view-active').style.display = tab === 'active' ? 'block' : 'none';
  document.getElementById('view-pending').style.display = tab === 'pending' ? 'block' : 'none';
  document.getElementById('tab-active-btn').classList.toggle('active', tab === 'active');
  document.getElementById('tab-pending-btn').classList.toggle('active', tab === 'pending');
  if (tab === 'active') loadStudents();
  if (tab === 'pending') loadPendingStudents();
}

let allStudents = [];
async function loadStudents() {
  const d = await apiFetch(`${API}/dashboard/students?limit=200`);
  allStudents = d.students || [];
  renderStudents(allStudents);
  refreshPendingBadge();
}

function searchStudents() {
  const q = document.getElementById('studentSearch').value.toLowerCase();
  renderStudents(allStudents.filter(s => `${s.first_name} ${s.last_name} ${s.student_id}`.toLowerCase().includes(q)));
}

function renderStudents(list) {
  const tbody = document.getElementById('studentsBody');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--dim);padding:20px">No active students found.</td></tr>'; return; }
  tbody.innerHTML = list.map(s => `
    <tr>
      <td style="font-size:12px;color:var(--muted)">${s.student_id}</td>
      <td>${s.first_name} ${s.last_name}</td>
      <td style="font-size:12px;color:var(--muted)">${s.email || '—'}</td>
      <td style="font-size:12px;color:var(--muted)">${s.contact_no || '—'}</td>
      <td><code style="font-size:11px;background:rgba(255,255,255,.06);padding:2px 6px;border-radius:5px">${s.card_uid || '<span style="color:var(--dim)">Not assigned</span>'}</code></td>
      <td><span class="badge ${s.is_active ? 'green' : 'red'}">${s.is_active ? 'Active' : 'Inactive'}</span></td>
    </tr>`).join('');
}

let allPending = [];
async function loadPendingStudents() {
  const d = await apiFetch(`${API}/dashboard/pending_students`);
  allPending = d.students || [];
  const ct = d.pending_count ?? allPending.length;
  updatePendingUI(ct);
  renderPending(allPending);
}

function searchPending() {
  const q = document.getElementById('pendingSearch').value.toLowerCase();
  renderPending(allPending.filter(s => `${s.first_name} ${s.last_name} ${s.student_id}`.toLowerCase().includes(q)));
}

function renderPending(list) {
  const tbody = document.getElementById('pendingBody');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--dim);padding:20px">🎉 No pending students.</td></tr>'; return; }
  tbody.innerHTML = list.map(s => `
    <tr id="prow-${s.user_id}">
      <td style="font-size:12px;color:var(--muted)">${s.student_id}</td>
      <td><span class="pending-dot"></span>${s.first_name} ${s.last_name}</td>
      <td style="font-size:12px;color:var(--muted)">${s.email || '—'}</td>
      <td style="font-size:12px;color:var(--muted)">${s.contact_no || '—'}</td>
      <td style="font-size:12px;color:var(--muted)">${fmtTime(s.created_at)}</td>
      <td>
        <div class="uid-assign-form">
          <input class="uid-input" id="uid-${s.user_id}" placeholder="Scan UID…" autocomplete="off" onkeydown="if(event.key==='Enter') assignUID(${s.user_id})"/>
          <button class="btn-assign" id="btn-${s.user_id}" onclick="assignUID(${s.user_id})">⚡ Activate</button>
        </div>
        <div id="uid-msg-${s.user_id}" style="font-size:11px;margin-top:5px;display:none"></div>
      </td>
    </tr>`).join('');
}

async function assignUID(userId) {
  const inp = document.getElementById(`uid-${userId}`);
  const btn = document.getElementById(`btn-${userId}`);
  const msg = document.getElementById(`uid-msg-${userId}`);
  const uid = inp ? inp.value.trim() : '';
  if (!uid) { showUIDMsg(msg, '⚠️ Enter or scan UID.', 'warn'); return; }
  btn.disabled = true; btn.textContent = '⏳ Saving…';
  
  const res = await apiFetch(`${API}/dashboard/assign_uid`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, card_uid: uid })
  });
  
  if (res.success) {
    showUIDMsg(msg, `✅ Activated! UID: ${uid}`, 'success');
    setTimeout(() => {
      const row = document.getElementById(`prow-${userId}`);
      if (row) { row.style.opacity = '0'; row.style.transition = 'opacity .4s'; setTimeout(() => row.remove(), 400); }
      allPending = allPending.filter(s => s.user_id !== userId);
      updatePendingUI(allPending.length);
    }, 900);
  } else {
    showUIDMsg(msg, `❌ ${res.message}`, 'error');
    btn.disabled = false; btn.textContent = '⚡ Activate';
  }
}

function showUIDMsg(el, text, type) {
  if (!el) return;
  const colors = { success: '#86efac', warn: '#fde68a', error: '#fca5a5' };
  el.style.color = colors[type] || '#fff'; el.textContent = text; el.style.display = 'block';
}

async function refreshPendingBadge() {
  const d = await apiFetch(`${API}/dashboard/pending_students`);
  updatePendingUI(d.pending_count ?? (d.students || []).length);
}

function updatePendingUI(ct) {
  const badge = document.getElementById('pendingTabBadge');
  const notice = document.getElementById('pendingNotice');
  const noticeCt = document.getElementById('pendingNoticeCt');
  const tblBadge = document.getElementById('pendingBadge');
  if (badge) { badge.textContent = ct; badge.style.display = ct > 0 ? 'inline-flex' : 'none'; }
  if (notice) { notice.style.display = ct > 0 ? 'flex' : 'none'; }
  if (noticeCt) { noticeCt.textContent = ct; }
  if (tblBadge) { tblBadge.textContent = `${ct} pending`; }
}

// SIMULATOR
async function loadReaders() {
  const d = await apiFetch(`${API}/dashboard/readers`);
  const sel = document.getElementById('sim_reader');
  sel.innerHTML = (d.readers || []).map(r => `<option value="${r.reader_code}">${r.reader_code} — ${r.location}</option>`).join('');
}

async function simulateTap() {
  const uid = document.getElementById('sim_uid').value.trim();
  const reader = document.getElementById('sim_reader').value;
  const res = document.getElementById('tapResult');
  if (!uid || !reader) { res.className = 'tap-result show error'; res.textContent = 'Please enter a Card UID and select a reader.'; setScannerState('error-state', 'Missing UID/Reader.'); return; }
  res.className = 'tap-result show'; res.innerHTML = 'Sending tap…';
  
  const d = await apiFetch(`${API}/rfid/tap`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_uid: uid, reader_code: reader })
  });
  
  if (d.success) {
    res.className = 'tap-result show success';
    res.innerHTML = `✅ <strong>${d.message}</strong><br><span style="font-size:12px;opacity:.8">${d.data?.subject} · ${d.data?.section} · ${d.data?.tap_time}</span>`;
    addFeedRow(d.data, uid, reader);
    setScannerState('success', `✅ Tap recorded — ${d.data?.student || uid}`);
  } else {
    res.className = 'tap-result show error'; res.textContent = `⚠️ ${d.message}`;
    setScannerState('error-state', `⚠️ ${d.message}`);
  }
  
  setTimeout(() => { document.getElementById('sim_uid').value = ''; setScannerState('ready', 'Ready to Scan — waiting for card…'); rfidFocusLock(); }, 2200);
}

function addFeedRow(data, uid, reader) {
  feedLog.unshift({ time: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }), student: data?.student || 'Unknown', uid, reader, status: data?.status || 'unknown', subject: data?.subject || '—' });
  document.getElementById('feedCount').textContent = feedLog.length;
  document.getElementById('feedBody').innerHTML = feedLog.slice(0, 20).map(f => `
    <tr>
      <td style="font-size:12px;color:var(--muted)">${f.time}</td>
      <td>${f.student}</td>
      <td><code style="font-size:11px;background:rgba(255,255,255,.06);padding:2px 6px;border-radius:5px">${f.uid}</code></td>
      <td style="font-size:12px;color:var(--muted)">${f.reader}</td>
      <td><span class="status-pill ${f.status}"><span class="status-dot ${f.status}"></span>${f.status}</span></td>
      <td style="font-size:12px;color:var(--muted)">${f.subject}</td>
    </tr>`).join('');
}

let focusLockEnabled = true, scanTimer = null;
const SCAN_TIMEOUT_MS = 80, MIN_UID_LENGTH = 4;
function rfidFocusLock() {
  if (!focusLockEnabled) return;
  const inp = document.getElementById('sim_uid');
  if (inp && document.getElementById('panel-simulator').classList.contains('active')) inp.focus();
}

function setScannerState(state, msg) {
  const bar = document.getElementById('scannerBar');
  const txt = document.getElementById('scannerStatus');
  bar.className = 'rfid-scanner-bar ' + state; txt.textContent = msg;
}

document.addEventListener('keydown', function(e) {
  const simPanel = document.getElementById('panel-simulator');
  if (!simPanel || !simPanel.classList.contains('active')) return;
  const inp = document.getElementById('sim_uid');
  if (e.key === 'Enter') { const uid = inp ? inp.value.trim() : ''; if (uid.length >= MIN_UID_LENGTH) { clearTimeout(scanTimer); finaliseScan(uid); } return; }
  if (focusLockEnabled && inp && document.activeElement !== inp) { if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) inp.focus(); }
});

document.addEventListener('DOMContentLoaded', function() {
  const inp = document.getElementById('sim_uid');
  if (!inp) return;
  inp.addEventListener('input', function() {
    const val = inp.value.trim();
    if (!val) { setScannerState('ready', 'Ready to Scan — waiting for card…'); inp.classList.remove('scanning-active'); return; }
    inp.classList.add('scanning-active'); setScannerState('scanning', `Reading card… "${val}"`);
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { if (val.length >= MIN_UID_LENGTH) finaliseScan(val); }, SCAN_TIMEOUT_MS);
  });
  document.addEventListener('click', function(ev) {
    const simPanel = document.getElementById('panel-simulator');
    if (!simPanel || !simPanel.classList.contains('active') || !focusLockEnabled) return;
    const tag = ev.target.tagName;
    if (tag === 'SELECT' || tag === 'BUTTON' || tag === 'OPTION' || ev.target.id === 'sim_uid') return;
    setTimeout(() => rfidFocusLock(), 120);
  });
});

function finaliseScan(uid) {
  const inp = document.getElementById('sim_uid');
  inp.classList.remove('scanning-active'); setScannerState('scanning', `Card detected: ${uid} — submitting…`);
  setTimeout(simulateTap, 120);
}

// SCHEDULE MANAGER
let schedDropdownsLoaded = false, allSchedules = [], editingScheduleId = null;

async function loadScheduleDropdowns() {
  if (schedDropdownsLoaded) return;
  const subs = await apiFetch(`${API}/schedule/all_subjects`);
  const secs = await apiFetch(`${API}/schedule/all_sections`);
  const facs = await apiFetch(`${API}/schedule/all_instructors`);
  const rdrs = await apiFetch(`${API}/schedule/all_readers`);
  
  fillSelect('f_subject_id', subs.subjects || [], 'subject_id', s => `${s.subject_code} — ${s.subject_name}`);
  fillSelect('f_section_id', secs.sections || [], 'section_id', s => `${s.section_name} (${s.course || ''})`);
  fillSelect('f_faculty_id', facs.instructors || [], 'user_id', f => f.name);
  fillSelect('f_reader_id', rdrs.readers || [], 'reader_id', r => `${r.reader_code} — ${r.location || ''}`);
  schedDropdownsLoaded = true;
}

function fillSelect(id, items, valKey, labelFn) {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">Select…</option>` + items.map(i => `<option value="${i[valKey]}">${labelFn(i)}</option>`).join('');
}

async function loadScheduleList() {
  const d = await apiFetch(`${API}/schedule/list_schedules`);
  allSchedules = d.schedules || [];
  renderScheduleList();
}

function filterSchedules() { renderScheduleList(); }

function renderScheduleList() {
  const q = (document.getElementById('schedSearch') || {}).value?.toLowerCase() || '';
  let list = allSchedules;
  if (q) list = list.filter(s => `${s.subject_name} ${s.subject_code} ${s.section_name} ${s.faculty_name}`.toLowerCase().includes(q));
  const tbody = document.getElementById('schedListBody');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--dim);padding:20px">No schedules found.</td></tr>'; return; }
  tbody.innerHTML = list.map(s => `
    <tr>
      <td><strong style="font-size:12px">${s.subject_code}</strong><br><span style="font-size:11px;color:var(--muted)">${s.subject_name}</span></td>
      <td>${s.section_name}</td>
      <td style="font-size:12px;color:var(--muted)">${s.faculty_name}<br><span style="font-size:10px;color:var(--dim)">${s.department || ''}</span></td>
      <td>${s.day_of_week}${s.is_weekend_session ? '<br><span class="weekend-badge">🌅 Weekend</span>' : ''}</td>
      <td style="font-size:12px">${s.start_time?.slice(0, 5)} – ${s.end_time?.slice(0, 5)}</td>
      <td><code style="font-size:11px;background:rgba(255,255,255,.06);padding:2px 6px;border-radius:5px">${s.reader_code}</code></td>
      <td style="text-align:center">${s.enrolled_count ?? 0}</td>
      <td><span class="badge ${s.is_active ? 'green' : 'red'}">${s.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn-edit" onclick="editSchedule(${s.schedule_id})">✏️</button>
          <button class="btn-deactivate" onclick="deactivateSchedule(${s.schedule_id},'${s.subject_code}')">🗑</button>
        </div>
      </td>
    </tr>`).join('');
}

function editSchedule(schedId) {
  const s = allSchedules.find(x => x.schedule_id === schedId);
  if (!s) return;
  editingScheduleId = schedId;
  document.getElementById('edit_schedule_id').value = schedId;
  document.getElementById('schedFormTitle').textContent = '✏️ Edit Schedule';
  document.getElementById('f_subject_id').value = s.subject_id;
  document.getElementById('f_section_id').value = s.section_id;
  document.getElementById('f_faculty_id').value = s.faculty_id;
  document.getElementById('f_reader_id').value = s.reader_id;
  document.getElementById('f_day_of_week').value = s.day_of_week;
  document.getElementById('f_start_time').value = s.start_time?.slice(0, 5) || '';
  document.getElementById('f_end_time').value = s.end_time?.slice(0, 5) || '';
  document.getElementById('f_late_minutes').value = s.late_minutes || 15;
  document.getElementById('schedFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetSchedForm() {
  editingScheduleId = null;
  document.getElementById('edit_schedule_id').value = '';
  document.getElementById('schedFormTitle').textContent = '➕ Create New Schedule';
  ['f_subject_id', 'f_section_id', 'f_faculty_id', 'f_reader_id', 'f_day_of_week', 'f_start_time', 'f_end_time'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f_late_minutes').value = 15;
  document.getElementById('conflictWarn').classList.remove('show');
  document.getElementById('schedOverrideBtn').style.display = 'none';
  document.getElementById('schedSaveMsg').textContent = '';
}

function getSchedFormBody() {
  return {
    schedule_id: editingScheduleId || undefined,
    subject_id: +document.getElementById('f_subject_id').value || null,
    section_id: +document.getElementById('f_section_id').value || null,
    faculty_id: +document.getElementById('f_faculty_id').value || null,
    reader_id: +document.getElementById('f_reader_id').value || null,
    day_of_week: document.getElementById('f_day_of_week').value,
    start_time: document.getElementById('f_start_time').value,
    end_time: document.getElementById('f_end_time').value,
    late_minutes: +document.getElementById('f_late_minutes').value || 15,
  };
}

async function checkConflicts() {
  const b = getSchedFormBody();
  if (!b.reader_id || !b.day_of_week || !b.start_time || !b.end_time) {
    const w = document.getElementById('conflictWarn');
    w.textContent = '⚠️ Fill in Reader, Day, Start Time, and End Time.'; w.classList.add('show'); return;
  }
  const excl = editingScheduleId ? `&exclude_schedule_id=${editingScheduleId}` : '';
  const d = await apiFetch(`${API}/schedule/conflict_check?reader_id=${b.reader_id}&day=${b.day_of_week}&start_time=${b.start_time}&end_time=${b.end_time}${excl}`);
  
  if (d.has_conflict) {
    document.getElementById('conflictWarn').innerHTML = '⚠️ <strong>Conflict detected.</strong> Use Force Override to proceed.';
    document.getElementById('conflictWarn').classList.add('show');
    document.getElementById('schedOverrideBtn').style.display = 'inline-flex';
  } else {
    document.getElementById('conflictWarn').classList.remove('show');
    document.getElementById('schedOverrideBtn').style.display = 'none';
    document.getElementById('schedSaveMsg').textContent = '✅ No conflicts detected.';
  }
}

async function saveSchedule(forceOverride) {
  const b = getSchedFormBody();
  const req = ['subject_id', 'section_id', 'faculty_id', 'reader_id', 'day_of_week', 'start_time', 'end_time'];
  for (const f of req) { if (!b[f]) { document.getElementById('schedSaveMsg').textContent = `⚠️ Field required.`; return; } }
  
  const action = editingScheduleId ? 'update_schedule' : 'create_schedule';
  const d = await apiFetch(`${API}/schedule/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...b, force_override: forceOverride })
  });
  
  if (d.success) {
    resetSchedForm();
    await loadScheduleList();
  } else if (d.conflict) {
    document.getElementById('conflictWarn').innerHTML = '⚠️ <strong>Conflict detected.</strong> Use Force Override to proceed.';
    document.getElementById('conflictWarn').classList.add('show');
    document.getElementById('schedOverrideBtn').style.display = 'inline-flex';
  } else {
    document.getElementById('schedSaveMsg').textContent = `❌ ${d.message}`;
  }
}

async function deactivateSchedule(schedId, code) {
  if (!confirm(`Deactivate schedule for "${code}"?`)) return;
  const d = await apiFetch(`${API}/schedule/delete_schedule`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schedule_id: schedId })
  });
  if (d.success) await loadScheduleList(); else alert(`Error: ${d.message}`);
}

// INSTRUCTORS
let allInstructors = [];
async function loadInstructors() {
  const q = document.getElementById('instructorSearch').value || '';
  const d = await apiFetch(`${API}/schedule/list_instructors?search=${encodeURIComponent(q)}`);
  allInstructors = d.instructors || [];
  renderInstructors(allInstructors);
  
  const facD = await apiFetch(`${API}/schedule/all_instructors`);
  const sel = document.getElementById('m_user_id');
  sel.innerHTML = '<option value="">— None / Standalone —</option>' + (facD.instructors || []).map(f => `<option value="${f.user_id}">${f.name} (${f.user_id})</option>`).join('');
}

function filterInstructors() {
  const q = document.getElementById('instructorSearch').value.toLowerCase();
  renderInstructors(allInstructors.filter(i => `${i.full_name} ${i.instructor_code} ${i.department} ${i.email || ''}`.toLowerCase().includes(q)));
}

function renderInstructors(list) {
  const grid = document.getElementById('instructorGrid');
  if (!list.length) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--dim);padding:40px">No instructors found.</div>'; return; }
  grid.innerHTML = list.map(i => {
    const initials = i.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const rfidHtml = i.rfid_uid ? `<span class="rfid-chip assigned">📡 ${i.rfid_uid}</span>` : `<span class="rfid-chip unassigned">⚠️ No RFID Assigned</span>`;
    return `
    <div class="instructor-card ${i.is_active ? '' : 'inactive'}">
      <div class="instructor-header">
        <div class="instructor-avatar">${initials}</div>
        <div>
          <div class="instructor-name">${i.full_name}</div>
          <div class="instructor-code">${i.instructor_code} · ${i.active_schedules || 0} schedules</div>
        </div>
      </div>
      <div class="instructor-meta">
        <div class="instructor-meta-item"><span class="instructor-meta-label">Dept</span><span class="instructor-meta-value">${i.department || '—'}</span></div>
        <div class="instructor-meta-item"><span class="instructor-meta-label">Email</span><span class="instructor-meta-value" style="font-size:11px">${i.email || '—'}</span></div>
      </div>
      <div style="margin-bottom:10px">${rfidHtml}</div>
      <div class="instructor-actions">
        <button class="btn-edit" onclick="openInstructorModal(${i.instructor_id})">✏️ Edit</button>
      </div>
    </div>`;
  }).join('');
}

function openInstructorModal(instructorId) {
  const modal = document.getElementById('instructorModal');
  if (instructorId) {
    const inst = allInstructors.find(i => i.instructor_id === instructorId);
    if (!inst) return;
    document.getElementById('instructorModalTitle').textContent = '✏️ Edit Instructor';
    document.getElementById('m_instructor_id').value = inst.instructor_id;
    document.getElementById('m_full_name').value = inst.full_name;
    document.getElementById('m_department').value = inst.department;
    document.getElementById('m_specialization').value = inst.specialization || '';
    document.getElementById('m_email').value = inst.email || '';
    document.getElementById('m_contact_no').value = inst.contact_no || '';
    document.getElementById('m_rfid_uid').value = inst.rfid_uid || '';
    document.getElementById('m_user_id').value = inst.user_id || '';
  } else {
    document.getElementById('instructorModalTitle').textContent = '➕ Add New Instructor';
    ['m_instructor_id', 'm_full_name', 'm_specialization', 'm_email', 'm_contact_no', 'm_rfid_uid', 'm_user_id'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('m_department').value = 'College of Teacher Education';
  }
  modal.classList.add('show');
}

function closeInstructorModal() { document.getElementById('instructorModal').classList.remove('show'); }

async function saveInstructor() {
  const iid = document.getElementById('m_instructor_id').value;
  const name = document.getElementById('m_full_name').value.trim();
  const dept = document.getElementById('m_department').value.trim();
  if (!name || !dept) { alert('Full Name and Department are required.'); return; }
  
  const payload = {
    full_name: name, department: dept, specialization: document.getElementById('m_specialization').value.trim() || null,
    email: document.getElementById('m_email').value.trim() || null, contact_no: document.getElementById('m_contact_no').value.trim() || null,
    rfid_uid: document.getElementById('m_rfid_uid').value.trim() || null, user_id: +document.getElementById('m_user_id').value || null,
  };
  
  const action = iid ? 'update_instructor' : 'create_instructor';
  if (iid) payload.instructor_id = +iid;
  
  const d = await apiFetch(`${API}/schedule/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  
  if (d.success) { closeInstructorModal(); await loadInstructors(); }
  else alert(`Error: ${d.message}`);
}

// LIVE SESSIONS
let livePollingTimer = null, selectedSessionId = null;

function startLivePolling() {
  if (livePollingTimer) clearInterval(livePollingTimer);
  livePollingTimer = setInterval(() => {
    if (document.getElementById('panel-live').classList.contains('active')) {
      loadLiveSessions(false);
      if (selectedSessionId) loadBootStudents(false);
    }
  }, 5000);
}

async function loadLiveSessions(showLoading = true) {
  if (showLoading) document.getElementById('sessionsGrid').innerHTML = '<div class="empty-sessions">Loading…</div>';
  const d = await apiFetch(`${API}/schedule/live_sessions`);
  const grid = document.getElementById('sessionsGrid');
  const sessions = d.sessions || [];
  if (!sessions.length) { grid.innerHTML = '<div class="empty-sessions"><span class="icon">📭</span>No sessions today yet.</div>'; return; }
  grid.innerHTML = sessions.map(s => `
    <div class="session-card ${s.status} ${selectedSessionId === s.session_id ? 'selected' : ''}" onclick="selectSession(${s.session_id},this)">
      <div class="session-card-subject">${s.subject_code} — ${s.subject_name}</div>
      <div class="session-card-meta">${s.section_name} · ${s.room_location || s.reader_code}</div>
      <div class="session-card-meta">${s.faculty_name}</div>
      <div class="session-card-stats">
        <div class="session-stat"><span class="session-stat-val" style="color:var(--green)">${s.tapped_count}</span><span class="session-stat-lbl">Tapped</span></div>
        <div class="session-stat"><span class="session-stat-val"><span class="badge ${s.status === 'open' ? 'open' : 'closed'}">${s.status}</span></span><span class="session-stat-lbl">Status</span></div>
      </div>
    </div>`).join('');
}

function selectSession(sessionId, cardEl) {
  selectedSessionId = sessionId;
  document.querySelectorAll('.session-card').forEach(c => c.classList.remove('selected'));
  cardEl.classList.add('selected');
  document.getElementById('bootPanelWrap').style.display = 'block';
  document.getElementById('bootPanelTitle').textContent = `Session: ${cardEl.querySelector('.session-card-subject').textContent}`;
  loadBootStudents();
}

async function loadBootStudents(showLoading = true) {
  if (!selectedSessionId) return;
  if (showLoading) document.getElementById('bootStudentList').innerHTML = '<p style="text-align:center;color:var(--dim);padding:16px">Loading students…</p>';
  const d = await apiFetch(`${API}/schedule/session_students?session_id=${selectedSessionId}`);
  const list = document.getElementById('bootStudentList');
  const students = d.students || [];
  if (!students.length) { list.innerHTML = '<p style="text-align:center;color:var(--dim);padding:20px">No students tapped in yet.</p>'; return; }
  list.innerHTML = students.map(s => `
    <div class="boot-student-row ${s.is_booted ? 'booted' : ''}">
      <div class="boot-student-info">
        <span class="boot-student-name">${s.full_name}</span>
        <span class="boot-student-id">${s.student_id} · <span class="status-pill ${s.status}"><span class="status-dot ${s.status}"></span>${s.status}</span></span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${s.is_booted ? '<span class="badge red">Booted</span>' : `<input class="boot-reason-input" id="reason-${s.user_id}" placeholder="Reason…"/><button class="btn-boot" onclick="bootUser(${s.user_id},'${s.full_name}')">🚫 Boot</button>`}
      </div>
    </div>`).join('');
}

async function bootUser(userId, name) {
  if (!selectedSessionId) return;
  const reason = document.getElementById(`reason-${userId}`)?.value || 'Removed by admin';
  if (!confirm(`Boot "${name}"?`)) return;
  const d = await apiFetch(`${API}/schedule/boot_user`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: selectedSessionId, user_id: userId, reason })
  });
  if (d.success) loadBootStudents(); else alert(`Error: ${d.message}`);
}

async function closeSession() {
  if (!selectedSessionId) return;
  if (!confirm('Close this entire session?')) return;
  const d = await apiFetch(`${API}/schedule/close_session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: selectedSessionId })
  });
  if (d.success) { await loadLiveSessions(); document.getElementById('bootPanelWrap').style.display = 'none'; selectedSessionId = null; }
  else alert(`Error: ${d.message}`);
}

// AUDIT
async function loadAudit() {
  const d = await apiFetch(`${API}/dashboard/audit`);
  const tbody = document.getElementById('auditBody');
  if (!d.logs?.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim);padding:20px">No audit entries.</td></tr>'; return; }
  tbody.innerHTML = d.logs.map(l => `
    <tr>
      <td style="font-size:12px;color:var(--muted)">${fmtTime(l.created_at)}</td>
      <td>${l.user_name || 'System'}</td>
      <td><span class="badge ${actionBadge(l.action)}">${l.action}</span></td>
      <td style="font-size:12px;color:var(--muted)">${l.table_name || '—'}</td>
      <td style="font-size:11px;color:var(--dim)">${l.ip_address || '—'}</td>
    </tr>`).join('');
}

function actionBadge(a) {
  if (a.includes('login')) return 'green';
  if (a.includes('tap')) return 'blue';
  if (a.includes('delete') || a.includes('boot') || a.includes('close')) return 'red';
  if (a.includes('create') || a.includes('update') || a.includes('assign')) return 'amber';
  return 'purple';
}

function logout() {
  fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }).then(() => location.href = 'index.html');
}
