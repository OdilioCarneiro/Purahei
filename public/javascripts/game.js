// public/javascripts/game.js

/*
   DOM utils
*/
const $ = (id) => document.getElementById(id);
const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function pxFromPercent(p, total) { return (p / 100) * total; }

/*
   Helpers / overlays
*/
function toggleHowTo() {
  const overlay = $('howto-overlay');
  if (!overlay) return;
  overlay.classList.toggle('hidden');
}

function openOverlay(id) { $(id)?.classList.remove('hidden'); }
function closeOverlay(id) { $(id)?.classList.add('hidden'); }

function getStoredArtists() {
  try {
    return JSON.parse(localStorage.getItem('purheire_artists') || 'null');
  } catch {
    return null;
  }
}

function spotifyArtistUrl(id) { return `https://open.spotify.com/artist/${id}`; }
function spotifyTrackUrl(id) { return `https://open.spotify.com/track/${id}`; }

/*
  Device id (para histórico por dispositivo)
*/
function getOrCreateDeviceId() {
  const key = 'purheire_device_id';
  let id = localStorage.getItem(key);
  if (id) return id;

  id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  localStorage.setItem(key, id);
  return id;
}

/*
   UI mode
*/
const UIMode = Object.freeze({
  PLAYING: 'PLAYING',
  CHOOSING_TRACK: 'CHOOSING_TRACK',
  CHOOSING_ARTIST: 'CHOOSING_ARTIST',
  WON: 'WON'
});

let uiMode = UIMode.PLAYING;

function setMode(mode) {
  uiMode = mode;
  const input = $('game-input');
  if (!input) return;
  input.disabled = (mode !== UIMode.PLAYING);
  if (mode === UIMode.PLAYING) input.focus();
}

/*
Zoom
*/
let viewScale = 1;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1;

function worldEl() { return $('game-world'); }

function setZoom(newScale) {
  viewScale = clamp(newScale, ZOOM_MIN, ZOOM_MAX);
  const w = worldEl();
  if (w) w.style.transform = `scale(${viewScale})`;
}

function getZoom() { return viewScale; }

function installZoomHandlers() {
  const sky = $('game-sky');
  if (!sky) return;

  sky.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.10 : 0.90;
    setZoom(getZoom() * factor);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === '+' || e.key === '=') setZoom(getZoom() * 1.10);
    if (e.key === '-') setZoom(getZoom() * 0.90);
    if (e.key === '0') setZoom(1);
  });
}

function localXYWorld(boundsEl, e) {
  const z = getZoom();
  const b = boundsEl.getBoundingClientRect();
  return { x: (e.clientX - b.left) / z, y: (e.clientY - b.top) / z };
}

function getWorldSize(boundsEl) {
  const z = getZoom();
  return { w: boundsEl.clientWidth / z, h: boundsEl.clientHeight / z };
}

/*
   Artist info fetch (cache)
*/
const artistInfoCache = new Map();
const artistInfoInFlight = new Map();

function pickImageUrl(a) {
  return (
    a?.imageUrl ??
    a?.image?.url ??
    a?.images?.[0]?.url ??
    null
  );
}

function normalizeArtistResponse(json, fallbackId) {
  const a = json?.artist || json?.data || json?.body || json?.payload || json;
  return { id: a?.id || fallbackId, name: a?.name || 'Unknown', imageUrl: pickImageUrl(a) };
}

async function fetchArtistInfo(artistId) {
  if (artistInfoCache.has(artistId)) return artistInfoCache.get(artistId);
  if (artistInfoInFlight.has(artistId)) return artistInfoInFlight.get(artistId);

  const p = (async () => {
    const res = await fetch(`/api/spotify/artist/${encodeURIComponent(artistId)}`);
    if (!res.ok) throw new Error(`GET /api/spotify/artist/${artistId} failed: ${res.status}`);

    const json = await res.json();
    const info = normalizeArtistResponse(json, artistId);

    artistInfoCache.set(artistId, info);
    return info;
  })().finally(() => {
    artistInfoInFlight.delete(artistId);
  });

  artistInfoInFlight.set(artistId, p);
  return p;
}

