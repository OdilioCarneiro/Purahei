// routes/history.js
var express = require('express');
var router = express.Router();
const { getDb } = require('../db/mongo');
const { getAccessToken } = require('../services/spotifyAuth');

/*
   Helpers: normalização
*/
function pickFirstImageUrl(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  return images[0]?.url || null;
}

function normArtist(a) {
  if (!a) return null;
  return {
    id: a.id || null,
    name: a.name || null,
    spotifyUrl: a.spotifyUrl || a.external_urls?.spotify || null,
    imageUrl: a.imageUrl || pickFirstImageUrl(a.images) || null,
  };
}

function normTrack(t) {
  if (!t) return null;
  return {
    id: t.id || null,
    name: t.name || null,
    spotifyUrl: t.spotifyUrl || t.external_urls?.spotify || null,
    imageUrl: t.imageUrl || pickFirstImageUrl(t.album?.images) || null,
  };
}


function normStep(s) {
  if (!s) return null;

  const track = s.track || s.chosenTrack || s.music || null;

  return {
    fromArtist: normArtist(s.fromArtist),
    toArtist: normArtist(s.toArtist),
    track: normTrack(track),
  };
}

/* 
   Spotify fetch + cache
*/
const cache = {
  artistImg: new Map(), // id -> url|null
  trackImg: new Map(),  // id -> url|null
};

async function spotifyFetch(path) {
  const token = await getAccessToken();
  const r = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { json = { raw: text }; }

  if (!r.ok) {
    console.error('HISTORY spotifyFetch ERROR', { status: r.status, path, body: json });
    return { ok: false, status: r.status, json };
  }
  return { ok: true, status: r.status, json };
}

async function artistImageById(id) {
  if (!id) return null;
  if (cache.artistImg.has(id)) return cache.artistImg.get(id);

  const r = await spotifyFetch(`/artists/${encodeURIComponent(id)}`);
  const url = r.ok ? (r.json?.images?.[0]?.url || null) : null; 
  cache.artistImg.set(id, url);
  return url;
}

async function trackImageById(id) {
  if (!id) return null;
  if (cache.trackImg.has(id)) return cache.trackImg.get(id);

  const r = await spotifyFetch(`/tracks/${encodeURIComponent(id)}`);
  const url = r.ok ? (r.json?.album?.images?.[0]?.url || null) : null; 
  cache.trackImg.set(id, url);
  return url;
}

/* 
   Enriquecimento de win
*/
async function enrichWin(win) {

  const w = JSON.parse(JSON.stringify(win || {}));

  // Normaliza topo 
  w.fromArtist = normArtist(w.fromArtist);
  w.toArtist = normArtist(w.toArtist);
  w.track = normTrack(w.track || w.lastTrack || w.music || null);

  // Normaliza steps
  const stepsRaw = Array.isArray(w.steps) ? w.steps : [];
  w.steps = stepsRaw.map(normStep).filter(Boolean);

  // Lista de ids a buscar
  const artistIds = new Set();
  const trackIds = new Set();

  if (w.fromArtist?.id) artistIds.add(w.fromArtist.id);
  if (w.toArtist?.id) artistIds.add(w.toArtist.id);
  if (w.track?.id) trackIds.add(w.track.id);

  for (const s of w.steps) {
    if (s?.fromArtist?.id) artistIds.add(s.fromArtist.id);
    if (s?.toArtist?.id) artistIds.add(s.toArtist.id);
    if (s?.track?.id) trackIds.add(s.track.id);
  }

  // Busca imagens em paralelo
  await Promise.all([
    ...[...artistIds].map(async (id) => { await artistImageById(id); }),
    ...[...trackIds].map(async (id) => { await trackImageById(id); }),
  ]);

  // Aplica imagens onde estiver faltando
  if (w.fromArtist?.id && !w.fromArtist.imageUrl) w.fromArtist.imageUrl = await artistImageById(w.fromArtist.id);
  if (w.toArtist?.id && !w.toArtist.imageUrl) w.toArtist.imageUrl = await artistImageById(w.toArtist.id);
  if (w.track?.id && !w.track.imageUrl) w.track.imageUrl = await trackImageById(w.track.id);

  for (const s of w.steps) {
    if (s?.fromArtist?.id && !s.fromArtist.imageUrl) s.fromArtist.imageUrl = await artistImageById(s.fromArtist.id);
    if (s?.toArtist?.id && !s.toArtist.imageUrl) s.toArtist.imageUrl = await artistImageById(s.toArtist.id);
    if (s?.track?.id && !s.track.imageUrl) s.track.imageUrl = await trackImageById(s.track.id);
  }

  return w;
}

/*
   ROTAS
*/

// POST
router.post('/win', async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const deviceId = String(b.deviceId ?? '').trim();
    if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId required' });


    if (!b.fromArtist?.id || !b.toArtist?.id || !b.track?.id) {
      return res.status(400).json({ ok: false, error: 'fromArtist/toArtist/track required' });
    }

    const db = await getDb();
    const col = db.collection('wins');

    const doc = {
      deviceId,
      fromArtist: normArtist(b.fromArtist),
      toArtist: normArtist(b.toArtist),
      track: normTrack(b.track),
      steps: (Array.isArray(b.steps) ? b.steps : []).map(normStep).filter(Boolean),
      createdAt: new Date(),
    };

    await col.insertOne(doc);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const deviceId = String(req.query.deviceId ?? '').trim();
    if (!deviceId) return res.status(400).json({ ok: false, error: 'deviceId required' });

    const db = await getDb();
    const col = db.collection('wins');

    const winsRaw = await col.find({ deviceId })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    const wins = await Promise.all(winsRaw.map(enrichWin));

    res.json({ ok: true, wins });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
