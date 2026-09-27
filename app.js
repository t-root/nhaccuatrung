/* ONE-FILE: file này chạy 2 vai.
   - Trong trang web (có `document`)  -> chạy app nhạc như bình thường.
   - Trong service worker (không có `document`) -> chỉ xử lý nút "Lưu bài" trên thông báo.
   Nhờ vậy không cần thêm file sw.js riêng. */
if (typeof document === 'undefined') {
  const APP_CACHE = 'nhac-cua-trung-shell-v1';
  const AUDIO_CACHE = 'nhac-cua-trung-audio-v1';
  const APP_ASSETS = ['./', './index.html', './styles.css', './app.js', './logo.png', './manifest.webmanifest'];
  self.addEventListener('install', event => {
    event.waitUntil(
      caches.open(APP_CACHE)
        .then(cache => cache.addAll(APP_ASSETS))
        .catch(() => {})
        .then(() => self.skipWaiting())
    );
  });
  self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
  self.addEventListener('message', event => {
    if (event.data?.type !== 'prefetch-audio') return;
    const urls = [...new Set(event.data.urls || [])].filter(url => /^https?:/i.test(url));
    event.waitUntil(caches.open(AUDIO_CACHE).then(async cache => {
      // Tải tuần tự từng URL một (không Promise.all song song), để chỉ bài
      // sắp nghe được chuẩn bị trước, không dồn tải cả loạt bài cùng lúc.
      for (const url of urls) {
        if (await cache.match(url)) continue;
        try {
          const response = await fetch(url, { cache: 'force-cache' });
          if (response.ok && response.status !== 206) await cache.put(url, response.clone()).catch(() => {});
        } catch { /* page-side IndexedDB remains the fallback */ }
      }
    }));
  });
  self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    if (request.destination === 'audio' && new URL(request.url).origin !== self.location.origin) {
      event.respondWith(caches.open(AUDIO_CACHE).then(cache => cache.match(request).then(cached => cached || fetch(request).then(response => {
        // Range requests từ thẻ <audio> trả về 206 Partial Content, mà Cache API không cho lưu
        // response dạng partial (cache.put sẽ throw "Partial response (status code 206) is unsupported").
        if (response.ok && response.status !== 206) cache.put(request, response.clone()).catch(() => {});
        return response;
      }))));
      return;
    }
    if (new URL(request.url).origin !== self.location.origin) return;
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok && response.status !== 206) caches.open(APP_CACHE).then(cache => cache.put(request, response.clone()).catch(() => {}));
        return response;
      }).catch(() => cached || Response.error()))
    );
  });
  self.addEventListener('notificationclick', event => {
    const action = event.action;          // '' = bấm thân thông báo, 'favorite' = bấm nút Lưu bài
    event.notification.close();
    event.waitUntil((async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach(client => client.postMessage({ type: 'notification-action', action }));
      if (!action) {
        const target = list.find(client => 'focus' in client);
        if (target) await target.focus();
        else await self.clients.openWindow('./');
      }
    })());
  });
} else {
const audio = document.querySelector('#audio');
audio.crossOrigin = 'anonymous';
const visualizerCanvas = document.querySelector('#audioVisualizer');
const visualizerState = document.querySelector('#visualizerState');
let audioContext = null;
let analyser = null;
let audioSource = null;
let frequencyData = null;
let waveformData = null;
let visualizerFrame = 0;
let visualizerPulse = 0;
let visualizerPeaks = [];
let visualizerVals = [];
let vizBassAvg = 0, vizLastBeat = 0, vizPrevT = 0, vizSpin = 0;
const vizShockwaves = [];
const vizBursts = [];
const visualizerParticles = Array.from({ length: 64 }, () => ({
  angle: Math.random() * Math.PI * 2,
  radius: 0.4 + Math.random() * 1.4,
  speed: 0.03 + Math.random() * 0.18,
  size: 1 + Math.random() * 2,
  phase: Math.random() * Math.PI * 2,
  type: Math.random() > 0.7 ? 'diamond' : 'dot'
}));
const els = {
  trackList: document.querySelector('#trackList'), empty: document.querySelector('#emptyState'),
  artistList: document.querySelector('#artistList'), playlistList: document.querySelector('#playlistList'), queueList: document.querySelector('#queueList'),
  search: document.querySelector('#searchInput'), sort: document.querySelector('#sortSelect'),
  pageTitle: document.querySelector('#pageTitle'), sectionTitle: document.querySelector('#sectionTitle'),
  stats: document.querySelector('#stats'), nowTitle: document.querySelector('#nowTitle'), nowArtist: document.querySelector('#nowArtist'),
  play: document.querySelector('#playButton'), progress: document.querySelector('#progress'), currentTime: document.querySelector('#currentTime'), duration: document.querySelector('#duration'),
  favorite: document.querySelector('#favoriteButton'), toast: document.querySelector('#toast')
};
const stateKey = 'giai-dieu-state-v1';
const libraryCacheKey = 'giai-dieu-library-cache-v1';
const themeColorKey = 'giai-dieu-theme-color-v1';
const defaultThemeColor = '#8ef0d1';
const audioExtensions = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac']);
const colors = ['coral', 'blue', 'gold'];
let seedTracks = [];
let currentTrack = null;
let view = { type: 'all', value: '' };
let queue = [];
let queueIndex = -1;
let queueRepeatLimit = 0;
let queueRepeatRemaining = 0;
let repeatMode = 'off';
let playlistRepeat = true;
let playbackSource = 'none';
let playGeneration = 0;
function sourceForView() { return view.type === 'playlist' ? 'playlist' : view.type === 'folder' ? 'artist' : 'collection'; }
function repeatsBySource(source) { return source === 'playlist' || source === 'artist'; }
let audioErrorGeneration = 0;
let shuffle = false;
let canWrite = false;
let state = readState();
let toastTimer;
let uploadFolderResolve = null;
let pendingArtistUpload = '';
const durationPromises = new Map();
const audioSourceCache = new Map();
const prefetchPromises = new Map();
let audioDbPromise = null;
const playRetryDelays = [0, 700, 1800];
let githubRepo = null;
let githubBranch = 'main';
let thirdPat = '';
function readState() {
  try { return Object.assign({ hidden: [], favorites: [], recent: [], playlists: [] }, JSON.parse(localStorage.getItem(stateKey) || '{}')); }
  catch { return { hidden: [], favorites: [], recent: [], playlists: [] }; }
}
function saveState() { localStorage.setItem(stateKey, JSON.stringify(state)); }
/* ============================================================
   KHÔI PHỤC PHÁT NHẠC SAU KHI TAB BỊ "ĐÁNH THỨC LẠI"
   ------------------------------------------------------------
   Trình duyệt mobile (đặc biệt Android Chrome/iOS Safari) có thể âm thầm
   dỡ (reload) tab đã đứng yên/tạm dừng quá lâu ở nền để giải phóng bộ nhớ,
   xoá sạch toàn bộ biến JS (queue, currentTrack...) trong khi thông báo
   media (lock screen / thanh thông báo) vẫn còn hiển thị bài cũ. Lúc đó
   bấm Play/Next/Previous trên thông báo sẽ không có tác dụng gì vì queue
   rỗng và audio.src trống. Lưu lại vị trí + hàng đợi để nạp lại (không tự
   phát) ngay khi trang tải xong, giúp các nút đó hoạt động trở lại. */
const playbackStateKey = 'giai-dieu-playback-v1';
function savePlaybackState() {
  try {
    localStorage.setItem(playbackStateKey, JSON.stringify({
      trackId: currentTrack ? currentTrack.id : null,
      queueIds: queue.map(item => item.id),
      queueIndex,
      position: audio.currentTime || 0,
      playbackSource, repeatMode, shuffle, playlistRepeat
    }));
  } catch { /* bỏ qua nếu localStorage đầy/bị chặn */ }
}
function readPlaybackState() {
  try { return JSON.parse(localStorage.getItem(playbackStateKey) || 'null'); }
  catch { return null; }
}
async function restorePlaybackState() {
  const saved = readPlaybackState();
  if (!saved?.trackId) return;
  const track = seedTracks.find(item => item.id === saved.trackId);
  if (!track) return;
  const restoredQueue = (saved.queueIds || []).map(id => seedTracks.find(item => item.id === id)).filter(Boolean);
  queue = restoredQueue.length ? restoredQueue : [track];
  queueIndex = Math.max(0, queue.findIndex(item => item.id === track.id));
  currentTrack = track;
  playbackSource = saved.playbackSource || playbackSource;
  repeatMode = saved.repeatMode || repeatMode;
  shuffle = Boolean(saved.shuffle);
  playlistRepeat = saved.playlistRepeat !== false;
  try {
    audio.src = await fileUrl(track);
    audio.preload = 'auto';
    audio.load();
    const restorePosition = () => {
      if (Number.isFinite(saved.position) && saved.position > 0) audio.currentTime = saved.position;
      audio.removeEventListener('loadedmetadata', restorePosition);
    };
    audio.addEventListener('loadedmetadata', restorePosition);
  } catch { /* không tải được nguồn phát ngay, bấm Play sẽ tự tải lại qua playTrack */ }
  syncMediaSession();
  updatePlayer();
  renderAll();
}
function saveLibraryCache() {
  try { localStorage.setItem(libraryCacheKey, JSON.stringify({ seedTracks, githubRepo, githubBranch })); }
  catch { /* bỏ qua nếu bộ nhớ đầy */ }
}
function readLibraryCache() {
  try { return JSON.parse(localStorage.getItem(libraryCacheKey) || 'null'); }
  catch { return null; }
}
function normalizeThemeColor(value) {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return '';
  const expanded = raw.length === 3 ? raw.split('').map(char => char + char).join('') : raw;
  return `#${expanded.toLowerCase()}`;
}
function themeColorRgb(color) {
  const hex = color.slice(1);
  return `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
}
function accentRgba(alpha) {
  const rgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '142, 240, 209';
  return `rgba(${rgb}, ${alpha})`;
}
function applyThemeColor(color, persist = true) {
  const normalized = normalizeThemeColor(color) || defaultThemeColor;
  const root = document.documentElement;
  root.style.setProperty('--coral', normalized);
  root.style.setProperty('--blue', normalized);
  root.style.setProperty('--peach', normalized);
  root.style.setProperty('--accent-rgb', themeColorRgb(normalized));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', normalized);
  if (persist) localStorage.setItem(themeColorKey, normalized);
  return normalized;
}
applyThemeColor(localStorage.getItem(themeColorKey) || defaultThemeColor, false);
async function syncThemeColorToGitHub(color) {
  if (!canWrite) throw new Error('Mở quyền chỉnh sửa để lưu màu lên GitHub.');
  if (!githubRepo) throw new Error('Chưa kết nối được repository GitHub.');
  const tokenValue = getGitHubToken();
  if (!tokenValue) throw new Error('Chưa cấu hình quyền GitHub để lưu màu.');
  const path = 'theme.json';
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const endpoint = `https://api.github.com/repos/${githubRepo.owner}/${githubRepo.name}/contents/${encodedPath}`;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${tokenValue}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const existing = await fetch(`${endpoint}?ref=${encodeURIComponent(githubBranch)}`, { headers });
  let sha;
  if (existing.ok) sha = (await existing.json()).sha;
  else if (existing.status !== 404) throw new Error('Không đọc được cấu hình màu trên GitHub.');
  const content = JSON.stringify({ color }, null, 2);
  const body = { message: `Update theme color: ${color}`, content: base64FromBytes(new TextEncoder().encode(content)), branch: githubBranch };
  if (sha) body.sha = sha;
  const response = await fetch(endpoint, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error('GitHub từ chối lưu màu chủ đạo.');
}
async function saveThemeColor(color) {
  try {
    await syncThemeColorToGitHub(color);
    showToast(`Đã lưu màu ${color} lên GitHub.`);
  } catch (error) {
    showToast(`Đã lưu màu trên thiết bị: ${error.message}`);
  }
}

/* ============================================================
   THÔNG BÁO KHI PHÁT NỀN: nút Trước / Phát-Dừng / Tiếp + nút Lưu bài
   ------------------------------------------------------------
   1) Media Session API  -> nút Trước / Phát-Dừng / Tiếp + thanh tiến trình
      (thanh thông báo Android, màn hình khóa, tai nghe Bluetooth, Windows/macOS)
   2) Web KHÔNG cho thêm nút tùy ý vào thông báo media, nên nút "Lưu bài"
      (= Yêu thích) được đặt trong 1 thông báo nhỏ đi kèm, gửi qua chính file app.js này (xem đầu file).
   ============================================================ */
let swReg = null;
let lastNotifKey = '';

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const set = (name, handler) => { try { navigator.mediaSession.setActionHandler(name, handler); } catch { /* trình duyệt không hỗ trợ */ } };
  set('play', () => robustPlay());
  set('pause', () => audio.pause());
  set('previoustrack', () => moveQueue(-1));
  set('nexttrack', () => moveQueue(1));
  set('seekto', details => { if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime; });
  set('stop', () => { audio.pause(); audio.currentTime = 0; });
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      position: Math.min(audio.currentTime, audio.duration),
      playbackRate: audio.playbackRate || 1
    });
  } catch { /* giá trị chưa hợp lệ, bỏ qua */ }
}

