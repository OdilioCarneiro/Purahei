// routes/spotify.js
const express = require('express');
const router = express.Router();

console.log('SPOTIFY ROUTER CARREGOU (routes/spotify.js)');
router.get('/ping', (req, res) => res.send('pong'));

const { getAccessToken } = require('../services/spotifyAuth');

/* Helpers */
function formatTrackResponse(track) {
  return {
    id: track.id,
    name: track.name,
    imageUrl: track.album?.images?.[0]?.url || null,
    artists: (track.artists || []).map(a => ({ id: a.id, name: a.name }))
  };
}

function formatArtistResponse(artist) {
  return {
    id: artist.id,
    name: artist.name,
    imageUrl: artist.images?.[0]?.url || null,
  };
}

function extractArtistIdsFromTrack(track) {
  return (track.artists || []).map(a => a.id);
}

function parseTrackSearchParams(req) {
  const artistId = (req.query.artistId || '').trim();
  const trackQuery = (req.query.trackQuery || '').trim();
  const limit = Math.min(parseInt(req.query.limit || '8', 10), 20);
  return { artistId, trackQuery, limit };
}

function validateTrackSearchParams(artistId, trackQuery) {
  return artistId && trackQuery;
}

function parseValidateParams(req) {
  const fromArtistId = (req.query.fromArtistId || '').trim();
  const toArtistId = (req.query.toArtistId || '').trim();
  const trackQuery = (req.query.trackQuery || '').trim();
  const limit = Math.min(parseInt(req.query.limit || '8', 10), 20);
  return { fromArtistId, toArtistId, trackQuery, limit };
}

function validateValidateParams(fromArtistId, toArtistId, trackQuery) {
  return fromArtistId && toArtistId && trackQuery;
}

async function searchAndGetFirstTrack(trackQuery, limit) {
  const s = await spotifyFetch(`/search?q=${encodeURIComponent(trackQuery)}&type=track&limit=${limit}`);
  if (!s.ok) return { ok: false, status: s.status, details: s.json };
  
  const items = s.json?.tracks?.items || [];
  if (!items.length) return { ok: false, noResults: true };
  
  return { ok: true, track: items[0] };
}

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
  return res.json(items.map(formatArtistResponse));
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
    artist: formatArtistResponse(r.json)
  });
});

// (compatibilidade) GET /api/spotify/track/validate?fromArtistId=...&toArtistId=...&trackQuery=...
router.get('/track/validate', async (req, res) => {
  const { fromArtistId, toArtistId, trackQuery, limit } = parseValidateParams(req);

  if (!validateValidateParams(fromArtistId, toArtistId, trackQuery)) {
    return res.status(400).json({ ok: false, reason: 'missing_params' });
  }

  const result = await searchAndGetFirstTrack(trackQuery, limit);
  if (result.noResults) return res.json({ ok: false, reason: 'no_track_found' });
  if (!result.ok) return res.status(result.status).json({ ok: false, reason: 'spotify_search_failed', details: result.details });

  const track = result.track;
  const ids = extractArtistIdsFromTrack(track);
  const ok = ids.includes(fromArtistId) && ids.includes(toArtistId);
  
  return res.json({
    ok,
    reason: ok ? null : 'track_not_connecting',
    track: formatTrackResponse(track)
  });
});

// GET /api/spotify/track/validate-for-artist?artistId=...&trackQuery=...
router.get('/track/validate-for-artist', async (req, res) => {
  const { artistId, trackQuery, limit } = parseTrackSearchParams(req);

  if (!validateTrackSearchParams(artistId, trackQuery)) {
    return res.status(400).json({ ok: false, reason: 'missing_params' });
  }

  const result = await searchAndGetFirstTrack(trackQuery, limit);
  if (result.noResults) return res.json({ ok: false, reason: 'no_track_found' });
  if (!result.ok) return res.status(result.status).json({ ok: false, reason: 'spotify_search_failed', details: result.details });

  const track = result.track;
  const ids = extractArtistIdsFromTrack(track);

  if (!ids.includes(artistId)) {
    return res.json({
      ok: false,
      reason: 'track_not_from_selected_artist',
      track: formatTrackResponse(track)
    });
  }

  return res.json({
    ok: true,
    track: formatTrackResponse(track)
  });
});

// GET /api/spotify/track/search-for-artist?artistId=...&trackQuery=...&limit=8
router.get('/track/search-for-artist', async (req, res) => {
  const { artistId, trackQuery, limit } = parseTrackSearchParams(req);

  if (!validateTrackSearchParams(artistId, trackQuery)) {
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
  const filtered = items.filter(t => extractArtistIdsFromTrack(t).includes(artistId));

  return res.json({
    ok: true,
    tracks: filtered.map(formatTrackResponse)
  });
});

module.exports = router;
