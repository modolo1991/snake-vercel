import { catalog, COIN_LIFE_STEPS, COIN_SPAWN_EVERY, levelDefs } from './catalog.js';
import { getAppConfig, hasSupabaseConfig } from './config.js';
import { loadLocalProfile, resetLocalProfile, saveLocalProfile, sanitizeProfile } from './storage.js';
import { fetchRemoteProfile, getSession, getSupabaseClient, onAuthStateChange, saveRemoteProfile, sendMagicLink, signIn, signOut, signUp } from './supabase.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const messageTitle = document.getElementById('messageTitle');
const messageText = document.getElementById('messageText');
const messageActions = document.getElementById('messageActions');
const messagePrimaryBtn = document.getElementById('messagePrimaryBtn');
const messageSecondaryBtn = document.getElementById('messageSecondaryBtn');
const toast = document.getElementById('toast');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const coinsEl = document.getElementById('coins');
const levelEl = document.getElementById('level');
const speedPill = document.getElementById('speedPill');
const statePill = document.getElementById('statePill');
const goalPill = document.getElementById('goalPill');
const skinPill = document.getElementById('skinPill');
const saveModePill = document.getElementById('saveModePill');
const saveChip = document.getElementById('saveChip');
const playPauseBtn = document.getElementById('playPauseBtn');
const restartBtn = document.getElementById('restartBtn');
const resetProgressBtn = document.getElementById('resetProgressBtn');
const pauseBtn = document.getElementById('pauseBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const shopToggleBtn = document.getElementById('shopToggleBtn');
const closeShopBtn = document.getElementById('closeShopBtn');
const shopPanel = document.getElementById('shopPanel');
const shopNote = document.getElementById('shopNote');
const shopItems = document.getElementById('shopItems');
const accountStatus = document.getElementById('accountStatus');
const syncStatus = document.getElementById('syncStatus');
const accountToggleBtn = document.getElementById('accountToggleBtn');
const accountPanel = document.getElementById('accountPanel');
const tabButtons = [...document.querySelectorAll('[data-tab]')];
const tabPanels = [...document.querySelectorAll('[data-panel]')];
const signInPrimaryBtn = document.getElementById('signInPrimaryBtn');
const signUpPrimaryBtn = document.getElementById('signUpPrimaryBtn');
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
const CENTER_SPAWN = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];

let profile = loadLocalProfile();
let currentUser = null;
let saveMode = hasSupabaseConfig(config) ? 'supabase-ready' : 'local-only';
let syncMessage = '';
let syncInFlight = false;
let snake = [];
let direction = { x: 0, y: 0 };
let nextDirection = { x: 0, y: 0 };
let lastHeading = { x: 1, y: 0 };
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
let overlayMode = 'ready';
let toastTimer = 0;
let activeTab = 'game';

boot();

