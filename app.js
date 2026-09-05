// ==================== IMPORTS ====================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage, ref as storageRef, uploadString, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import { firebaseConfig } from './firebase-config.js';

// ==================== FIREBASE INIT ====================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

enableIndexedDbPersistence(db).catch(err => console.warn('Offline persistence:', err.code));

// ==================== INTERVALS ====================
const DEFAULT_INTERVALS = [
  { value: 10, unit: 'Minuten' },
  { value: 1,  unit: 'Tage'   },
  { value: 3,  unit: 'Tage'   },
  { value: 5,  unit: 'Tage'   },
  { value: 1,  unit: 'Wochen' },
];
const UNIT_MS   = { Minuten: 60_000, Tage: 86_400_000, Wochen: 604_800_000, Monate: 2_592_000_000 };
const SINGULAR  = { Minuten: 'Minute', Tage: 'Tag', Wochen: 'Woche', Monate: 'Monat' };
function ivMs(iv)    { return iv.value * UNIT_MS[iv.unit]; }
function ivLabel(iv) { return iv.value === 1 ? `1 ${SINGULAR[iv.unit]}` : `${iv.value} ${iv.unit}`; }

// ==================== THEME ====================
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

// ==================== UTILS ====================
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==================== FIRESTORE DATA LAYER ====================
function userCol(name) {
  return collection(db, 'users', auth.currentUser.uid, name);
}
function userDoc(name, id) {
  return doc(db, 'users', auth.currentUser.uid, name, id);
}

