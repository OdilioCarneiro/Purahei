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
   spotify fetch + cache
*/
const cache = {
  artistImg: new Map(),
  trackImg: new Map(),
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


async function enrichWin(win) {
  const w = JSON.parse(JSON.stringify(win || {}));


  w.fromArtist = normArtist(w.fromArtist);
  w.toArtist = normArtist(w.toArtist);
  w.track = normTrack(w.track || w.lastTrack || w.music || null);

  const stepsRaw = Array.isArray(w.steps) ? w.steps : [];
  w.steps = stepsRaw.map(normStep).filter(Boolean);


  const { artistIds, trackIds } = collectMediaIds(w);
  await prefetchMediaImages(artistIds, trackIds);
  applyCachedImagesToWin(w);

  return w;
}

function collectMediaIds(winObj) {
  const artistIds = new Set();
  const trackIds = new Set();

  if (winObj.fromArtist?.id) artistIds.add(winObj.fromArtist.id);
  if (winObj.toArtist?.id) artistIds.add(winObj.toArtist.id);
  if (winObj.track?.id) trackIds.add(winObj.track.id);

  for (const s of (winObj.steps || [])) {
    if (s?.fromArtist?.id) artistIds.add(s.fromArtist.id);
    if (s?.toArtist?.id) artistIds.add(s.toArtist.id);
    if (s?.track?.id) trackIds.add(s.track.id);
  }

  return { artistIds, trackIds };
}

async function prefetchMediaImages(artistIds, trackIds) {
  const artistPromises = [...artistIds].map(id => artistImageById(id));
  const trackPromises = [...trackIds].map(id => trackImageById(id));
  await Promise.all([...artistPromises, ...trackPromises]);
}

function applyCachedImagesToWin(winObj) {
  if (winObj.fromArtist?.id && !winObj.fromArtist.imageUrl) winObj.fromArtist.imageUrl = cache.artistImg.get(winObj.fromArtist.id) || null;
  if (winObj.toArtist?.id && !winObj.toArtist.imageUrl) winObj.toArtist.imageUrl = cache.artistImg.get(winObj.toArtist.id) || null;
  if (winObj.track?.id && !winObj.track.imageUrl) winObj.track.imageUrl = cache.trackImg.get(winObj.track.id) || null;

  for (const s of (winObj.steps || [])) {
    if (s?.fromArtist?.id && !s.fromArtist.imageUrl) s.fromArtist.imageUrl = cache.artistImg.get(s.fromArtist.id) || null;
    if (s?.toArtist?.id && !s.toArtist.imageUrl) s.toArtist.imageUrl = cache.artistImg.get(s.toArtist.id) || null;
    if (s?.track?.id && !s.track.imageUrl) s.track.imageUrl = cache.trackImg.get(s.track.id) || null;
  }
}

/*
   rotas
*/

// post
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
