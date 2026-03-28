import { defaultProfile, STORAGE_KEY } from './catalog.js';

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

export function loadLocalProfile() {
  try {
    return sanitizeProfile(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return defaultProfile();
  }
}

export function saveLocalProfile(profile) {
  const clean = sanitizeProfile({ ...profile, updatedAt: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

export function resetLocalProfile() {
  return saveLocalProfile(defaultProfile());
}
