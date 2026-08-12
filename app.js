/* StarFit — workout log PWA (local-first) */
'use strict';

const APP_VERSION = '1.1.2';
const STORE_KEY = 'starfit-v1';

/* ============ Data helpers ============ */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const parseISO = (s) => new Date(s + 'T12:00:00');
const weekdayLat = (d) =>
  ['Svētdiena', 'Pirmdiena', 'Otrdiena', 'Trešdiena', 'Ceturtdiena', 'Piektdiena', 'Sestdiena'][d.getDay()];
const monthLat = (d) =>
  ['Janvāris', 'Februāris', 'Marts', 'Aprīlis', 'Maijs', 'Jūnijs', 'Jūlijs', 'Augusts', 'Septembris', 'Oktobris', 'Novembris', 'Decembris'][d.getMonth()];
const monthLatGen = (d) =>
  ['janvāra', 'februāra', 'marta', 'aprīļa', 'maija', 'jūnija', 'jūlija', 'augusta', 'septembra', 'oktobra', 'novembra', 'decembra'][d.getMonth()];
const fmtDateLong = (d) => `${weekdayLat(d)}, ${d.getDate()}. ${monthLatGen(d)} ${d.getFullYear()}`;
const fmtShort = (iso) => {
  const d = parseISO(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ============ Seed data ============ */
const DEFAULT_CATEGORIES = [
  { id: 'kaj', name: 'Kājas', color: '#fbbf24' },
  { id: 'kru', name: 'Krūtis', color: '#a78bfa' },
  { id: 'mug', name: 'Mugura', color: '#34d399' },
  { id: 'ple', name: 'Pleci', color: '#fb923c' },
  { id: 'rok', name: 'Rokas', color: '#f87171' },
  { id: 'pre', name: 'Prese', color: '#60a5fa' },
  { id: 'for', name: 'Forearms', color: '#c084fc' },
  { id: 'kar', name: 'Kardio', color: '#22d3ee' },
  { id: 'cit', name: 'Cits', color: '#9aa0b8' }
];

const DEFAULT_EXERCISES = [
  ['Squat', 'kaj'], ['Leg Press', 'kaj'], ['Hanteles Krutis Flat', 'kru'],
  ['Bench press', 'kru'], ['Incline bench press', 'kru'], ['Incline Dumbell 30°', 'kru'],
  ['Deadlift', 'mug'], ['Lat Pulldowns', 'mug'], ['Pully', 'mug'],
  ['Face pulls', 'mug'], ['Military Press', 'ple'],
  ['Shoulder press hanteles', 'ple'], ['Biceps Ar Līko stieni', 'rok'],
  ['Triceps Push Down', 'rok'], ['Prese Līdztekās', 'pre']
];

/* FitNotes export name → preferred StarFit name (optional aliases) */
const EXERCISE_ALIASES = {
  'bench press': 'Bench press',
  'lat pulldown': 'Lat Pulldowns',
  'lat pulldowns': 'Lat Pulldowns',
  'face pull': 'Face pulls',
  'face pulls': 'Face pulls',
  'pully (kabeļu rinda)': 'Pully',
  'pully': 'Pully',
  'triceps pushdown': 'Triceps Push Down',
  'triceps push down': 'Triceps Push Down',
  'biceps ar līko stieni': 'Biceps Ar Līko stieni',
  'shoulder press (hanteles)': 'Shoulder press hanteles',
  'pec fly': 'Pectoral fly (Imanta)',
  'incline bench press': 'Incline bench press'
};

const CAT_COLORS = {
  'kājas': '#fbbf24', 'krūtis': '#a78bfa', 'mugura': '#34d399',
  'pleci': '#fb923c', 'rokas': '#f87171', 'prese': '#60a5fa',
  'forearms': '#c084fc', 'kardio': '#22d3ee', 'cits': '#9aa0b8'
};

/* ============ State ============ */
let db = loadDB();
let state = {
  view: 'today',
  selDate: new Date(), // selected date (day strip + calendar)
  calMonth: new Date(),
  calSelected: null, // iso
  exCat: null,
  exSearch: '',
  logger: null, // { exerciseId, tab }
  rest: { t: 0, iv: null },
  lastSave: null
};

function loadDB() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.version === 1 && Array.isArray(d.exercises)) return d;
    }
  } catch (e) { /* corrupt */ }
  const d = {
    version: 1,
    settings: { unit: 'kg', restSeconds: 90, timerOn: true, locale: 'lv' },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    exercises: DEFAULT_EXERCISES.map(([name, cat]) => ({ id: uid(), name, categoryId: cat, type: 'resistance' })),
    workouts: {}
  };
  saveDB(d);
  return d;
}

function saveDB(d = db) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
  } catch (e) {
    toast('⚠ Krātuve pilna — dati nesaglabājās');
  }
}

const catById = (id) => db.categories.find((c) => c.id === id) || { name: '?', color: '#9aa0b8' };
const exById = (id) => db.exercises.find((e) => e.id === id);
const workoutOf = (iso) => db.workouts[iso] || null;

function ensureWorkout(iso) {
  if (!db.workouts[iso]) db.workouts[iso] = { exercises: [] };
  return db.workouts[iso];
}
function addSetToWorkout(iso, exerciseId, weight, reps, note) {
  const w = ensureWorkout(iso);
  let entry = w.exercises.find((e) => e.exerciseId === exerciseId);
  if (!entry) {
    entry = { exerciseId, order: w.exercises.length, sets: [] };
    w.exercises.push(entry);
  }
  entry.sets.push({ weight, reps, note: note || '', ts: Date.now() });
  saveDB();
}

function dayTotalVolume(iso) {
  const w = workoutOf(iso);
  if (!w) return 0;
  let vol = 0;
  w.exercises.forEach((e) => e.sets.forEach((s) => { vol += (s.weight || 0) * (s.reps || 0); }));
  return vol;
}

