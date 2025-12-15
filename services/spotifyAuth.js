// spotifyAuth.js
const fetch = require('node-fetch');

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

let accessToken = null;
let tokenExpiresAt = 0; 

async function getAccessToken() {
  if (!clientId || !clientSecret) {
    throw new Error('Defina SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no arquivo .env');
  }

  const now = Date.now();


  if (accessToken && now < tokenExpiresAt - 60_000) {
    return accessToken;
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Erro ao obter token do Spotify: ' + txt);
  }

  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000; 

  return accessToken;
}

module.exports = { getAccessToken };
