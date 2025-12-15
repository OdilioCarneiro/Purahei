// routes/spotify.js
const express = require('express');
const router = express.Router();

console.log('SPOTIFY ROUTER CARREGOU (routes/spotify.js)');
router.get('/ping', (req, res) => res.send('pong'));

const { getAccessToken } = require('../services/spotifyAuth');

async function spotifyFetch(path) {
  const token = await getAccessToken();

  const r = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await r.text();

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = { raw: text };
  }

  if (!r.ok) {
    console.error('SPOTIFY API ERROR', {
      status: r.status,
      path,
      body: json,
    });
    return { ok: false, status: r.status, json };
  }

  return { ok: true, status: r.status, json };
}

// GET /api/spotify/artist?q=...&limit=5
router.get('/artist', async (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit || '5', 10), 10);
  if (!q) return res.json([]);

  const r = await spotifyFetch(`/search?q=${encodeURIComponent(q)}&type=artist&limit=${limit}`);
  if (!r.ok) {
    return res.status(r.status).json({
      ok: false,
      reason: 'spotify_search_failed',
      details: r.json
    });
  }

  const items = r.json?.artists?.items || [];
  return res.json(items.map(a => ({
    id: a.id,
    name: a.name,
    imageUrl: a.images?.[0]?.url || null,
  })));
});

// GET /api/spotify/artist/:id
router.get('/artist/:id', async (req, res) => {
  const id = (req.params.id || '').trim();
  if (!id) return res.status(400).json({ ok: false, reason: 'missing_id' });

  const r = await spotifyFetch(`/artists/${encodeURIComponent(id)}`);
  if (!r.ok) {
    return res.status(r.status).json({
      ok: false,
      reason: 'spotify_get_artist_failed',
      details: r.json
    });
  }

  return res.json({
    ok: true,
    artist: {
      id: r.json.id,
      name: r.json.name,
      imageUrl: r.json.images?.[0]?.url || null
    }
  });
});

// (compatibilidade) GET /api/spotify/track/validate?fromArtistId=...&toArtistId=...&trackQuery=...
router.get('/track/validate', async (req, res) => {
  const fromArtistId = (req.query.fromArtistId || '').trim();
  const toArtistId = (req.query.toArtistId || '').trim();
  const trackQuery = (req.query.trackQuery || '').trim();
  const limit = Math.min(parseInt(req.query.limit || '8', 10), 20);

  if (!fromArtistId || !toArtistId || !trackQuery) {
    return res.status(400).json({ ok: false, reason: 'missing_params' });
  }

  const s = await spotifyFetch(`/search?q=${encodeURIComponent(trackQuery)}&type=track&limit=${limit}`);
  if (!s.ok) {
    return res.status(s.status).json({
      ok: false,
      reason: 'spotify_search_failed',
      details: s.json
    });
  }

  const items = s.json?.tracks?.items || [];
  if (!items.length) return res.json({ ok: false, reason: 'no_track_found' });

  const track = items[0];
  const ids = (track.artists || []).map(a => a.id);

  const ok = ids.includes(fromArtistId) && ids.includes(toArtistId);
  return res.json({
    ok,
    reason: ok ? null : 'track_not_connecting',
    track: {
      id: track.id,
      name: track.name,
      imageUrl: track.album?.images?.[0]?.url || null,
      artists: (track.artists || []).map(a => ({ id: a.id, name: a.name })),
    }
  });
});

// GET /api/spotify/track/validate-for-artist?artistId=...&trackQuery=...
router.get('/track/validate-for-artist', async (req, res) => {
  const artistId = (req.query.artistId || '').trim();
  const trackQuery = (req.query.trackQuery || '').trim();
  const limit = Math.min(parseInt(req.query.limit || '8', 10), 20);

  if (!artistId || !trackQuery) {
    return res.status(400).json({ ok: false, reason: 'missing_params' });
  }

  const s = await spotifyFetch(`/search?q=${encodeURIComponent(trackQuery)}&type=track&limit=${limit}`);
  if (!s.ok) {
    return res.status(s.status).json({
      ok: false,
      reason: 'spotify_search_failed',
      details: s.json
    });
  }

  const items = s.json?.tracks?.items || [];
  if (!items.length) return res.json({ ok: false, reason: 'no_track_found' });

  const track = items[0];
  const ids = (track.artists || []).map(a => a.id);

  if (!ids.includes(artistId)) {
    return res.json({
      ok: false,
      reason: 'track_not_from_selected_artist',
      track: {
        id: track.id,
        name: track.name,
        imageUrl: track.album?.images?.[0]?.url || null,
        artists: (track.artists || []).map(a => ({ id: a.id, name: a.name })),
      }
    });
  }

  return res.json({
    ok: true,
    track: {
      id: track.id,
      name: track.name,
      imageUrl: track.album?.images?.[0]?.url || null,
      artists: (track.artists || []).map(a => ({ id: a.id, name: a.name })),
    }
  });
});

// GET /api/spotify/track/search-for-artist?artistId=...&trackQuery=...&limit=8
router.get('/track/search-for-artist', async (req, res) => {
  const artistId = (req.query.artistId || '').trim();
  const trackQuery = (req.query.trackQuery || '').trim();
  const limit = Math.min(parseInt(req.query.limit || '8', 10), 20);

  if (!artistId || !trackQuery) {
    return res.status(400).json({ ok: false, reason: 'missing_params' });
  }

  const s = await spotifyFetch(`/search?q=${encodeURIComponent(trackQuery)}&type=track&limit=${limit}`);
  if (!s.ok) {
    return res.status(s.status).json({
      ok: false,
      reason: 'spotify_search_failed',
      details: s.json
    });
  }

  const items = s.json?.tracks?.items || [];

  const filtered = items.filter(t =>
    (t.artists || []).some(a => a.id === artistId)
  );

  return res.json({
    ok: true,
    tracks: filtered.map(t => ({
      id: t.id,
      name: t.name,
      imageUrl: t.album?.images?.[0]?.url || null,
      artists: (t.artists || []).map(a => ({ id: a.id, name: a.name }))
    }))
  });
});

module.exports = router;