function allSetDates(exerciseId) {
  return Object.keys(db.workouts)
    .filter((iso) => db.workouts[iso].exercises.some((e) => e.exerciseId === exerciseId))
    .sort();
}
function allSetsFor(exerciseId) {
  const out = [];
  Object.keys(db.workouts).forEach((iso) => {
    const w = db.workouts[iso];
    w.exercises.forEach((e) => {
      if (e.exerciseId === exerciseId) {
        e.sets.forEach((s, i) => out.push({ iso, ...s, setIndex: i + 1 }));
      }
    });
  });
  out.sort((a, b) => (a.iso === b.iso ? a.ts - b.ts : a.iso < b.iso ? -1 : 1));
  return out;
}
function epley1RM(weight, reps) {
  if (!weight || weight <= 0) return 0;
  if (!reps || reps <= 0) return weight;
  return weight * (1 + reps / 30);
}
function setBest1RM(exerciseId) {
  let best = 0;
  allSetsFor(exerciseId).forEach((s) => { best = Math.max(best, epley1RM(s.weight, s.reps)); });
  return best;
}
function exerciseTotalVolume(exerciseId) {
  return allSetsFor(exerciseId).reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0);
}
function totalWorkouts() { return Object.keys(db.workouts).length; }
function totalSets() {
  let n = 0;
  Object.values(db.workouts).forEach((w) => w.exercises.forEach((e) => { n += e.sets.length; }));
  return n;
}
function totalVolume() {
  let v = 0;
  Object.values(db.workouts).forEach((w) => w.exercises.forEach((e) => e.sets.forEach((s) => { v += (s.weight || 0) * (s.reps || 0); })));
  return v;
}

/* ============ DOM refs ============ */
const $ = (id) => document.getElementById(id);
const els = {
  topSubtitle: $('topSubtitle'),
  dayStrip: $('dayStrip'),
  dayLabel: $('dayLabel'),
  dayPrev: $('dayPrev'),
  dayNext: $('dayNext'),
  todayContent: $('todayContent'),
  calMonthTitle: $('calMonthTitle'),
  calWeekdays: $('calWeekdays'),
  calGrid: $('calGrid'),
  calTotal: $('calTotal'),
  calLegend: $('calLegend'),
  calPrev: $('calPrev'),
  calNext: $('calNext'),
  exSearch: $('exSearch'),
  exBrowser: $('exBrowser'),
  statsContent: $('statsContent'),
  toast: $('toast'),
  modalBackdrop: $('modalBackdrop'),
  modal: $('modal'),
  modalTitle: $('modalTitle'),
  modalBody: $('modalBody'),
  modalFoot: $('modalFoot'),
  modalClose: $('modalClose'),
  loggerSheet: $('loggerSheet'),
  loggerTitle: $('loggerTitle'),
  loggerMeta: $('loggerMeta'),
  loggerBody: $('loggerBody'),
  loggerBack: $('loggerBack'),
  restOverlay: $('restOverlay'),
  restTime: $('restTime'),
  restMinus: $('restMinus'),
  restSkip: $('restSkip'),
  restPlus: $('restPlus')
};

/* ============ Navigation ============ */
function switchView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== view));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.nav === view));
  const subs = { today: 'Šodien', calendar: 'Kalendārs', exercises: 'Vingrinājumi', stats: 'Progress' };
  els.topSubtitle.textContent = subs[view] || '';
  // Day strip only on Log; frees vertical space for calendar fit-on-screen
  if (els.dayStrip) els.dayStrip.classList.toggle('hidden', view !== 'today');
  document.body.dataset.view = view;
  if (view === 'calendar') { if (!state.calSelected) state.calSelected = toISO(state.selDate); renderCalendar(); }
  if (view === 'exercises') { els.exSearch.value = state.exSearch; renderExerciseBrowser(); }
  if (view === 'stats') renderStats();
  if (view === 'today') renderToday();
}

function openModal(title, bodyHTML, footHTML) {
  els.modalTitle.innerHTML = title;
  els.modalBody.innerHTML = bodyHTML;
  els.modalFoot.innerHTML = footHTML || '';
  els.modalBackdrop.classList.remove('hidden');
}
function closeModal() {
  els.modalBackdrop.classList.add('hidden');
  els.modalBody.innerHTML = '';
  els.modalFoot.innerHTML = '';
}
function toast(msg, ms = 1600) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.add('hidden'), ms);
}

/* ============ TODAY view ============ */
function todayISO() { return toISO(state.selDate); }
function isTodaySel() { return toISO(state.selDate) === toISO(new Date()); }

function renderToday() {
  const iso = todayISO();
  els.dayLabel.textContent = isTodaySel() ? 'TODAY' : fmtShort(iso).toUpperCase();
  els.dayStrip.dataset.date = iso;
  const w = workoutOf(iso);
  const has = w && w.exercises.length > 0;

  if (!has) {
    els.todayContent.innerHTML = `
      <div class="empty">
        <p class="empty-title">Workout Log Empty</p>
        <div class="empty-actions">
          <button type="button" class="empty-cta" id="startNewBtn">
            <span class="big">＋</span><span>Start New Workout</span>
          </button>
          <button type="button" class="empty-cta" id="copyPrevBtn">
            <span class="big">⧉</span><span>Copy Previous Workout</span>
          </button>
        </div>
      </div>`;
    $('startNewBtn').addEventListener('click', () => pickExercise());
    $('copyPrevBtn').addEventListener('click', copyPreviousWorkout);
    return;
  }

  const cards = w.exercises.map((entry, ei) => {
    const ex = exById(entry.exerciseId);
    const cat = ex ? catById(ex.categoryId) : { name: '', color: '#9aa0b8' };
    const rows = entry.sets.map((s, si) => `
      <div class="set-row">
        <span class="set-n">${si + 1}</span>
        <span class="set-w">${fmtW(s.weight)} ${db.settings.unit}</span>
        <span class="set-r">${s.reps} reps</span>
        <button type="button" class="set-del" data-ex="${entry.exerciseId}" data-set="${si}" aria-label="Dzēst setu">✕</button>
      </div>`).join('');
    return `
      <div class="ex-card" data-ei="${ei}">
        <div class="ex-card-head" data-open="${entry.exerciseId}">
          <span class="ex-dot" style="background:${cat.color}; color:${cat.color}"></span>
          <h3>${esc(ex ? ex.name : '?')}</h3>
          <span class="chev">›</span>
        </div>
        <div class="sets-list">${rows}</div>
        <div class="ex-card-foot">
          <button type="button" class="btn secondary sm" data-add="${entry.exerciseId}">＋ Set</button>
          <button type="button" class="btn ghost sm" data-open2="${entry.exerciseId}">Atvērt</button>
        </div>
      </div>`;
  }).join('');

  const vol = dayTotalVolume(iso);
  els.todayContent.innerHTML = `
    <div class="volume-chip">Kopējais apjoms: <b>${fmtW(vol)} ${db.settings.unit}</b> · ${w.exercises.reduce((a, e) => a + e.sets.length, 0)} seti</div>
    ${cards}
    <div class="fab-row">
      <button type="button" class="btn primary block" id="addExBtn">＋ Pievienot vingrinājumu</button>
    </div>`;

  els.todayContent.querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', () => openLogger(el.dataset.open)));
  els.todayContent.querySelectorAll('[data-open2]').forEach((el) =>
    el.addEventListener('click', () => openLogger(el.dataset.open2)));
  els.todayContent.querySelectorAll('[data-add]').forEach((el) =>
    el.addEventListener('click', () => openLogger(el.dataset.add, true)));
  els.todayContent.querySelectorAll('[data-set]').forEach((el) =>
    el.addEventListener('click', (e) => { e.stopPropagation(); deleteSet(el.dataset.ex, Number(el.dataset.set)); }));
  $('addExBtn').addEventListener('click', () => pickExercise());
}