async function fsAll(colName) {
  const snap = await getDocs(userCol(colName));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function fsGet(colName, id) {
  const snap = await getDoc(userDoc(colName, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
async function fsAdd(colName, data) {
  const ref = await addDoc(userCol(colName), { ...data, createdAt: Date.now() });
  return ref.id;
}
async function fsUpdate(colName, id, data) {
  await updateDoc(userDoc(colName, id), data);
}
async function fsDel(colName, id) {
  await deleteDoc(userDoc(colName, id));
}
async function fsByField(colName, field, value) {
  const q = query(userCol(colName), where(field, '==', value));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ==================== IMAGE STORAGE ====================
async function uploadImage(cardId, side, base64DataUrl) {
  const uid = auth.currentUser.uid;
  const path = `users/${uid}/cards/${cardId}-${side}`;
  const ref = storageRef(storage, path);
  await uploadString(ref, base64DataUrl, 'data_url');
  return path;
}

const _urlCache = new Map();

async function getImageUrl(storagePath) {
  if (!storagePath) return null;
  if (_urlCache.has(storagePath)) return _urlCache.get(storagePath);
  try {
    const url = await getDownloadURL(storageRef(storage, storagePath));
    _urlCache.set(storagePath, url);
    return url;
  } catch (e) {
    console.warn('Bild konnte nicht geladen werden:', e);
    return null;
  }
}

async function deleteImage(storagePath) {
  if (!storagePath) return;
  try {
    await deleteObject(storageRef(storage, storagePath));
  } catch (e) {
    console.warn('Bild konnte nicht gelöscht werden:', e);
  }
}

// ==================== GLOBAL STATE ====================
let routeHistory    = [];
let curFolderId     = null;
let curSetId        = null;
let ivEditorOpen    = false;
let studyQueue      = [];
let studyIndex      = 0;
let isFlipped       = false;
let editCardId      = null;
let frontImgData    = null;
let backImgData     = null;
let frontStoragePath = null;
let backStoragePath  = null;
let frontImgRemoved  = false;
let backImgRemoved   = false;
let afterSaveView   = null;
let nameCallback    = null;

// ==================== DOM BUILDER ====================
function buildDOM() {
  const root = document.getElementById('app');
  root.innerHTML = `
    <!-- LOGIN SCREEN -->
    <div id="login-screen" style="display:none">
      <div class="login-card">
        <div class="login-icon">📚</div>
        <h1 class="login-title">Karteikarten</h1>
        <p class="login-subtitle">Spaced-Repetition Lernkarten</p>
        <button id="google-signin-btn" class="btn btn-primary btn-lg">
          Mit Google anmelden
        </button>
      </div>
    </div>

    <!-- MAIN SCREEN -->
    <div id="main-screen" style="display:none">

      <!-- HOME VIEW -->
      <div id="view-home" class="view">
        <div class="top-bar">
          <span class="top-bar-title">📚 Karteikarten</span>
          <button class="btn btn-ghost btn-sm" id="theme-toggle-btn" title="Design wechseln">🌙</button>
          <button class="btn btn-ghost btn-sm sign-out-btn" id="sign-out-btn">Abmelden</button>
        </div>
        <div class="content">
          <button class="btn btn-primary" id="new-folder-btn">+ Neuer Ordner</button>
          <ul class="list" id="folder-list"></ul>
        </div>
      </div>

      <!-- FOLDER VIEW -->
      <div id="view-folder" class="view">
        <div class="top-bar">
          <button class="btn btn-ghost back-btn" id="folder-back-btn">← Zurück</button>
          <span class="top-bar-title" id="folder-title">Ordner</span>
        </div>
        <div class="content">
          <button class="btn btn-primary" id="new-set-btn">+ Neues Set</button>
          <ul class="list" id="set-list"></ul>
        </div>
      </div>

      <!-- SET VIEW -->
      <div id="view-set" class="view">
        <div class="top-bar">
          <button class="btn btn-ghost back-btn" id="set-back-btn">← Zurück</button>
          <span class="top-bar-title" id="set-title">Set</span>
        </div>
        <div class="content">
          <div class="set-actions">
            <button class="btn btn-primary" id="study-start-btn">▶ Lernen</button>
            <button class="btn btn-secondary" id="add-card-btn">+ Karte hinzufügen</button>
            <button class="btn btn-secondary" id="table-view-btn">📋 Alle Karten (Tabelle)</button>
          </div>

          <div class="iv-box" id="iv-box">
            <div class="iv-box-header" id="iv-box-header">
              <span class="iv-box-label">Intervalle</span>
              <div class="iv-chips" id="iv-chips"></div>
              <span class="iv-edit-toggle" id="iv-toggle-text">▾ bearbeiten</span>
            </div>
            <div class="interval-editor" id="iv-editor-set">
              <div id="iv-rows"></div>
              <div class="iv-editor-actions">
                <button class="btn btn-secondary add-iv-btn" id="add-iv-btn">+ Hinzufügen</button>
                <button class="btn btn-primary" id="save-iv-btn">Speichern</button>
              </div>
            </div>
          </div>

          <ul class="list" id="card-list"></ul>
        </div>
      </div>

      <!-- STUDY VIEW -->
      <div id="view-study" class="view">
        <div class="top-bar">
          <button class="btn btn-ghost back-btn" id="study-back-btn">← Zurück</button>
          <span class="top-bar-title">Lernen</span>
        </div>
        <div class="study-container">
          <div class="study-progress">
            <div class="progress-bar">
              <div class="progress-fill" id="study-bar" style="width:0%"></div>
            </div>
            <span id="study-count">0 / 0</span>
          </div>
          <div class="flashcard" id="flashcard">
            <div class="card-inner" id="card-inner">
              <div class="card-front" id="card-front"></div>
              <div class="card-back"  id="card-back"></div>
            </div>
          </div>
          <div class="study-hint" id="study-hint">Tippen um umzudrehen</div>
        </div>
        <div class="bottom-bar" id="iv-bar"></div>
      </div>

      <!-- DONE VIEW -->
      <div id="view-done" class="view">
        <div class="top-bar">
          <button class="btn btn-ghost back-btn" id="done-back-btn">← Zurück</button>
          <span class="top-bar-title">Fertig!</span>
        </div>
        <div class="done-screen">
          <div class="done-icon">🎉</div>
          <h2 class="done-title">Alle Karten geschafft!</h2>
          <p class="done-subtitle">Die heutigen Karten sind erledigt. Morgen geht's weiter!</p>
          <button class="btn btn-primary" id="done-back-set-btn">Zurück zum Set</button>
        </div>
      </div>

      <!-- TABLE VIEW -->
      <div id="view-table" class="view">
        <div class="top-bar">
          <button class="btn btn-ghost back-btn" id="table-back-btn">← Zurück</button>
          <span class="top-bar-title" id="table-title">Alle Karten</span>
        </div>
        <div class="table-container">
          <table class="card-table" id="cards-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Vorderseite</th>
                <th>Rückseite</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="cards-table-body"></tbody>
          </table>
          <p id="table-empty" style="display:none;text-align:center;padding:30px;color:#94a3b8">Noch keine Karten.</p>
        </div>
      </div>

    </div><!-- /main-screen -->

    <!-- CARD EDITOR MODAL -->
    <div class="modal-overlay" id="card-modal">
      <div class="modal">
        <h2 class="modal-title" id="card-modal-title">Karte hinzufügen</h2>
        <div class="card-editor">
          <div class="card-side">
            <span class="side-label">Vorderseite (Frage)</span>
            <textarea class="modal-input" id="front-text" placeholder="Frage eingeben…"></textarea>
            <label class="img-upload-btn">🖼 Bild hinzufügen
              <input type="file" accept="image/*" style="display:none" id="front-file">
            </label>
            <span class="paste-hint">Screenshot: Strg+V ins Textfeld einfügen</span>
            <div id="front-img-wrap" style="display:none;position:relative;display:none">
              <img class="img-preview" id="front-img-preview" alt="">
              <button class="remove-img-btn" id="front-remove-btn">✕</button>
            </div>
          </div>
          <div class="card-side">
            <span class="side-label">Rückseite (Antwort)</span>
            <textarea class="modal-input" id="back-text" placeholder="Antwort eingeben…"></textarea>
            <label class="img-upload-btn">🖼 Bild hinzufügen
              <input type="file" accept="image/*" style="display:none" id="back-file">
            </label>
            <span class="paste-hint">Screenshot: Strg+V ins Textfeld einfügen</span>
            <div id="back-img-wrap" style="display:none;position:relative;display:none">
              <img class="img-preview" id="back-img-preview" alt="">
              <button class="remove-img-btn" id="back-remove-btn">✕</button>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary"   id="card-save-btn">Speichern</button>
          <button class="btn btn-secondary" id="card-save-next-btn">+ Nächste</button>
          <button class="btn btn-ghost"     id="card-cancel-btn">Abbrechen</button>
        </div>
      </div>
    </div>

    <!-- NAME MODAL -->
    <div class="modal-overlay" id="name-modal">
      <div class="modal">
        <h2 class="modal-title" id="name-modal-title">Name</h2>
        <input class="modal-input" type="text" id="name-input" placeholder="Name eingeben…">
        <div class="modal-actions">
          <button class="btn btn-primary" id="name-submit-btn">Erstellen</button>
          <button class="btn btn-ghost"   id="name-cancel-btn">Abbrechen</button>
        </div>
      </div>
    </div>
  `;
}

// ==================== EVENT WIRING ====================
function wireEvents() {
  // Auth
  document.getElementById('google-signin-btn').addEventListener('click', () => {
    signInWithPopup(auth, new GoogleAuthProvider()).catch(e => console.error('Anmeldung fehlgeschlagen:', e));
  });
  document.getElementById('sign-out-btn').addEventListener('click', () => signOut(auth));

  // Theme
  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

  // Home view
  document.getElementById('new-folder-btn').addEventListener('click', () => openNameModal('folder'));

  // Folder view
  document.getElementById('folder-back-btn').addEventListener('click', () => goBack());
  document.getElementById('new-set-btn').addEventListener('click', () => openNameModal('set'));

  // Set view
  document.getElementById('set-back-btn').addEventListener('click', () => goBack());
  document.getElementById('study-start-btn').addEventListener('click', () => startStudy());
  document.getElementById('add-card-btn').addEventListener('click', () => openCardEditor(null));
  document.getElementById('table-view-btn').addEventListener('click', () => navigate('table', curSetId));
  document.getElementById('iv-box-header').addEventListener('click', () => toggleIvEditor());
  document.getElementById('add-iv-btn').addEventListener('click', () => addSetIvRow());
  document.getElementById('save-iv-btn').addEventListener('click', () => saveSetIntervals());

  // Study view
  document.getElementById('study-back-btn').addEventListener('click', () => goBack());
  document.getElementById('flashcard').addEventListener('click', () => flipCard());

  // Done view
  document.getElementById('done-back-btn').addEventListener('click', () => goBack());
  document.getElementById('done-back-set-btn').addEventListener('click', () => goBack());

  // Table view
  document.getElementById('table-back-btn').addEventListener('click', () => goBack());

  // Card modal
  document.getElementById('card-save-btn').addEventListener('click', () => saveCard(false));
  document.getElementById('card-save-next-btn').addEventListener('click', () => saveCard(true));
  document.getElementById('card-cancel-btn').addEventListener('click', () => closeCardModal());
  document.getElementById('card-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCardModal();
  });
  document.getElementById('front-file').addEventListener('change', function () { loadImg(this, 'front'); });
  document.getElementById('back-file').addEventListener('change',  function () { loadImg(this, 'back');  });
  document.getElementById('front-remove-btn').addEventListener('click', () => removeImg('front'));
  document.getElementById('back-remove-btn').addEventListener('click',  () => removeImg('back'));

  // Name modal
  document.getElementById('name-submit-btn').addEventListener('click', () => submitName());
  document.getElementById('name-cancel-btn').addEventListener('click', () => closeNameModal());
  document.getElementById('name-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitName(); });
  document.getElementById('name-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeNameModal();
  });

  // Clipboard paste
  setupPasteHandlers();
}

// ==================== ROUTER ====================
async function navigate(route, id) {
  routeHistory.push({ route, id });
  await show(route, id);
}

function goBack() {
  routeHistory.pop();
  const prev = routeHistory[routeHistory.length - 1] || { route: 'home' };
  show(prev.route, prev.id);
}

async function show(route, id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewEl = document.getElementById('view-' + route) || document.getElementById('view-home');
  viewEl.classList.add('active');
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.add('active');
  try {
    if (route === 'home')   await renderHome();
    if (route === 'folder') await renderFolder(id);
    if (route === 'set')    await renderSet(id);
    if (route === 'study')  await renderStudy(id);
    if (route === 'table')  await renderTable(id);
  } finally {
    overlay.classList.remove('active');
  }
}

// ==================== HOME ====================
async function renderHome() {
  const folders = await fsAll('folders');
  const list = document.getElementById('folder-list');
  list.innerHTML = '';

  if (!folders.length) {
    list.innerHTML = '<li class="empty-note">Noch keine Ordner. Erstelle deinen ersten!</li>';
    return;
  }

  for (const f of folders) {
    const sets = await fsByField('sets', 'folderId', f.id);
    const li = document.createElement('li');
    li.className = 'list-item';

    const nameEl = document.createElement('span');
    nameEl.className = 'list-item-name';
    nameEl.textContent = '📁 ' + f.name;
    nameEl.addEventListener('click', () => navigate('folder', f.id));

    const metaEl = document.createElement('span');
    metaEl.className = 'list-item-meta';
    metaEl.innerHTML = `<span class="badge">${sets.length} Set${sets.length !== 1 ? 's' : ''}</span>`;

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost btn-sm btn-danger';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => delFolder(f.id));

    li.appendChild(nameEl);
    li.appendChild(metaEl);
    li.appendChild(delBtn);
    list.appendChild(li);
  }
}

async function delFolder(id) {
  if (!confirm('Ordner und alle Inhalte löschen?')) return;
  const sets = await fsByField('sets', 'folderId', id);
  for (const s of sets) {
    const cards = await fsByField('cards', 'setId', s.id);
    for (const c of cards) {
      await deleteImage(c.front?.storagePath);
      await deleteImage(c.back?.storagePath);
      await fsDel('cards', c.id);
    }
    await fsDel('sets', s.id);
  }
  await fsDel('folders', id);
  await renderHome();
}

// ==================== FOLDER ====================
async function renderFolder(folderId) {
  curFolderId = folderId;
  const folder = await fsGet('folders', folderId);
  if (!folder) { await navigate('home'); return; }
  document.getElementById('folder-title').textContent = folder.name;

  const sets = await fsByField('sets', 'folderId', folderId);
  const list = document.getElementById('set-list');
  list.innerHTML = '';

  if (!sets.length) {
    list.innerHTML = '<li class="empty-note">Noch keine Sets.</li>';
    return;
  }

  for (const s of sets) {
    const cards = await fsByField('cards', 'setId', s.id);
    const due = cards.filter(c => !c.nextReview || c.nextReview <= Date.now()).length;

    const li = document.createElement('li');
    li.className = 'list-item';

    const nameEl = document.createElement('span');
    nameEl.className = 'list-item-name';
    nameEl.textContent = '📝 ' + s.name;
    nameEl.addEventListener('click', () => navigate('set', s.id));

    const metaEl = document.createElement('span');
    metaEl.className = 'list-item-meta';
    metaEl.innerHTML =
      `<span class="badge">${cards.length} Karten</span>` +
      (due > 0 ? `<span class="badge badge-due">${due} fällig</span>` : '');

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost btn-sm btn-danger';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => delSet(s.id));

    li.appendChild(nameEl);
    li.appendChild(metaEl);
    li.appendChild(delBtn);
    list.appendChild(li);
  }
}

async function delSet(id) {
  if (!confirm('Set und alle Karten löschen?')) return;
  const cards = await fsByField('cards', 'setId', id);
  for (const c of cards) {
    await deleteImage(c.front?.storagePath);
    await deleteImage(c.back?.storagePath);
    await fsDel('cards', c.id);
  }
  await fsDel('sets', id);
  await renderFolder(curFolderId);
}

// ==================== SET ====================
async function renderSet(setId) {
  curSetId = setId;
  ivEditorOpen = false;

  const set = await fsGet('sets', setId);
  if (!set) { await navigate('home'); return; }
  document.getElementById('set-title').textContent = set.name;

  const intervals = set.intervals || DEFAULT_INTERVALS;
  const cards = await fsByField('cards', 'setId', setId);
  const due = cards.filter(c => !c.nextReview || c.nextReview <= Date.now()).length;

  document.getElementById('study-start-btn').textContent =
    due > 0 ? `▶ Lernen  (${due} fällig)` : '▶ Alle Karten wiederholen';

  // Interval chips
  document.getElementById('iv-chips').innerHTML =
    intervals.map(iv => `<span class="iv-chip">${ivLabel(iv)}</span>`).join('');

  // Interval editor — collapsed by default
  document.getElementById('iv-editor-set').classList.remove('open');
  document.getElementById('iv-toggle-text').textContent = '▾ bearbeiten';
  buildSetIvRows(intervals);

  // Card list
  const list = document.getElementById('card-list');
  list.innerHTML = '';

  if (!cards.length) {
    list.innerHTML = '<li class="empty-note">Noch keine Karten.</li>';
    return;
  }

  for (const c of cards) {
    const preview = (c.front?.text || '').slice(0, 60) || (c.front?.storagePath ? '🖼 Bild' : '(leer)');
    const now = Date.now();
    let nextStr, badgeCls;
    if (!c.nextReview)             { nextStr = 'Neu';    badgeCls = 'badge'; }
    else if (c.nextReview <= now)  { nextStr = 'fällig'; badgeCls = 'badge badge-due'; }
    else                           { nextStr = new Date(c.nextReview).toLocaleDateString('de-AT'); badgeCls = 'badge'; }

    const li = document.createElement('li');
    li.className = 'list-item';

    const nameEl = document.createElement('span');
    nameEl.className = 'list-item-name';
    nameEl.textContent = preview;
    nameEl.addEventListener('click', () => openCardEditor(c.id));

    const metaEl = document.createElement('span');
    metaEl.className = 'list-item-meta';
    metaEl.innerHTML = `<span class="${badgeCls}">${nextStr}</span>`;

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost btn-sm btn-danger';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => delCard(c.id));

    li.appendChild(nameEl);
    li.appendChild(metaEl);
    li.appendChild(delBtn);
    list.appendChild(li);
  }
}

function toggleIvEditor() {
  ivEditorOpen = !ivEditorOpen;
  document.getElementById('iv-editor-set').classList.toggle('open', ivEditorOpen);
  document.getElementById('iv-toggle-text').textContent = ivEditorOpen ? '▴ schließen' : '▾ bearbeiten';
}

function buildSetIvRows(intervals) {
  const container = document.getElementById('iv-rows');
  container.innerHTML = '';
  intervals.forEach(iv => addRowToContainer(container, iv));
}

function addRowToContainer(container, iv) {
  const row = document.createElement('div');
  row.className = 'interval-row';

  const numEl = document.createElement('input');
  numEl.type = 'number';
  numEl.min  = '1';
  numEl.value = String(iv.value);
  numEl.className = 'iv-value';

  const selEl = document.createElement('select');
  selEl.className = 'iv-unit';
  ['Minuten', 'Tage', 'Wochen', 'Monate'].forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    if (u === iv.unit) opt.selected = true;
    selEl.appendChild(opt);
  });

  const prevEl = document.createElement('span');
  prevEl.className = 'iv-label-preview';
  prevEl.textContent = ivLabel(iv);

  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-danger btn-sm';
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', () => row.remove());

  const updatePreview = () => {
    prevEl.textContent = ivLabel({ value: parseInt(numEl.value) || 1, unit: selEl.value });
  };
  numEl.addEventListener('input', updatePreview);
  selEl.addEventListener('change', updatePreview);

  row.appendChild(numEl);
  row.appendChild(selEl);
  row.appendChild(prevEl);
  row.appendChild(delBtn);
  container.appendChild(row);
}

function addSetIvRow() {
  addRowToContainer(document.getElementById('iv-rows'), { value: 1, unit: 'Tage' });
}

async function saveSetIntervals() {
  const rows = document.querySelectorAll('#iv-rows .interval-row');
  const intervals = [];
  rows.forEach(row => {
    const v = Math.max(1, parseInt(row.querySelector('.iv-value').value) || 1);
    const u = row.querySelector('.iv-unit').value;
    intervals.push({ value: v, unit: u });
  });
  if (!intervals.length) { alert('Mindestens ein Intervall ist erforderlich.'); return; }

  await fsUpdate('sets', curSetId, { intervals });
  document.getElementById('iv-chips').innerHTML =
    intervals.map(iv => `<span class="iv-chip">${ivLabel(iv)}</span>`).join('');
  toggleIvEditor();
}

async function delCard(id) {
  if (!confirm('Karte löschen?')) return;
  const card = await fsGet('cards', id);
  if (card) {
    await deleteImage(card.front?.storagePath);
    await deleteImage(card.back?.storagePath);
  }
  await fsDel('cards', id);
  await renderSet(curSetId);
}

async function startStudy() {
  const cards = await fsByField('cards', 'setId', curSetId);
  if (!cards.length) { alert('Noch keine Karten in diesem Set.'); return; }
  const due = cards.filter(c => !c.nextReview || c.nextReview <= Date.now());
  if (!due.length) { alert('Alle Karten erledigt! Schau morgen wieder rein.'); return; }
  studyQueue = due.sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0));
  studyIndex = 0;

  // Alle Bild-URLs parallel vorabladen und in Browser-Cache legen
  const paths = studyQueue.flatMap(c => [c.front?.storagePath, c.back?.storagePath]).filter(Boolean);
  await Promise.all(paths.map(p => getImageUrl(p).then(url => { if (url) { new Image().src = url; } })));

  await navigate('study', curSetId);
}