async function boot() {
  setActiveTab('game');
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
      else syncMessage = 'Sign in if you want this progress synced across devices.';
      onAuthStateChange(async (user) => {
        currentUser = user;
        if (currentUser) await syncProfileFromCloud();
        else {
          saveMode = 'local-only';
          syncMessage = 'Signed out. Progress stays on this device until you sign back in.';
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
function isStationary() { return direction.x === 0 && direction.y === 0; }
function currentHeading() { return isStationary() ? lastHeading : direction; }

function setOverlay(title, text, visible, mode = 'ready') {
  overlayMode = mode;
  messageTitle.textContent = title;
  messageText.textContent = text;
  const showActions = mode === 'level-up';
  messageActions.classList.toggle('hidden', !showActions);
  if (showActions) {
    messagePrimaryBtn.textContent = 'Start next level';
    messageSecondaryBtn.textContent = 'Open shop';
  }
  overlay.classList.toggle('hidden', !visible);
}

function showToast(text, duration = 1800) {
  toast.textContent = text;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.add('hidden'), duration);
}

function centerSnake() {
  snake = CENTER_SPAWN.map((cell) => ({ ...cell }));
  direction = { x: 0, y: 0 };
  nextDirection = { x: 0, y: 0 };
  lastHeading = { x: 1, y: 0 };
  started = false;
  running = false;
  accumulator = 0;
}

function resetGame(autoStart = false) {
  score = 0;
  bankedRunCoins = 0;
  levelIndex = 0;
  levelFood = 0;
  gameOver = false;
  usedShield = false;
  lastTime = 0;
  tunnelCooldown = 0;
  coin = null;
  applyLevel();
  centerSnake();
  food = randomFreeCell();
  updateUi();
  draw();
  if (autoStart) startLevelFromInput({ x: 1, y: 0 });
  else setOverlay('Ready?', 'Tap an arrow to start. Swipe on the board also works if you want it.', true, 'ready');
}

function applyLevel() {
  obstacles = dedupeCells(activeLevel().obstacles.slice());
  tunnels = createTunnels(activeLevel().tunnels);
}

function resetBoardForLevel() {
  applyLevel();
  centerSnake();
  food = randomFreeCell();
  coin = null;
  draw();
}

function startGame() {
  if (gameOver) {
    resetGame(false);
    return;
  }
  if (isStationary()) {
    setOverlay('Choose a direction', 'Tap an arrow to begin this level. Swipe still works on the board.', true, overlayMode);
    return;
  }
  started = true;
  running = true;
  setOverlay('', '', false, 'none');
  updateUi();
}

function startLevelFromInput(dir) {
  direction = { ...dir };
  nextDirection = { ...dir };
  lastHeading = { ...dir };
  started = true;
  running = true;
  setOverlay('', '', false, 'none');
  updateUi();
}

function pauseGame(showOverlay = true) {
  if ((!started && !gameOver) || gameOver) return;
  running = false;
  if (showOverlay) setOverlay('Paused', 'Tap play or use the arrows to resume.', true, 'pause');
  updateUi();
}

function togglePlayPause() {
  if (gameOver) {
    resetGame(false);
    return;
  }
  if (running) pauseGame();
  else startGame();
}

function setDirection(x, y) {
  const moving = !isStationary();
  const heading = currentHeading();
  if (moving && x === -heading.x && y === -heading.y) return;
  nextDirection = { x, y };
  lastHeading = { x, y };
  if (!started) startLevelFromInput({ x, y });
  else if (!running) {
    direction = { x, y };
    running = true;
    setOverlay('', '', false, 'none');
    updateUi();
  }
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
  let result = 'updated';
  await mutateProfile((draft) => {
    if (!draft.owned.includes(id)) {
      if (draft.coins < item.cost) {
        result = 'insufficient';
        return draft;
      }
      draft.coins -= item.cost;
      draft.owned.push(id);
      result = 'purchased';
    }
    if (item.type === 'skin') {
      draft.equippedSkin = id;
      result = result === 'purchased' ? 'purchased-equipped' : 'equipped';
    } else if (draft.activePowers.includes(id)) {
      draft.activePowers = draft.activePowers.filter((entry) => entry !== id);
      result = 'deactivated';
    } else {
      draft.activePowers.push(id);
      result = result === 'purchased' ? 'purchased-activated' : 'activated';
    }
    return draft;
  });
  if (result === 'insufficient') showToast(`Not enough coins for ${item.name}.`);
  else if (result === 'equipped') showToast(`${item.name} equipped.`);
  else if (result === 'activated') showToast(`${item.name} enabled.`);
  else if (result === 'deactivated') showToast(`${item.name} disabled.`);
  else showToast(`${item.name} ready.`);
}

function renderShop() {
  shopItems.innerHTML = '';
  for (const item of catalog) {
    const owned = hasItem(item.id);
    const equipped = item.type === 'skin' ? profile.equippedSkin === item.id : profile.activePowers.includes(item.id);
    const card = document.createElement('div');
    card.className = 'item';
    const accent = item.colors ? `<span class="swatch" style="background:${item.colors.head}"></span>` : '';
    const label = !owned ? `Buy ${item.cost}🪙` : equipped ? (item.type === 'skin' ? 'Equipped' : 'Active') : (item.type === 'skin' ? 'Equip' : 'Activate');
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
    resetBoardForLevel();
    openShop(true);
    setOverlay(`Level ${levelIndex + 1}: ${activeLevel().name}`, 'Fresh board. Pick a loadout if you want, then choose a direction to start.', true, 'level-up');
  } else {
    running = false;
    started = false;
    setOverlay('Final level cleared', 'Nice. Open the shop or start another run when ready.', true, 'level-up');
    openShop(true);
  }
  updateUi();
  draw();
}

async function awardCoin(amount) {
  bankedRunCoins += amount;
  await mutateProfile((draft) => ({ ...draft, coins: draft.coins + amount, best: Math.max(draft.best, score) }));
  showToast(`+${amount} coin${amount === 1 ? '' : 's'}`);
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
  showToast('Shield used. One save only.');
  return true;
}

async function step() {
  direction = { ...nextDirection };
  lastHeading = { ...direction };
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
    if (levelFood >= activeLevel().target) {
      levelUp();
      return;
    }
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
  setOverlay('Game over', `Score ${score}, coins banked +${bankedRunCoins}. Tap play for another run.`, true, 'game-over');
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
  saveChip.textContent = currentUser ? 'Cloud sync on' : (hasSupabaseConfig(config) ? 'Local until login' : 'Local only');
  let state = 'waiting for first move';
  if (gameOver) state = 'game over';
  else if (running) state = activeLevel().name;
  else if (started) state = 'paused';
  statePill.textContent = `State: ${state}`;
  playPauseBtn.textContent = gameOver ? 'Play again' : (running ? 'Pause' : 'Play');
  pauseBtn.textContent = running ? 'Pause' : 'Play';
  shopToggleBtn.textContent = activeTab === 'shop' ? 'Game' : 'Shop';
  shopNote.textContent = running ? 'You can browse now, but it feels best between levels.' : 'Good time to change skins or enable upgrades before the next run.';

  if (currentUser) {
    accountStatus.textContent = `Signed in as ${currentUser.email}`;
    syncStatus.textContent = syncMessage || 'Progress saves here and syncs with your account.';
  } else if (hasSupabaseConfig(config)) {
    accountStatus.textContent = 'Not signed in yet';
    syncStatus.textContent = syncMessage || 'Play locally now, or sign in to keep progress across devices.';
  } else {
    accountStatus.textContent = 'Running in local-only mode';
    syncStatus.textContent = syncMessage || 'Add Supabase config later if you want accounts and cloud sync.';
  }

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
  const heading = currentHeading();
  snake.forEach((seg, index) => {
    const x = seg.x * CELL + 2;
    const y = seg.y * CELL + 2;
    const size = CELL - 4;
    drawRoundedRect(x, y, size, size, 7, index === 0 ? skin.head : skin.body);
    if (index === 0) {
      const eyeOffsetX = heading.x === 0 ? CELL * 0.15 : heading.x * CELL * 0.12;
      const eyeOffsetY = heading.y === 0 ? CELL * 0.15 : heading.y * CELL * 0.12;
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

function updateViewportHeight() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--vh', `${viewportHeight * 0.01}px`);
}
async function goFullscreen() { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) try { await el.requestFullscreen({ navigationUI: 'hide' }); } catch {} }
function setActiveTab(tab) {
  activeTab = tab;
  tabButtons.forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  tabPanels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
  accountToggleBtn.setAttribute('aria-expanded', String(tab === 'account'));
}
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

function openShop(force = false) {
  if (running && !force) pauseGame(false);
  setActiveTab('shop');
  updateUi();
}

function closeShop() {
  setActiveTab('game');
  updateUi();
}

function toggleShop() {
  if (activeTab === 'shop') closeShop();
  else openShop();
}

function toggleAccountPanel(force) {
  const open = typeof force === 'boolean' ? force : activeTab !== 'account';
  setActiveTab(open ? 'account' : 'game');
}

function wireEvents() {
  canvas.addEventListener('pointerdown', (event) => {
    touchStart = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  }, { passive: false });
  canvas.addEventListener('pointermove', (event) => {
    event.preventDefault();
  }, { passive: false });
  canvas.addEventListener('pointerup', (event) => {
    if (touchStart) handleSwipe(touchStart.x, touchStart.y, event.clientX, event.clientY);
    touchStart = null;
    event.preventDefault();
  }, { passive: false });
  canvas.addEventListener('pointercancel', () => { touchStart = null; }, { passive: true });
  canvas.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  document.querySelectorAll('[data-dir]').forEach((button) => button.addEventListener('click', () => {
    const dir = button.dataset.dir;
    if (dir === 'up') setDirection(0, -1); else if (dir === 'down') setDirection(0, 1); else if (dir === 'left') setDirection(-1, 0); else if (dir === 'right') setDirection(1, 0);
  }));
  tabButtons.forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.tab)));
  playPauseBtn.addEventListener('click', togglePlayPause);
  restartBtn.addEventListener('click', () => resetGame(false));
  pauseBtn.addEventListener('click', togglePlayPause);
  fullscreenBtn.addEventListener('click', goFullscreen);
  shopToggleBtn.addEventListener('click', toggleShop);
  closeShopBtn.addEventListener('click', closeShop);
  messagePrimaryBtn.addEventListener('click', () => {
    closeShop();
    setOverlay('Choose a direction', 'Tap an arrow to start this level. Swipe still works on the board.', true, 'ready');
  });
  messageSecondaryBtn.addEventListener('click', () => openShop(true));
  resetProgressBtn.addEventListener('click', async () => {
    const ok = window.confirm(currentUser ? 'Reset your progress everywhere? This removes coins, skins, upgrades, and best score.' : 'Reset local progress on this device? This removes coins, skins, upgrades, and best score.');
    if (!ok) return;
    profile = resetLocalProfile();
    if (currentUser) await syncProfileToCloud(true);
    resetGame(false);
    syncMessage = currentUser ? 'Progress reset locally and in the cloud.' : 'Local progress reset.';
    closeShop();
    updateUi();
  });
  accountToggleBtn.addEventListener('click', () => toggleAccountPanel());
  signInPrimaryBtn.addEventListener('click', () => { toggleAccountPanel(true); authEmail.focus(); });
  signUpPrimaryBtn.addEventListener('click', () => { toggleAccountPanel(true); authEmail.focus(); });
  signInBtn.addEventListener('click', async () => {
    try {
      const { email, password } = getAuthInput();
      await signIn(email, password);
      syncMessage = 'Signed in.';
      showToast('Signed in.');
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
      showToast('Account created.');
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
      showToast('Magic link sent.');
      updateUi();
    } catch (error) {
      syncMessage = error.message;
      updateUi();
    }
  });
  signOutBtn.addEventListener('click', async () => {
    try { await signOut(); showToast('Signed out.'); } catch (error) { syncMessage = error.message; updateUi(); }
  });
  syncNowBtn.addEventListener('click', async () => { await syncProfileToCloud(true); showToast('Sync finished.'); });
  window.addEventListener('keydown', handleKey, { passive: false });
  window.addEventListener('resize', updateViewportHeight);
  window.addEventListener('orientationchange', updateViewportHeight);
  window.visualViewport?.addEventListener('resize', updateViewportHeight);
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) pauseGame(false); });
}