const LOGO_URL = new URL('logo.png', document.baseURI).href;   // logo.png nằm cùng thư mục với index.html

function syncMediaSession() {
  if ('mediaSession' in navigator) {
    if (!currentTrack) navigator.mediaSession.metadata = null;
    else {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: String(currentTrack.title || 'Không rõ tên bài'),
          artist: String(currentTrack.artist || ''),
          album: document.title,
          artwork: [
            { src: LOGO_URL, sizes: '192x192', type: 'image/png' },
            { src: LOGO_URL, sizes: '384x384', type: 'image/png' },
            { src: LOGO_URL, sizes: '512x512', type: 'image/png' }
          ]
        });
      } catch { /* bỏ qua */ }
    }
    navigator.mediaSession.playbackState = !currentTrack ? 'none' : audio.paused ? 'paused' : 'playing';
  }
  legacyShowActionNotification();
}

async function legacyOriginalShowActionNotification() {
  if (!swReg || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (!currentTrack) {
    lastNotifKey = '';
    const old = await swReg.getNotifications({ tag: 'now-playing' });
    old.forEach(n => n.close());
    return;
  }
  const liked = state.favorites.includes(currentTrack.id);
  const key = [currentTrack.id, liked, canWrite].join('|');
  if (key === lastNotifKey) return;
  lastNotifKey = key;
  const options = {
    body: currentTrack.artist,
    tag: 'now-playing',   // cùng tag => thay thế thông báo cũ, không bị chồng
    silent: true,
    icon: LOGO_URL,
    requireInteraction: true,
    actions: canWrite ? [{ action: 'favorite', title: liked ? '♥ Bỏ lưu' : '♡ Lưu bài' }] : []
  };
  try { await swReg.showNotification(currentTrack.title, options); } catch { /* bỏ qua */ }
}

async function setupActionNotification() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('app.js');
    navigator.serviceWorker.addEventListener('message', event => {
      const data = event.data || {};
      if (data.type !== 'notification-action') return;
      if (data.action === 'previous') moveQueue(-1);
      if (data.action === 'next') moveQueue(1);
      if (data.action === 'play') audio.play().catch(() => {});
      if (data.action === 'pause') audio.pause();
      if (data.action === 'favorite' && currentTrack) toggleFavorite(currentTrack.id);
      lastNotifKey = '';          // thông báo đã bị đóng sau khi bấm -> vẽ lại
      syncMediaSession();
    });
    // Trình duyệt chỉ cho hỏi quyền thông báo sau một thao tác của người dùng
    if ('Notification' in window && Notification.permission === 'default') {
      document.addEventListener('click', () => {
        if (Notification.permission === 'default') Notification.requestPermission().then(syncMediaSession);
      }, { once: true });
    }
  } catch { /* chạy file:// hoặc không có HTTPS thì bỏ qua, app vẫn chạy bình thường */ }
}