// ==================== TABLE ====================
async function renderTable(setId) {
  const set = await fsGet('sets', setId);
  if (!set) { goBack(); return; }
  document.getElementById('table-title').textContent = set.name;
  curSetId = setId;

  const cards = await fsByField('cards', 'setId', setId);
  const tbody = document.getElementById('cards-table-body');
  const empty = document.getElementById('table-empty');
  tbody.innerHTML = '';

  if (!cards.length) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const tr = document.createElement('tr');

    const numTd = document.createElement('td');
    numTd.textContent = String(i + 1);

    const frontTd = document.createElement('td');
    frontTd.innerHTML = await buildCellHtml(card.front);

    const backTd = document.createElement('td');
    backTd.innerHTML = await buildCellHtml(card.back);

    const actionTd = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-ghost btn-sm';
    editBtn.title = 'Bearbeiten';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => tableEditCard(card.id));
    actionTd.appendChild(editBtn);

    tr.appendChild(numTd);
    tr.appendChild(frontTd);
    tr.appendChild(backTd);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }
}

async function buildCellHtml(side) {
  if (!side?.text && !side?.storagePath) {
    return '<span style="color:#cbd5e1;font-style:italic">—</span>';
  }
  let html = '<div class="td-cell">';
  if (side.storagePath) {
    const url = await getImageUrl(side.storagePath);
    if (url) html += `<img class="thumbnail" src="${url}" alt="">`;
  }
  if (side.text) html += `<span class="td-text">${esc(side.text)}</span>`;
  html += '</div>';
  return html;
}

