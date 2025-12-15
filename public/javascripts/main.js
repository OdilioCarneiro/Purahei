// public/javascripts/main.js

const SEED_ARTISTS = [
  // ===== POP (internacional) =====
  'Anitta',
  'Beyoncé',
  'Lady Gaga',
  'Taylor Swift',
  'Dua Lipa',
  'Rihanna',
  'Billie Eilish',
  'Doja Cat',
  'Adele',
  'Bruno Mars',
  'Ed Sheeran',
  'Ariana Grande',
  'Post Malone',
  'Olivia Rodrigo',
  'SZA',
  'Justin Bieber',
  'Selena Gomez',
  'Katy Perry',
  'Madonna',
  'Britney Spears',
  'Christina Aguilera',
  'Miley Cyrus',
  'Halsey',
  'Khalid',
  'Lizzo',
  'Megan Thee Stallion',
  'Cardi B',
  'Harry Styles',
  'Shawn Mendes',
  'Charlie Puth',
  'The Chainsmokers',
  'The Kid LAROI',
  'Sam Smith',
  'Sia',
  'Lana Del Rey',
  'Lorde',
  'Pink',
  'Jennifer Lopez',
  'Kelly Clarkson',
  'Kesha',
  'Alicia Keys',
  'Michael Jackson',
  'Prince',
  'Elton John',
  'ABBA',
  'Backstreet Boys',
  '*NSYNC',
  'One Direction',
  'Maroon 5',
  'Coldplay',
  'Camila Cabello',

  // ===== HIP-HOP / R&B (internacional) =====
  'Kendrick Lamar',
  'Drake',
  'Travis Scott',
  'The Weeknd',
  'Eminem',
  'Nicki Minaj',
  'Kanye West',
  'J. Cole',
  'Future',
  '21 Savage',
  'Tyler, The Creator',
  'A$AP Rocky',
  'Childish Gambino',
  'Frank Ocean',
  'Brent Faiyaz',
  'Chris Brown',

  // ===== LATIN =====
  'Bad Bunny',
  'J Balvin',
  'Shakira',
  'Rosalía',
  'Karol G',
  'Maluma',
  'Ozuna',
  'Daddy Yankee',

  // ===== ROCK / POP ROCK (internacional) =====
  'Queen',
  'The Beatles',
  'The Rolling Stones',
  'Pink Floyd',
  'Led Zeppelin',
  'AC/DC',
  "Guns N' Roses",
  'Nirvana',
  'Foo Fighters',
  'Red Hot Chili Peppers',
  'Green Day',
  'Linkin Park',
  'Metallica',
  'Pearl Jam',
  'Radiohead',
  'The Strokes',
  'Arctic Monkeys',
  'The Killers',
  'Imagine Dragons',
  'Paramore',
  'Evanescence',
  'Muse',
  'U2',
  'Bon Jovi',

  // ===== BRASIL (pop / funk / rap / mpb / sertanejo) =====
  'Ludmilla',
  'IZA',
  'Pabllo Vittar',
  'Gloria Groove',
  'Luísa Sonza',
  'Jão',
  'Di Ferrero',
  'Ivete Sangalo',
  'Claudia Leitte',
  'Maiara & Maraisa',
  'Marília Mendonça',
  'Henrique & Juliano',
  'Jorge & Mateus',
  'Gusttavo Lima',
  'Zé Neto & Cristiano',
  'Simone Mendes',
  'Luan Santana',
  'Wesley Safadão',
  'Pedro Sampaio',
  'Alok',
  'Djavan',
  'Caetano Veloso',
  'Gilberto Gil',
  'Gal Costa',
  'Maria Bethânia',
  'Chico Buarque',
  'Marisa Monte',
  'Seu Jorge',
  'Tim Maia',
  'Elis Regina',
  'Racionais MC’s',
  'Emicida',
  'Criolo',

  // ===== BRASIL (rock / pop rock) =====
  'Legião Urbana',
  'Titãs',
  'Os Paralamas do Sucesso',
  'Skank',
  'Capital Inicial',
  'Engenheiros do Hawaii',
  'Charlie Brown Jr.',
  'Pitty',
  'Los Hermanos',
  'O Rappa',
  'NX Zero',
  'Fresno',
  'CPM 22',
  'Rita Lee',
  'Raul Seixas',
];
const STORAGE_KEY = 'purheire_artists';
const DEFAULT_PLACEHOLDER = '/assets/profile.png';

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function pickRandomArtistName() {
  const i = Math.floor(Math.random() * SEED_ARTISTS.length);
  return SEED_ARTISTS[i];
}