/* 
   Drag
*/
function applyFloatingStyle(cardEl, s, nowMs) {
  cardEl.style.left = `${s.x}px`;
  cardEl.style.top = `${s.y}px`;
  const bob = Math.sin(nowMs / 900 + s.bobPhase) * 3.5;
  const rot = clamp(s.vx * 0.04, -10, 10);
  cardEl.style.transform = `translate(-50%, -50%) translateY(${bob}px) rotate(${rot}deg)`;
}

function initPosition(boundsEl, s, leftPct, topPct, applyFn) {
  const { w, h } = getWorldSize(boundsEl);
  s.x = pxFromPercent(leftPct, w);
  s.y = pxFromPercent(topPct, h);
  s.tx = s.x;
  s.ty = s.y;
  applyFn(0);
}

function shouldStartDrag(s, x, y, slop) {
  if (s.moved) return true;
  const dx = x - s.downX;
  const dy = y - s.downY;
  if (Math.hypot(dx, dy) < slop) return false;
  s.moved = true;
  return true;
}

function beginPointerDrag(cardEl, boundsEl, s, e) {
  const { x, y } = localXYWorld(boundsEl, e);

  s.dragging = true;
  s.pid = e.pointerId;
  s.moved = false;

  s.ox = x - s.x;
  s.oy = y - s.y;

  s.downX = x;
  s.downY = y;

  s.lastX = x;
  s.lastY = y;
  s.lastT = performance.now();

  s.vx = 0;
  s.vy = 0;

  cardEl.classList.add('dragging');
  cardEl.setPointerCapture(e.pointerId);
}

function movePointerDrag(boundsEl, s, e, slop) {
  if (!s.dragging || s.pid !== e.pointerId) return;

  const { x, y } = localXYWorld(boundsEl, e);
  if (!shouldStartDrag(s, x, y, slop)) return;

  s.tx = x - s.ox;
  s.ty = y - s.oy;

  const now = performance.now();
  const dt = Math.max(1, now - s.lastT);

  s.vx = ((x - s.lastX) / dt) * 16;
  s.vy = ((y - s.lastY) / dt) * 16;

  s.lastX = x;
  s.lastY = y;
  s.lastT = now;
}

function endPointerDrag(cardEl, s, e) {
  if (!s.dragging) return;
  if (s.pid !== null && e && e.pointerId !== s.pid) return;

  if (!s.moved) { s.vx = 0; s.vy = 0; }
  else { s.vx *= 0.5; s.vy *= 0.5; }

  s.dragging = false;
  s.pid = null;
  cardEl.classList.remove('dragging');
}

function stepPhysics(boundsEl, cardEl, s) {
  const { w: bw, h: bh } = getWorldSize(boundsEl);
  const w = cardEl.offsetWidth;
  const h = cardEl.offsetHeight;

  const spring = 0.18, damping = 0.80, friction = 0.985, bounce = 0.65;

  if (s.dragging && s.moved) {
    s.vx = (s.vx + (s.tx - s.x) * spring) * damping;
    s.vy = (s.vy + (s.ty - s.y) * spring) * damping;
  } else {
    s.vx *= friction;
    s.vy *= friction;
  }

  s.x += s.vx;
  s.y += s.vy;

  const minX = w / 2, maxX = bw - w / 2;
  const minY = h / 2, maxY = bh - h / 2;

  if (s.x < minX) { s.x = minX; s.vx = -s.vx * bounce; }
  if (s.x > maxX) { s.x = maxX; s.vx = -s.vx * bounce; }
  if (s.y < minY) { s.y = minY; s.vy = -s.vy * bounce; }
  if (s.y > maxY) { s.y = maxY; s.vy = -s.vy * bounce; }
}

