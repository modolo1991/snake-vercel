import { defaultProfile, STORAGE_KEY } from './catalog.js';

function profileKey(userId) {
  return userId ? `${STORAGE_KEY}:user:${userId}` : `${STORAGE_KEY}:guest`;
}

export function sanitizeProfile(raw = {}) {
  const base = defaultProfile();
  return {
    best: Math.max(0, Number(raw.best || 0)),
    coins: Math.max(0, Number(raw.coins || 0)),
    owned: Array.isArray(raw.owned) && raw.owned.length ? Array.from(new Set(raw.owned)) : base.owned,
    equippedSkin: typeof raw.equippedSkin === 'string' ? raw.equippedSkin : base.equippedSkin,
    activePowers: Array.isArray(raw.activePowers) ? Array.from(new Set(raw.activePowers)) : base.activePowers,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
  };
}

export function loadLocalProfile(userId = null) {
  try {
    if (!userId) return defaultProfile();
    return sanitizeProfile(JSON.parse(localStorage.getItem(profileKey(userId)) || '{}'));
  } catch {
    return defaultProfile();
  }
}

export function saveLocalProfile(profile, userId = null) {
  const clean = sanitizeProfile({ ...profile, updatedAt: new Date().toISOString() });
  if (userId) {
    localStorage.setItem(profileKey(userId), JSON.stringify(clean));
  }
  return clean;
}

export function resetLocalProfile(userId = null) {
  const clean = sanitizeProfile(defaultProfile());
  if (userId) {
    localStorage.setItem(profileKey(userId), JSON.stringify(clean));
  } else {
    localStorage.removeItem(profileKey());
  }
  return clean;
}
