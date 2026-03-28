import { catalog, COIN_LIFE_STEPS, COIN_SPAWN_EVERY, defaultProfile, levelDefs } from './catalog.js';
import { getAppConfig, hasSupabaseConfig } from './config.js';
import { loadLocalProfile, resetLocalProfile, saveLocalProfile, sanitizeProfile } from './storage.js';
import { fetchRemoteProfile, getSession, getSupabaseClient, onAuthStateChange, saveRemoteProfile, sendMagicLink, signIn, signOut, signUp } from './supabase.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const messageTitle = document.getElementById('messageTitle');
const messageText = document.getElementById('messageText');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const coinsEl = document.getElementById('coins');
const levelEl = document.getElementById('level');
const speedPill = document.getElementById('speedPill');
const statePill = document.getElementById('statePill');
const goalPill = document.getElementById('goalPill');
const skinPill = document.getElementById('skinPill');
const saveModePill = document.getElementById('saveModePill');
const playPauseBtn = document.getElementById('playPauseBtn');
const restartBtn = document.getElementById('restartBtn');
const resetProgressBtn = document.getElementById('resetProgressBtn');
const pauseBtn = document.getElementById('pauseBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const shopItems = document.getElementById('shopItems');
const accountStatus = document.getElementById('accountStatus');
const syncStatus = document.getElementById('syncStatus');
const showAuthBtn = document.getElementById('showAuthBtn');
const closeAuthBtn = document.getElementById('closeAuthBtn');
const authPanel = document.getElementById('authPanel');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const signInBtn = document.getElementById('signInBtn');
const signUpBtn = document.getElementById('signUpBtn');
const magicLinkBtn = document.getElementById('magicLinkBtn');
const signOutBtn = document.getElementById('signOutBtn');
const syncNowBtn = document.getElementById('syncNowBtn');
const accountActionsSignedOut = document.getElementById('accountActionsSignedOut');
const accountActionsSignedIn = document.getElementById('accountActionsSignedIn');

const GRID = 20;
const SIZE = canvas.width;
const CELL = SIZE / GRID;
const config = getAppConfig();

let profile = loadLocalProfile();
let currentUser = null;
let saveMode = hasSupabaseConfig(config) ? 'supabase-ready' : 'local-only';
let syncMessage = '';
let syncInFlight = false;
let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = null;
let coin = null;
let obstacles = [];
let tunnels = [];
let score = 0;
let bankedRunCoins = 0;
let levelIndex = 0;
let levelFood = 0;
let running = false;
let started = false;
let gameOver = false;
let usedShield = false;
let lastTime = 0;
let accumulator = 0;
let touchStart = null;
let tunnelCooldown = 0;

boot();

async function boot() {
  renderShop();
  resetGame(false);
  wireEvents();
  updateViewportHeight();
  requestAnimationFrame(loop);
  updateAuthButtons();
  updateUi();

  if (hasSupabaseConfig(config)) {
    try {
      await getSupabaseClient();
      const { user } = await getSession();
      currentUser = user;
      if (currentUser) await syncProfileFromCloud();
      else syncMessage = 'Supabase connected. Log in to sync progress across devices.';
      onAuthStateChange(async (user) => {
        currentUser = user;
        if (currentUser) await syncProfileFromCloud();
        else {
          saveMode = hasSupabaseConfig(config) ? 'local-only' : 'local-only';
          syncMessage = 'Signed out. Progress is staying on this device until you log in again.';
          updateAuthButtons();
          updateUi();
        }
      });
    } catch (error) {
      saveMode = 'local-only';
      syncMessage = `Supabase unavailable: ${error.message}`;
    }
  }
  updateAuthButtons();
  updateUi();
}

function activeLevel() {
  return levelDefs[Math.min(levelIndex, levelDefs.length - 1)];
}

function hasItem(id) { return profile.owned.includes(id); }
function hasPower(id) { return hasItem(id) && profile.activePowers.includes(id); }
function currentSkin() { return catalog.find((item) => item.id === profile.equippedSkin) || catalog[0]; }
function getSpeed() { return activeLevel().speed * (hasPower('power-slow') ? 0.88 : 1); }
function keyOf(cell) { return `${cell.x},${cell.y}`; }
function sameCell(a, b) { return a && b && a.x === b.x && a.y === b.y; }

function setOverlay(title, text, visible) {
  messageTitle.textContent = title;
  messageText.textContent = text;
  overlay.classList.toggle('hidden', !visible);
}

function resetGame(autoStart = false) {
  snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  bankedRunCoins = 0;
  levelIndex = 0;
  levelFood = 0;
  running = false;
  started = false;
  gameOver = false;
  usedShield = false;
  lastTime = 0;
  accumulator = 0;
  tunnelCooldown = 0;
  applyLevel();
  food = randomFreeCell();
  coin = null;
  updateUi();
  draw();
  if (autoStart) startGame();
  else setOverlay('Ready?', 'Collect apples to level up. Coins buy skins and power-ups.', true);
}

function applyLevel() {
  obstacles = dedupeCells(activeLevel().obstacles.slice());
  tunnels = createTunnels(activeLevel().tunnels);
}

function startGame() {
  if (gameOver) resetGame(false);
  started = true;
  running = true;
  setOverlay('', '', false);
  updateUi();
}

function pauseGame() {
  if (!started || gameOver) return;
  running = false;
  setOverlay('Paused', 'Tap play, swipe again, or press space to resume.', true);
  updateUi();
}

function togglePlayPause() {
  if (!started || gameOver) startGame();
  else if (running) pauseGame();
  else startGame();
}

function setDirection(x, y) {
  if (x === -direction.x && y === -direction.y) return;
  nextDirection = { x, y };
  if (!started || gameOver) startGame();
}

async function mutateProfile(mutator, options = {}) {
  profile = sanitizeProfile(mutator({ ...profile }));
  profile = saveLocalProfile(profile);
  renderShop();
  updateUi();
  draw();
  if (!options.skipRemote) await syncProfileToCloud();
}

async function buyOrEquip(id) {
  const item = catalog.find((entry) => entry.id === id);
  if (!item) return;
  await mutateProfile((draft) => {
    if (!draft.owned.includes(id)) {
      if (draft.coins < item.cost) return draft;
      draft.coins -= item.cost;
      draft.owned.push(id);
    }
    if (item.type === 'skin') {
      draft.equippedSkin = id;
    } else if (draft.activePowers.includes(id)) {
      draft.activePowers = draft.activePowers.filter((entry) => entry !== id);
    } else {
      draft.activePowers.push(id);
    }
    return draft;
  });
}

function renderShop() {
  shopItems.innerHTML = '';
  for (const item of catalog) {
    const owned = hasItem(item.id);
    const equipped = item.type === 'skin' ? profile.equippedSkin === item.id : profile.activePowers.includes(item.id);
    const card = document.createElement('div');
    card.className = 'item';
    const accent = item.colors ? `<span class="swatch" style="background:${item.colors.head}"></span>` : '';
    let label = !owned ? `Buy ${item.cost}🪙` : equipped ? (item.type === 'skin' ? 'Equipped' : 'Active') : (item.type === 'skin' ? 'Equip' : 'Activate');
    card.innerHTML = `
      <div class="item-head">
        <div>
          <div class="item-name">${item.name}</div>
          <div class="item-desc">${item.desc}</div>
        </div>
        ${accent}
      </div>
      <button class="mini ${owned && equipped ? 'secondary' : owned ? 'ghost' : ''}" ${owned && equipped && item.type === 'skin' ? 'disabled' : ''}>${label}</button>
    `;
    card.querySelector('button').addEventListener('click', () => buyOrEquip(item.id));
    shopItems.appendChild(card);
  }
}

function randomFreeCell(extraBlocked = []) {
  const blocked = new Set([...snake.map(keyOf), ...obstacles.map(keyOf), ...tunnels.flatMap((pair) => [keyOf(pair.a), keyOf(pair.b)]), ...extraBlocked.map(keyOf)]);
  const options = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (!blocked.has(`${x},${y}`)) options.push({ x, y });
  return options[Math.floor(Math.random() * options.length)] || { x: 0, y: 0 };
}

function createTunnels(count) {
  const pairs = [];
  const blocked = new Set([...snake.map(keyOf), ...obstacles.map(keyOf)]);
  const candidates = [];
  for (let y = 1; y < GRID - 1; y++) for (let x = 1; x < GRID - 1; x++) if (!blocked.has(`${x},${y}`)) candidates.push({ x, y });
  shuffle(candidates);
  while (pairs.length < count && candidates.length >= 2) {
    const a = candidates.pop();
    const bIndex = candidates.findIndex((cell) => Math.abs(cell.x - a.x) + Math.abs(cell.y - a.y) >= 8);
    if (bIndex === -1) continue;
    const [b] = candidates.splice(bIndex, 1);
    pairs.push({ a, b });
  }
  return pairs;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function dedupeCells(cells) {
  const seen = new Set();
  return cells.filter((cell) => {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function levelUp() {
  if (levelIndex < levelDefs.length - 1) {
    levelIndex += 1;
    levelFood = 0;
    applyLevel();
    food = randomFreeCell(coin ? [coin] : []);
    if (coin) Object.assign(coin, randomFreeCell([food]), { life: coin.life });
    setOverlay(`Level ${levelIndex + 1}: ${activeLevel().name}`, 'New speed and hazards. Tap play or swipe to continue.', true);
    running = false;
  }
  updateUi();
  draw();
}

async function awardCoin(amount) {
  bankedRunCoins += amount;
  await mutateProfile((draft) => ({ ...draft, coins: draft.coins + amount, best: Math.max(draft.best, score) }));
}

function maybeSpawnCoin() {
  if (!coin && score > 0 && score % COIN_SPAWN_EVERY === 0) {
    const pos = randomFreeCell([food]);
    coin = { x: pos.x, y: pos.y, life: COIN_LIFE_STEPS };
  }
}

function consumeShield() {
  if (!hasPower('power-shield') || usedShield) return false;
  usedShield = true;
  snake.shift();
  direction = { ...nextDirection };
  setOverlay('Shield used', 'You got one free save this run.', true);
  running = false;
  updateUi();
  draw();
  return true;
}

async function step() {
  direction = nextDirection;
  if (tunnelCooldown > 0) tunnelCooldown -= 1;
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
  const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
  const hitObstacle = obstacles.some((cell) => sameCell(cell, head));
  const tail = snake[snake.length - 1];
  const willGrow = food && sameCell(head, food);
  const hitSelf = snake.some((seg, index) => !(!willGrow && index === snake.length - 1 && sameCell(seg, tail)) && sameCell(seg, head));
  if (hitWall || hitObstacle || hitSelf) {
    if (consumeShield()) return;
    return endGame();
  }
  snake.unshift(head);
  applyTunnelTravel();
  applyMagnet();
  let grew = false;
  if (food && sameCell(snake[0], food)) {
    score += 1;
    levelFood += 1;
    grew = true;
    if (score > profile.best) mutateProfile((draft) => ({ ...draft, best: score }), { skipRemote: false });
    food = randomFreeCell(coin ? [coin] : []);
    maybeSpawnCoin();
    if (levelFood >= activeLevel().target) levelUp();
  }
  if (coin && sameCell(snake[0], coin)) {
    const value = activeLevel().coinValue;
    coin = null;
    await awardCoin(value);
  }
  if (!grew) snake.pop();
  if (coin) {
    coin.life -= 1;
    if (coin.life <= 0) coin = null;
  }
  updateUi();
  draw();
}

function applyTunnelTravel() {
  if (tunnelCooldown > 0) return;
  for (const pair of tunnels) {
    if (sameCell(snake[0], pair.a)) { snake[0] = { ...pair.b }; tunnelCooldown = 2; return; }
    if (sameCell(snake[0], pair.b)) { snake[0] = { ...pair.a }; tunnelCooldown = 2; return; }
  }
}

function applyMagnet() {
  if (!coin || !hasPower('power-magnet')) return;
  const head = snake[0];
  const dx = head.x - coin.x;
  const dy = head.y - coin.y;
  const dist = Math.abs(dx) + Math.abs(dy);
  if (dist > 3 || dist === 0) return;
  const moveX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const moveY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  const candidate = Math.abs(dx) >= Math.abs(dy) ? { x: coin.x + moveX, y: coin.y } : { x: coin.x, y: coin.y + moveY };
  if (!isBlocked(candidate, [food])) Object.assign(coin, candidate);
}

function isBlocked(cell, extra = []) {
  if (cell.x < 0 || cell.y < 0 || cell.x >= GRID || cell.y >= GRID) return true;
  return [...snake, ...obstacles, ...tunnels.flatMap((pair) => [pair.a, pair.b]), ...extra].some((entry) => sameCell(entry, cell));
}

function endGame() {
  running = false;
  gameOver = true;
  setOverlay('Game over', `Score ${score}, coins banked +${bankedRunCoins}. Tap play for another run.`, true);
  updateUi();
  draw();
}

function updateUi() {
  scoreEl.textContent = String(score);
  bestEl.textContent = String(profile.best);
  coinsEl.textContent = String(profile.coins);
  levelEl.textContent = String(levelIndex + 1);
  speedPill.textContent = `Speed: ${getSpeed().toFixed(1)} tiles/sec`;
  goalPill.textContent = `Next level: ${Math.max(activeLevel().target - levelFood, 0)} food`;
  skinPill.textContent = `Skin: ${currentSkin().name}`;
  saveModePill.textContent = `Save: ${currentUser ? 'cloud sync on' : saveMode.replace('-', ' ')}`;
  let state = 'waiting';
  if (gameOver) state = 'game over';
  else if (running) state = activeLevel().name;
  else if (started) state = 'paused';
  statePill.textContent = `State: ${state}`;
  playPauseBtn.textContent = gameOver ? 'Play again' : (running ? 'Pause' : 'Play');
  pauseBtn.textContent = running ? 'Pause' : 'Play';
  accountStatus.textContent = currentUser ? `Signed in as ${currentUser.email}` : (hasSupabaseConfig(config) ? 'Supabase connected. Sign in to sync progress.' : 'Running in local-only mode.');
  syncStatus.textContent = syncMessage || (currentUser ? 'Progress saves on this device and syncs to your account.' : 'Add Supabase config to enable login and cross-device save sync.');
  magicLinkBtn.disabled = !config.enableMagicLink || !hasSupabaseConfig(config);
  renderShop();
}

function drawBoard() {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#0a1628' : '#0d1b31';
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }
}
function drawRoundedRect(x, y, w, h, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
function drawObstacles() { for (const cell of obstacles) drawRoundedRect(cell.x * CELL + 3, cell.y * CELL + 3, CELL - 6, CELL - 6, 6, '#475569'); }
function drawFood() {
  if (!food) return;
  const cx = food.x * CELL + CELL / 2;
  const cy = food.y * CELL + CELL / 2;
  ctx.fillStyle = 'rgba(251, 113, 133, 0.18)'; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.38, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fb7185'; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.23, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd7df'; ctx.beginPath(); ctx.arc(cx - CELL * 0.07, cy - CELL * 0.07, CELL * 0.05, 0, Math.PI * 2); ctx.fill();
}
function drawCoin() {
  if (!coin) return;
  const cx = coin.x * CELL + CELL / 2;
  const cy = coin.y * CELL + CELL / 2;
  ctx.fillStyle = 'rgba(250, 204, 21, 0.17)'; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.36, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.24, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.17, 0, Math.PI * 2); ctx.stroke();
}
function drawTunnels() {
  tunnels.forEach((pair, index) => [pair.a, pair.b].forEach((cell) => {
    const cx = cell.x * CELL + CELL / 2;
    const cy = cell.y * CELL + CELL / 2;
    const gradient = ctx.createRadialGradient(cx, cy, CELL * 0.08, cx, cy, CELL * 0.42);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(0.55, index % 2 === 0 ? '#8b5cf6' : '#ec4899');
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0.12)');
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.24, 0, Math.PI * 2); ctx.stroke();
  }));
}
function drawSnake() {
  const skin = currentSkin().colors;
  snake.forEach((seg, index) => {
    const x = seg.x * CELL + 2;
    const y = seg.y * CELL + 2;
    const size = CELL - 4;
    drawRoundedRect(x, y, size, size, 7, index === 0 ? skin.head : skin.body);
    if (index === 0) {
      const eyeOffsetX = direction.x === 0 ? CELL * 0.15 : direction.x * CELL * 0.12;
      const eyeOffsetY = direction.y === 0 ? CELL * 0.15 : direction.y * CELL * 0.12;
      const baseX = seg.x * CELL + CELL / 2;
      const baseY = seg.y * CELL + CELL / 2;
      ctx.fillStyle = skin.eye; ctx.beginPath(); ctx.arc(baseX - 5 + eyeOffsetX, baseY - 5 + eyeOffsetY, 2.3, 0, Math.PI * 2); ctx.arc(baseX + 5 + eyeOffsetX, baseY - 5 + eyeOffsetY, 2.3, 0, Math.PI * 2); ctx.fill();
      if (hasPower('power-shield') && !usedShield) { ctx.strokeStyle = 'rgba(125, 211, 252, 0.9)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(baseX, baseY, CELL * 0.42, 0, Math.PI * 2); ctx.stroke(); }
    }
  });
}
function drawLevelBadge() {
  ctx.fillStyle = 'rgba(7, 16, 28, 0.72)'; ctx.fillRect(8, 8, 250, 50);
  ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 18px system-ui'; ctx.fillText(`Level ${levelIndex + 1}: ${activeLevel().name}`, 18, 30);
  ctx.fillStyle = '#94a3b8'; ctx.font = '14px system-ui'; ctx.fillText(`Coins x${activeLevel().coinValue} • target ${activeLevel().target}`, 18, 48);
}
function draw() { ctx.clearRect(0, 0, SIZE, SIZE); drawBoard(); drawObstacles(); drawTunnels(); drawFood(); drawCoin(); drawSnake(); drawLevelBadge(); }

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const delta = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  if (running) {
    accumulator += delta;
    const interval = 1 / getSpeed();
    while (accumulator >= interval) {
      accumulator -= interval;
      if (!running) break;
      step();
    }
  }
  requestAnimationFrame(loop);
}

function handleKey(event) {
  if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;
  const key = event.key.toLowerCase();
  if (["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"," ","f"].includes(key)) event.preventDefault();
  if (key === 'arrowup' || key === 'w') setDirection(0, -1);
  else if (key === 'arrowdown' || key === 's') setDirection(0, 1);
  else if (key === 'arrowleft' || key === 'a') setDirection(-1, 0);
  else if (key === 'arrowright' || key === 'd') setDirection(1, 0);
  else if (key === ' ') togglePlayPause();
  else if (key === 'f') goFullscreen();
}

function handleSwipe(startX, startY, endX, endY) {
  const dx = endX - startX;
  const dy = endY - startY;
  const threshold = 22;
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
  if (Math.abs(dx) > Math.abs(dy)) setDirection(dx > 0 ? 1 : -1, 0);
  else setDirection(0, dy > 0 ? 1 : -1);
}

function updateViewportHeight() { document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`); }
async function goFullscreen() { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) try { await el.requestFullscreen({ navigationUI: 'hide' }); } catch {} }
function updateAuthButtons() {
  accountActionsSignedOut.classList.toggle('hidden', Boolean(currentUser));
  accountActionsSignedIn.classList.toggle('hidden', !currentUser);
}
function getAuthInput() {
  return { email: authEmail.value.trim(), password: authPassword.value.trim() };
}
async function syncProfileFromCloud() {
  if (!currentUser) return;
  try {
    const remote = await fetchRemoteProfile(currentUser.id);
    if (!remote) {
      await syncProfileToCloud(true);
      saveMode = 'cloud-sync';
      syncMessage = 'Created your cloud save from the current local profile.';
    } else {
      const localTime = new Date(profile.updatedAt || 0).getTime();
      const remoteTime = new Date(remote.updatedAt || 0).getTime();
      profile = remoteTime >= localTime ? remote : profile;
      profile = saveLocalProfile(profile);
      if (localTime > remoteTime) await syncProfileToCloud(true);
      saveMode = 'cloud-sync';
      syncMessage = 'Cloud progress loaded.';
    }
  } catch (error) {
    saveMode = 'local-only';
    syncMessage = `Cloud sync failed: ${error.message}`;
  }
  updateAuthButtons();
  updateUi();
  draw();
}
async function syncProfileToCloud(force = false) {
  if (!currentUser || syncInFlight) return;
  if (!force && !hasSupabaseConfig(config)) return;
  syncInFlight = true;
  try {
    const remote = await saveRemoteProfile(currentUser.id, profile);
    if (remote) profile = saveLocalProfile(remote);
    saveMode = 'cloud-sync';
    syncMessage = 'Progress synced.';
  } catch (error) {
    saveMode = 'local-only';
    syncMessage = `Cloud save failed: ${error.message}`;
  } finally {
    syncInFlight = false;
    updateUi();
  }
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = (target.tagName || '').toUpperCase();
  if (target.isContentEditable) return true;
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag)) return true;
  return !!target.closest?.('form, [role=dialog], .auth-panel, .auth-card');
}

function wireEvents() {
  canvas.addEventListener('pointerdown', (event) => { touchStart = { x: event.clientX, y: event.clientY }; }, { passive: true });
  canvas.addEventListener('pointerup', (event) => { if (touchStart) handleSwipe(touchStart.x, touchStart.y, event.clientX, event.clientY); touchStart = null; }, { passive: true });
  canvas.addEventListener('pointercancel', () => { touchStart = null; }, { passive: true });
  document.querySelectorAll('[data-dir]').forEach((button) => button.addEventListener('click', () => {
    const dir = button.dataset.dir;
    if (dir === 'up') setDirection(0, -1); else if (dir === 'down') setDirection(0, 1); else if (dir === 'left') setDirection(-1, 0); else if (dir === 'right') setDirection(1, 0);
  }));
  playPauseBtn.addEventListener('click', togglePlayPause);
  restartBtn.addEventListener('click', () => resetGame(true));
  pauseBtn.addEventListener('click', togglePlayPause);
  fullscreenBtn.addEventListener('click', goFullscreen);
  resetProgressBtn.addEventListener('click', async () => {
    const ok = window.confirm(currentUser ? 'Reset your progress everywhere? This removes coins, skins, upgrades, and best score.' : 'Reset local progress on this device? This removes coins, skins, upgrades, and best score.');
    if (!ok) return;
    profile = resetLocalProfile();
    if (currentUser) await syncProfileToCloud(true);
    resetGame(false);
    syncMessage = currentUser ? 'Progress reset locally and in the cloud.' : 'Local progress reset.';
    updateUi();
  });
  showAuthBtn.addEventListener('click', () => authPanel.classList.remove('hidden'));
  closeAuthBtn.addEventListener('click', () => authPanel.classList.add('hidden'));
  signInBtn.addEventListener('click', async () => {
    try {
      const { email, password } = getAuthInput();
      await signIn(email, password);
      authPanel.classList.add('hidden');
      syncMessage = 'Signed in.';
    } catch (error) {
      syncMessage = error.message;
      updateUi();
    }
  });
  signUpBtn.addEventListener('click', async () => {
    try {
      const { email, password } = getAuthInput();
      await signUp(email, password);
      syncMessage = 'Account created. Check email if confirmation is enabled.';
      updateUi();
    } catch (error) {
      syncMessage = error.message;
      updateUi();
    }
  });
  magicLinkBtn.addEventListener('click', async () => {
    try {
      const { email } = getAuthInput();
      await sendMagicLink(email);
      syncMessage = 'Magic link sent.';
      updateUi();
    } catch (error) {
      syncMessage = error.message;
      updateUi();
    }
  });
  signOutBtn.addEventListener('click', async () => {
    try { await signOut(); } catch (error) { syncMessage = error.message; updateUi(); }
  });
  syncNowBtn.addEventListener('click', () => syncProfileToCloud(true));
  window.addEventListener('keydown', handleKey, { passive: false });
  window.addEventListener('resize', updateViewportHeight);
  window.addEventListener('orientationchange', updateViewportHeight);
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) pauseGame(); });
}