function createFloatingDraggable(cardEl, boundsEl, initialPercentLeft, initialPercentTop) {
  const s = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    tx: 0, ty: 0,
    dragging: false,
    pid: null,
    ox: 0, oy: 0,
    lastX: 0, lastY: 0, lastT: 0,
    bobPhase: Math.random() * Math.PI * 2,
    downX: 0, downY: 0,
    moved: false
  };

  const DRAG_SLOP = 6;
  const apply = (nowMs) => applyFloatingStyle(cardEl, s, nowMs);

  initPosition(boundsEl, s, initialPercentLeft, initialPercentTop, apply);

  cardEl.addEventListener('pointerdown', (e) => beginPointerDrag(cardEl, boundsEl, s, e));
  cardEl.addEventListener('pointermove', (e) => movePointerDrag(boundsEl, s, e, DRAG_SLOP));
  cardEl.addEventListener('pointerup', (e) => endPointerDrag(cardEl, s, e));
  cardEl.addEventListener('pointercancel', (e) => endPointerDrag(cardEl, s, e));

  function tick(now) {
    stepPhysics(boundsEl, cardEl, s);
    apply(now);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/*
   SVG edges (screen coords)
*/
const edges = []; // { id, fromEl, toEl }

function getCenterInSkyScreen(el, skyEl) {
  const r = el.getBoundingClientRect();
  const b = skyEl.getBoundingClientRect();
  return { x: (r.left + r.width / 2) - b.left, y: (r.top + r.height / 2) - b.top };
}

function ensureLine(svgEl, id) {
  let line = svgEl.querySelector(`line[data-edge-id="${id}"]`);
  if (line) return line;

  line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('stroke', 'rgba(255,212,110,0.55)');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('data-edge-id', id);
  svgEl.appendChild(line);
  return line;
}

function updateLine(svgEl, edge, skyEl) {
  const a = getCenterInSkyScreen(edge.fromEl, skyEl);
  const b = getCenterInSkyScreen(edge.toEl, skyEl);
  const line = ensureLine(svgEl, edge.id);
  line.setAttribute('x1', a.x);
  line.setAttribute('y1', a.y);
  line.setAttribute('x2', b.x);
  line.setAttribute('y2', b.y);
}

function startEdgesLoop() {
  const skyEl = $('game-sky');
  const svgEl = $('edges');
  if (!skyEl || !svgEl) return;

  function tick() {
    for (const e of edges) updateLine(svgEl, e, skyEl);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/*
   Nodes + state
*/
const artistNodes = new Map(); 
const trackNodes = new Map();  

let LEFT_ID = null;
let TARGET_ID = null;

let currentArtist = null; 
let selectedArtistEl = null;
let gameWon = false;

let songsFound = 0;
const pathSteps = []; 

function updateHUD() {
  setText('songs-found', String(songsFound));
  setText('best-path', String(pathSteps.length));
  setText('current-artist-label', currentArtist?.name || '—');
}

function setSelectedArtistById(artistId) {
  if (selectedArtistEl) selectedArtistEl.classList.remove('selected');
  selectedArtistEl = artistNodes.get(artistId) || null;
  if (selectedArtistEl) selectedArtistEl.classList.add('selected');

  const input = $('game-input');
  if (input && currentArtist) input.placeholder = `MÚSICA DO(A) ${currentArtist.name.toUpperCase()}...`;
}

function updateArtistNodeUI(artistId, info) {
  const el = artistNodes.get(artistId);
  if (!el || !info) return;

  const nm = el.querySelector('.artist-card-name');
  const img = el.querySelector('img');

  const name = info.name && info.name !== 'Unknown' ? info.name : null;
  if (name) {
    el.dataset.displayName = name;
    nm && (nm.textContent = name);
  }

  if (info.imageUrl && img) {
    img.src = info.imageUrl;
    img.alt = name ?? img.alt ?? 'Artist';
  }
}

async function setCurrentArtistById(artistId) {
  if (gameWon) return;
  if (uiMode !== UIMode.PLAYING) return;

  const el = artistNodes.get(artistId);
  if (!el) return;

  try {
    const info = await fetchArtistInfo(artistId);
    currentArtist = info;
    updateArtistNodeUI(artistId, info);
  } catch {
    currentArtist = { id: artistId, name: el.dataset.displayName || 'Artist', imageUrl: null };
  }

  setSelectedArtistById(artistId);
  updateHUD();
}

/*
   WIN
*/
function buildAdjacencyFromSteps(steps) {
  const adj = new Map();
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
  };

  for (const s of steps) {
    add(s.fromArtist.id, s.toArtist.id);
    add(s.toArtist.id, s.fromArtist.id);
  }
  return adj;
}

function bfsHasPath(adj, startId, targetId) {
  if (startId === targetId) return true;

  const q = [startId];
  const visited = new Set([startId]);

  for (let head = 0; head < q.length; head++) {
    const u = q[head];
    const neighbors = adj.get(u) ?? [];
    for (const v of neighbors) {
      if (v === targetId) return true;
      if (visited.has(v)) continue;
      visited.add(v);
      q.push(v);
    }
  }
  return false;
}

/*
  Salvar vitória no histórico (Mongo) - dispara no win
*/
async function saveWinToHistory() {
  try {
    const stored = getStoredArtists();

    const fromInfo = await fetchArtistInfo(LEFT_ID)
      .catch(() => stored?.left || { id: LEFT_ID, name: 'Artist', imageUrl: null });

    const toInfo = await fetchArtistInfo(TARGET_ID)
      .catch(() => stored?.right || { id: TARGET_ID, name: 'Artist', imageUrl: null });

    const lastStep = pathSteps[pathSteps.length - 1];
    const track = lastStep?.track;
    if (!track?.id) return;

    const payload = {
      deviceId: getOrCreateDeviceId(),
      fromArtist: {
        id: fromInfo.id,
        name: fromInfo.name,
        imageUrl: fromInfo.imageUrl || null,
        spotifyUrl: spotifyArtistUrl(fromInfo.id),
      },
      toArtist: {
        id: toInfo.id,
        name: toInfo.name,
        imageUrl: toInfo.imageUrl || null,
        spotifyUrl: spotifyArtistUrl(toInfo.id),
      },
      track: {
        id: track.id,
        name: track.name,
        imageUrl: null,
        spotifyUrl: spotifyTrackUrl(track.id),
      },
      steps: pathSteps, 
    };

    const res = await fetch('/api/history/win', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('Falha ao salvar histórico:', res.status, txt);
    }
  } catch (err) {
    console.error('saveWinToHistory error:', err);
  }
}

function tryWinAfterNewConnection() {
  if (gameWon) return;
  if (!LEFT_ID || !TARGET_ID) return;
  if (!pathSteps.length) return;

  const adj = buildAdjacencyFromSteps(pathSteps);
  if (!bfsHasPath(adj, LEFT_ID, TARGET_ID)) return;

  gameWon = true;
  setMode(UIMode.WON);
  showWin();
  saveWinToHistory(); 
}

/*
   Create nodes
*/
function attachArtistClick(el, artistId) {
  on(el, 'click', (e) => {
    const tag = e.target?.tagName;
    if (tag === 'A' || tag === 'BUTTON') return;
    setCurrentArtistById(artistId);
  });
}

function createCardElement({ nodeType, id, name, imageUrl }) {
  const el = document.createElement('div');
  el.className = 'artist-card';
  el.dataset.nodeType = nodeType;
  el.dataset.spotifyId = id;
  el.dataset.displayName = name || '...';

  el.innerHTML = `
    <div class="artist-photo"><img class="artist-img" alt=""></div>
    <p class="artist-card-name"></p>
  `;

  const nm = el.querySelector('.artist-card-name');
  const img = el.querySelector('img');

  if (nm) nm.textContent = name || '...';
  if (img) {
    if (imageUrl) img.src = imageUrl;
    img.alt = name || 'Artist';
  }

  return el;
}

function createArtistNode(artist, skyEl, xPct = 55, yPct = 55) {
  if (artistNodes.has(artist.id)) return artistNodes.get(artist.id);

  const el = createCardElement({
    nodeType: 'artist',
    id: artist.id,
    name: artist.name || '...',
    imageUrl: artist.imageUrl || null
  });

  worldEl()?.appendChild(el);
  createFloatingDraggable(el, skyEl, xPct, yPct);

  artistNodes.set(artist.id, el);
  attachArtistClick(el, artist.id);

  fetchArtistInfo(artist.id).then((info) => updateArtistNodeUI(artist.id, info)).catch(() => {});
  return el;
}

function createTrackNode(track, skyEl, nearEl) {
  if (trackNodes.has(track.id)) return trackNodes.get(track.id);

  const el = createCardElement({
    nodeType: 'track',
    id: track.id,
    name: track.name,
    imageUrl: track.imageUrl || null
  });

  // spawn near
  const z = getZoom();
  const skyRect = skyEl.getBoundingClientRect();
  const near = nearEl.getBoundingClientRect();

  const cxScreen = (near.left + near.width / 2) - skyRect.left;
  const cyScreen = (near.top + near.height / 2) - skyRect.top;

  const cx = cxScreen / z;
  const cy = cyScreen / z;

  el.style.left = `${cx + 190}px`;
  el.style.top = `${cy}px`;
  el.style.transform = 'translate(-50%, -50%)';

  worldEl()?.appendChild(el);

  const { w: worldW, h: worldH } = getWorldSize(skyEl);
  const leftPct = ((cx + 190) / Math.max(1, worldW)) * 100;
  const topPct = (cy / Math.max(1, worldH)) * 100;

  createFloatingDraggable(el, skyEl, leftPct, topPct);

  trackNodes.set(track.id, el);
  return el;
}

/*
   Win modal
*/
function showWin() {
  const list = $('win-list');
  if (!list) return;

  list.innerHTML = '';
  for (const step of pathSteps) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div>
        <a href="${spotifyArtistUrl(step.fromArtist.id)}" target="_blank" rel="noopener noreferrer">${step.fromArtist.name}</a>
        → <a href="${spotifyTrackUrl(step.track.id)}" target="_blank" rel="noopener noreferrer">${step.track.name}</a>
        → <a href="${spotifyArtistUrl(step.toArtist.id)}" target="_blank" rel="noopener noreferrer">${step.toArtist.name}</a>
      </div>
    `;
    list.appendChild(row);
  }

  openOverlay('win-overlay');
}

/*
   API calls
*/
async function searchTracksForArtist(artistId, trackQuery) {
  const url =
    `/api/spotify/track/search-for-artist` +
    `?artistId=${encodeURIComponent(artistId)}` +
    `&trackQuery=${encodeURIComponent(trackQuery)}` +
    `&limit=10`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`track search failed: ${res.status}`);
  return res.json();
}

/*
   Modals (no inline style)
*/
function renderTrackChoices(tracks) {
  const list = $('track-choices-list');
  if (!list) return;

  list.innerHTML = '';

  if (!tracks.length) {
    const div = document.createElement('div');
    div.className = 'row';
    div.textContent = 'Nenhum resultado válido para esse artista.';
    list.appendChild(div);
    return;
  }

  for (const t of tracks) {
    const row = document.createElement('div');
    row.className = 'row choice';

    const artistsText = (t.artists || []).map(a => a.name).join(', ');

    row.innerHTML = `
      <div class="choice-title">${t.name}</div>
      <div class="choice-subtitle">${artistsText}</div>
      <div class="choice-actions">
        <button class="secondary secondary-inline" type="button">ESCOLHER</button>
        <a class="secondary secondary-inline" href="${spotifyTrackUrl(t.id)}" target="_blank" rel="noopener noreferrer">ABRIR NO SPOTIFY</a>
      </div>
    `;

    on(row.querySelector('button'), 'click', () => {
      closeOverlay('track-choices-overlay');
      showArtistChoicesForTrack(t);
    });

    list.appendChild(row);
  }
}

function makeArtistChoiceRow(track, artist) {
  const row = document.createElement('div');
  row.className = 'row choice';

  const head = document.createElement('div');
  head.className = 'choice-artist-head';

  const avatar = document.createElement('div');
  avatar.className = 'choice-avatar';

  const img = document.createElement('img');
  img.className = 'choice-avatar-img';
  img.alt = artist.name || 'Artist';
  img.dataset.artistThumb = artist.id;

  const name = document.createElement('div');
  name.className = 'choice-artist-name';
  name.textContent = artist.name ?? '';

  avatar.appendChild(img);
  head.appendChild(avatar);
  head.appendChild(name);

  const actions = document.createElement('div');
  actions.className = 'choice-actions';

  const btn = document.createElement('button');
  btn.className = 'secondary secondary-inline';
  btn.type = 'button';
  btn.textContent = 'ESCOLHER COMO PRÓXIMO';

  const link = document.createElement('a');
  link.className = 'secondary secondary-inline';
  link.href = spotifyArtistUrl(artist.id);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'ABRIR ARTISTA';

  actions.appendChild(btn);
  actions.appendChild(link);

  row.appendChild(head);
  row.appendChild(actions);

  fetchArtistInfo(artist.id)
    .then(info => { if (info?.imageUrl) img.src = info.imageUrl; })
    .catch(() => {});

  on(btn, 'click', () => {
    closeOverlay('artist-choices-overlay');
    applyStep(track, artist);
  });

  return row;
}

function showArtistChoicesForTrack(track) {
  const list = $('artist-choices-list');
  if (!list) return;

  list.textContent = '';

  const candidates = (track.artists ?? []).filter(a => a.id !== currentArtist.id);

  if (!candidates.length) {
    const div = document.createElement('div');
    div.className = 'row';
    div.textContent = 'Essa música não tem outro artista para escolher.';
    list.appendChild(div);
  } else {
    for (const a of candidates) list.appendChild(makeArtistChoiceRow(track, a));
  }

  openOverlay('artist-choices-overlay');
  setMode(UIMode.CHOOSING_ARTIST);
}

/*
   Apply step
*/
function addEdge(fromEl, toEl) {
  edges.push({ id: `e-${edges.length}`, fromEl, toEl });
}

async function applyStep(track, nextArtist) {
  if (gameWon) return;

  const skyEl = $('game-sky');
  if (!skyEl) return;

  setMode(UIMode.PLAYING);

  const fromEl = artistNodes.get(currentArtist.id);
  if (!fromEl) return;

  const trackEl = createTrackNode(track, skyEl, fromEl);
  const nextEl = createArtistNode(
    { id: nextArtist.id, name: nextArtist.name, imageUrl: null },
    skyEl,
    55,
    55
  );

  addEdge(fromEl, trackEl);
  addEdge(trackEl, nextEl);

  pathSteps.push({
    fromArtist: { id: currentArtist.id, name: currentArtist.name },
    track: { id: track.id, name: track.name },
    toArtist: { id: nextArtist.id, name: nextArtist.name }
  });

  songsFound += 1;

  try {
    const info = await fetchArtistInfo(nextArtist.id);
    currentArtist = info;
    updateArtistNodeUI(info.id, info);
  } catch {
    currentArtist = { id: nextArtist.id, name: nextArtist.name, imageUrl: null };
  }

  setSelectedArtistById(currentArtist.id);
  updateHUD();

  tryWinAfterNewConnection();
}

/*
   Submit
*/
function canSubmitQuery() {
  return !gameWon && uiMode === UIMode.PLAYING && !!currentArtist;
}

function readQueryAndClearInput() {
  const input = $('game-input');
  const q = input?.value?.trim() ?? '';
  if (input) input.value = '';
  return q;
}

async function loadAndShowTrackChoices(artistId, q) {
  setMode(UIMode.CHOOSING_TRACK);

  const result = await searchTracksForArtist(artistId, q);
  const tracks = result.ok ? (result.tracks ?? []) : [];

  renderTrackChoices(tracks);
  openOverlay('track-choices-overlay');
}

async function onSubmitQuery() {
  if (!canSubmitQuery()) return;

  const q = readQueryAndClearInput();
  if (!q) return;

  try {
    await loadAndShowTrackChoices(currentArtist.id, q);
  } catch {
    closeOverlay('track-choices-overlay');
    setMode(UIMode.PLAYING);
  }
}

/*
   Boot
*/
document.addEventListener('DOMContentLoaded', () => {
  const ctx = buildGameContext();
  if (!ctx) return;

  initZoom();
  fillMainCards(ctx);
  registerCoreNodes(ctx);
  initDragging(ctx);
  initInitialSelection(ctx);
  polishArtistsAsync(ctx);
  registerUIEvents();
  startGameLoop();
});

function buildGameContext() {
  const sky = $('game-sky');
  const world = worldEl();
  if (!sky || !world) return null;

  const stored = getStoredArtists();
  if (!stored?.left?.id || !stored?.right?.id) {
    window.location.href = '/';
    return null;
  }

  LEFT_ID = stored.left.id;
  TARGET_ID = stored.right.id;

  return { sky, world, stored };
}

function initZoom() {
  setZoom(1);
  installZoomHandlers();
}

function fillMainCards({ stored }) {
  setText('game-artist-left-label', stored.left.name.toUpperCase());
  setText('game-artist-right-label', stored.right.name.toUpperCase());

  const cardLeft = $('card-left');
  const cardRight = $('card-right');

  if (cardLeft) {
    cardLeft.dataset.spotifyId = stored.left.id;
    cardLeft.dataset.displayName = stored.left.name;
    setText('card-left-name', stored.left.name);
    const img = $('card-left-img');
    if (stored.left.imageUrl && img) img.src = stored.left.imageUrl;
  }

  if (cardRight) {
    cardRight.dataset.spotifyId = stored.right.id;
    cardRight.dataset.displayName = stored.right.name;
    setText('card-right-name', stored.right.name);
    const img = $('card-right-img');
    if (stored.right.imageUrl && img) img.src = stored.right.imageUrl;
  }
}

function registerCoreNodes({ stored }) {
  const cardLeft = $('card-left');
  const cardRight = $('card-right');

  if (cardLeft) {
    artistNodes.set(stored.left.id, cardLeft);
    attachArtistClick(cardLeft, stored.left.id);
  }

  if (cardRight) {
    artistNodes.set(stored.right.id, cardRight);
    attachArtistClick(cardRight, stored.right.id);
  }
}

function initDragging({ sky }) {
  const cardLeft = $('card-left');
  const cardRight = $('card-right');
  createFloatingDraggable(cardLeft, sky, 42, 50);
  createFloatingDraggable(cardRight, sky, 58, 50);
}

function initInitialSelection({ stored }) {
  currentArtist = { id: stored.left.id, name: stored.left.name, imageUrl: stored.left.imageUrl || null };
  setSelectedArtistById(currentArtist.id);
  updateHUD();
  setMode(UIMode.PLAYING);
}

function polishArtistsAsync({ stored }) {
  fetchArtistInfo(stored.left.id)
    .then((info) => {
      updateArtistNodeUI(info.id, info);
      currentArtist = info;
    })
    .catch(() => {})
    .finally(() => {
      updateHUD();
      setSelectedArtistById(currentArtist.id);
    });

  fetchArtistInfo(stored.right.id)
    .then((info) => updateArtistNodeUI(info.id, info))
    .catch(() => {});
}

function registerUIEvents() {
  on($('game-input'), 'keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    onSubmitQuery();
  });

  on($('btn-close-track-choices'), 'click', () => {
    closeOverlay('track-choices-overlay');
    setMode(UIMode.PLAYING);
  });

  on($('btn-close-artist-choices'), 'click', () => {
    closeOverlay('artist-choices-overlay');
    setMode(UIMode.PLAYING);
  });

  on($('btn-close-win'), 'click', () => closeOverlay('win-overlay'));
  on($('btn-play-again'), 'click', () => { window.location.href = '/'; });
}

function startGameLoop() {
  startEdgesLoop();
}