function fmtW(n) {
  if (n == null) return '0';
  return String(Number(n) % 1 === 0 ? Number(n) : Number(n).toFixed(1));
}

function deleteSet(exerciseId, idx) {
  const iso = todayISO();
  const w = workoutOf(iso);
  if (!w) return;
  const entry = w.exercises.find((e) => e.exerciseId === exerciseId);
  if (!entry) return;
  entry.sets.splice(idx, 1);
  if (entry.sets.length === 0) {
    w.exercises = w.exercises.filter((e) => e.exerciseId !== exerciseId);
  }
  if (w.exercises.length === 0) delete db.workouts[iso];
  saveDB();
  renderToday();
}

function copyPreviousWorkout() {
  const prevDays = Object.keys(db.workouts).filter((iso) => iso < todayISO()).sort().reverse();
  if (prevDays.length === 0) { toast('Nav iepriekšēja treniņa'); return; }
  const src = db.workouts[prevDays[0]];
  if (!src || src.exercises.length === 0) { toast('Nav iepriekšēja treniņa'); return; }
  const target = ensureWorkout(todayISO());
  const names = [];
  src.exercises.forEach((entry) => {
    if (target.exercises.some((e) => e.exerciseId === entry.exerciseId)) return;
    const ex = exById(entry.exerciseId);
    if (!ex) return;
    target.exercises.push({
      exerciseId: entry.exerciseId,
      order: target.exercises.length,
      sets: entry.sets.map((s) => ({ ...s, ts: Date.now() }))
    });
    names.push(ex.name);
  });
  saveDB();
  renderToday();
  if (names.length) toast(`Kopēts: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`);
  else toast('Viss jau ir šodien');
}

/* ============ Exercise picker (modal) ============ */
function pickExercise() {
  const groups = {};
  db.categories.forEach((c) => { groups[c.id] = []; });
  db.exercises.forEach((e) => {
    (groups[e.categoryId] || (groups[e.categoryId] = [])).push(e);
  });
  const already = new Set((workoutOf(todayISO()) || { exercises: [] }).exercises.map((e) => e.exerciseId));
  const body = db.categories.map((c) => {
    const exs = groups[c.id] || [];
    if (!exs.length) return '';
    const items = exs.map((e) => `
      <button type="button" class="list-row" data-pick="${e.id}">
        <span class="ex-dot" style="background:${c.color}; color:${c.color}"></span>
        <span class="grow">${esc(e.name)}</span>
        ${already.has(e.id) ? '<span class="meta">✓</span>' : ''}
      </button>`).join('');
    return `<div class="section-title">${esc(c.name)}</div><div class="ex-list">${items}</div>`;
  }).join('');
  openModal('Pievienot vingrinājumu', `<div class="ex-list">${body || '<p class="note">Nav vingrinājumu.</p>'}</div>`);
  els.modalBody.querySelectorAll('[data-pick]').forEach((el) =>
    el.addEventListener('click', () => {
      const exId = el.dataset.pick;
      const iso = todayISO();
      const w = ensureWorkout(iso);
      if (!w.exercises.some((e) => e.exerciseId === exId)) {
        w.exercises.push({ exerciseId: exId, order: w.exercises.length, sets: [] });
        saveDB();
      }
      closeModal();
      renderToday();
      openLogger(exId, true);
    }));
}

/* ============ Logger ============ */
function openLogger(exerciseId, focusTrack = false) {
  const ex = exById(exerciseId);
  if (!ex) return;
  state.logger = { exerciseId, tab: focusTrack ? 'track' : 'history' };
  els.loggerSheet.classList.remove('hidden');
  els.loggerTitle.textContent = ex.name;
  const cat = catById(ex.categoryId);
  const sets = allSetsFor(exerciseId);
  const best = setBest1RM(exerciseId);
  els.loggerMeta.textContent = `${cat.name} · ${sets.length} seti · 1RM ${fmtW(best)} kg`;
  renderLoggerTab();
}

function closeLogger() {
  els.loggerSheet.classList.add('hidden');
  state.logger = null;
}

function renderLoggerTab() {
  const lg = state.logger;
  if (!lg) return;
  document.querySelectorAll('.ltab').forEach((t) => t.classList.toggle('active', t.dataset.ltab === lg.tab));
  if (lg.tab === 'track') renderTrack();
  else if (lg.tab === 'history') renderHistory();
  else renderGraph();
}

