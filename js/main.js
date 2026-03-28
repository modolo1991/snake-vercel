import { catalog, COIN_LIFE_STEPS, COIN_SPAWN_EVERY, defaultProfile, levelDefs } from './catalog.js';
import { getAppConfig, hasSupabaseConfig } from './config.js';
import { resetLocalProfile, saveLocalProfile, sanitizeProfile } from './storage.js';
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

const playPauseBtn = document.getElementById('playPauseBtn');
const restartBtn = document.getElementById('restartBtn');
const resetProgressBtn = document.getElementById('resetProgressBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const shopToggleBtn = document.getElementById('shopToggleBtn');
const accountToggleBtn = document.getElementById('accountToggleBtn');

const sheetBackdrop = document.getElementById('sheetBackdrop');
const shopSheet = document.getElementById('shopSheet');
const accountSheet = document.getElementById('accountSheet');
const closeShopBtn = document.getElementById('closeShopBtn');
const closeAccountBtn = document.getElementById('closeAccountBtn');
const shopNote = document.getElementById('shopNote');
const shopItems = document.getElementById('shopItems');
const shopBalance = document.getElementById('shopBalance');
const shopFeedback = document.getElementById('shopFeedback');
const accountStatus = document.getElementById('accountStatus');
const syncStatus = document.getElementById('syncStatus');

const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const signInBtn = document.getElementById('signInBtn');
const signUpBtn = document.getElementById('signUpBtn');
const magicLinkBtn = document.getElementById('magicLinkBtn');
const signOutBtn = document.getElementById('signOutBtn');
const accountActionsSignedOut = document.getElementById('accountActionsSignedOut');
const accountActionsSignedIn = document.getElementById('accountActionsSignedIn');

const boardFrame = document.querySelector('.board-frame');
const boardTopline = document.querySelector('.board-topline');
const boardShell = document.querySelector('.board-shell');

const GRID = 20;
const SIZE = canvas.width;
const CELL = SIZE / GRID;
const config = getAppConfig();
const CENTER_SPAWN = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
const PHASE = {
  READY: 'ready',
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  PAUSED: 'paused',
  LEVEL_UP: 'level-up',
  DEAD: 'dead',
};

let profile = saveLocalProfile(defaultProfile());
let currentUser = null;
let saveMode = hasSupabaseConfig(config) ? 'supabase-ready' : 'local-only';
let syncMessage = '';
let syncInFlight = false;

let snake = [];
let direction = { x: 0, y: 0 };
let nextDirection = { x: 0, y: 0 };
let pendingStartDirection = null;
let lastHeading = { x: 1, y: 0 };
let food = null;
let coin = null;
let obstacles = [];
let tunnels = [];
let score = 0;
let bankedRunCoins = 0;
let levelIndex = 0;
let levelFood = 0;
let usedShield = false;
let lastTime = 0;
let accumulator = 0;
let touchStart = null;
let tunnelCooldown = 0;
let overlayMode = PHASE.READY;
let toastTimer = 0;
let activeSheet = null;
let phase = PHASE.READY;
let countdownRemaining = 0;
let countdownUntil = 0;
let shopFeedbackTimer = 0;

boot();

async function boot() {
  renderShop();
  resetGameState(false, { reason: 'initial load', skipSync: true });
  wireEvents();
  updateViewportHeight();
  updateBoardSize();
  requestAnimationFrame(loop);
  updateAuthButtons();
  updateUi();

  if (hasSupabaseConfig(config)) {
    try {
      await getSupabaseClient();
      const { user } = await getSession();
      currentUser = user;
      if (currentUser) await syncProfileFromCloud();
      else syncMessage = 'Play here now, or sign in to keep your save across devices.';
      onAuthStateChange(async (user) => {
        currentUser = user;
        if (currentUser) {
          clearAuthInputs();
          await syncProfileFromCloud();
          closeSheets();
          setOverlay('', '', false, 'none');
          showToast('Signed in. Save loaded.');
        } else {
          saveMode = 'local-only';
          syncMessage = 'Signed out. This device keeps the current session locally.';
          clearAuthInputs();
          updateAuthButtons();
          updateUi();
        }
      });
    } catch (error) {
      saveMode = 'local-only';
      syncMessage = `Cloud save unavailable: ${error.message}`;
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
function isSheetOpen(id) { return activeSheet === id; }
function isRoundReadyToStart() { return phase === PHASE.READY || phase === PHASE.DEAD || phase === PHASE.LEVEL_UP; }

function setPhase(nextPhase) {
  phase = nextPhase;
  overlayMode = nextPhase;
}

function setOverlay(title, text, visible, mode = PHASE.READY) {
  overlayMode = mode;
  messageTitle.textContent = title;
  messageText.textContent = text;
  const showActions = mode === PHASE.LEVEL_UP;
  messageActions.classList.toggle('hidden', !showActions);
  if (showActions) {
    messagePrimaryBtn.textContent = 'Next level';
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

function showShopFeedback(text, tone = 'neutral', duration = 2200) {
  shopFeedback.textContent = text;
  shopFeedback.dataset.tone = tone;
  shopFeedback.classList.remove('hidden');
  clearTimeout(shopFeedbackTimer);
  shopFeedbackTimer = window.setTimeout(() => shopFeedback.classList.add('hidden'), duration);
}

function openSheet(id) {
  activeSheet = id;
  const showShop = id === 'shop';
  const showAccount = id === 'account';
  shopSheet.classList.toggle('hidden', !showShop);
  accountSheet.classList.toggle('hidden', !showAccount);
  sheetBackdrop.classList.toggle('hidden', !id);
  shopSheet.setAttribute('aria-hidden', String(!showShop));
  accountSheet.setAttribute('aria-hidden', String(!showAccount));
  accountToggleBtn.setAttribute('aria-expanded', String(showAccount));
  shopToggleBtn.setAttribute('aria-pressed', String(showShop));
}

function closeSheets() {
  activeSheet = null;
  openSheet(null);
}

function centerSnake() {
  snake = CENTER_SPAWN.map((cell) => ({ ...cell }));
  direction = { x: 0, y: 0 };
  nextDirection = { x: 0, y: 0 };
  pendingStartDirection = null;
  lastHeading = { x: 1, y: 0 };
  accumulator = 0;
  countdownRemaining = 0;
  countdownUntil = 0;
}

function clearAuthInputs() {
  authEmail.value = '';
  authPassword.value = '';
}

function getValidStartDirections() {
  const head = CENTER_SPAWN[0];
  const bodyKeys = new Set(CENTER_SPAWN.slice(1).map(keyOf));
  const options = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
  ].filter((dir) => {
    const next = { x: head.x + dir.x, y: head.y + dir.y };
    if (next.x < 0 || next.y < 0 || next.x >= GRID || next.y >= GRID) return false;
    if (bodyKeys.has(keyOf(next))) return false;
    if (obstacles.some((cell) => sameCell(cell, next))) return false;
    return true;
  });
  return options.length ? options : [{ x: 1, y: 0 }];
}

function randomStartDirection() {
  const options = getValidStartDirections();
  return options[Math.floor(Math.random() * options.length)];
}

function resetGameState(autoStart = false, options = {}) {
  score = 0;
  bankedRunCoins = 0;
  levelIndex = 0;
  levelFood = 0;
  usedShield = false;
  lastTime = 0;
  tunnelCooldown = 0;
  coin = null;
  applyLevel();
  centerSnake();
  food = randomFreeCell();
  setPhase(PHASE.READY);
  if (autoStart) beginCountdown(randomStartDirection());
  else setOverlay('Ready', 'Press Start for a short countdown. Then swipe on the board to steer while the snake launches in a random valid direction.', true, PHASE.READY);
  updateUi();
  draw();
  if (!options.skipSync) syncProfileToCloud(false, options.reason || 'reset');
}

function applyLevel() {
  obstacles = dedupeCells(activeLevel().obstacles.slice());
  tunnels = createTunnels(activeLevel().tunnels);
}

function resetBoardForLevel(phaseAfterReset = PHASE.READY) {
  applyLevel();
  centerSnake();
  food = randomFreeCell();
  coin = null;
  setPhase(phaseAfterReset);
  draw();
}

function beginCountdown(dir) {
  pendingStartDirection = { ...dir };
  direction = { ...dir };
  nextDirection = { ...dir };
  lastHeading = { ...dir };
  accumulator = 0;
  countdownRemaining = 3;
  countdownUntil = performance.now() + countdownRemaining * 1000;
  setPhase(PHASE.COUNTDOWN);
  setOverlay('Starting in 3', 'Get ready. Movement begins after the countdown, then you steer by swiping on the board.', true, PHASE.COUNTDOWN);
  updateUi();
  draw();
}

function commitCountdownStart() {
  if (!pendingStartDirection) return;
  direction = { ...pendingStartDirection };
  nextDirection = { ...pendingStartDirection };
  lastHeading = { ...pendingStartDirection };
  pendingStartDirection = null;
  accumulator = 0;
  setPhase(PHASE.RUNNING);
  setOverlay('', '', false, 'none');
  updateUi();
}

function startOrResumeGame() {
  if (phase === PHASE.DEAD) {
    resetGameState(true, { reason: 'new run' });
    return;
  }
  if (phase === PHASE.READY || phase === PHASE.LEVEL_UP) {
    beginCountdown(randomStartDirection());
    return;
  }
  if (phase === PHASE.PAUSED) {
    setPhase(PHASE.RUNNING);
    setOverlay('', '', false, 'none');
    updateUi();
  }
}

function pauseGame(showOverlay = true) {
  if (phase !== PHASE.RUNNING && phase !== PHASE.COUNTDOWN) return;
  setPhase(PHASE.PAUSED);
  countdownRemaining = 0;
  countdownUntil = 0;
  pendingStartDirection = null;
  if (showOverlay) setOverlay('Paused', 'Tap play to resume, then keep steering with swipes on the board.', true, PHASE.PAUSED);
  updateUi();
}

function togglePlayPause() {
  if (phase === PHASE.RUNNING || phase === PHASE.COUNTDOWN) pauseGame();
  else startOrResumeGame();
}

function applyDirectionInput(x, y) {
  const requested = { x, y };
  if (phase === PHASE.COUNTDOWN) return;
  if (isRoundReadyToStart()) {
    beginCountdown(randomStartDirection());
    return;
  }
  const heading = currentHeading();
  if (phase === PHASE.RUNNING && x === -heading.x && y === -heading.y) return;
  nextDirection = requested;
  lastHeading = requested;
  if (phase === PHASE.PAUSED) {
    direction = requested;
    setPhase(PHASE.RUNNING);
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
  if (!options.skipRemote) await syncProfileToCloud(false, options.reason || 'save');
}

async function buyOrEquip(id) {
  const item = catalog.find((entry) => entry.id === id);
  if (!item) return;
  let result = 'updated';
  let shortfall = 0;
  await mutateProfile((draft) => {
    if (!draft.owned.includes(id)) {
      if (draft.coins < item.cost) {
        result = 'insufficient';
        shortfall = item.cost - draft.coins;
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
  }, { reason: `shop: ${item.name}` });

  if (result === 'insufficient') {
    showToast(`Need ${shortfall} more coin${shortfall === 1 ? '' : 's'} for ${item.name}.`);
    showShopFeedback(`${item.name} costs ${item.cost} coins. You have ${profile.coins}.`, 'error');
  } else if (result === 'equipped') {
    showToast(`${item.name} equipped.`);
    showShopFeedback(`${item.name} is now equipped.`, 'success');
  } else if (result === 'activated') {
    showToast(`${item.name} enabled.`);
    showShopFeedback(`${item.name} is active for this run.`, 'success');
  } else if (result === 'deactivated') {
    showToast(`${item.name} disabled.`);
    showShopFeedback(`${item.name} is turned off.`, 'neutral');
  } else {
    showToast(`${item.name} ready.`);
    showShopFeedback(`${item.name} unlocked and ready to use.`, 'success');
  }
}

function renderShop() {
  shopItems.innerHTML = '';
  shopBalance.textContent = `${profile.coins} coin${profile.coins === 1 ? '' : 's'} available`;
  for (const item of catalog) {
    const owned = hasItem(item.id);
    const equipped = item.type === 'skin' ? profile.equippedSkin === item.id : profile.activePowers.includes(item.id);
    const affordable = owned || profile.coins >= item.cost;
    const card = document.createElement('div');
    card.className = `item ${affordable ? '' : 'item-locked'}`.trim();
    const accent = item.colors ? `<span class="swatch" style="background:${item.colors.head}"></span>` : '';
    const price = owned ? '' : `<div class="item-price ${affordable ? 'can-afford' : 'cant-afford'}">${item.cost} coins</div>`;
    const label = !owned ? `Buy` : equipped ? (item.type === 'skin' ? 'Equipped' : 'Active') : (item.type === 'skin' ? 'Equip' : 'Activate');
    card.innerHTML = `
      <div class="item-head">
        <div>
          <div class="item-name">${item.name}</div>
          <div class="item-desc">${item.desc}</div>
          ${price}
        </div>
        ${accent}
      </div>
      <button class="mini ${owned && equipped ? 'secondary' : owned ? 'ghost' : affordable ? '' : 'secondary'}" ${owned && equipped && item.type === 'skin' ? 'disabled' : ''}>${label}</button>
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
    resetBoardForLevel(PHASE.LEVEL_UP);
    openShop(true);
    setOverlay(`Level ${levelIndex + 1}: ${activeLevel().name}`, 'Board reset. Shop if you want, then press Start and steer with swipes when ready.', true, PHASE.LEVEL_UP);
    syncProfileToCloud(false, `level ${levelIndex + 1}`);
  } else {
    resetBoardForLevel(PHASE.LEVEL_UP);
    setOverlay('Run cleared', 'You finished every level. Open the shop or press Start for another swipe-steered run.', true, PHASE.LEVEL_UP);
    openShop(true);
    syncProfileToCloud(false, 'run cleared');
  }
  updateUi();
  draw();
}

async function awardCoin(amount) {
  bankedRunCoins += amount;
  await mutateProfile((draft) => ({ ...draft, coins: draft.coins + amount, best: Math.max(draft.best, score) }), { reason: `coins +${amount}` });
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
  showToast('Shield used.');
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
    if (score > profile.best) mutateProfile((draft) => ({ ...draft, best: score }), { reason: 'new best' });
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
  const summary = `Score ${score}. Coins banked this run: +${bankedRunCoins}. Press Start when you want another run.`;
  resetBoardForLevel(PHASE.DEAD);
  setOverlay('Game over', summary, true, PHASE.DEAD);
  syncProfileToCloud(false, 'death');
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
  saveModePill.textContent = `Save: ${currentUser ? 'auto cloud sync' : saveMode.replace('-', ' ')}`;

  let state = 'ready';
  if (phase === PHASE.COUNTDOWN) state = `starting in ${countdownRemaining}`;
  else if (phase === PHASE.RUNNING) state = activeLevel().name;
  else if (phase === PHASE.PAUSED) state = 'paused';
  else if (phase === PHASE.LEVEL_UP) state = 'level cleared';
  else if (phase === PHASE.DEAD) state = 'game over';
  statePill.textContent = `State: ${state}`;

  playPauseBtn.textContent = phase === PHASE.DEAD ? 'Start again' : (phase === PHASE.RUNNING || phase === PHASE.COUNTDOWN ? 'Pause' : phase === PHASE.PAUSED ? 'Resume' : 'Start');
  shopNote.textContent = phase === PHASE.RUNNING ? 'You can look now, but changing things between rounds is easier.' : 'Coins, prices, and what you can afford are shown here clearly.';

  if (currentUser) {
    accountStatus.textContent = `Signed in as ${currentUser.email}`;
    syncStatus.textContent = syncMessage || 'Progress saves automatically and syncs with this account.';
  } else if (hasSupabaseConfig(config)) {
    accountStatus.textContent = 'Not signed in';
    syncStatus.textContent = syncMessage || 'Play locally now, or sign in to sync this save across devices.';
  } else {
    accountStatus.textContent = 'Local save only';
    syncStatus.textContent = syncMessage || 'Add Supabase config later if you want login and cloud sync.';
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

function updateCountdown(now) {
  if (phase !== PHASE.COUNTDOWN) return;
  const msLeft = Math.max(0, countdownUntil - now);
  const nextCount = Math.max(0, Math.ceil(msLeft / 1000));
  if (nextCount !== countdownRemaining) {
    countdownRemaining = nextCount;
    if (countdownRemaining > 0) setOverlay(`Starting in ${countdownRemaining}`, 'Get ready. Movement begins after the countdown.', true, PHASE.COUNTDOWN);
    updateUi();
  }
  if (msLeft <= 0) commitCountdownStart();
}

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const delta = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  updateCountdown(timestamp);
  if (phase === PHASE.RUNNING) {
    accumulator += delta;
    const interval = 1 / getSpeed();
    while (accumulator >= interval) {
      accumulator -= interval;
      if (phase !== PHASE.RUNNING) break;
      step();
    }
  }
  requestAnimationFrame(loop);
}

function handleKey(event) {
  if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;
  const key = event.key.toLowerCase();
  if (["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"," ","f","escape"].includes(key)) event.preventDefault();
  if (key === 'arrowup' || key === 'w') applyDirectionInput(0, -1);
  else if (key === 'arrowdown' || key === 's') applyDirectionInput(0, 1);
  else if (key === 'arrowleft' || key === 'a') applyDirectionInput(-1, 0);
  else if (key === 'arrowright' || key === 'd') applyDirectionInput(1, 0);
  else if (key === ' ') togglePlayPause();
  else if (key === 'f') goFullscreen();
  else if (key === 'escape' && activeSheet) closeSheets();
}

function handleSwipe(startX, startY, endX, endY) {
  const dx = endX - startX;
  const dy = endY - startY;
  const threshold = 16;
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
  if (Math.abs(dx) > Math.abs(dy)) applyDirectionInput(dx > 0 ? 1 : -1, 0);
  else applyDirectionInput(0, dy > 0 ? 1 : -1);
}

function updateViewportHeight() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--vh', `${viewportHeight * 0.01}px`);
}

function updateBoardSize() {
  const frameRect = boardFrame.getBoundingClientRect();
  const toplineRect = boardTopline.getBoundingClientRect();
  const frameStyle = getComputedStyle(boardFrame);
  const gap = parseFloat(frameStyle.rowGap || frameStyle.gap || '0') || 0;
  const availableWidth = Math.max(0, frameRect.width);
  const availableHeight = Math.max(0, frameRect.height - toplineRect.height - gap);
  const size = Math.max(0, Math.floor(Math.min(availableWidth, availableHeight)));
  boardShell.style.width = `${size}px`;
  boardShell.style.height = `${size}px`;
}

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
      await syncProfileToCloud(true, 'first cloud save');
      saveMode = 'cloud-sync';
      syncMessage = 'Cloud save created from this device.';
    } else {
      const localTime = new Date(profile.updatedAt || 0).getTime();
      const remoteTime = new Date(remote.updatedAt || 0).getTime();
      profile = remoteTime >= localTime ? remote : profile;
      profile = saveLocalProfile(profile);
      if (localTime > remoteTime) await syncProfileToCloud(true, 'login merge');
      saveMode = 'cloud-sync';
      syncMessage = 'Cloud save loaded.';
    }
  } catch (error) {
    saveMode = 'local-only';
    syncMessage = `Cloud sync failed: ${error.message}`;
  }
  updateAuthButtons();
  updateUi();
  draw();
}
async function syncProfileToCloud(force = false, reason = 'save') {
  if (!currentUser || syncInFlight) return;
  if (!force && !hasSupabaseConfig(config)) return;
  syncInFlight = true;
  try {
    const remote = await saveRemoteProfile(currentUser.id, profile);
    if (remote) profile = saveLocalProfile(remote);
    saveMode = 'cloud-sync';
    syncMessage = `Saved automatically after ${reason}.`;
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
  if (phase === PHASE.RUNNING && !force) pauseGame(false);
  openSheet('shop');
  updateUi();
}

function closeShop() {
  if (isSheetOpen('shop')) closeSheets();
  updateUi();
}

function toggleShop() {
  if (isSheetOpen('shop')) closeShop();
  else openShop();
}

function toggleAccountPanel(force) {
  if (typeof force === 'boolean') {
    if (force) openSheet('account');
    else if (isSheetOpen('account')) closeSheets();
  } else if (isSheetOpen('account')) closeSheets();
  else openSheet('account');
  updateUi();
}

function wireEvents() {
  canvas.addEventListener('pointerdown', (event) => {
    touchStart = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  }, { passive: false });
  canvas.addEventListener('pointermove', (event) => {
    if (touchStart) {
      const dx = event.clientX - touchStart.x;
      const dy = event.clientY - touchStart.y;
      if (Math.abs(dx) >= 16 || Math.abs(dy) >= 16) {
        handleSwipe(touchStart.x, touchStart.y, event.clientX, event.clientY);
        touchStart = { x: event.clientX, y: event.clientY };
      }
    }
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

  playPauseBtn.addEventListener('click', togglePlayPause);
  restartBtn.addEventListener('click', () => {
    const needsConfirm = phase !== PHASE.READY || score > 0 || levelIndex > 0;
    if (needsConfirm) {
      const ok = window.confirm('Reset this run and return to the starting board?');
      if (!ok) return;
    }
    resetGameState(false, { reason: 'restart' });
  });
  fullscreenBtn?.addEventListener('click', goFullscreen);

  shopToggleBtn.addEventListener('click', toggleShop);
  accountToggleBtn.addEventListener('click', () => toggleAccountPanel());
  closeShopBtn.addEventListener('click', closeShop);
  closeAccountBtn.addEventListener('click', () => toggleAccountPanel(false));
  sheetBackdrop.addEventListener('click', closeSheets);

  messagePrimaryBtn.addEventListener('click', () => {
    closeShop();
    beginCountdown(randomStartDirection());
  });
  messageSecondaryBtn.addEventListener('click', () => openShop(true));

  resetProgressBtn.addEventListener('click', async () => {
    const ok = window.confirm(currentUser ? 'Reset your progress everywhere? This removes coins, skins, upgrades, and best score.' : 'Reset progress on this device? This removes coins, skins, upgrades, and best score.');
    if (!ok) return;
    profile = resetLocalProfile();
    if (currentUser) await syncProfileToCloud(true, 'progress reset');
    resetGameState(false, { reason: 'progress reset', skipSync: true });
    syncMessage = currentUser ? 'Progress reset here and in the cloud.' : 'Progress reset on this device.';
    closeSheets();
    updateUi();
  });

  signInBtn.addEventListener('click', async () => {
    try {
      const { email, password } = getAuthInput();
      await signIn(email, password);
      syncMessage = 'Signing you in...';
      updateUi();
    } catch (error) {
      syncMessage = error.message;
      updateUi();
    }
  });
  signUpBtn.addEventListener('click', async () => {
    try {
      const { email, password } = getAuthInput();
      await signUp(email, password);
      syncMessage = 'Account created. Check your email if confirmation is on.';
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
    try {
      await signOut();
      showToast('Signed out.');
    } catch (error) {
      syncMessage = error.message;
      updateUi();
    }
  });

  window.addEventListener('keydown', handleKey, { passive: false });
  window.addEventListener('resize', () => { updateViewportHeight(); updateBoardSize(); });
  window.addEventListener('orientationchange', () => { updateViewportHeight(); updateBoardSize(); });
  window.visualViewport?.addEventListener('resize', () => { updateViewportHeight(); updateBoardSize(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && (phase === PHASE.RUNNING || phase === PHASE.COUNTDOWN)) pauseGame(false); });
  new ResizeObserver(() => updateBoardSize()).observe(document.body);
}