setupMediaSession();
['loadedmetadata', 'seeked', 'play', 'pause', 'ratechange'].forEach(name => audio.addEventListener(name, updatePositionState));
['playing', 'loadedmetadata'].forEach(name => audio.addEventListener(name, syncMediaSession));
setupActionNotification();
function uid(text) { return text.startsWith('local:') ? text : `repo:${text}`; }
function normalizeTrack(track) { return { ...track, id: track.id || uid(track.src), local: Boolean(track.local) }; }
function allTracks() { return seedTracks.filter(track => !state.hidden.includes(track.id)); }
function artists() { return [...new Set(seedTracks.map(track => track.artist))]; }
function esc(text) { return String(text).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function formatTime(seconds) { if (!Number.isFinite(seconds)) return '0:00'; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function showToast(message) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.add('visible'); toastTimer = setTimeout(() => els.toast.classList.remove('visible'), 2800); }
function durationLabel(tracks) { if (!tracks.length) return '0:00'; if (tracks.some(track => !Number.isFinite(track.duration))) return 'đang tính thời lượng'; return formatTime(tracks.reduce((total, track) => total + track.duration, 0)); }
function loadTrackDuration(track) {
  if (Number.isFinite(track.duration)) return Promise.resolve(track.duration);
  if (durationPromises.has(track.id)) return durationPromises.get(track.id);
  const promise = new Promise(resolve => {
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => { track.duration = probe.duration; probe.src = ''; resolve(track.duration); };
    probe.onerror = () => { probe.src = ''; resolve(0); };
    probe.src = track.src;
  });
  durationPromises.set(track.id, promise);
  return promise;
}
async function ensureDurations(tracks) { await Promise.all(tracks.map(loadTrackDuration)); renderTracks(); renderQueue(); }
function resizeVisualizer() {
  if (!visualizerCanvas) return;
  const rect = visualizerCanvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  visualizerCanvas.width = Math.max(1, Math.floor(rect.width * ratio));
  visualizerCanvas.height = Math.max(1, Math.floor(rect.height * ratio));
  visualizerCanvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
}
// Mở trang bằng index.html?noviz=1 để TẮT hẳn Web Audio + phổ nhạc (dùng để thử xem tiếng rè có do nó không)
const VIZ_AUDIO_ENABLED = !new URLSearchParams(location.search).has('noviz');
function setupVisualizer() {
  if (!VIZ_AUDIO_ENABLED || !visualizerCanvas || analyser) return;
  try {
    // latencyHint 'playback': bộ đệm âm thanh lớn hơn => ít bị giật/rè khi máy đang bận vẽ hình
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = .84;
    audioSource = audioContext.createMediaElementSource(audio);
    audioSource.connect(analyser);
    analyser.connect(audioContext.destination);
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    waveformData = new Uint8Array(analyser.fftSize);
    resizeVisualizer();
  } catch {
    if (visualizerState) visualizerState.textContent = 'VISUALIZER OFFLINE';
  }
}
function drawVisualizer() {
  if (!visualizerCanvas) return;
  const ctx = visualizerCanvas.getContext('2d');
  const W = visualizerCanvas.clientWidth;
  const H = visualizerCanvas.clientHeight;
  if (!W || !H) { visualizerFrame = requestAnimationFrame(drawVisualizer); return; }
  const t = performance.now() / 1000;
  const dt = Math.min(0.05, Math.max(0.001, t - (vizPrevT || t - 0.016)));
  vizPrevT = t;
  const TAU = Math.PI * 2;
  // ---------- phân tích âm thanh ----------
  let bass = 0.08, mid = 0.08, treble = 0.06, total = 0.1;
  if (analyser) {
    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(waveformData);
    const n = frequencyData.length;
    bass = frequencyData.slice(0, 10).reduce((s, v) => s + v, 0) / (10 * 255);
    mid = frequencyData.slice(10, 40).reduce((s, v) => s + v, 0) / (30 * 255);
    treble = frequencyData.slice(40, 80).reduce((s, v) => s + v, 0) / (40 * 255);
    total = frequencyData.reduce((s, v) => s + v, 0) / (n * 255);
  }
  const vol = audio.muted ? 0 : audio.volume;
  const beat = Math.max(bass * 0.65 + vol * 0.22 + 0.04, 0.03);
  visualizerPulse += (beat - visualizerPulse) * 0.55;   // lên/xuống nhanh hơn
  const p = visualizerPulse;
  const playerBar = document.querySelector('#playerBar');
  if (playerBar) {
    playerBar.style.setProperty('--player-beat', p.toFixed(3));
    playerBar.style.setProperty('--player-energy', (audio.muted ? 0 : audio.volume).toFixed(3));
  }
  const g = p * 0.75 + vol * 0.2;
  vizSpin += dt * (0.2 + mid * 1.4);

  const cx = W * 0.5;
  const cy = H * 0.48;
  const R = Math.min(W, H) * 0.195;

  // nhận diện nhịp (beat) -> sóng xung kích + hạt bắn ra
  vizBassAvg += (bass - vizBassAvg) * 0.06;
  const isBeat = analyser && !audio.paused && bass > 0.32 && bass > vizBassAvg * 1.45 && t - vizLastBeat > 0.28;
  if (isBeat) {
    vizLastBeat = t;
    vizShockwaves.push({ r: R * 0.3, a: 0.6 });
    for (let k = 0; k < 18; k++) {
      vizBursts.push({ ang: Math.random() * TAU, dist: R * 2.25, v: 30 + Math.random() * 90, life: 1, size: 1 + Math.random() * 2 });
    }
  }
  const flash = Math.max(0, 1 - (t - vizLastBeat) * 3.2); // 1 -> 0 sau mỗi nhịp

  // ---------- nền ----------
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(6, 9, 12, 0.35)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accentRgba(0.035);
  for (let y = 12; y < H; y += 22) {
    for (let x = 12 + ((y / 22) % 2) * 11; x < W; x += 22) ctx.fillRect(x, y, 1.1, 1.1);
  }

  // vầng sáng đối xứng (nhấp nháy theo nhịp)
  const glowGrad = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R * 2.7);
  glowGrad.addColorStop(0, accentRgba(0.06 + p * 0.1 + flash * 0.06));
  glowGrad.addColorStop(0.5, accentRgba(0.02 + p * 0.035));
  glowGrad.addColorStop(1, accentRgba(0));
  ctx.fillStyle = glowGrad;
  ctx.beginPath(); ctx.arc(cx, cy, R * 2.7, 0, TAU); ctx.fill();

  // ---------- [FX 1] Phổ sàn đối xứng ở đáy ----------
  const floorBars = 72, floorY = H * 0.9;
  const fbw = W / floorBars;
  for (let i = 0; i < floorBars; i++) {
    const k = i < floorBars / 2 ? i : floorBars - 1 - i;      // đối xứng trái/phải
    const mm = k / (floorBars / 2);
    const v = frequencyData ? frequencyData[Math.floor(Math.pow(mm, 0.9) * frequencyData.length * 0.6)] / 255 : 0.04;
    const h = 3 + v * H * 0.08;
    ctx.fillStyle = accentRgba(0.05 + v * 0.22);
    ctx.fillRect(i * fbw + 1, floorY - h, Math.max(1, fbw - 2), h);
  }

  // ---------- [FX 2] Vòng vạch chia xoay chậm ----------
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * TAU + vizSpin * 0.04;
    const r1 = R * 2.3, r2 = r1 + (i % 5 === 0 ? 6 : 3);
    ctx.strokeStyle = accentRgba(i % 5 === 0 ? 0.22 : 0.09);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();
  }

  // ---------- [FX 3] Cung xoay ngược chiều, dài ra theo treble ----------
  [[2.4, 1, 0.9], [2.4, -1.3, 0.5], [2.4, 0.7, 0.35]].forEach(([sc, dir, len], i) => {
    const a0 = vizSpin * dir * 0.7 + i * 2.1;
    ctx.beginPath();
    ctx.arc(cx, cy, R * sc, a0, a0 + len * (0.5 + treble * 1.1));
    ctx.strokeStyle = accentRgba(0.15 + treble * 0.28);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  });

  // ---------- thanh tần số (đối xứng hoàn toàn trái = phải) ----------
  const bands = 56;
  const gapRatio = 0.16;
  const inner = R * 1.18;
  const maxLen = R * 0.92;
  if (visualizerPeaks.length !== bands) visualizerPeaks = new Array(bands).fill(0);
  if (visualizerVals.length !== bands) visualizerVals = new Array(bands).fill(0.05);
  const binCount = frequencyData ? Math.floor(frequencyData.length * 0.72) : 0;
  const half = bands / 2;
  const target = new Array(bands);
  for (let i = 0; i < bands; i++) {
    const k = i < half ? i : bands - 1 - i;
    const m = (k + 0.5) / half;                                  // 0 = 12h, 1 = 6h
    const fi = Math.min(binCount - 1, Math.floor(Math.pow(m, 0.85) * binCount));
    const rawIn = frequencyData ? frequencyData[Math.max(0, fi)] / 255 : 0.06 + Math.sin(t * 2 + k * 0.3) * 0.02;
    const raw = Math.pow(rawIn, 0.78) * 0.85;                     // giảm khuếch đại để có headroom
    const boost = 1 + m * 0.35;                                   // bù treble nhẹ
    target[i] = Math.min(1, Math.max(0.04, (p * 0.32 + raw * 0.78) * boost));
  }
  for (let i = 0; i < bands; i++) {                              // mượt theo thời gian — tăng tốc độ
    visualizerVals[i] += (target[i] - visualizerVals[i]) * (target[i] > visualizerVals[i] ? 0.88 : 0.42);
  }
  const vals = visualizerVals.map((v, i, a) => a[(i + bands - 1) % bands] * 0.15 + v * 0.70 + a[(i + 1) % bands] * 0.15); // mượt nhẹ hơn
  const tips = [];
  for (let i = 0; i < bands; i++) {
    const k = i < half ? i : bands - 1 - i;
    const m = (k + 0.5) / half;
    const a0 = (i / bands) * TAU - Math.PI / 2;
    const a1 = ((i + 1 - gapRatio) / bands) * TAU - Math.PI / 2;
    const am = (a0 + a1) / 2;
    const val = vals[i];
    const outer = inner + 4 + val * maxLen;
    const bright = Math.min(1, val * 1.1);
    const grad = ctx.createLinearGradient(cx + Math.cos(am) * inner, cy + Math.sin(am) * inner, cx + Math.cos(am) * outer, cy + Math.sin(am) * outer);
    grad.addColorStop(0, accentRgba(0.25 + bright * 0.35));
    grad.addColorStop(1, accentRgba(0.35 + bright * 0.6));
    ctx.beginPath();
    ctx.arc(cx, cy, outer, a0, a1);
    ctx.arc(cx, cy, inner, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // phản chiếu bên trong
    const refl = inner - 3 - val * R * 0.16;
    ctx.beginPath();
    ctx.arc(cx, cy, inner - 3, a0, a1);
    ctx.arc(cx, cy, refl, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = accentRgba(0.06 + val * 0.2);
    ctx.fill();
    // chấm đỉnh rơi dần
    visualizerPeaks[i] = Math.max(val, visualizerPeaks[i] - 0.028);  // rơi nhanh hơn
    const pr = inner + 8 + visualizerPeaks[i] * maxLen;
    ctx.fillStyle = accentRgba(0.35 + visualizerPeaks[i] * 0.55);
    ctx.fillRect(cx + Math.cos(am) * pr - 1.5, cy + Math.sin(am) * pr - 1.5, 3, 3);
    tips.push([cx + Math.cos(am) * (outer + 3), cy + Math.sin(am) * (outer + 3)]);
  }

  // ---------- [FX 4] Dải viền phát sáng nối đỉnh các thanh ----------
  ctx.beginPath();
  for (let i = 0; i < tips.length; i++) {
    const a = tips[i], b = tips[(i + 1) % tips.length];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(a[0], a[1], mx, my);
  }
  ctx.closePath();
  ctx.shadowColor = accentRgba(0.9);
  ctx.shadowBlur = 10 + flash * 10;
  ctx.strokeStyle = accentRgba(0.35 + p * 0.4);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // ---------- [FX 5] Vòng dao động (oscilloscope) đối xứng ----------
  const scopeN = 120;
  ctx.beginPath();
  for (let i = 0; i <= scopeN; i++) {
    const idx = i % scopeN;
    const k = idx < scopeN / 2 ? idx : scopeN - 1 - idx;
    const mm = k / (scopeN / 2);
    const wv = waveformData ? (waveformData[Math.floor(mm * (waveformData.length - 1) * 0.5)] - 128) / 128 : Math.sin(t * 3 + mm * 9) * 0.05;
    const r = R * 0.98 + wv * R * (0.18 + p * 0.30);
    const a = (idx / scopeN) * TAU - Math.PI / 2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = accentRgba(0.4 + p * 0.4);
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // ---------- vòng đồng tâm ----------
  [0.22, 0.38, 0.54, 0.70, 0.88, 1.08].forEach((scale, i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, R * scale + p * 2.5, 0, TAU);
    ctx.strokeStyle = accentRgba(i === 3 ? 0.32 + g * 0.12 : 0.14 + g * 0.08);
    ctx.lineWidth = i === 3 ? 1.6 : (i % 2 === 0 ? 1.1 : 0.75);
    ctx.stroke();
  });
  ctx.setLineDash([3, 6]);
  [1.55, 1.82, 2.08].forEach(scale => {
    ctx.beginPath();
    ctx.arc(cx, cy, R * scale + p * 2, 0, TAU);
    ctx.strokeStyle = accentRgba(0.07 + g * 0.05);
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // ---------- [FX 6] Sóng xung kích khi có nhịp trống ----------
  for (let i = vizShockwaves.length - 1; i >= 0; i--) {
    const w = vizShockwaves[i];
    w.r += dt * R * 3.2;
    w.a -= dt * 0.75;
    if (w.a <= 0 || w.r > R * 2.7) { vizShockwaves.splice(i, 1); continue; }
    ctx.beginPath();
    ctx.arc(cx, cy, w.r, 0, TAU);
    ctx.strokeStyle = accentRgba(w.a);
    ctx.lineWidth = 1 + w.a * 2.2;
    ctx.stroke();
  }

  // ---------- lục giác (2 lớp quay ngược chiều) ----------
  function drawHex(radius, rot, alpha, lineW) {
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = rot + (i / 6) * TAU;
      const x = cx + Math.cos(a) * radius, y = cy + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = accentRgba(alpha);
    ctx.lineWidth = lineW;
    ctx.stroke();
  }
  const hexR = R * 0.58 + p * 3;
  drawHex(hexR, t * 0.2, 0.22 + g * 0.12, 1.1);
  drawHex(hexR, t * 0.2 + Math.PI / 6, 0.1 + g * 0.06, 0.7);
  drawHex(hexR * 0.72, -t * 0.35, 0.16 + g * 0.1, 0.8);

  // ---------- [FX 7] Tia laser trong lõi, dài theo treble ----------
  for (let i = 0; i < 12; i++) {
    const a = -vizSpin * 0.5 + (i / 12) * TAU;
    const len = R * (0.34 + treble * 0.55 * (0.6 + 0.4 * Math.sin(t * 3 + i)));
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3);
    ctx.lineTo(cx + Math.cos(a) * (R * 0.3 + len * 0.6), cy + Math.sin(a) * (R * 0.3 + len * 0.6));
    ctx.strokeStyle = accentRgba(0.08 + treble * 0.4);
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }

  // ---------- quét radar ----------
  const sweepA = t * 1.05;
  try {
    const sweepGrad = ctx.createConicGradient(sweepA, cx, cy);
    sweepGrad.addColorStop(0, accentRgba(0));
    sweepGrad.addColorStop(0.88, accentRgba(0));
    sweepGrad.addColorStop(0.97, accentRgba(0.1 + p * 0.14));
    sweepGrad.addColorStop(1, accentRgba(0));
    ctx.fillStyle = sweepGrad;
    ctx.beginPath(); ctx.arc(cx, cy, R * 2.15, 0, TAU); ctx.fill();
  } catch (_) {}

  // ---------- lõi ----------
  const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.42);
  coreG.addColorStop(0, accentRgba(0.18 + p * 0.28 + flash * 0.2));
  coreG.addColorStop(0.55, accentRgba(0.05 + p * 0.08));
  coreG.addColorStop(1, accentRgba(0));
  ctx.fillStyle = coreG;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.42 + p * 2.5, 0, TAU); ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.26 + p * 1.5, 0, TAU);
  ctx.strokeStyle = accentRgba(0.55 + g * 0.25);
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 3 + p * 1.8 + flash * 2, 0, TAU);
  ctx.fillStyle = accentRgba(0.75 + p * 0.25);
  ctx.fill();

  const br = R * 0.48 + p * 2.5, bs = 9;
  ctx.strokeStyle = accentRgba(0.28 + g * 0.18);
  ctx.lineWidth = 1.2;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
    ctx.beginPath();
    ctx.moveTo(cx + sx * br, cy + sy * (br - bs));
    ctx.lineTo(cx + sx * br, cy + sy * br);
    ctx.lineTo(cx + sx * (br - bs), cy + sy * br);
    ctx.stroke();
  });

  // ---------- [FX 8] Vệ tinh có đuôi sao chổi ----------
  [[0.54, 1.0, 0], [0.88, -0.75, 2.1], [1.08, 1.4, 4.2], [2.4, -0.5, 1.2]].forEach(([sc, spd, off]) => {
    const a = t * spd * (0.8 + mid * 1.5) + off;
    const rr = R * sc + p * 2.5;
    for (let j = 0; j < 14; j++) {
      const aj = a - Math.sign(spd) * j * 0.05;
      ctx.fillStyle = accentRgba((1 - j / 14) * 0.55);
      ctx.fillRect(cx + Math.cos(aj) * rr - 1, cy + Math.sin(aj) * rr - 1, 2, 2);
    }
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 2.6 + p * 1.5, 0, TAU);
    ctx.fillStyle = accentRgba(0.95);
    ctx.shadowColor = accentRgba(1); ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // ---------- hạt trôi ----------
  visualizerParticles.forEach(pt => {
    const ang = pt.angle + t * pt.speed;
    const dist = R * (1.0 + pt.radius * 0.9) + Math.sin(t * 1.6 + pt.phase) * (2 + p * 6);
    const x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist;
    const alpha = 0.12 + Math.max(0, Math.sin(t * 2 + pt.phase)) * 0.45 + total * 0.28 + vol * 0.12;
    ctx.fillStyle = accentRgba(Math.min(0.9, alpha));
    if (pt.type === 'diamond') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size);
      ctx.restore();
    } else {
      ctx.fillRect(x - pt.size / 2, y - pt.size / 2, pt.size, pt.size);
    }
  });

  // ---------- [FX 9] Hạt bắn ra khi có nhịp ----------
  for (let i = vizBursts.length - 1; i >= 0; i--) {
    const b = vizBursts[i];
    b.dist += b.v * dt;
    b.life -= dt * 0.9;
    if (b.life <= 0) { vizBursts.splice(i, 1); continue; }
    ctx.fillStyle = accentRgba(b.life * 0.85);
    ctx.fillRect(cx + Math.cos(b.ang) * b.dist, cy + Math.sin(b.ang) * b.dist, b.size, b.size);
  }

  // ---------- [FX 10] Thanh bên ĐỐI XỨNG trái = phải ----------
  const sideBins = 32;
  for (let i = 0; i < sideBins; i++) {
    const bin = frequencyData ? frequencyData[Math.floor(i * frequencyData.length * 0.6 / sideBins)] / 255 : 0.05;
    const len = 2 + Math.min(28, bin * 18);
    const y = cy - sideBins * 2.6 + i * 5.2;
    ctx.fillStyle = accentRgba(0.14 + Math.min(1, bin * 1.4) * 0.7);
    ctx.fillRect(14, y, len, 2.6);
    ctx.fillRect(W - 14 - len, y, len, 2.6);
  }

  // ---------- [FX 11] Đồng hồ BASS / MID / HI ở góc dưới ----------
  ctx.font = '9px "Square VN"';
  ctx.textBaseline = 'middle';
  [['BASS', bass], ['MID', mid], ['HI', treble]].forEach(([label, v], i) => {
    const y = H - 62 + i * 12;
    const lv = Math.min(1, v * 1.35);
    ctx.fillStyle = accentRgba(0.6);
    ctx.textAlign = 'left';
    ctx.fillText(label, 16, y);
    ctx.fillStyle = accentRgba(0.12);
    ctx.fillRect(48, y - 2, 60, 4);
    ctx.fillStyle = accentRgba(0.85);
    ctx.fillRect(48, y - 2, 60 * lv, 4);
    // bên phải: gương của bên trái
    ctx.textAlign = 'right';
    ctx.fillStyle = accentRgba(0.6);
    ctx.fillText(label, W - 16, y);
    ctx.fillStyle = accentRgba(0.12);
    ctx.fillRect(W - 108, y - 2, 60, 4);
    ctx.fillStyle = accentRgba(0.85);
    ctx.fillRect(W - 48 - 60 * lv, y - 2, 60 * lv, 4);
  });
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  // ---------- sóng âm đáy (kèm bóng phản chiếu) ----------
  const wn = waveformData?.length || 64;
  [[1, 0.45 + p * 0.4, 1.2], [-1, 0.12 + p * 0.1, 1]].forEach(([dir, alpha, lw]) => {
    ctx.beginPath();
    for (let i = 0; i < wn; i++) {
      const x = (i / (wn - 1)) * W;
      const v = waveformData ? waveformData[i] / 255 : 0.5 + Math.sin(t * 3 + i * 0.12) * 0.05;
      const y = H * 0.9 + dir * (v - 0.5) * (8 + p * 22 + vol * 8) + (dir < 0 ? 6 : 0);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = accentRgba(alpha);
    ctx.lineWidth = lw;
    ctx.stroke();
  });
  ctx.strokeStyle = accentRgba(0.07);
  ctx.beginPath(); ctx.moveTo(0, H * 0.9); ctx.lineTo(W, H * 0.9); ctx.stroke();

  visualizerFrame = requestAnimationFrame(drawVisualizer);
}