async function tableEditCard(cardId) {
  const card = await fsGet('cards', cardId);
  if (card) curSetId = card.setId;
  afterSaveView = 'table';
  await openCardEditor(cardId);
}

// ==================== STUDY ====================
async function renderStudy(setId) {
  const set = await fsGet('sets', setId);
  const intervals = set?.intervals || DEFAULT_INTERVALS;

  const bar = document.getElementById('iv-bar');
  bar.innerHTML = '';
  bar.classList.remove('visible');

  intervals.forEach((iv, i) => {
    const btn = document.createElement('button');
    btn.className = `btn iv-btn-${(i % 5) + 1}`;
    btn.textContent = ivLabel(iv);
    btn.addEventListener('click', () => pickInterval(iv));
    bar.appendChild(btn);
  });

  if (!studyQueue.length) {
    const cards = await fsByField('cards', 'setId', setId);
    studyQueue = cards
      .filter(c => !c.nextReview || c.nextReview <= Date.now())
      .sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0));
    studyIndex = 0;
  }

  await showCard();
}

async function showCard() {
  if (studyIndex >= studyQueue.length) {
    document.getElementById('iv-bar').classList.remove('visible');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-done').classList.add('active');
    return;
  }

  isFlipped = false;
  document.getElementById('card-inner').classList.remove('flipped');
  document.getElementById('iv-bar').classList.remove('visible');
  document.getElementById('study-hint').textContent = 'Tippen um umzudrehen';

  const pct = (studyIndex / studyQueue.length * 100).toFixed(0);
  document.getElementById('study-bar').style.width = pct + '%';
  document.getElementById('study-count').textContent = `${studyIndex} / ${studyQueue.length}`;

  const card = studyQueue[studyIndex];
  await renderFace('card-front', card.front, 'Frage');
  await renderFace('card-back',  card.back,  'Antwort');
}