// Busca lista de artistas (aceita backend que retorna array ou objeto)
async function searchArtists(q, limit = 5) {
  const url = `/api/spotify/artist?q=${encodeURIComponent(q)}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (Array.isArray(data)) return data;
  return data ? [data] : [];
}

function getSuggestionsListEl(inputEl) {
  return document.querySelector(
    `[data-role="artist-suggestions"][data-for-input="#${CSS.escape(inputEl.id)}"]`
  );
}

function getClearBtnForInput(inputEl) {
  return document.querySelector(
    `[data-role="clear-artist"][data-target-input="#${CSS.escape(inputEl.id)}"]`
  );
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function readStorage() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEY) || 'null', null) || {};
}

function writeStorage(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

function saveArtistToStorage(side, artist) {
  const current = readStorage();
  current[side] = {
    id: artist.id,
    name: artist.name,
    imageUrl: artist.imageUrl || null
  };
  writeStorage(current);
}

function clearArtistInStorage(side) {
  const current = readStorage();
  delete current[side];
  writeStorage(current);
}


function getImgPlaceholder(imgEl) {
  if (!imgEl) return DEFAULT_PLACEHOLDER;

  const fromData = imgEl.getAttribute('data-placeholder') || imgEl.dataset.placeholder;
  if (fromData) return fromData;

  const initialSrc = imgEl.getAttribute('src');
  const placeholder = initialSrc || DEFAULT_PLACEHOLDER;
  imgEl.dataset.placeholder = placeholder;
  return placeholder;
}

function setImgToPlaceholder(imgEl) {
  if (!imgEl) return;
  imgEl.src = getImgPlaceholder(imgEl);
}

function applyArtistToUI(artist, inputEl) {
  const imgSelector = inputEl.dataset.discTarget;   // mantém nome do atributo por compatibilidade
  const nameSelector = inputEl.dataset.nameTarget;

  if (imgSelector) {
    const img = document.querySelector(imgSelector);
    if (img) {
      img.src = artist.imageUrl || getImgPlaceholder(img);
      img.alt = artist.name;
    }
  }

  if (nameSelector) {
    const nameEl = document.querySelector(nameSelector);
    if (nameEl) nameEl.textContent = artist.name;
  }

  inputEl.value = artist.name;
  inputEl.dataset.locked = 'true';


  const ul = getSuggestionsListEl(inputEl);
  if (ul) {
    ul.innerHTML = '';
    ul.classList.remove('visible');
  }


  const clearBtn = getClearBtnForInput(inputEl);
  if (clearBtn) clearBtn.style.display = 'flex';


  const side = inputEl.id === 'artist-left' ? 'left' : 'right';
  saveArtistToStorage(side, artist);
}

function clearArtistSelection(inputEl) {
  const imgSelector = inputEl.dataset.discTarget;
  const nameSelector = inputEl.dataset.nameTarget;

  if (imgSelector) {
    const img = document.querySelector(imgSelector);
    if (img) {
  
      setImgToPlaceholder(img);
      img.alt = 'Artista';
    }
  }

  if (nameSelector) {
    const nameEl = document.querySelector(nameSelector);
    if (nameEl) nameEl.textContent = '';
  }

  inputEl.value = '';
  inputEl.dataset.locked = 'false';

  const ul = getSuggestionsListEl(inputEl);
  if (ul) {
    ul.innerHTML = '';
    ul.classList.remove('visible');
  }

  const clearBtn = getClearBtnForInput(inputEl);
  if (clearBtn) clearBtn.style.display = 'none';

  // remove do storage
  const side = inputEl.id === 'artist-left' ? 'left' : 'right';
  clearArtistInStorage(side);
}

function renderSuggestions(artists, inputEl) {
  const ul = getSuggestionsListEl(inputEl);
  if (!ul) return;

  ul.innerHTML = '';

  if (!artists.length) {
    ul.classList.remove('visible');
    return;
  }

  artists.forEach(artist => {
    const li = document.createElement('li');
    li.textContent = artist.name;
    li.addEventListener('click', () => applyArtistToUI(artist, inputEl));
    ul.appendChild(li);
  });

  ul.classList.add('visible');
}

async function handleArtistInput(inputEl) {
  if (inputEl.dataset.locked === 'true') return;

  const q = inputEl.value.trim();
  if (!q || q.length < 2) {
    renderSuggestions([], inputEl);
    return;
  }

  const artists = await searchArtists(q, 6);
  renderSuggestions(artists, inputEl);
}

async function handleArtistEnter(inputEl) {
  const ul = getSuggestionsListEl(inputEl);
  const first = ul && ul.querySelector('li');

  if (first) {
    first.click();
    return;
  }

  const q = inputEl.value.trim();
  if (!q) return;

  const artists = await searchArtists(q, 1);
  if (artists[0]) applyArtistToUI(artists[0], inputEl);
}

function closeAllSuggestions(exceptInputEl = null) {
  document.querySelectorAll('[data-role="artist-input"]').forEach((input) => {
    if (exceptInputEl && input === exceptInputEl) return;
    const ul = getSuggestionsListEl(input);
    if (ul) ul.classList.remove('visible');
  });
}

document.addEventListener('DOMContentLoaded', () => {
 
  const discs = ['#disc-left', '#disc-right'];
  discs.forEach((sel) => {
    const img = document.querySelector(sel);
    if (img) getImgPlaceholder(img);
  });


  document.querySelectorAll('[data-role="artist-input"]').forEach(input => {
    input.dataset.locked = input.dataset.locked === 'true' ? 'true' : 'false';

    input.addEventListener('input', debounce(() => handleArtistInput(input), 350));

    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        handleArtistEnter(input);
      }

      if (evt.key === 'Escape') {
        const ul = getSuggestionsListEl(input);
        if (ul) ul.classList.remove('visible');
      }
    });

    input.addEventListener('focus', () => {
   
      closeAllSuggestions(input);
      if (input.value.trim().length >= 2) handleArtistInput(input);
    });
  });


  document.addEventListener('click', (evt) => {
    const wraps = document.querySelectorAll('.artist-input-wrap');
    for (const wrap of wraps) {
      if (wrap.contains(evt.target)) return; 
    }
    closeAllSuggestions(null);
  });


  document.querySelectorAll('[data-role="random-artist"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetInputSelector = btn.dataset.targetInput;
      const input = document.querySelector(targetInputSelector);
      if (!input) return;

      input.dataset.locked = 'false';
      input.value = pickRandomArtistName();
      await handleArtistEnter(input);
    });
  });

  // Clear 
  document.querySelectorAll('[data-role="clear-artist"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.querySelector(btn.dataset.targetInput);
      if (!input) return;
      clearArtistSelection(input);
      input.focus();
    });
  });
});


function toggleHowTo() {
  const el = document.getElementById('howto-overlay');
  if (!el) return;
  el.classList.toggle('hidden');
}

function onOverlayClick(e) {
  if (e.target && e.target.id === 'howto-overlay') toggleHowTo();
}