window.addEventListener('resize', resizeVisualizer);
// F11 (fullscreen trình duyệt, ẩn thanh địa chỉ/tab) không bắn ra sự kiện Fullscreen
// API nào cả, nên phải đoán qua việc kích thước cửa sổ khớp kích thước màn hình.
function checkBrowserFullscreen() {
  const isFull = Boolean(document.fullscreenElement) ||
    (Math.abs(window.innerWidth - screen.width) < 2 && Math.abs(window.innerHeight - screen.height) < 2);
  document.body.classList.toggle('is-browser-fullscreen', isFull);
  resizeVisualizer();
}
window.addEventListener('resize', checkBrowserFullscreen);
document.addEventListener('fullscreenchange', checkBrowserFullscreen);
checkBrowserFullscreen();
resizeVisualizer();
drawVisualizer();
function md5(input) {
  const bytes = Array.from(new TextEncoder().encode(input));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let index = 0; index < 8; index += 1) bytes.push((bitLength / 2 ** (8 * index)) & 0xff);
  let a0 = 0x67452301; let b0 = 0xefcdab89; let c0 = 0x98badcfe; let d0 = 0x10325476;
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const rotate = (value, amount) => (value << amount) | (value >>> (32 - amount));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = [];
    for (let index = 0; index < 16; index += 1) words[index] = bytes[offset + index * 4] | (bytes[offset + index * 4 + 1] << 8) | (bytes[offset + index * 4 + 2] << 16) | (bytes[offset + index * 4 + 3] << 24);
    let a = a0; let b = b0; let c = c0; let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let functionValue; let wordIndex;
      if (index < 16) { functionValue = (b & c) | (~b & d); wordIndex = index; }
      else if (index < 32) { functionValue = (d & b) | (~d & c); wordIndex = (5 * index + 1) % 16; }
      else if (index < 48) { functionValue = b ^ c ^ d; wordIndex = (3 * index + 5) % 16; }
      else { functionValue = c ^ (b | ~d); wordIndex = (7 * index) % 16; }
      const shift = shifts[(index % 4) + (index < 16 ? 0 : index < 32 ? 4 : index < 48 ? 8 : 12)];
      const constant = Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32);
      const next = (a + functionValue + constant + words[wordIndex]) | 0;
      a = d; d = c; c = b; b = (b + rotate(next, shift)) | 0;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  return [a0, b0, c0, d0].map(value => Array.from({ length: 4 }, (_, index) => (value >>> (index * 8)) & 0xff).map(byte => byte.toString(16).padStart(2, '0')).join('')).join('');
}
function setWriteAccess(enabled) {
  canWrite = enabled;
  if (enabled) sessionStorage.setItem('giai-dieu-admin-session', '1');
  else sessionStorage.removeItem('giai-dieu-admin-session');
  document.body.classList.toggle('read-only', !enabled);
}
function openAudioDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nhac-cua-trung-audio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('tracks', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function getAudioDb() {
  if (!audioDbPromise) audioDbPromise = openAudioDb().catch(() => null);
  return audioDbPromise;
}
function readAudioRecord(id) {
  return getAudioDb().then(db => new Promise(resolve => {
    if (!db) return resolve(null);
    const request = db.transaction('tracks', 'readonly').objectStore('tracks').get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  }));
}
function writeAudioRecord(record) {
  return getAudioDb().then(db => new Promise(resolve => {
    if (!db) return resolve();
    const request = db.transaction('tracks', 'readwrite').objectStore('tracks').put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  }));
}
async function cachedAudioUrl(track) {
  const record = await readAudioRecord(track.id);
  if (!record || record.src !== track.src || !(record.blob instanceof Blob)) return null;
  const url = URL.createObjectURL(record.blob);
  audioSourceCache.set(track.id, url);
  return url;
}
async function fileUrl(track) {
  const cached = audioSourceCache.get(track.id);
  if (cached) return cached;
  const pending = prefetchPromises.get(track.id);
  if (pending) {
    try { return await pending; } catch { /* fall back to the remote URL */ }
  }
  try {
    const stored = await cachedAudioUrl(track);
    if (stored) return stored;
  } catch { /* fall back to the remote URL */ }
  return track.src;
}

async function loadLibrary() {
  try {
    const repo = getGitHubRepo();
    if (!repo) throw new Error('GitHub Pages URL required');
    githubRepo = repo;
    const apiHeaders = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${getGitHubToken()}` };
    const repoResponse = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}`, { headers: apiHeaders });
    if (!repoResponse.ok) {
      if (repoResponse.status === 403) throw new Error('GitHub API từ chối truy cập hoặc đã hết rate limit.');
      if (repoResponse.status === 404) throw new Error('Không tìm thấy repository GitHub.');
      throw new Error('GitHub API unavailable');
    }
    const repository = await repoResponse.json();
    githubBranch = repository.default_branch;
    const treeResponse = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/git/trees/${encodeURIComponent(githubBranch)}?recursive=1`, { headers: apiHeaders });
    if (!treeResponse.ok) {
      if (treeResponse.status === 403) throw new Error('GitHub API từ chối truy cập hoặc đã hết rate limit.');
      throw new Error('GitHub API unavailable');
    }
    const tree = await treeResponse.json();
    const remoteTheme = tree.tree.find(item => item.type === 'blob' && item.path === 'theme.json');
    if (remoteTheme) {
      try {
        const encodedPath = remoteTheme.path.split('/').map(encodeURIComponent).join('/');
        const themeResponse = await fetch(`https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${repository.default_branch}/${encodedPath}?t=${Date.now()}`);
        const theme = await themeResponse.json();
        const remoteColor = normalizeThemeColor(theme.color);
        if (remoteColor) applyThemeColor(remoteColor);
      } catch { /* dùng màu đã lưu trên thiết bị nếu cấu hình GitHub không hợp lệ */ }
    }
    seedTracks = tree.tree.filter(item => item.type === 'blob' && /^artist\/[^/]+\/.+$/i.test(item.path) && audioExtensions.has(getExtension(item.path))).map(item => {
      const parts = item.path.split('/');
      const artist = parts[0].toLowerCase() === 'artist' && parts.length > 2 ? parts[1] : (parts.length > 1 ? parts[0] : 'Nhạc gốc');
      const title = parts.at(-1).replace(/\.[^.]+$/, '');
      const encodedPath = item.path.split('/').map(encodeURIComponent).join('/');
      return normalizeTrack({ title, artist, path: item.path, sha: item.sha, src: `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${repository.default_branch}/${encodedPath}` });
    });
    const playlistFiles = tree.tree.filter(item => item.type === 'blob' && /^playlist\/[^/]+\/playlist\.json$/i.test(item.path));
    const remotePlaylists = await Promise.all(playlistFiles.map(async item => {
      const encodedPath = item.path.split('/').map(encodeURIComponent).join('/');
      try { return await (await fetch(`https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${repository.default_branch}/${encodedPath}`)).json(); } catch { return null; }
    }));
    const loadedPlaylists = remotePlaylists.filter(Boolean);
    const remoteNames = new Set(loadedPlaylists.map(remote => String(remote.name).toLocaleLowerCase()));
    // Chỉ xoá khỏi máy những playlist ĐÃ từng đồng bộ lên GitHub thành công mà giờ
    // không còn thấy trên đó nữa (bị xoá từ nơi khác). Playlist vừa tạo/sửa ở máy
    // này mà chưa kịp đồng bộ (synced === false, ví dụ do mất mạng, chưa cấu hình
    // quyền GitHub...) thì giữ nguyên, không xoá, để không bị mất khi tải lại trang.
    state.playlists = state.playlists.filter(item => remoteNames.has(item.name.toLocaleLowerCase()) || item.synced === false);
    loadedPlaylists.forEach(remote => {
      const tracks = (remote.tracks || []).map(path => seedTracks.find(track => track.path === path)?.id).filter(Boolean);
      const existing = state.playlists.find(item => item.name.toLocaleLowerCase() === String(remote.name).toLocaleLowerCase());
      if (existing) { if (existing.synced !== false) { existing.trackIds = tracks; existing.synced = true; } }
      else state.playlists.push({ id: `playlist:${Date.now()}-${remote.name}`, name: remote.name, trackIds: tracks, synced: true });
    });
    saveState();
    saveLibraryCache();
    retryUnsyncedPlaylists();
  } catch (error) {
    const cached = readLibraryCache();
    if (cached && Array.isArray(cached.seedTracks) && cached.seedTracks.length) {
      seedTracks = cached.seedTracks.map(normalizeTrack);
      githubRepo = cached.githubRepo || githubRepo;
      githubBranch = cached.githubBranch || githubBranch;
      showToast('Không có mạng. Đang dùng danh sách nhạc đã lưu trên máy.');
    } else {
      seedTracks = [];
      showToast(error.message === 'GitHub Pages URL required' ? 'Hãy mở trang từ GitHub Pages để đọc nhạc trong repository.' : 'Không đọc được file nhạc từ GitHub. Kiểm tra repository công khai và thử lại.');
    }
  }
  renderAll();
  ensureDurations(seedTracks);
  prefetchAllForOffline();
}
function prefetchAllForOffline() {
  // Âm thầm gửi toàn bộ URL bài hát cho service worker để nó tải dần về cache,
  // theo cùng cơ chế tuần tự đã dùng cho bài đang phát/bài kế tiếp (xem
  // preloadNextTrack). Bài nào đã có trong cache rồi thì service worker tự bỏ
  // qua, nên gọi lại hàm này mỗi lần mở app không tốn thêm băng thông.
  if (!('serviceWorker' in navigator)) return;
  const urls = seedTracks.map(track => track.src).filter(src => /^https?:/i.test(src));
  if (!urls.length) return;
  navigator.serviceWorker.ready.then(registration => {
    registration.active?.postMessage({ type: 'prefetch-audio', urls });
  }).catch(() => {});
}
function getExtension(path) { return `.${path.split('.').pop().toLowerCase()}`; }
function getGitHubRepo() {
  const queryRepo = new URLSearchParams(location.search).get('repo');
  const host = location.hostname.toLowerCase();
  const pathParts = location.pathname.split('/').filter(Boolean);
  if (queryRepo?.includes('/')) { const [owner, name] = queryRepo.split('/'); return { owner, name }; }
  if (!host.endsWith('.github.io')) return null;
  const owner = host.replace('.github.io', '');
  return { owner, name: pathParts[0] || `${owner}.github.io` };
}

function getVisibleTracks() {
  let tracks = allTracks();
  if (view.type === 'recent') tracks = state.recent.map(id => tracks.find(track => track.id === id)).filter(Boolean);
  if (view.type === 'favorites') tracks = tracks.filter(track => state.favorites.includes(track.id));
  if (view.type === 'folder') tracks = tracks.filter(track => track.artist === view.value);
  if (view.type === 'playlist') { const playlist = state.playlists.find(item => item.id === view.value); tracks = playlist ? tracks.filter(track => playlist.trackIds.includes(track.id)) : []; }
  const query = els.search.value.trim().toLocaleLowerCase('vi');
  if (query) tracks = tracks.filter(track => `${track.title} ${track.artist}`.toLocaleLowerCase('vi').includes(query));
  const sort = els.sort.value;
  if (sort === 'title') tracks.sort((a, b) => a.title.localeCompare(b.title, 'vi'));
  if (sort === 'artist') tracks.sort((a, b) => a.artist.localeCompare(b.artist, 'vi') || a.title.localeCompare(b.title, 'vi'));
  return tracks;
}
function viewName() {
  if (view.type === 'folder') return view.value;
  if (view.type === 'playlist') return state.playlists.find(item => item.id === view.value)?.name || 'Playlist';
  return { all: 'Tất cả bài hát', recent: 'Nghe gần đây', favorites: 'Yêu thích' }[view.type];
}
function renderAll() { renderPlaylists(); renderTracks(); renderQueue(); updatePlayer(); const addTracksButton = document.querySelector('#addTracksButton'); if (addTracksButton) addTracksButton.hidden = view.type !== 'playlist'; updatePlaylistRepeatButton(); updateClearCurrentCollectionButton(); }
function updateClearCurrentCollectionButton() {
  const button = document.querySelector('#clearCurrentCollectionButton');
  const renameButton = document.querySelector('#renameCurrentCollectionButton');
  if (!button || !renameButton) return;
  const playlist = view.type === 'playlist' ? state.playlists.find(item => item.id === view.value) : null;
  const tracks = view.type === 'folder' ? artistTracks(view.value) : playlist?.trackIds || [];
  const inCollection = view.type === 'folder' || view.type === 'playlist';
  const label = view.type === 'folder' ? 'nghệ sĩ' : 'playlist';
  renameButton.hidden = !inCollection;
  renameButton.disabled = !canWrite || (view.type === 'playlist' ? !playlist : !tracks.length);
  renameButton.title = `Đổi tên ${label} này`;
  renameButton.innerHTML = `<span>✎</span> Đổi tên ${label}`;
  button.hidden = !inCollection;
  button.disabled = !canWrite || (view.type === 'playlist' ? !playlist : !tracks.length);
  button.title = `Xóa ${label} này`;
  button.innerHTML = `<span>×</span> Xóa ${label}`;
}
function renderPlaylists() {
  const folders = artists().map(artist => `<button class="playlist-item artist-item ${view.type === 'folder' && view.value === artist ? 'active' : ''}" data-folder="${esc(artist)}"><span>▱</span><span class="artist-name">${esc(artist)}</span><span class="artist-actions"><i data-edit-artist="${esc(artist)}" title="Đổi tên nghệ sĩ">✎</i><i data-delete-artist="${esc(artist)}" title="Xóa nghệ sĩ">×</i></span></button>`).join('');
  const custom = state.playlists.map(item => `<button class="playlist-item ${view.type === 'playlist' && view.value === item.id ? 'active' : ''}" data-playlist="${esc(item.id)}"><span>▤</span><span>${esc(item.name)}</span><span class="artist-actions"><i data-edit-playlist="${esc(item.id)}" title="Đổi tên playlist">✎</i><i class="playlist-delete" data-delete-playlist="${esc(item.id)}" title="Xóa playlist">×</i></span></button>`).join('');
  els.artistList.innerHTML = folders || '<p class="sidebar-note">Chưa có nghệ sĩ</p>';
  els.playlistList.innerHTML = custom || '<p class="sidebar-note">Chưa có playlist</p>';
}
function renderTracks() {
  const tracks = getVisibleTracks();
  const title = viewName();
  els.pageTitle.textContent = title; els.sectionTitle.textContent = title;
  els.stats.textContent = `${tracks.length} bài hát${view.type === 'all' ? ` · ${artists().length} nghệ sĩ` : ''} · ${durationLabel(tracks)}`;
  els.empty.hidden = tracks.length > 0; els.trackList.innerHTML = tracks.map((track, index) => {
    const liked = state.favorites.includes(track.id);
    const playing = currentTrack?.id === track.id;
    return `<article class="track-row${playing ? ' is-playing' : ''}" data-track-id="${esc(track.id)}"><span class="track-index">${playing && !audio.paused ? '♫' : String(index + 1).padStart(2, '0')}</span><div class="track-main"><div class="track-art ${colors[index % colors.length]}">${playing ? '♫' : '♪'}</div><div class="track-name"><strong>${esc(track.title)}</strong><span>${esc(track.artist)}${track.local ? ' · đã tải lên' : ''}</span></div></div><span class="track-album">${esc(track.artist)}</span><span class="track-duration">${track.duration ? formatTime(track.duration) : '--:--'}</span><div class="row-actions"><button class="row-button play-row" data-play="${esc(track.id)}" title="Phát">▶</button><button class="row-button" data-favorite="${esc(track.id)}" title="${liked ? 'Bỏ yêu thích' : 'Yêu thích'}">${liked ? '♥' : '♡'}</button><button class="row-button" data-add-queue="${esc(track.id)}" title="Thêm vào hàng đợi">≡+</button><button class="row-button" data-add="${esc(track.id)}" title="Thêm vào playlist">+</button>${view.type === 'playlist' ? `<button class="row-button remove-from-playlist" data-remove-from-playlist="${esc(track.id)}" title="Xóa khỏi playlist (bài hát vẫn còn trong thư viện)">−</button>` : `<button class="row-button delete-row" data-delete="${esc(track.id)}" title="Xóa hẳn khỏi thư viện">×</button>`}</div></article>`;
  }).join('');
}
function renderQueue() { const total = document.querySelector('#queueTotal'); if (total) total.textContent = `${queue.length} bài · ${durationLabel(queue)}`; updateQueueRepeatButton(); els.queueList.innerHTML = queue.length ? queue.map((track, index) => { const playing = currentTrack?.id === track.id; return `<div class="queue-item${playing ? ' is-current' : ''}"><div class="track-art ${colors[index % colors.length]}">${playing && !audio.paused ? '♫' : '♪'}</div><div class="queue-item-copy"><strong>${esc(track.title)}</strong><span>${esc(track.artist)} · ${Number.isFinite(track.duration) ? formatTime(track.duration) : '--:--'}${playing ? ' · đang phát' : ''}</span></div><button class="queue-item-play" data-queue-play="${esc(track.id)}" title="Phát bài này">▶</button></div>`; }).join('') : '<p class="empty-state">Hàng đợi đang trống.</p>'; }
function addToQueue(id) { const track = allTracks().find(item => item.id === id); if (!track) return; if (queue.some(item => item.id === id)) return showToast('Bài hát đã có trong hàng đợi.'); queue.push(track); if (queueIndex < 0) queueIndex = 0; renderQueue(); ensureDurations([track]); showToast(`Đã thêm “${track.title}” vào hàng đợi.`); }
function playQueue() { if (!queue.length) return showToast('Hàng đợi đang trống.'); playbackSource = 'queue'; queueRepeatRemaining = queueRepeatLimit; playTrack(queue[0], queue); }

async function legacyPlayTrack(track, nextQueue = null) {
  if (!track) return;
  if (nextQueue && playbackSource !== 'queue' && view.type === 'playlist') playbackSource = 'playlist';
  try {
    const src = await fileUrl(track);
    if (nextQueue) { queue = [...nextQueue]; queueIndex = queue.findIndex(item => item.id === track.id); }
    else if (!queue.some(item => item.id === track.id)) { queue = [track]; queueIndex = 0; }
    currentTrack = track; syncMediaSession(); audio.src = src; audio.load();
    await audio.play();
    state.recent = [track.id, ...state.recent.filter(id => id !== track.id)].slice(0, 20); saveState();
    renderAll();
  } catch { showToast('Không thể phát file này. Kiểm tra đường dẫn hoặc định dạng.'); }
}
function playCurrentList(forceShuffle = false) { const tracks = getVisibleTracks(); if (!tracks.length) return showToast('Danh sách này chưa có bài hát.'); playbackSource = sourceForView(); const shouldShuffle = forceShuffle || shuffle; const ordered = shouldShuffle ? [...tracks].sort(() => Math.random() - .5) : tracks; playTrack(ordered[0], ordered); }
function toggleFavorite(id) { if (!canWrite) return showToast('Chế độ chỉ nghe.'); state.favorites = state.favorites.includes(id) ? state.favorites.filter(item => item !== id) : [id, ...state.favorites]; saveState(); renderAll(); }
async function deleteGitHubFile(track) {
  const token = getGitHubToken();
  if (!token) throw new Error('Chưa cấu hình quyền GitHub để xóa file.');
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const encodedPath = track.path.split('/').map(encodeURIComponent).join('/');
  const endpoint = `https://api.github.com/repos/${githubRepo.owner}/${githubRepo.name}/contents/${encodedPath}`;
  const existing = await fetch(`${endpoint}?ref=${encodeURIComponent(githubBranch)}`, { headers });
  if (!existing.ok) throw new Error('Không tìm thấy file trên GitHub.');
  const { sha } = await existing.json();
  const response = await fetch(endpoint, { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Delete music: ${track.path}`, sha, branch: githubBranch }) });
  if (!response.ok) throw new Error('GitHub từ chối xóa file.');
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
async function pushFilesToGitHub(files, artistName, isFolderUpload) {
  const token = getGitHubToken();
  if (!token) throw new Error('Chưa cấu hình quyền GitHub để tải file lên.');
  if (!githubRepo) throw new Error('Không xác định được repository GitHub.');
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  for (const file of files) {
    const path = (isFolderUpload ? `artist/${file.webkitRelativePath}` : `artist/${artistName}/${file.name}`).split('/').filter(Boolean).join('/');
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const endpoint = `https://api.github.com/repos/${githubRepo.owner}/${githubRepo.name}/contents/${encodedPath}`;
    const existing = await fetch(`${endpoint}?ref=${encodeURIComponent(githubBranch)}`, { headers });
    let sha;
    if (existing.ok) sha = (await existing.json()).sha;
    else if (existing.status === 401 || existing.status === 403) throw new Error('Mock token bị GitHub từ chối; đây là bản thử nghiệm.');
    else if (existing.status !== 404) throw new Error(`Không kiểm tra được file ${file.name}.`);
    const body = { message: `Add music: ${path}`, content: await fileToBase64(file), branch: githubBranch };
    if (sha) body.sha = sha;
    const response = await fetch(endpoint, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
      throw new Error(`GitHub từ chối ${file.name}. Kiểm tra token và quyền Contents.`);
    }
  }
  return true;
}
function base64FromBytes(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
async function syncPlaylistToGitHub(playlist) {
  if (!githubRepo) throw new Error('Không xác định được repository GitHub.');
  const token = getGitHubToken();
  if (!token) throw new Error('Chưa cấu hình quyền GitHub để lưu playlist.');
  const safeName = playlist.name.replace(/[<>:"/\\|?*]/g, '-').trim();
  const path = `playlist/${safeName}/playlist.json`;
  const content = JSON.stringify({ name: playlist.name, tracks: playlist.trackIds.map(id => allTracks().find(track => track.id === id)?.path).filter(Boolean) }, null, 2);
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const endpoint = `https://api.github.com/repos/${githubRepo.owner}/${githubRepo.name}/contents/${encodedPath}`;
  const existing = await fetch(`${endpoint}?ref=${encodeURIComponent(githubBranch)}`, { headers });
  let sha;
  if (existing.ok) sha = (await existing.json()).sha;
  else if (existing.status !== 404) throw new Error('GitHub không cho đọc playlist.');
  const body = { message: `Update playlist: ${playlist.name}`, content: base64FromBytes(new TextEncoder().encode(content)), branch: githubBranch };
  if (sha) body.sha = sha;
  const response = await fetch(endpoint, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error('GitHub từ chối lưu playlist.');
  playlist.synced = true;
  saveState();
}
async function retryUnsyncedPlaylists() {
  const pending = state.playlists.filter(item => item.synced === false);
  for (const playlist of pending) {
    try { await syncPlaylistToGitHub(playlist); } catch { /* vẫn giữ ở máy, thử lại lần tải trang sau */ }
  }
}
// Mỗi khi mở xem 1 playlist, lấy thẳng playlist.json mới nhất từ GitHub để hiển thị,
// thay vì tin vào bản lưu cục bộ (tránh tình trạng các tab/máy khác nhau thấy khác nhau).
// Dùng GitHub Contents API (api.github.com) thay vì raw.githubusercontent.com, vì
// raw.githubusercontent.com chạy qua CDN riêng và cache nội dung vài phút — thêm
// query string né cache không ăn thua với CDN đó. Contents API trả dữ liệu mới ngay.
// Nếu playlist đang có thay đổi CHƯA kịp đồng bộ (synced === false) thì bỏ qua, không
// ghi đè, để không làm mất bài vừa thêm/xóa ở máy này.
async function refreshPlaylistFromGitHub(playlistId) {
  if (!githubRepo) return;
  const playlist = state.playlists.find(item => item.id === playlistId);
  if (!playlist || playlist.synced === false) return;
  try {
    const safeName = playlist.name.replace(/[<>:"/\\|?*]/g, '-').trim();
    const encodedPath = `playlist/${safeName}/playlist.json`.split('/').map(encodeURIComponent).join('/');
    const token = getGitHubToken();
    const headers = { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const response = await fetch(`https://api.github.com/repos/${githubRepo.owner}/${githubRepo.name}/contents/${encodedPath}?ref=${encodeURIComponent(githubBranch)}&t=${Date.now()}`, { headers, cache: 'no-store' });
    if (!response.ok) return;
    const file = await response.json();
    const bytes = Uint8Array.from(atob(file.content.replace(/\n/g, '')), char => char.charCodeAt(0));
    const remote = JSON.parse(new TextDecoder().decode(bytes));
    const tracks = (remote.tracks || []).map(path => seedTracks.find(track => track.path === path)?.id).filter(Boolean);
    playlist.trackIds = tracks;
    playlist.synced = true;
    saveState();
    if (view.type === 'playlist' && view.value === playlistId) renderAll();
  } catch { /* mạng lỗi hoặc chưa có file trên GitHub thì cứ giữ bản đang có */ }
}
function chooseUploadFolder() {
  const folders = [...new Set(artists())];
  if (!folders.length) { showToast('Chưa có thư mục nhạc trên GitHub để chọn.'); return Promise.resolve(''); }
  const dialog = document.querySelector('#uploadDialog');
  const select = document.querySelector('#uploadFolderSelect');
  select.replaceChildren(...folders.map(folder => new Option(folder, folder)));
  dialog.showModal();
  return new Promise(resolve => { uploadFolderResolve = resolve; });
}
async function uploadFiles(files, targetFolder = '') {
  if (!canWrite) return showToast('Chế độ chỉ nghe.');
  const audioFiles = [...files].filter(file => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(file.name));
  if (!audioFiles.length) return showToast('Thư mục không có file nhạc hợp lệ.');
  let folder = targetFolder.trim();
  const isFolderUpload = audioFiles.some(file => file.webkitRelativePath);
  if (!folder && !isFolderUpload) {
    folder = await chooseUploadFolder();
    if (!folder) return;
  }
  try {
    await pushFilesToGitHub(audioFiles, folder, isFolderUpload);
    await loadLibrary();
    showToast(`Đã thêm ${audioFiles.length} bài hát lên GitHub.`);
  } catch (error) { showToast(error.message); }
}
async function collectDirectoryFiles(directoryHandle, parentPath = directoryHandle.name) {
  const files = [];
  for await (const entry of directoryHandle.values()) {
    const entryPath = `${parentPath}/${entry.name}`;
    if (entry.kind === 'directory') {
      files.push(...await collectDirectoryFiles(entry, entryPath));
      continue;
    }
    const file = await entry.getFile();
    Object.defineProperty(file, 'webkitRelativePath', { configurable: true, value: entryPath });
    files.push(file);
  }
  return files;
}
async function chooseFolderUpload() {
  if (!canWrite) return showToast('Chế độ chỉ nghe.');
  if (!window.isSecureContext || typeof window.showDirectoryPicker !== 'function') {
    return showToast('Tải thư mục cần mở website bằng HTTPS trên trình duyệt hỗ trợ.');
  }
  try {
    const directory = await window.showDirectoryPicker({ mode: 'read' });
    await uploadFiles(await collectDirectoryFiles(directory));
  } catch (error) {
    if (error?.name !== 'AbortError') showToast('Không thể đọc thư mục đã chọn.');
  }
}
function updatePlayer() { const playerBar = document.querySelector('#playerBar'); const live = Boolean(currentTrack && !audio.paused); els.nowTitle.textContent = currentTrack?.title || 'Chưa chọn bài hát'; els.nowArtist.textContent = currentTrack?.artist || 'Chọn một bài để bắt đầu'; els.play.textContent = live ? 'Ⅱ' : '▶'; els.favorite.classList.toggle('active', Boolean(currentTrack && state.favorites.includes(currentTrack.id))); els.favorite.textContent = currentTrack && state.favorites.includes(currentTrack.id) ? '♥' : '♡'; playerBar?.classList.toggle('is-live', live); playerBar?.style.setProperty('--player-energy', (audio.muted ? 0 : audio.volume).toFixed(3)); updateRepeatButton(); syncMediaSession(); }
function updateRepeatButton() { const button = document.querySelector('#repeatButton'); const labels = { off: 'Tắt lặp', one: 'Lặp bài vô hạn' }; button.classList.toggle('active', repeatMode !== 'off'); button.title = labels[repeatMode]; button.textContent = repeatMode === 'one' ? '↻∞' : '↻'; }
function updatePlaylistRepeatButton() { const button = document.querySelector('#repeatPlaylistButton'); if (!button) return; button.hidden = view.type !== 'playlist' && view.type !== 'folder'; const label = view.type === 'folder' ? 'Nghệ sĩ' : 'Playlist'; button.classList.toggle('active', playlistRepeat); button.textContent = playlistRepeat ? `↻ ${label}` : `↻ Lặp ${label.toLocaleLowerCase('vi')}`; button.title = playlistRepeat ? `Tắt lặp ${label.toLocaleLowerCase('vi')}` : `Lặp ${label.toLocaleLowerCase('vi')} vô hạn`; }
function updateQueueRepeatButton() { const button = document.querySelector('#repeatQueueButton'); if (!button) return; button.textContent = queueRepeatLimit ? `↻${queueRepeatLimit}` : '↻'; button.title = queueRepeatLimit ? `Lặp hàng đợi ${queueRepeatLimit} lần` : 'Không lặp hàng đợi'; button.classList.toggle('active', queueRepeatLimit > 0); }
function moveQueue(direction) {
  if (!queue.length) return;
  const next = queueIndex + direction;
  if (next < 0 || next >= queue.length) {
    if (repeatMode === 'one') return playTrack(currentTrack);
    if (repeatsBySource(playbackSource) && playlistRepeat) {
      queueIndex = direction > 0 ? 0 : queue.length - 1;
      return playTrack(queue[queueIndex]);
    }
    if (queueRepeatRemaining > 0 && direction > 0) {
      queueRepeatRemaining -= 1;
      queueIndex = 0;
      return playTrack(queue[0]);
    }
    return;
  }
  queueIndex = next;
  playTrack(queue[queueIndex]);
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { view = { type: button.dataset.view, value: '' }; document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === button)); renderAll(); }));
els.artistList.addEventListener('click', event => { const edit = event.target.closest('[data-edit-artist]'); if (edit) return openArtistDialog(edit.dataset.editArtist); const remove = event.target.closest('[data-delete-artist]'); if (remove) return deleteArtist(remove.dataset.deleteArtist); const folder = event.target.closest('[data-folder]'); if (!folder) return; view = { type: 'folder', value: folder.dataset.folder }; document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active')); renderAll(); });
els.playlistList.addEventListener('click', event => { const edit = event.target.closest('[data-edit-playlist]'); if (edit) return openPlaylistDialog('rename', edit.dataset.editPlaylist); const remove = event.target.closest('[data-delete-playlist]'); if (remove) return deletePlaylist(remove.dataset.deletePlaylist); const playlist = event.target.closest('[data-playlist]'); if (playlist) { view = { type: 'playlist', value: playlist.dataset.playlist }; document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active')); renderAll(); refreshPlaylistFromGitHub(playlist.dataset.playlist); } });
els.trackList.addEventListener('click', event => { const row = event.target.closest('[data-track-id]'); if (!row) return; const id = row.dataset.trackId; const track = allTracks().find(item => item.id === id); if (event.target.closest('[data-play]')) { playbackSource = sourceForView(); return playTrack(track, getVisibleTracks()); } if (event.target.closest('[data-favorite]')) return toggleFavorite(id); if (event.target.closest('[data-add-queue]')) return addToQueue(id); if (event.target.closest('[data-add]')) return addToPlaylist(id); if (event.target.closest('[data-remove-from-playlist]')) return removeTrackFromPlaylist(id); if (event.target.closest('[data-delete]')) return deleteTrack(id); if (!event.target.closest('button')) { playbackSource = sourceForView(); playTrack(track, getVisibleTracks()); } });
els.queueList.addEventListener('click', event => { const id = event.target.dataset.queuePlay; if (id) { const track = queue.find(item => item.id === id); if (track) playTrack(track); } });
document.querySelector('#createPlaylist').addEventListener('click', createPlaylist);
document.querySelector('#createArtist').addEventListener('click', openCreateArtistDialog);
document.querySelector('#renameCurrentCollectionButton').addEventListener('click', () => { if (view.type === 'folder') openArtistDialog(view.value); if (view.type === 'playlist') openPlaylistDialog('rename', view.value); });
document.querySelector('#clearCurrentCollectionButton').addEventListener('click', clearCurrentCollection);
document.querySelector('#fileInput').addEventListener('change', event => { uploadFiles(event.target.files); event.target.value = ''; });
document.querySelector('#artistFileInput').addEventListener('change', event => { const artistName = pendingArtistUpload; pendingArtistUpload = ''; uploadFiles(event.target.files, artistName); event.target.value = ''; });
document.querySelector('#folderUploadButton').addEventListener('click', chooseFolderUpload);
document.querySelector('#cancelUpload').addEventListener('click', () => { document.querySelector('#uploadDialog').close(); uploadFolderResolve?.(''); uploadFolderResolve = null; });
document.querySelector('#confirmUpload').addEventListener('click', () => { const value = document.querySelector('#uploadFolderSelect').value; document.querySelector('#uploadDialog').close(); uploadFolderResolve?.(value); uploadFolderResolve = null; });
document.querySelector('#playAllButton').addEventListener('click', playCurrentList);
document.querySelector('#shuffleAllButton').addEventListener('click', () => playCurrentList(true));
document.querySelector('#repeatPlaylistButton').addEventListener('click', () => { playlistRepeat = !playlistRepeat; updatePlaylistRepeatButton(); showToast(playlistRepeat ? 'Playlist đang lặp vô hạn.' : 'Đã tắt lặp playlist.'); });
document.querySelector('#queueButton').addEventListener('click', () => document.querySelector('#queuePanel').classList.add('open'));
document.querySelector('#closeQueue').addEventListener('click', () => document.querySelector('#queuePanel').classList.remove('open'));
document.querySelector('#playQueueButton').addEventListener('click', playQueue);
document.querySelector('#repeatQueueButton').addEventListener('click', () => { queueRepeatLimit = queueRepeatLimit >= 3 ? 0 : queueRepeatLimit + 1; queueRepeatRemaining = queueRepeatLimit; updateQueueRepeatButton(); showToast(queueRepeatLimit ? `Hàng đợi sẽ lặp ${queueRepeatLimit} lần.` : 'Đã tắt lặp hàng đợi.'); });
els.search.addEventListener('input', renderTracks); els.sort.addEventListener('change', renderTracks);
async function robustPlay() {
  if (!currentTrack) return playCurrentList();
  try {
    await audio.play();
  } catch (error) {
    // Sau khi dừng lâu, trình duyệt có thể đã giải phóng tài nguyên audio khiến
    // play() thất bại dù audio.src vẫn còn; tải lại đúng bài đang phát rồi thử lại.
    if (error?.name !== 'NotAllowedError') { try { await playTrack(currentTrack, null, false); } catch { /* playTrack đã tự báo lỗi */ } }
  }
  updatePlayer();
  renderTracks();
}
els.play.addEventListener('click', () => { if (!currentTrack) return playCurrentList(); if (audio.paused) return robustPlay(); audio.pause(); updatePlayer(); renderTracks(); });
document.querySelector('#previousButton').addEventListener('click', () => moveQueue(-1)); document.querySelector('#nextButton').addEventListener('click', () => moveQueue(1));
document.querySelector('#shuffleButton').addEventListener('click', event => { shuffle = !shuffle; event.currentTarget.classList.toggle('active', shuffle); showToast(shuffle ? 'Đã bật phát ngẫu nhiên.' : 'Đã tắt phát ngẫu nhiên.'); });
document.querySelector('#repeatButton').addEventListener('click', () => { repeatMode = repeatMode === 'off' ? 'one' : 'off'; updateRepeatButton(); showToast(repeatMode === 'one' ? 'Bài hát đang lặp vô hạn.' : 'Đã tắt lặp bài hát.'); });
els.favorite.addEventListener('click', () => currentTrack && toggleFavorite(currentTrack.id));
els.progress.addEventListener('input', () => { if (audio.duration) audio.currentTime = audio.duration * (els.progress.value / 100); });
audio.volume = 1;
audio.addEventListener('volumechange', updatePlayer);
audio.addEventListener('loadedmetadata', () => { els.duration.textContent = formatTime(audio.duration); const item = seedTracks.find(track => track.id === currentTrack?.id); if (item) item.duration = audio.duration; renderTracks(); renderQueue(); });
let lastPlaybackSaveAt = 0;
audio.addEventListener('timeupdate', () => {
  els.currentTime.textContent = formatTime(audio.currentTime);
  els.progress.value = audio.duration ? audio.currentTime / audio.duration * 100 : 0;
  const now = Date.now();
  if (currentTrack && now - lastPlaybackSaveAt > 5000) { lastPlaybackSaveAt = now; savePlaybackState(); }
});
audio.addEventListener('play', () => { setupVisualizer(); audioContext?.resume(); if (visualizerState) visualizerState.textContent = `LIVE / ${currentTrack?.artist || 'AUDIO'}`; updatePlayer(); renderTracks(); }); audio.addEventListener('pause', () => { if (visualizerState) visualizerState.textContent = 'SIGNAL PAUSED'; updatePlayer(); renderTracks(); savePlaybackState(); });
audio.addEventListener('error', () => {
  if (currentTrack) audioErrorGeneration = playGeneration;
});
audio.addEventListener('ended', () => {
  return advanceQueue();
  if (repeatMode === 'one') return playTrack(currentTrack);
  if (!queue.length) {
    updatePlayer();
    renderTracks();
    return;
  }
  if (queueIndex < queue.length - 1) {
    queueIndex += 1;
    return playTrack(queue[queueIndex]);
  }
  // End of queue — only restart if an explicit loop mode is on
  if (playbackSource === 'playlist' && playlistRepeat) {
    queueIndex = 0;
    return playTrack(queue[0], queue);
  }
  if (queueRepeatRemaining > 0) {
    queueRepeatRemaining -= 1;
    queueIndex = 0;
    return playTrack(queue[0], queue);
  }
  // No loop: stop completely
  audio.pause();
  audio.currentTime = 0;
  updatePlayer();
  renderTracks();
  if (visualizerState) visualizerState.textContent = 'SIGNAL ENDED';
});
const accessDialog = document.querySelector('#accessDialog');
const accessQuestion = document.querySelector('#accessQuestion');
const accessPassword = document.querySelector('#accessPassword');
const accessPass = document.querySelector('#accessPass');
const accessError = document.querySelector('#accessError');
const themeColorDialog = document.querySelector('#themeColorDialog');
const themeColorInput = document.querySelector('#themeColorInput');
document.querySelector('#themeColorButton').addEventListener('click', () => {
  themeColorInput.value = localStorage.getItem(themeColorKey) || defaultThemeColor;
  themeColorDialog.showModal();
  themeColorInput.focus();
});
document.querySelector('#cancelThemeColor').addEventListener('click', () => themeColorDialog.close());
document.querySelector('#saveThemeColor').addEventListener('click', () => {
  const color = normalizeThemeColor(themeColorInput.value);
  if (!color) return showToast('Mã màu không hợp lệ. Dùng dạng #RRGGBB.');
  applyThemeColor(color);
  themeColorInput.value = color;
  themeColorDialog.close();
  saveThemeColor(color);
});
document.querySelector('#resetThemeColor').addEventListener('click', () => {
  applyThemeColor(defaultThemeColor);
  themeColorInput.value = defaultThemeColor;
  saveThemeColor(defaultThemeColor);
});
themeColorInput.addEventListener('keydown', event => { if (event.key === 'Enter') document.querySelector('#saveThemeColor').click(); });
document.querySelector('#accessNo').addEventListener('click', () => { setWriteAccess(false); accessDialog.close(); });
document.querySelector('#accessYes').addEventListener('click', () => { accessQuestion.hidden = true; accessPassword.hidden = false; accessPass.focus(); });
document.querySelector('#accessUnlock').addEventListener('click', () => {
  if (md5(accessPass.value) === 'dc09c97fd73d7a324bdbfe7c79525f64') { setWriteAccess(true); accessDialog.close(); showToast('Đã mở quyền chỉnh sửa trong phiên này.'); }
  else accessError.textContent = 'Mật khẩu không đúng.';
});
accessPass.addEventListener('keydown', event => { if (event.key === 'Enter') document.querySelector('#accessUnlock').click(); });
const hasAdminSession = sessionStorage.getItem('giai-dieu-admin-session') === '1';
const isInstalledPwa = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
setWriteAccess(hasAdminSession || isInstalledPwa);
if (!hasAdminSession && !isInstalledPwa) accessDialog.showModal();
// Collapsible sidebar sections (Artists / Playlists)
(function setupSectionToggles() {
  const key = 'giai-dieu-section-collapse';
  let collapsed = {};
  try { collapsed = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
  function applyState(name) {
    const section = document.querySelector(`.sidebar-section[data-section="${name}"]`);
    const btn = document.querySelector(`[data-toggle="${name}"]`);
    if (!section || !btn) return;
    const isCollapsed = Boolean(collapsed[name]);
    section.classList.toggle('is-collapsed', isCollapsed);
    btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
  }
  ['artists', 'playlists'].forEach(applyState);
  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', event => {
      // don't toggle when clicking the + create button (it's outside)
      event.preventDefault();
      const name = btn.dataset.toggle;
      collapsed[name] = !collapsed[name];
      localStorage.setItem(key, JSON.stringify(collapsed));
      applyState(name);
    });
  });
})();

fetch('./key.txt', { cache: 'no-store' })
  .then(response => response.ok ? response.text() : '')
  .then(value => { thirdPat = value.trim(); })
  .catch(() => {})
  .then(() => loadLibrary())
  .then(restorePlaybackState);
// Nếu lúc thêm bài bị mất mạng/GitHub từ chối, playlist chỉ được lưu ở máy
// (synced: false). Ngay khi có mạng trở lại thì tự thử đẩy lên GitHub luôn,
// không cần đợi người dùng tải lại trang mới đồng bộ.
window.addEventListener('online', retryUnsyncedPlaylists);

function openPlaylistDialog(mode, trackId = '') {
  const dialog = document.querySelector('#playlistDialog');
  const select = document.querySelector('#playlistSelect');
  const nameInput = document.querySelector('#playlistNameInput');
  const createMode = mode === 'create';
  const renameMode = mode === 'rename';
  const playlist = renameMode ? state.playlists.find(item => item.id === trackId) : null;
  if (renameMode && !playlist) return showToast('Không tìm thấy playlist.');
  document.querySelector('#playlistDialogTitle').textContent = createMode ? 'Tạo playlist' : renameMode ? 'Đổi tên playlist' : 'Thêm vào playlist';
  document.querySelector('#playlistCreateFields').hidden = !createMode && !renameMode;
  document.querySelector('#playlistSelectFields').hidden = createMode || renameMode;
  document.querySelector('#savePlaylist').textContent = renameMode ? 'Đổi tên' : createMode ? 'Tạo' : 'Lưu';
  nameInput.value = playlist?.name || '';
  select.replaceChildren(...state.playlists.map(item => new Option(item.name, item.id)));
  dialog.dataset.mode = mode;
  dialog.dataset.trackId = trackId;
  dialog.showModal();
  (createMode || renameMode ? nameInput : select).focus();
}
async function addToPlaylist(id) {
  if (!canWrite) return showToast('Chế độ chỉ nghe.');
  if (!state.playlists.length) return openPlaylistDialog('create', id);
  openPlaylistDialog('add', id);
}
async function createPlaylist() {
  if (!canWrite) return showToast('Chế độ chỉ nghe.');
  openPlaylistDialog('create');
}
async function savePlaylistDialog() {
  const dialog = document.querySelector('#playlistDialog');
  const mode = dialog.dataset.mode;
  const trackId = dialog.dataset.trackId;
  let playlist;
  if (mode === 'create') {
    const cleanName = document.querySelector('#playlistNameInput').value.trim();
    if (!cleanName) return showToast('Nhập tên playlist.');
    if (state.playlists.some(item => item.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return showToast('Playlist này đã tồn tại.');
    playlist = { id: `playlist:${Date.now()}`, name: cleanName, trackIds: trackId ? [trackId] : [], synced: false };
    state.playlists.push(playlist);
  } else if (mode === 'rename') {
    const cleanName = document.querySelector('#playlistNameInput').value.trim();
    playlist = state.playlists.find(item => item.id === trackId);
    if (!playlist) return showToast('Không tìm thấy playlist.');
    if (!cleanName) return showToast('Nhập tên playlist.');
    if (cleanName.toLocaleLowerCase() === playlist.name.toLocaleLowerCase()) return dialog.close();
    if (state.playlists.some(item => item.id !== playlist.id && item.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return showToast('Playlist này đã tồn tại.');
    const oldName = playlist.name;
    playlist.name = cleanName;
    playlist.synced = false;
    dialog.close();
    saveState();
    renderAll();
    try {
      await renameRemotePlaylist(playlist, oldName);
      showToast(`Đã đổi tên playlist thành “${playlist.name}”.`);
    } catch (error) { showToast(`Đã đổi tên cục bộ: ${error.message}`); }
    return;
  } else {
    playlist = state.playlists.find(item => item.id === document.querySelector('#playlistSelect').value);
    if (!playlist) return showToast('Chưa có playlist để chọn.');
    if (playlist.trackIds.includes(trackId)) return showToast('Bài hát đã có trong playlist.');
    playlist.trackIds.push(trackId);
    playlist.synced = false;
  }
  dialog.close();
  saveState();
  renderAll();
  try {
    await syncPlaylistToGitHub(playlist);
    showToast(mode === 'create' ? `Đã tạo playlist “${playlist.name}”.` : `Đã thêm bài hát vào ${playlist.name}.`);
  } catch (error) { showToast(`Đã lưu playlist cục bộ: ${error.message}`); }
}
async function renameRemotePlaylist(playlist, oldName) {
  const token = getGitHubToken();
  if (!token) throw new Error('Chưa cấu hình quyền GitHub để đổi tên playlist.');
  if (!githubRepo) throw new Error('Không xác định được repository GitHub.');
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const safeOldName = oldName.replace(/[<>:"/\\|?*]/g, '-').trim();
  const safeNewName = playlist.name.replace(/[<>:"/\\|?*]/g, '-').trim();
  const oldPath = `playlist/${safeOldName}/playlist.json`;
  const newPath = `playlist/${safeNewName}/playlist.json`;
  if (oldPath === newPath) return syncPlaylistToGitHub(playlist);
  const endpointFor = path => `https://api.github.com/repos/${githubRepo.owner}/${githubRepo.name}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const oldEndpoint = endpointFor(oldPath);
  const newEndpoint = endpointFor(newPath);
  const oldResponse = await fetch(`${oldEndpoint}?ref=${encodeURIComponent(githubBranch)}`, { headers });
  let oldSha;
  if (oldResponse.ok) oldSha = (await oldResponse.json()).sha;
  else if (oldResponse.status !== 404) throw new Error('Không đọc được playlist cũ trên GitHub.');
  const newResponse = await fetch(`${newEndpoint}?ref=${encodeURIComponent(githubBranch)}`, { headers });
  if (newResponse.ok) throw new Error('Tên playlist mới đã tồn tại trên GitHub.');
  if (newResponse.status !== 404) throw new Error('Không kiểm tra được playlist mới trên GitHub.');
  const content = JSON.stringify({ name: playlist.name, tracks: playlist.trackIds.map(id => allTracks().find(track => track.id === id)?.path).filter(Boolean) }, null, 2);
  const putResponse = await fetch(newEndpoint, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Rename playlist: ${oldName} to ${playlist.name}`, content: base64FromBytes(new TextEncoder().encode(content)), branch: githubBranch }) });
  if (!putResponse.ok) throw new Error('GitHub từ chối tạo playlist mới.');
  if (oldSha) {
    const deleteResponse = await fetch(oldEndpoint, { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Rename playlist: ${oldName} to ${playlist.name}`, sha: oldSha, branch: githubBranch }) });
    if (!deleteResponse.ok) throw new Error('Đã tạo playlist mới nhưng chưa xóa playlist cũ.');
  }
  playlist.synced = true;
  saveState();
}
async function deleteRemotePlaylist(playlist) {
  const token = getGitHubToken();
  if (!token) throw new Error('Chưa cấu hình quyền GitHub để xóa playlist.');
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const safeName = playlist.name.replace(/[<>:"/\\|?*]/g, '-').trim();
  const path = `playlist/${safeName}/playlist.json`;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const endpoint = `https://api.github.com/repos/${githubRepo.owner}/${githubRepo.name}/contents/${encodedPath}`;
  const existing = await fetch(`${endpoint}?ref=${encodeURIComponent(githubBranch)}`, { headers });
  if (existing.status === 404) return;
  if (!existing.ok) throw new Error('Không đọc được playlist trên GitHub.');
  const { sha } = await existing.json();
  const response = await fetch(endpoint, { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Delete playlist: ${playlist.name}`, sha, branch: githubBranch }) });
  if (!response.ok) throw new Error('GitHub từ chối xóa playlist.');
}
function getGitHubToken() { return `github_pat_${thirdPat}`; }
document.querySelector('#cancelPlaylist').addEventListener('click', () => document.querySelector('#playlistDialog').close());
document.querySelector('#savePlaylist').addEventListener('click', savePlaylistDialog);

let confirmResolve = null;
function askConfirmation(title, message, confirmLabel = 'Xác nhận') {
  const dialog = document.querySelector('#confirmDialog');
  document.querySelector('#confirmDialogTitle').textContent = title;
  document.querySelector('#confirmDialogMessage').textContent = message;
  document.querySelector('#acceptConfirm').textContent = confirmLabel;
  dialog.showModal();
  return new Promise(resolve => { confirmResolve = resolve; });
}
function finishConfirmation(value) {
  const resolve = confirmResolve;
  confirmResolve = null;
  const dialog = document.querySelector('#confirmDialog');
  if (dialog.open) dialog.close();
  resolve?.(value);
}
document.querySelector('#cancelConfirm').addEventListener('click', () => finishConfirmation(false));
document.querySelector('#acceptConfirm').addEventListener('click', () => finishConfirmation(true));
document.querySelector('#confirmDialog').addEventListener('close', () => {
  if (confirmResolve) finishConfirmation(false);
});
async function deleteTrack(id) {
  if (!canWrite) return showToast('Chế độ chỉ nghe.');
  const track = allTracks().find(item => item.id === id);
  if (!track || !(await askConfirmation('Xóa bài hát', `Xóa “${track.title}” khỏi GitHub?`, 'Xóa'))) return;
  try { await deleteGitHubFile(track); await loadLibrary(); showToast('Đã xóa file khỏi GitHub.'); }
  catch (error) { showToast(error.message); }
}
async function removeTrackFromPlaylist(trackId) {
  if (!canWrite) return showToast('Chế độ chỉ nghe.');
  if (view.type !== 'playlist') return;
  const playlist = state.playlists.find(item => item.id === view.value);
  if (!playlist) return;
  playlist.trackIds = playlist.trackIds.filter(id => id !== trackId);
  playlist.synced = false;
  saveState();
  renderAll();
  try { await syncPlaylistToGitHub(playlist); showToast('Đã xóa bài hát khỏi playlist.'); }
  catch (error) { showToast(`Đã xóa cục bộ: ${error.message}`); }
}
async function deletePlaylist(id) {
  if (!canWrite) return showToast('Chế độ chỉ nghe.');
  const playlist = state.playlists.find(item => item.id === id);
  if (!playlist || !(await askConfirmation('Xóa playlist', `Xóa playlist “${playlist.name}”?`, 'Xóa'))) return;
  try {
    await deleteRemotePlaylist(playlist);
    state.playlists = state.playlists.filter(item => item.id !== id);
    if (view.value === id) view = { type: 'all', value: '' };
    saveState(); renderAll(); showToast('Đã xóa playlist trên GitHub.');
  } catch (error) { showToast(error.message); }
}
function renderAddTrackChoices() {
  const playlist = state.playlists.find(item => item.id === view.value);
  const list = document.querySelector('#addTrackList');
  const filter = document.querySelector('#addTrackFilter').value;
  const artistSelect = document.querySelector('#addTrackArtist');
  let tracks = allTracks().filter(track => !playlist?.trackIds.includes(track.id));
  if (filter === 'recent') tracks = state.recent.map(id => tracks.find(track => track.id === id)).filter(Boolean);
  if (filter === 'favorites') tracks = tracks.filter(track => state.favorites.includes(track.id));
  if (filter === 'artist' && artistSelect.value) tracks = tracks.filter(track => track.artist === artistSelect.value);
  list.innerHTML = tracks.length ? tracks.map(track => `<label class="add-track-option"><input type="checkbox" data-add-track="${esc(track.id)}"><span><strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small></span></label>`).join('') : '<p class="empty-state">Không còn bài hát phù hợp để thêm.</p>';
}
function openAddTracksDialog() {
  if (!canWrite) return showToast('Chế độ chỉ nghe.');
  if (view.type !== 'playlist') return;
  const artistSelect = document.querySelector('#addTrackArtist');
  artistSelect.replaceChildren(new Option('Tất cả nghệ sĩ', ''), ...artists().map(artist => new Option(artist, artist)));
  document.querySelector('#addTrackFilter').value = 'all';
  artistSelect.hidden = true;
  renderAddTrackChoices();
  document.querySelector('#addTracksDialog').showModal();
}
async function saveAddedTracks() {
  const playlist = state.playlists.find(item => item.id === view.value);
  if (!playlist) return;
  const selected = [...document.querySelectorAll('#addTrackList [data-add-track]:checked')].map(input => input.dataset.addTrack);
  if (!selected.length) return showToast('Chọn ít nhất một bài hát.');
  playlist.trackIds.push(...selected.filter(id => !playlist.trackIds.includes(id)));
  playlist.synced = false;
  saveState();
  document.querySelector('#addTracksDialog').close();
  renderAll();
  try { await syncPlaylistToGitHub(playlist); showToast(`Đã thêm ${selected.length} bài hát vào ${playlist.name}.`); }
  catch (error) { showToast(`Đã lưu playlist cục bộ: ${error.message}`); }
}
document.querySelector('#addTracksButton').addEventListener('click', openAddTracksDialog);
document.querySelector('#cancelAddTracks').addEventListener('click', () => document.querySelector('#addTracksDialog').close());
document.querySelector('#saveAddTracks').addEventListener('click', saveAddedTracks);
document.querySelector('#addTrackFilter').addEventListener('change', event => {
  document.querySelector('#addTrackArtist').hidden = event.target.value !== 'artist';
  renderAddTrackChoices();
});
document.querySelector('#addTrackArtist').addEventListener('change', renderAddTrackChoices);
document.querySelector('#createPlaylistFromAdd').addEventListener('click', () => {
  const trackId = document.querySelector('#playlistDialog').dataset.trackId;
  document.querySelector('#playlistDialog').close();
  openPlaylistDialog('create', trackId);
});

function githubPath(path) { return path.split('/').map(encodeURIComponent).join('/'); }
function artistTracks(name) { return seedTracks.filter(track => track.artist === name); }
function validArtistName(name) { return name && name !== '.' && name !== '..' && !/[\\/]/.test(name); }
function openCreateArtistDialog() {
  if (!canWrite) return showToast('Chế độ chỉ nghe.');
  const dialog = document.querySelector('#createArtistDialog');
  const input = document.querySelector('#createArtistNameInput');
  input.value = '';
  dialog.showModal();
  input.focus();
}
function saveCreateArtist() {
  const dialog = document.querySelector('#createArtistDialog');
  const name = document.querySelector('#createArtistNameInput').value.trim();
  if (!validArtistName(name)) return showToast('Tên nghệ sĩ không hợp lệ.');
  if (artists().some(artist => artist.toLocaleLowerCase() === name.toLocaleLowerCase())) return showToast('Nghệ sĩ đã tồn tại.');
  pendingArtistUpload = name;
  dialog.close();
  document.querySelector('#artistFileInput').click();
}
function openArtistDialog(name) {
  if (!canWrite) return showToast('Chế độ chỉ nghe.');
  const dialog = document.querySelector('#artistDialog');
  dialog.dataset.artist = name;
  document.querySelector('#artistNameInput').value = name;
  dialog.showModal();
  document.querySelector('#artistNameInput').focus();
}
async function moveArtistFile(track, oldName, newName) {
  const token = getGitHubToken();
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const relativePath = track.path.split('/').slice(2).join('/');
  const oldPath = track.path;
  const newPath = `artist/${newName}/${relativePath}`;
  const oldEndpoint = `https://api.github.com/repos/${githubRepo.owner}/${githubRepo.name}/contents/${githubPath(oldPath)}`;
  const newEndpoint = `https://api.github.com/repos/${githubRepo.owner}/${githubRepo.name}/contents/${githubPath(newPath)}`;
  let source;
  if (track.sha) {
    const blobEndpoint = `https://api.github.com/repos/${githubRepo.owner}/${githubRepo.name}/git/blobs/${encodeURIComponent(track.sha)}`;
    const blobResponse = await fetch(blobEndpoint, { headers });
    if (!blobResponse.ok) throw new Error(`Không đọc được file ${relativePath}.`);
    const blob = await blobResponse.json();
    source = { sha: track.sha, content: blob.content };
  } else {
    const sourceResponse = await fetch(`${oldEndpoint}?ref=${encodeURIComponent(githubBranch)}`, { headers });
    if (!sourceResponse.ok) throw new Error(`Không đọc được file ${relativePath}.`);
    source = await sourceResponse.json();
  }
  const destinationResponse = await fetch(`${newEndpoint}?ref=${encodeURIComponent(githubBranch)}`, { headers });
  if (destinationResponse.ok) throw new Error(`File đích đã tồn tại: ${newPath}.`);
  const putResponse = await fetch(newEndpoint, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Rename artist: ${oldName} to ${newName}`, content: String(source.content || '').replace(/\s/g, ''), branch: githubBranch }) });
  if (!putResponse.ok) throw new Error(`Không tạo được file mới: ${newPath}.`);
  const deleteResponse = await fetch(oldEndpoint, { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Rename artist: ${oldName} to ${newName}`, sha: source.sha, branch: githubBranch }) });
  if (!deleteResponse.ok) throw new Error(`Đã tạo file mới nhưng chưa xóa được ${oldPath}.`);
}
async function renameArtist(oldName, newName) {
  const token = getGitHubToken();
  if (!token) throw new Error('Chưa cấu hình quyền GitHub để đổi tên nghệ sĩ.');
  if (!githubRepo) throw new Error('Không xác định được repository GitHub.');
  const tracks = artistTracks(oldName);
  if (!tracks.length) throw new Error('Nghệ sĩ này không có file nhạc.');
  for (const track of tracks) await moveArtistFile(track, oldName, newName);
  const movedPaths = new Map(tracks.map(track => [track.path, `artist/${newName}/${track.path.split('/').slice(2).join('/')}`]));
  tracks.forEach(track => { track.path = movedPaths.get(track.path); });
  const affectedIds = new Set(tracks.map(track => track.id));
  for (const playlist of state.playlists.filter(item => item.trackIds.some(id => affectedIds.has(id)))) await syncPlaylistToGitHub(playlist);
}
async function saveArtistName() {
  const dialog = document.querySelector('#artistDialog');
  const oldName = dialog.dataset.artist;
  const newName = document.querySelector('#artistNameInput').value.trim();
  if (!validArtistName(newName)) return showToast('Tên nghệ sĩ không hợp lệ.');
  if (newName.toLocaleLowerCase() === oldName.toLocaleLowerCase()) return dialog.close();
  if (artists().some(artist => artist.toLocaleLowerCase() === newName.toLocaleLowerCase())) return showToast('Tên nghệ sĩ đã tồn tại.');
  dialog.close();
  try {
    await renameArtist(oldName, newName);
    if (view.type === 'folder' && view.value === oldName) view.value = newName;
    await loadLibrary();
    showToast(`Đã đổi tên nghệ sĩ thành “${newName}”.`);
  } catch (error) { showToast(error.message); }
}
async function deleteArtist(name) {
  if (!canWrite) return showToast('Chế độ chỉ nghe.');
  const tracks = artistTracks(name);
  if (!tracks.length) return showToast('Nghệ sĩ này không có file nhạc.');
  if (!(await askConfirmation('Xóa nghệ sĩ', `Xóa “${name}” và ${tracks.length} file nhạc khỏi GitHub?`, 'Xóa'))) return;
  const token = getGitHubToken();
  if (!token) return showToast('Chưa cấu hình quyền GitHub để xóa nghệ sĩ.');
  try {
    for (const track of tracks) await deleteGitHubFile(track);
    if (view.type === 'folder' && view.value === name) view = { type: 'all', value: '' };
    await loadLibrary();
    showToast(`Đã xóa nghệ sĩ “${name}”.`);
  } catch (error) { showToast(error.message); }
}
function clearCurrentCollection() {
  if (view.type === 'playlist') return deletePlaylist(view.value);
  if (view.type === 'folder') return deleteArtist(view.value);
}
document.querySelector('#cancelArtist').addEventListener('click', () => document.querySelector('#artistDialog').close());
document.querySelector('#saveArtist').addEventListener('click', saveArtistName);
document.querySelector('#artistNameInput').addEventListener('keydown', event => { if (event.key === 'Enter') saveArtistName(); });
document.querySelector('#cancelCreateArtist').addEventListener('click', () => document.querySelector('#createArtistDialog').close());
document.querySelector('#saveCreateArtist').addEventListener('click', saveCreateArtist);
document.querySelector('#createArtistNameInput').addEventListener('keydown', event => { if (event.key === 'Enter') saveCreateArtist(); });
function waitForPlaybackRetry(delay) { return new Promise(resolve => setTimeout(resolve, delay)); }
function prefetchTrack(track) {
  if (!track?.src || audioSourceCache.has(track.id) || prefetchPromises.has(track.id) || !/^https?:/i.test(track.src)) return;
  const promise = cachedAudioUrl(track).then(stored => {
    if (stored) return stored;
    return fetch(track.src, { cache: 'force-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`Audio fetch failed: ${response.status}`);
        return response.blob();
      })
      .then(async blob => {
        await writeAudioRecord({ id: track.id, src: track.src, blob, updatedAt: Date.now() });
        const url = URL.createObjectURL(blob);
        audioSourceCache.set(track.id, url);
        return url;
      });
  })
    .finally(() => prefetchPromises.delete(track.id));
  prefetchPromises.set(track.id, promise);
  promise.catch(() => {});
}
function preloadNextTrack(includeCurrent = true) {
  // Chỉ chuẩn bị trước bài đang phát + bài kế tiếp trong hàng đợi, không tải
  // luôn cả danh sách cùng lúc. Bài nào đã có trong cache/IndexedDB rồi thì
  // prefetchTrack() và service worker tự bỏ qua, không tải lại.
  const upcoming = [];
  if (includeCurrent && currentTrack) upcoming.push(currentTrack);
  if (queueIndex >= 0 && queueIndex + 1 < queue.length) upcoming.push(queue[queueIndex + 1]);
  upcoming.forEach(track => prefetchTrack(track));
  const urls = upcoming.map(track => track.src).filter(src => /^https?:/i.test(src));
  if ('serviceWorker' in navigator && urls.length) {
    navigator.serviceWorker.ready.then(registration => {
      registration.active?.postMessage({ type: 'prefetch-audio', urls });
    }).catch(() => {});
  }
}
function stopAtQueueEnd() {
  audio.pause();
  audio.currentTime = 0;
  updatePlayer();
  renderTracks();
  if (visualizerState) visualizerState.textContent = 'SIGNAL ENDED';
}
function advanceQueue() {
  if (repeatMode === 'one') return playTrack(currentTrack, null, false);
  if (!queue.length) {
    updatePlayer();
    renderTracks();
    return;
  }
  if (queueIndex < queue.length - 1) {
    queueIndex += 1;
    return playTrack(queue[queueIndex]);
  }
  if (repeatsBySource(playbackSource) && playlistRepeat) {
    queueIndex = 0;
    return playTrack(queue[0], queue);
  }
  if (queueRepeatRemaining > 0) {
    queueRepeatRemaining -= 1;
    queueIndex = 0;
    return playTrack(queue[0], queue);
  }
  stopAtQueueEnd();
}
async function playTrack(track, nextQueue = null, advanceOnFailure = true) {
  if (!track) return;
  const request = ++playGeneration;
  if (nextQueue && playbackSource !== 'queue' && (view.type === 'playlist' || view.type === 'folder')) playbackSource = sourceForView();
  try {
    if (nextQueue) { queue = [...nextQueue]; queueIndex = queue.findIndex(item => item.id === track.id); }
    else if (!queue.some(item => item.id === track.id)) { queue = [track]; queueIndex = 0; }
    currentTrack = track;
    preloadNextTrack(false);
    const src = await fileUrl(track);
    if (request !== playGeneration) return;
    syncMediaSession();
    let lastError;
    for (const delay of playRetryDelays) {
      if (request !== playGeneration) return;
      if (delay) await waitForPlaybackRetry(delay);
      if (request !== playGeneration) return;
      audio.pause();
      audio.src = src;
      audio.autoplay = true;
      audio.preload = 'auto';
      audio.load();
      audioErrorGeneration = 0;
      try {
        await audio.play();
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (error?.name === 'NotAllowedError') break;
      }
    }
    if (request !== playGeneration) return;
    if (lastError) {
      if (lastError.name === 'NotAllowedError') {
        showToast('TrÃ¬nh duyá»‡t Ä‘ang cháº·n phÃ¡t ná»n. Nháº¥n PhÃ¡t Ä‘á»ƒ tiáº¿p tá»¥c.');
        updatePlayer();
        return;
      }
      throw lastError;
    }
    state.recent = [track.id, ...state.recent.filter(id => id !== track.id)].slice(0, 20); saveState();
    savePlaybackState();
    preloadNextTrack();
    renderAll();
  } catch {
    if (request !== playGeneration) return;
    showToast('Bá» qua file lá»—i, chuyá»ƒn sang bÃ i tiáº¿p theo.');
    if (advanceOnFailure) advanceQueue();
  }
}
async function legacyShowActionNotification() {
  if (!swReg || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (!currentTrack) {
    lastNotifKey = '';
    const old = await swReg.getNotifications({ tag: 'now-playing' });
    old.forEach(notification => notification.close());
    return;
  }
  const key = [currentTrack.id, audio.paused].join('|');
  if (key === lastNotifKey) return;
  lastNotifKey = key;
  try {
    await swReg.showNotification(currentTrack.title, {
      body: currentTrack.artist,
      tag: 'now-playing',
      silent: true,
      icon: LOGO_URL,
      requireInteraction: true,
      actions: [
        { action: 'previous', title: 'Previous' },
        { action: audio.paused ? 'play' : 'pause', title: audio.paused ? 'Play' : 'Pause' },
        { action: 'next', title: 'Next' }
      ]
    });
  } catch { /* notification actions are optional */ }
}
}
