// public/javascripts/historico.js

function getOrCreateDeviceId() {
  const key = 'purheire_device_id';
  let id = localStorage.getItem(key);
  if (id) return id;

  id = (crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2));

  localStorage.setItem(key, id);
  return id;
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

const A_PH = '/assets/profile.png';
const T_PH = '/assets/profile.png';

const artistUrl = (id) =>
  `https://open.spotify.com/artist/${encodeURIComponent(id || '')}`;
const trackUrl = (id) =>
  `https://open.spotify.com/track/${encodeURIComponent(id || '')}`;

function uniqArtistsFromSteps(steps) {
  const map = new Map();
  for (const s of steps) {
    const a = s?.fromArtist;
    const b = s?.toArtist;
    if (a?.id && !map.has(a.id)) map.set(a.id, a);
    if (b?.id && !map.has(b.id)) map.set(b.id, b);
  }
  return [...map.values()];
}

function renderArtistRow(a) {
  return `
    <li class="hrow">
      <img class="hthumb" src="${esc(a?.imageUrl || A_PH)}" alt="${esc(a?.name)}">
      <span class="hlabel">${esc(a?.name || 'Artista')}</span>
      <a class="hplay" href="${esc(a?.spotifyUrl || artistUrl(a?.id))}"
         target="_blank" rel="noopener noreferrer">OUVIR</a>
    </li>
  `;
}

function renderTrackRow(step) {
  const t = step?.track || {};
  const who = [step?.fromArtist?.name, step?.toArtist?.name]
    .filter(Boolean)
    .join(' FEAT ');

  return `
    <li class="hrow">
      <img class="hthumb" src="${esc(t?.imageUrl || T_PH)}" alt="${esc(t?.name)}">
      <div class="hstack">
        <span class="hlabel">${esc(t?.name || 'Música')}</span>
        <span class="hsub">${esc(who)}</span>
      </div>
      <a class="hplay" href="${esc(t?.spotifyUrl || trackUrl(t?.id))}"
         target="_blank" rel="noopener noreferrer">OUVIR</a>
    </li>
  `;
}

function buildCardFromTemplate(win, idx) {
  const template = document.getElementById('history-card-template');
  if (!template) throw new Error('Template #history-card-template não encontrado no historico.ejs');

  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector('[data-history-card]');
  const panel = fragment.querySelector('.hexpand');
  const btn = fragment.querySelector('.hbtn');

  const from = win.fromArtist || {};
  const to = win.toArtist || {};
  const steps = Array.isArray(win.steps) ? win.steps : [];
  const artistsUsed = uniqArtistsFromSteps(steps);

  const expId = `exp-${idx}`;


  if (btn) btn.setAttribute('aria-controls', expId);
  if (panel) panel.id = expId;


  const leftImg = fragment.querySelector('.hcell--left .hart');
  const rightImg = fragment.querySelector('.hcell--right .hart');

  if (leftImg) {
    leftImg.src = from.imageUrl || A_PH;
    leftImg.alt = from.name || 'Artista inicial';
  }
  if (rightImg) {
    rightImg.src = to.imageUrl || A_PH;
    rightImg.alt = to.name || 'Artista alvo';
  }

  const artistsList = fragment.querySelector('[data-role="artists"]');
  const tracksList = fragment.querySelector('[data-role="tracks"]');

  if (artistsList) {
    artistsList.innerHTML = artistsUsed.length
      ? artistsUsed.map(renderArtistRow).join('')
      : `<li class="hrow"><span class="hlabel">Sem artistas.</span></li>`;
  }

  if (tracksList) {
    tracksList.innerHTML = steps.length
      ? steps.map(renderTrackRow).join('')
      : `<li class="hrow"><span class="hlabel">Sem músicas.</span></li>`;
  }

  return card;
}

function toggleCard(card) {
  const btn = card.querySelector('.hbtn');
  const panel = card.querySelector('.hexpand');
  const isOpen = card.classList.contains('is-open');

  if (isOpen) {
    card.classList.add('closing');
    card.classList.remove('is-open');
    btn?.setAttribute('aria-expanded', 'false');

    setTimeout(() => {
      if (panel) panel.hidden = true;
      card.classList.remove('closing');
    }, 600);
  } else {
    if (panel) panel.hidden = false;
    requestAnimationFrame(() => {
      card.classList.add('is-open');
      btn?.setAttribute('aria-expanded', 'true');
    });
  }
}

async function loadHistory() {
  const deviceId = getOrCreateDeviceId();
  const res = await fetch(`/api/history?deviceId=${encodeURIComponent(deviceId)}`);
  const data = await res.json();

  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const wins = (data && data.ok && Array.isArray(data.wins)) ? data.wins : [];

  if (!wins.length) {
    empty?.classList.remove('hidden');
    if (list) list.innerHTML = '';
    return;
  }

  empty?.classList.add('hidden');
  if (!list) return;

  list.innerHTML = '';
  wins.forEach((win, idx) => {
    const card = buildCardFromTemplate(win, idx);
    list.appendChild(card);
  });
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.hbtn');
  if (!btn) return;
  const card = btn.closest('[data-history-card]');
  if (card) toggleCard(card);
});

document.addEventListener('DOMContentLoaded', () => {
  loadHistory().catch((err) => console.error('loadHistory error:', err));
});