function renderTrack() {
  const lg = state.logger;
  const sets = allSetsFor(lg.exerciseId);
  const w = workoutOf(todayISO());
  const todayEntry = w ? w.exercises.find((e) => e.exerciseId === lg.exerciseId) : null;
  const last = sets.length ? sets[sets.length - 1] : null;
  const weight = last ? fmtW(last.weight) : '';
  const reps = last ? String(last.reps) : '';
  els.loggerBody.innerHTML = `
    <div class="stepper-block">
      <label>SVARS (${db.settings.unit})</label>
      <div class="stepper">
        <button type="button" id="wMinus">−</button>
        <input id="wInput" type="number" inputmode="decimal" step="0.5" min="0" placeholder="0" value="${esc(weight)}">
        <button type="button" id="wPlus">＋</button>
      </div>
    </div>
    <div class="stepper-block">
      <label>ATKĀRTOJUMI</label>
      <div class="stepper">
        <button type="button" id="rMinus">−</button>
        <input id="rInput" type="number" inputmode="numeric" step="1" min="0" placeholder="0" value="${esc(reps)}">
        <button type="button" id="rPlus">＋</button>
      </div>
    </div>
    <div class="track-actions">
      <button type="button" class="btn primary" id="saveSetBtn">SAVE</button>
      <button type="button" class="btn secondary" id="clearBtn">CLEAR</button>
    </div>
    <div class="saved-sets" id="savedSets">
      ${sets.length ? sets.map((s, i) => `
        <div class="set-row">
          <span class="set-n">${i + 1}</span>
          <span class="set-w">${fmtW(s.weight)} ${db.settings.unit}</span>
          <span class="set-r">${s.reps} reps</span>
          <span class="set-del" data-del="${s.iso}|${s.setIndex - 1}" title="Dzēst">✕</span>
        </div>`).join('') : '<p class="note">Nav saglabātu setu.</p>'}
    </div>`;

  const wInput = $('wInput'), rInput = $('rInput');
  const bump = (input, delta) => {
    const v = parseFloat(input.value) || 0;
    input.value = fmtW(Math.max(0, Math.round((v + delta) * 10) / 10));
  };
  $('wMinus').addEventListener('click', () => bump(wInput, -2.5));
  $('wPlus').addEventListener('click', () => bump(wInput, 2.5));
  $('rMinus').addEventListener('click', () => bump(rInput, -1));
  $('rPlus').addEventListener('click', () => bump(rInput, 1));
  $('clearBtn').addEventListener('click', () => { wInput.value = ''; rInput.value = ''; });
  $('saveSetBtn').addEventListener('click', () => {
    const weight = parseFloat(wInput.value);
    const reps = parseInt(rInput.value, 10);
    if (!(weight >= 0) || !(reps >= 1)) { toast('Ievadi svaru un atkārtojumus'); return; }
    const iso = todayISO();
    const entry = ensureWorkout(iso).exercises.find((e) => e.exerciseId === lg.exerciseId);
    const had = entry && entry.sets.length > 0;
    addSetToWorkout(iso, lg.exerciseId, weight, reps, '');
    saveDB();
    toast('Training saved');
    renderTrack();
    renderToday();
    if (db.settings.timerOn && db.settings.restSeconds > 0 && had) startRest(db.settings.restSeconds);
  });
  els.loggerBody.querySelectorAll('[data-del]').forEach((el) =>
    el.addEventListener('click', () => {
      const [iso, idx] = el.dataset.del.split('|');
      const w = workoutOf(iso);
      if (!w) return;
      const entry = w.exercises.find((e) => e.exerciseId === lg.exerciseId);
      if (!entry) return;
      entry.sets.splice(Number(idx), 1);
      if (entry.sets.length === 0) {
        w.exercises = w.exercises.filter((e) => e.exerciseId !== lg.exerciseId);
      }
      if (w.exercises.length === 0) delete db.workouts[iso];
      saveDB();
      renderTrack();
      renderToday();
    }));
}

function renderHistory() {
  const lg = state.logger;
  const sets = allSetsFor(lg.exerciseId);
  if (!sets.length) {
    els.loggerBody.innerHTML = '<p class="note">Nav vēstures.</p>';
    return;
  }
  const byDay = {};
  sets.forEach((s) => { (byDay[s.iso] = byDay[s.iso] || []).push(s); });
  const days = Object.keys(byDay).sort().reverse();
  els.loggerBody.innerHTML = days.map((iso) => `
    <div class="hist-day">
      <h4>${weekdayLat(parseISO(iso)).toUpperCase()}, ${fmtShort(iso)}</h4>
      ${byDay[iso].map((s) => `
        <div class="set-row">
          <span class="set-n">${s.setIndex}</span>
          <span class="set-w">${fmtW(s.weight)} ${db.settings.unit}</span>
          <span class="set-r">${s.reps} reps</span>
        </div>`).join('')}
    </div>`).join('');
}

function renderGraph() {
  const lg = state.logger;
  const sets = allSetsFor(lg.exerciseId);
  if (!sets.length) {
    els.loggerBody.innerHTML = '<p class="note">Nav datu grafikam.</p>';
    return;
  }
  els.loggerBody.innerHTML = `
    <div class="graph-controls">
      <select id="gMetric" class="select">
        <option value="1rm">Estimated 1RM</option>
        <option value="maxw">Max Weight</option>
        <option value="vol">Volume</option>
        <option value="reps">Max Reps</option>
      </select>
      <select id="gRange" class="select">
        <option value="all">All time</option>
        <option value="1m">1 month</option>
        <option value="3m">3 months</option>
        <option value="1y">1 year</option>
      </select>
    </div>
    <div class="graph-wrap">
      <canvas id="gCanvas"></canvas>
    </div>
    <p class="graph-hint">Tap a point on the graph to view more details</p>`;

  const metric = $('gMetric').value;
  const range = $('gRange').value;
  $('gMetric').addEventListener('change', renderGraph);
  $('gRange').addEventListener('change', renderGraph);
  drawGraph(sets, metric, range);
}

function drawGraph(sets, metric, range) {
  const cv = $('gCanvas');
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || 300;
  const H = 240;
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.height = H + 'px';
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  let data = sets.map((s) => {
    const val = metric === '1rm' ? epley1RM(s.weight, s.reps)
      : metric === 'maxw' ? (s.weight || 0)
      : metric === 'vol' ? (s.weight || 0) * (s.reps || 0)
      : (s.reps || 0);
    return { x: parseISO(s.iso).getTime(), y: val, iso: s.iso, w: s.weight, r: s.reps };
  });

  if (range !== 'all') {
    const months = { '1m': 1, '3m': 3, '1y': 12 }[range];
    const cutoff = Date.now() - months * 30 * 864e5;
    data = data.filter((d) => d.x >= cutoff);
  }
  if (data.length === 0) {
    ctx.fillStyle = '#9aa0b8';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nav datu šajā periodā', W / 2, H / 2);
    return;
  }

  const minX = Math.min(...data.map((d) => d.x));
  const maxX = Math.max(...data.map((d) => d.x));
  const vals = data.map((d) => d.y);
  let minY = Math.min(...vals, 0);
  let maxY = Math.max(...vals);
  const padY = (maxY - minY) * 0.15 || 1;
  minY = Math.max(0, minY - padY);
  maxY = maxY + padY;

  const px = (x) => 40 + ((x - minX) / (maxX - minX || 1)) * (W - 52);
  const py = (y) => H - 28 - ((y - minY) / (maxY - minY || 1)) * (H - 52);

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.fillStyle = '#6b728a';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = 28 + (i * (H - 52)) / 4;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(W - 12, y);
    ctx.stroke();
    const val = minY + ((4 - i) / 4) * (maxY - minY);
    ctx.fillText(fmtW(val), 34, y + 3);
  }

  // area
  ctx.beginPath();
  ctx.moveTo(px(data[0].x), H - 28);
  data.forEach((d) => ctx.lineTo(px(d.x), py(d.y)));
  ctx.lineTo(px(data[data.length - 1].x), H - 28);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(167,139,250,0.35)');
  grad.addColorStop(1, 'rgba(34,211,238,0.03)');
  ctx.fillStyle = grad;
  ctx.fill();

  // line
  ctx.beginPath();
  data.forEach((d, i) => (i ? ctx.lineTo(px(d.x), py(d.y)) : ctx.moveTo(px(d.x), py(d.y))));
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(167,139,250,0.55)';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // points
  data.forEach((d) => {
    ctx.beginPath();
    ctx.arc(px(d.x), py(d.y), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#e879f9';
    ctx.fill();
  });

  // x labels
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6b728a';
  const step = Math.max(1, Math.floor(data.length / 4));
  for (let i = 0; i < data.length; i += step) {
    const d = data[i];
    const dt = new Date(d.x);
    const label = `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${String(dt.getFullYear()).slice(2)}`;
    let lx = px(d.x);
    const lw = ctx.measureText(label).width;
    lx = Math.min(Math.max(lx, lw / 2 + 40), W - lw / 2 - 6);
    ctx.fillText(label, lx, H - 10);
  }
}