async function renderFace(elemId, side, label) {
  const el = document.getElementById(elemId);
  el.innerHTML = `<div class="card-label">${label}</div>`;

  if (side?.storagePath) {
    const url = await getImageUrl(side.storagePath);
    if (url) {
      const img = document.createElement('img');
      img.className = 'card-img';
      img.src = url;
      img.alt = '';
      el.appendChild(img);
    }
  }

  if (side?.text) {
    const p = document.createElement('p');
    p.className = 'card-text';
    p.textContent = side.text;
    el.appendChild(p);
  }
}

function flipCard() {
  isFlipped = !isFlipped;
  document.getElementById('card-inner').classList.toggle('flipped', isFlipped);
  document.getElementById('iv-bar').classList.toggle('visible', isFlipped);
  document.getElementById('study-hint').textContent = isFlipped ? 'Wähle ein Intervall ↓' : 'Tippen um umzudrehen';
}

async function pickInterval(iv) {
  const card = studyQueue[studyIndex];
  card.nextReview = Date.now() + ivMs(iv);
  await fsUpdate('cards', card.id, { nextReview: card.nextReview });
  studyIndex++;
  await showCard();
}

// ==================== CARD EDITOR ====================
async function openCardEditor(cardId) {
  editCardId      = cardId;
  frontImgData    = null;
  backImgData     = null;
  frontStoragePath = null;
  backStoragePath  = null;
  frontImgRemoved  = false;
  backImgRemoved   = false;

  // Bug fix: reset afterSaveView when opening a fresh new card from set view
  if (cardId === null) afterSaveView = null;

  // Bug fix: always reset the full form to prevent stale data from leaking
  document.getElementById('front-text').value = '';
  document.getElementById('back-text').value  = '';
  document.getElementById('front-file').value = '';
  document.getElementById('back-file').value  = '';
  document.getElementById('front-img-wrap').style.display = 'none';
  document.getElementById('back-img-wrap').style.display  = 'none';

  if (cardId) {
    document.getElementById('card-modal-title').textContent = 'Karte bearbeiten';
    const card = await fsGet('cards', cardId);
    document.getElementById('front-text').value = card.front?.text || '';
    document.getElementById('back-text').value  = card.back?.text  || '';

    // Load existing images from Storage for preview
    if (card.front?.storagePath) {
      frontStoragePath = card.front.storagePath;
      const url = await getImageUrl(frontStoragePath);
      if (url) setImgPreview('front', url);
    }
    if (card.back?.storagePath) {
      backStoragePath = card.back.storagePath;
      const url = await getImageUrl(backStoragePath);
      if (url) setImgPreview('back', url);
    }
  } else {
    document.getElementById('card-modal-title').textContent = 'Karte hinzufügen';
  }

  document.getElementById('card-modal').classList.add('open');
  setTimeout(() => document.getElementById('front-text').focus(), 100);
}

function setImgPreview(side, urlOrData) {
  document.getElementById(side + '-img-preview').src = urlOrData;
  document.getElementById(side + '-img-wrap').style.display = 'block';
}

function loadImg(input, side) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    if (side === 'front') {
      frontImgData    = e.target.result;
      frontImgRemoved = false;
      setImgPreview('front', frontImgData);
    } else {
      backImgData    = e.target.result;
      backImgRemoved = false;
      setImgPreview('back', backImgData);
    }
  };
  reader.readAsDataURL(file);
}

function removeImg(side) {
  if (side === 'front') {
    frontImgData    = null;
    frontImgRemoved = true;
    document.getElementById('front-img-wrap').style.display = 'none';
    document.getElementById('front-file').value = '';
  } else {
    backImgData    = null;
    backImgRemoved = true;
    document.getElementById('back-img-wrap').style.display = 'none';
    document.getElementById('back-file').value = '';
  }
}

async function saveCard(andNext) {
  const ft = document.getElementById('front-text').value.trim();
  const bt = document.getElementById('back-text').value.trim();

  const hasFront = ft || frontImgData || (frontStoragePath && !frontImgRemoved);
  if (!hasFront) {
    alert('Die Vorderseite braucht Text oder ein Bild.');
    return;
  }

  const saveBtn     = document.getElementById('card-save-btn');
  const saveNextBtn = document.getElementById('card-save-next-btn');
  if (saveBtn.disabled) return;
  saveBtn.disabled     = true;
  saveNextBtn.disabled = true;
  const origLabel      = saveBtn.textContent;
  saveBtn.textContent  = 'Speichern…';

  try {

  if (editCardId) {
    // -- EDIT EXISTING CARD --
    let newFrontPath = frontStoragePath;
    let newBackPath  = backStoragePath;

    // Remove old image if user clicked remove
    if (frontImgRemoved && frontStoragePath) {
      await deleteImage(frontStoragePath);
      newFrontPath = null;
    }
    if (backImgRemoved && backStoragePath) {
      await deleteImage(backStoragePath);
      newBackPath = null;
    }

    // Upload new images if provided (replaces old)
    if (frontImgData) {
      if (frontStoragePath) await deleteImage(frontStoragePath);
      newFrontPath = await uploadImage(editCardId, 'front', frontImgData);
    }
    if (backImgData) {
      if (backStoragePath) await deleteImage(backStoragePath);
      newBackPath = await uploadImage(editCardId, 'back', backImgData);
    }

    await fsUpdate('cards', editCardId, {
      front: { text: ft, storagePath: newFrontPath || null },
      back:  { text: bt, storagePath: newBackPath  || null },
    });

  } else {
    // -- NEW CARD --
    // Create doc first to get the Firestore ID, then upload images under that ID
    const newId = await fsAdd('cards', {
      setId:      curSetId,
      front:      { text: ft, storagePath: null },
      back:       { text: bt, storagePath: null },
      nextReview: null,
    });

    let frontPath = null;
    let backPath  = null;
    if (frontImgData) frontPath = await uploadImage(newId, 'front', frontImgData);
    if (backImgData)  backPath  = await uploadImage(newId, 'back',  backImgData);

    if (frontPath !== null || backPath !== null) {
      await fsUpdate('cards', newId, {
        front: { text: ft, storagePath: frontPath || null },
        back:  { text: bt, storagePath: backPath  || null },
      });
    }
  }

  closeCardModal();

  // Bug fix: reset afterSaveView to null when continuing with next card,
  // so the next "Save" doesn't accidentally route back to table view.
  if (andNext) {
    afterSaveView = null;
    await openCardEditor(null);
  } else if (afterSaveView === 'table') {
    afterSaveView = null;
    await renderTable(curSetId);
  } else {
    await renderSet(curSetId);
  }

  } catch (e) {
    console.error('Fehler beim Speichern:', e);
    alert('Fehler beim Speichern. Bitte nochmal versuchen.');
    saveBtn.disabled     = false;
    saveNextBtn.disabled = false;
    saveBtn.textContent  = origLabel;
  }
}