/* ============ Calendar ============ */
function dotsFor(iso) {
  const w = workoutOf(iso);
  if (!w) return [];
  const colors = new Set();
  w.exercises.forEach((e) => {
    const ex = exById(e.exerciseId);
    if (ex) colors.add(catById(ex.categoryId).color);
  });
  return [...colors].slice(0, 3);
}

function renderCalendar() {
  const m = state.calMonth;
  els.calMonthTitle.textContent = `${monthLat(m)} ${m.getFullYear()}`;
  els.calWeekdays.innerHTML = ['P', 'O', 'T', 'C', 'Pk', 'S', 'Sv'].map((w) => `<div>${w}</div>`).join('');
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const startDow = (first.getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const todayIso = toISO(new Date());
  let html = '';
  for (let i = 0; i < startDow; i++) html += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(d)}`;
    const dots = dotsFor(iso);
    const cls = ['cal-cell'];
    if (dots.length) cls.push('has');
    if (iso === todayIso) cls.push('today');
    if (iso === state.calSelected) cls.push('selected');
    html += `<button type="button" class="${cls.join(' ')}" data-iso="${iso}">
      <span>${d}</span>
      <span class="cal-dots">${dots.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
    </button>`;
  }
  els.calGrid.innerHTML = html;
  els.calGrid.querySelectorAll('.cal-cell:not(.empty)').forEach((el) =>
    el.addEventListener('click', () => {
      state.calSelected = el.dataset.iso;
      renderCalendar();
      showDaySheet(el.dataset.iso);
    }));

  const legend = {};
  db.categories.forEach((c) => {
    if (db.exercises.some((e) => e.categoryId === c.id)) legend[c.id] = c;
  });
  els.calLegend.innerHTML = Object.values(legend).map((c) =>
    `<span><i style="background:${c.color}"></i> ${esc(c.name)}</span>`).join('');
  els.calTotal.textContent = `${totalWorkouts()} WORKOUTS`;
}

function showDaySheet(iso) {
  const w = workoutOf(iso);
  const d = parseISO(iso);
  const title = `${weekdayLat(d)}, ${fmtShort(iso)}`;
  if (!w || w.exercises.length === 0) {
    openModal(`${title}`, '<p class="note">Šajā dienā nav treniņa.</p>',
      `<button type="button" class="btn primary" id="goDayBtn">Sākt treniņu</button>
       <button type="button" class="btn ghost" id="cancelDayBtn">Cancel</button>`);
    $('goDayBtn').addEventListener('click', () => {
      state.selDate = parseISO(iso);
      switchView('today');
      closeModal();
    });
    $('cancelDayBtn').addEventListener('click', closeModal);
    return;
  }
  const blocks = w.exercises.map((entry) => {
    const ex = exById(entry.exerciseId);
    const cat = ex ? catById(ex.categoryId) : { color: '#9aa0b8' };
    const sets = entry.sets.map((s) =>
      `<div class="set-row">
        <span class="set-n"></span>
        <span class="set-w">${fmtW(s.weight)} ${db.settings.unit}</span>
        <span class="set-r">${s.reps} reps</span>
      </div>`).join('');
    return `<div class="wo-ex">
      <div class="wo-ex-name"><span class="ex-dot" style="background:${cat.color}; color:${cat.color}"></span>${esc(ex ? ex.name : '?')}</div>
      <div class="wo-ex-sets">${sets}</div>
    </div>`;
  }).join('');
  openModal(title, `<div class="wo-block">${blocks}</div>`,
    `<button type="button" class="btn primary" id="goDayBtn">Go To</button>
     <button type="button" class="btn ghost" id="cancelDayBtn">Cancel</button>`);
  $('goDayBtn').addEventListener('click', () => {
    state.selDate = parseISO(iso);
    switchView('today');
    closeModal();
  });
  $('cancelDayBtn').addEventListener('click', closeModal);
}

/* ============ Exercises browser ============ */
function renderExerciseBrowser() {
  const q = state.exSearch.trim().toLowerCase();
  if (state.exCat) {
    const cat = catById(state.exCat);
    const exs = db.exercises.filter((e) => e.categoryId === state.exCat && (!q || e.name.toLowerCase().includes(q)));
    els.exBrowser.innerHTML = `
      <div class="crumb"><button type="button" id="exBack">← Visas kategorijas</button> / ${esc(cat.name)}</div>
      ${exs.map((e) => `
        <div class="ex-list" style="margin-bottom:6px">
          <button type="button" class="list-row" data-open="${e.id}">
            <span class="ex-dot" style="background:${cat.color}; color:${cat.color}"></span>
            <span class="grow">${esc(e.name)}</span>
            <span class="meta">${allSetsFor(e.id).length} seti</span>
          </button>
        </div>`).join('') || '<p class="note">Nav atbilstošu vingrinājumu.</p>'}
      <button type="button" class="btn secondary block" id="addExNew" style="margin-top:12px">＋ Jauns vingrinājums</button>`;
    $('exBack').addEventListener('click', () => { state.exCat = null; renderExerciseBrowser(); });
    els.exBrowser.querySelectorAll('[data-open]').forEach((el) =>
      el.addEventListener('click', () => openLogger(el.dataset.open, true)));
    $('addExNew').addEventListener('click', () => addExerciseModal(state.exCat));
    return;
  }
  const groups = {};
  db.categories.forEach((c) => { groups[c.id] = []; });
  db.exercises.forEach((e) => {
    if (!q || e.name.toLowerCase().includes(q)) (groups[e.categoryId] || (groups[e.categoryId] = [])).push(e);
  });
  els.exBrowser.innerHTML = db.categories.map((c) => {
    const list = groups[c.id] || [];
    if (q && !list.length) return '';
    const items = list.map((e) => `
      <button type="button" class="list-row" data-open="${e.id}">
        <span class="ex-dot" style="background:${c.color}; color:${c.color}"></span>
        <span class="grow">${esc(e.name)}</span>
        <span class="meta">${allSetsFor(e.id).length}</span>
      </button>`).join('');
    return `<div class="section-title" style="margin-top:10px">${esc(c.name)}</div>
      <div class="ex-list">${items || (q ? '' : '<span class="note">Tukšs</span>')}</div>`;
  }).join('') + `
    <button type="button" class="btn secondary block" id="addExNew" style="margin-top:14px">＋ Jauns vingrinājums</button>`;
  els.exBrowser.querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', () => openLogger(el.dataset.open, true)));
  $('addExNew').addEventListener('click', () => addExerciseModal(null));
}

function addExerciseModal(presetCat) {
  const opts = db.categories.map((c) =>
    `<option value="${c.id}" ${c.id === presetCat ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  openModal('Jauns vingrinājums', `
    <div class="form-row"><label>Nosaukums</label><input id="newExName" placeholder="e.g. Bench Press" autocomplete="off"></div>
    <div class="form-row"><label>Kategorija</label><select id="newExCat">${opts}</select></div>`,
    `<button type="button" class="btn primary" id="newExSave">Saglabāt</button>
     <button type="button" class="btn ghost" id="newExCancel">Cancel</button>`);
  $('newExSave').addEventListener('click', () => {
    const name = $('newExName').value.trim();
    if (!name) { toast('Ievadi nosaukumu'); return; }
    const ex = { id: uid(), name, categoryId: $('newExCat').value, type: 'resistance' };
    db.exercises.push(ex);
    saveDB();
    closeModal();
    renderExerciseBrowser();
    toast('Vingrinājums pievienots');
  });
  $('newExCancel').addEventListener('click', closeModal);
  setTimeout(() => $('newExName').focus(), 50);
}

/* ============ Stats ============ */
function renderStats() {
  const nWorkouts = totalWorkouts();
  const nSets = totalSets();
  const nVol = totalVolume();
  const nEx = db.exercises.length;
  const best = {};
  db.exercises.forEach((e) => {
    const b = setBest1RM(e.id);
    if (b > 0) best[e.id] = b;
  });
  const top = Object.entries(best).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const recent = Object.keys(db.workouts).sort().reverse().slice(0, 6);
  els.statsContent.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Treniņi</div><div class="value">${nWorkouts}</div></div>
      <div class="stat-card"><div class="label">Seti</div><div class="value">${nSets}</div></div>
      <div class="stat-card"><div class="label">Apjoms (${db.settings.unit})</div><div class="value">${fmtW(nVol)}</div></div>
      <div class="stat-card"><div class="label">Vingrinājumi</div><div class="value">${nEx}</div></div>
    </div>
    ${top.length ? `
      <div class="section-title">Top 1RM</div>
      <div class="recent-list">
        ${top.map(([id, v]) => {
          const ex = exById(id);
          const cat = ex ? catById(ex.categoryId) : null;
          return `<div class="list-row">
            ${cat ? `<span class="ex-dot" style="background:${cat.color}; color:${cat.color}"></span>` : ''}
            <span class="grow">${esc(ex ? ex.name : '?')}</span>
            <span class="meta">${fmtW(v)} kg</span>
          </div>`;
        }).join('')}
      </div>` : ''}
    <div class="section-title" style="margin-top:14px">Pēdējie treniņi</div>
    <div class="recent-list">
      ${recent.length ? recent.map((iso) => {
        const w = workoutOf(iso);
        const d = parseISO(iso);
        return `<button type="button" class="list-row" data-day="${iso}">
          <span class="grow">${weekdayLat(d)}, ${fmtShort(iso)}</span>
          <span class="meta">${w.exercises.reduce((a, e) => a + e.sets.length, 0)} seti</span>
        </button>`;
      }).join('') : '<p class="note">Vēl nav treniņu.</p>'}
    </div>`;
  els.statsContent.querySelectorAll('[data-day]').forEach((el) =>
    el.addEventListener('click', () => { state.selDate = parseISO(el.dataset.day); switchView('today'); }));
}

/* ============ Settings ============ */
function openSettings() {
  const s = db.settings;
  const nDays = totalWorkouts();
  const nSets = totalSets();
  openModal('Iestatījumi', `
    <div class="settings-block">
      <h4>Vienības</h4>
      <div class="pill-row">
        <button type="button" class="pill ${s.unit === 'kg' ? 'on' : ''}" data-unit="kg">kg</button>
        <button type="button" class="pill ${s.unit === 'lbs' ? 'on' : ''}" data-unit="lbs">lbs</button>
      </div>
    </div>
    <div class="settings-block">
      <h4>Rest timer</h4>
      <div class="form-row"><label>Sekundes (0 = izslēgts)</label><input type="number" id="restSec" min="0" step="15" value="${s.restSeconds}"></div>
      <div class="note">Pēc saglabāta seta sākas atpakaļskaitīšana.</div>
    </div>
    <div class="settings-block">
      <h4>FitNotes migrācija</h4>
      <div class="note" style="margin-bottom:10px">
        FitNotes → Settings → Export → CSV. Šeit ielādē <b>FitNotes_Export.csv</b>.
        Dati paliek tikai šajā ierīcē — nekur netiek sūtīti.
      </div>
      <div class="settings-actions">
        <button type="button" class="btn primary" id="importFitNotesBtn">⬆ Importēt FitNotes CSV</button>
      </div>
      <div class="note" style="margin-top:8px">Pašlaik: <b>${nDays}</b> treniņu dienas · <b>${nSets}</b> seti</div>
    </div>
    <div class="settings-block">
      <h4>Backup</h4>
      <div class="settings-actions">
        <button type="button" class="btn secondary" id="exportBtn">⬇ Eksportēt JSON</button>
        <button type="button" class="btn secondary" id="exportCsvBtn">⬇ Eksportēt CSV</button>
        <button type="button" class="btn secondary" id="importBtn">⬆ Importēt StarFit JSON</button>
        <button type="button" class="btn danger" id="wipeBtn">Dzēst visus datus</button>
      </div>
      <div class="note" style="margin-top:10px">Versija ${APP_VERSION} · localStorage · bez mākoņa.</div>
    </div>`,
    `<button type="button" class="btn primary" id="settingsDone">Gatavs</button>`);

  els.modalBody.querySelectorAll('[data-unit]').forEach((el) =>
    el.addEventListener('click', () => { db.settings.unit = el.dataset.unit; saveDB(); openSettings(); }));
  $('restSec').addEventListener('change', () => {
    db.settings.restSeconds = Math.max(0, parseInt($('restSec').value, 10) || 0);
    saveDB();
  });
  $('exportBtn').addEventListener('click', exportJSON);
  $('exportCsvBtn').addEventListener('click', exportCSV);
  $('importBtn').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.addEventListener('change', () => { if (inp.files[0]) importJSON(inp.files[0]); });
    inp.click();
  });
  $('importFitNotesBtn').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,text/csv';
    inp.addEventListener('change', () => { if (inp.files[0]) pickFitNotesImport(inp.files[0]); });
    inp.click();
  });
  $('wipeBtn').addEventListener('click', () => {
    if (!confirm('Dzēst VISUS treniņu datus? Šo nevar atsaukt.')) return;
    db.workouts = {};
    saveDB();
    closeModal();
    switchView('today');
    toast('Dati dzēsti');
  });
  $('settingsDone').addEventListener('click', closeModal);
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportJSON() {
  download(`starfit-backup-${todayISO()}.json`, JSON.stringify(db, null, 2), 'application/json');
  toast('Backup saglabāts');
}
function exportCSV() {
  // FitNotes-compatible columns so round-trip is easy
  const rows = [['Date', 'Exercise', 'Category', 'Weight', 'Weight Unit', 'Reps', 'Distance', 'Distance Unit', 'Time']];
  Object.keys(db.workouts).sort().forEach((iso) => {
    const w = db.workouts[iso];
    w.exercises.forEach((e) => {
      const ex = exById(e.exerciseId);
      const cat = ex ? catById(ex.categoryId) : { name: '' };
      e.sets.forEach((s) => {
        rows.push([
          iso,
          ex ? ex.name : e.exerciseId,
          cat.name,
          s.weight != null ? s.weight : '',
          db.settings.unit === 'lbs' ? 'lbs' : 'kgs',
          s.reps != null ? s.reps : '',
          s.distance != null ? s.distance : '',
          s.distanceUnit || '',
          s.time || ''
        ]);
      });
    });
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  download(`starfit-export-${todayISO()}.csv`, '\ufeff' + csv, 'text/csv');
  toast('CSV saglabāts');
}
function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.version || !Array.isArray(data.exercises)) throw new Error('bad format');
      db = data;
      saveDB();
      closeModal();
      switchView('today');
      toast('Dati importēti');
    } catch (e) {
      toast('❌ Nederīgs fails');
    }
  };
  reader.readAsText(file);
}

/* ============ FitNotes CSV import ============ */
function parseCSV(text) {
  // RFC4180-ish: handles quotes and commas inside quotes
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  if (!lines.length) return { headers: [], rows: [] };
  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  // skip empty trailing lines
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = cols[idx] != null ? cols[idx].trim() : ''; });
    rows.push(obj);
  }
  return { headers, rows };
}

function normName(s) {
  return String(s || '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function ensureCategoryByName(name) {
  const n = (name || 'Cits').trim() || 'Cits';
  let cat = db.categories.find((c) => normName(c.name) === normName(n));
  if (cat) return cat;
  const color = CAT_COLORS[normName(n)] || '#9aa0b8';
  cat = { id: uid(), name: n, color };
  db.categories.push(cat);
  return cat;
}

function resolveExercise(name, categoryName) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const key = normName(raw);
  const preferred = EXERCISE_ALIASES[key] || raw;

  // exact (case-insensitive) match on existing
  let ex = db.exercises.find((e) => normName(e.name) === normName(preferred))
    || db.exercises.find((e) => normName(e.name) === key);
  if (ex) {
    // if category empty on exercise was wrong, leave as-is
    return ex;
  }
  const cat = ensureCategoryByName(categoryName);
  ex = { id: uid(), name: preferred, categoryId: cat.id, type: 'resistance' };
  db.exercises.push(ex);
  return ex;
}

function toKg(weight, unit) {
  const w = parseFloat(weight);
  if (Number.isNaN(w) || w < 0) return 0;
  const u = String(unit || 'kgs').toLowerCase();
  if (u === 'lbs' || u === 'lb') return Math.round(w * 0.45359237 * 100) / 100;
  return w;
}

function pickFitNotesImport(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = parseCSV(reader.result);
      const hdr = parsed.headers.map((h) => h.toLowerCase());
      const looksFit =
        hdr.includes('date') &&
        hdr.includes('exercise') &&
        (hdr.includes('weight') || hdr.includes('reps'));
      if (!looksFit || !parsed.rows.length) {
        toast('❌ Nav FitNotes CSV formāts');
        return;
      }
      const previewDays = new Set(parsed.rows.map((r) => r.Date || r.date).filter(Boolean));
      const previewEx = new Set(parsed.rows.map((r) => r.Exercise || r.exercise).filter(Boolean));
      openModal(
        'FitNotes imports',
        `<p class="note">Fails: <b>${esc(file.name)}</b></p>
         <p class="note">Rindas: <b>${parsed.rows.length}</b> · Dienas: <b>${previewDays.size}</b> · Vingrinājumi: <b>${previewEx.size}</b></p>
         <p class="note" style="margin-top:12px">Kā importēt?</p>
         <div class="settings-actions" style="margin-top:8px">
           <button type="button" class="btn primary" id="fnMerge">🔗 Apvienot ar esošajiem</button>
           <button type="button" class="btn secondary" id="fnReplace">♻ Aizstāt visus treniņus</button>
           <button type="button" class="btn ghost" id="fnCancel">Atcelt</button>
         </div>
         <p class="note" style="margin-top:12px">
           <b>Apvienot</b> — pievieno setus pie esošajiem (ieteicams).<br>
           <b>Aizstāt</b> — dzēš esošos treniņus, saglabā kategorijas/vingrinājumus + importu.
         </p>`,
        ''
      );
      $('fnCancel').addEventListener('click', closeModal);
      $('fnMerge').addEventListener('click', () => runFitNotesImport(parsed, 'merge'));
      $('fnReplace').addEventListener('click', () => {
        if (!confirm('Aizstāt VISUS esošos treniņus ar FitNotes datiem?')) return;
        runFitNotesImport(parsed, 'replace');
      });
    } catch (e) {
      console.error(e);
      toast('❌ Neizdevās nolasīt CSV');
    }
  };
  reader.readAsText(file);
}

function runFitNotesImport(parsed, mode) {
  try {
    if (mode === 'replace') {
      db.workouts = {};
    }
    let imported = 0;
    let skipped = 0;
    // group by date+exercise to preserve order of sets as in file
    const orderMap = {}; // iso -> exerciseId[] order of first appearance
    parsed.rows.forEach((r, idx) => {
      const date = (r.Date || r.date || '').trim();
      const exercise = (r.Exercise || r.exercise || '').trim();
      const category = (r.Category || r.category || 'Cits').trim();
      if (!date || !exercise) { skipped++; return; }
      // validate date YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; return; }

      const weightRaw = r.Weight != null && r.Weight !== '' ? r.Weight : (r.weight || '0');
      const unit = r['Weight Unit'] || r['Weight unit'] || r.weight_unit || 'kgs';
      const repsRaw = r.Reps != null && r.Reps !== '' ? r.Reps : (r.reps || '0');
      const weight = toKg(weightRaw, unit);
      const reps = parseInt(repsRaw, 10);
      if (Number.isNaN(reps) || reps < 0) { skipped++; return; }

      const ex = resolveExercise(exercise, category);
      if (!ex) { skipped++; return; }

      const w = ensureWorkout(date);
      if (!orderMap[date]) orderMap[date] = [];
      let entry = w.exercises.find((e) => e.exerciseId === ex.id);
      if (!entry) {
        entry = { exerciseId: ex.id, order: w.exercises.length, sets: [] };
        w.exercises.push(entry);
        orderMap[date].push(ex.id);
      }
      entry.sets.push({
        weight,
        reps,
        note: '',
        ts: Date.parse(date + 'T12:00:00') + idx, // stable order within day
        distance: (r.Distance || r.distance || '') || undefined,
        distanceUnit: (r['Distance Unit'] || r.distance_unit || '') || undefined,
        time: (r.Time || r.time || '') || undefined
      });
      // clean undefined keys
      Object.keys(entry.sets[entry.sets.length - 1]).forEach((k) => {
        if (entry.sets[entry.sets.length - 1][k] === undefined) delete entry.sets[entry.sets.length - 1][k];
      });
      imported++;
    });

    // drop empty workouts
    Object.keys(db.workouts).forEach((iso) => {
      const w = db.workouts[iso];
      w.exercises = w.exercises.filter((e) => e.sets && e.sets.length);
      if (!w.exercises.length) delete db.workouts[iso];
    });

    saveDB();
    closeModal();
    // jump to most recent imported day if any
    const days = Object.keys(db.workouts).sort();
    if (days.length) {
      state.selDate = parseISO(days[days.length - 1]);
      state.calMonth = new Date(state.selDate);
    }
    switchView('today');
    toast(`✅ Importēti ${imported} seti · ${days.length} dienas${skipped ? ` · izlaisti ${skipped}` : ''}`, 3200);
  } catch (e) {
    console.error(e);
    toast('❌ Imports neizdevās');
  }
}

/* ============ Rest timer ============ */
function startRest(seconds) {
  stopRest();
  state.rest.t = seconds;
  els.restOverlay.classList.remove('hidden');
  updateRestDisplay();
  state.rest.iv = setInterval(() => {
    state.rest.t -= 1;
    if (state.rest.t <= 0) { state.rest.t = 0; updateRestDisplay(); stopRest(); toast('⏱ Atpūta beigusies'); return; }
    updateRestDisplay();
  }, 1000);
}
function stopRest() {
  clearInterval(state.rest.iv);
  state.rest.iv = null;
  els.restOverlay.classList.add('hidden');
}
function updateRestDisplay() {
  const m = Math.floor(state.rest.t / 60);
  const s = state.rest.t % 60;
  els.restTime.textContent = `${m}:${pad(s)}`;
}
function adjustRest(delta) {
  state.rest.t = Math.max(0, state.rest.t + delta);
  updateRestDisplay();
}

/* ============ Events ============ */
function bindEvents() {
  // bottom nav
  document.querySelectorAll('.nav-item').forEach((n) =>
    n.addEventListener('click', () => switchView(n.dataset.nav)));

  // day strip
  els.dayPrev.addEventListener('click', () => {
    state.selDate.setDate(state.selDate.getDate() - 1);
    renderToday();
  });
  els.dayNext.addEventListener('click', () => {
    state.selDate.setDate(state.selDate.getDate() + 1);
    renderToday();
  });
  els.dayLabel.addEventListener('click', () => {
    state.selDate = new Date();
    renderToday();
  });

  // calendar nav
  els.calPrev.addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  els.calNext.addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  // search
  els.exSearch.addEventListener('input', () => {
    state.exSearch = els.exSearch.value;
    renderExerciseBrowser();
  });

  // top bar
  $('brandHome').addEventListener('click', () => { state.selDate = new Date(); switchView('today'); });
  $('btnSettings').addEventListener('click', openSettings);
  $('btnRest').addEventListener('click', () => {
    if (state.rest.iv) stopRest();
    else startRest(db.settings.restSeconds || 90);
  });

  // modal
  els.modalClose.addEventListener('click', closeModal);
  els.modalBackdrop.addEventListener('click', (e) => { if (e.target === els.modalBackdrop) closeModal(); });

  // logger
  els.loggerBack.addEventListener('click', closeLogger);
  document.querySelectorAll('.ltab').forEach((t) =>
    t.addEventListener('click', () => { if (state.logger) { state.logger.tab = t.dataset.ltab; renderLoggerTab(); } }));
  $('loggerInfo').addEventListener('click', () => {
    if (!state.logger) return;
    openModal('1RM', `<p class="note">Estimated 1RM = svars × (1 + atkārtojumi/30) (Epley formula).<br>Labākais aprēķinātais 1RM visiem taviem setiem.</p>`,
      `<button type="button" class="btn primary" id="infoOk">OK</button>`);
    $('infoOk').addEventListener('click', closeModal);
  });

  // rest
  els.restSkip.addEventListener('click', stopRest);
  els.restMinus.addEventListener('click', () => adjustRest(-15));
  els.restPlus.addEventListener('click', () => adjustRest(15));

  // keyboard escape closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!els.modalBackdrop.classList.contains('hidden')) closeModal();
      else if (state.logger) closeLogger();
    }
  });
}

/* ============ PWA / boot ============ */
function registerSW() {
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  } catch (e) { /* ignore */ }
}

function boot() {
  bindEvents();
  switchView('today');
  registerSW();
}

document.addEventListener('DOMContentLoaded', boot);