function closeCardModal() {
  document.getElementById('card-modal').classList.remove('open');
}

// ==================== NAME MODAL ====================
function openNameModal(type) {
  document.getElementById('name-modal-title').textContent =
    type === 'folder' ? 'Neuer Ordner' : 'Neues Set';
  document.getElementById('name-input').value = '';

  nameCallback = async name => {
    if (type === 'folder') {
      await fsAdd('folders', { name });
      await renderHome();
    } else {
      await fsAdd('sets', { name, folderId: curFolderId, intervals: DEFAULT_INTERVALS });
      await renderFolder(curFolderId);
    }
  };

  document.getElementById('name-modal').classList.add('open');
  setTimeout(() => document.getElementById('name-input').focus(), 100);
}

async function submitName() {
  const name = document.getElementById('name-input').value.trim();
  if (!name) return;
  // Bug fix: save callback reference BEFORE closeNameModal nulls nameCallback
  const cb = nameCallback;
  closeNameModal();
  if (cb) await cb(name);
}

function closeNameModal() {
  document.getElementById('name-modal').classList.remove('open');
  nameCallback = null;
}

// ==================== CLIPBOARD PASTE ====================
function setupPasteHandlers() {
  [['front-text', 'front'], ['back-text', 'back']].forEach(([textareaId, side]) => {
    document.getElementById(textareaId).addEventListener('paste', e => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          const reader = new FileReader();
          reader.onload = ev => {
            if (side === 'front') {
              frontImgData    = ev.target.result;
              frontImgRemoved = false;
              setImgPreview('front', frontImgData);
            } else {
              backImgData    = ev.target.result;
              backImgRemoved = false;
              setImgPreview('back', backImgData);
            }
            // Green flash feedback so the user knows the paste worked
            const ta = document.getElementById(textareaId);
            ta.classList.add('paste-flash');
            setTimeout(() => ta.classList.remove('paste-flash'), 600);
          };
          reader.readAsDataURL(file);
          return; // image handled — stop iterating
        }
      }
      // No image found → let normal text paste proceed
    });
  });
}

// ==================== AUTH SCREENS ====================
function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('main-screen').style.display  = 'none';
}

function showMainScreen() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display  = 'flex';
}

async function initApp() {
  routeHistory = [];
  await navigate('home');
}

// ==================== BOOT ====================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  buildDOM();
  wireEvents();

  onAuthStateChanged(auth, user => {
    if (user) {
      showMainScreen();
      initApp();
    } else {
      showLoginScreen();
    }
  });
});
