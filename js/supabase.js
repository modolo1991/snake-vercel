import { getAppConfig, hasSupabaseConfig } from './config.js';
import { defaultProfile } from './catalog.js';
import { sanitizeProfile } from './storage.js';

let clientPromise = null;

export async function getSupabaseClient() {
  const config = getAppConfig();
  if (!hasSupabaseConfig(config)) return null;
  if (!clientPromise) {
    clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm')
      .then(({ createClient }) => createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }))
      .catch((error) => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}

export async function getSession() {
  const client = await getSupabaseClient();
  if (!client) return { session: null, user: null };
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return { session: data.session, user: data.session?.user || null };
}

export async function signIn(email, password) {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email, password) {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  const { siteUrl } = getAppConfig();
  const { error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: siteUrl },
  });
  if (error) throw error;
}

export async function sendMagicLink(email) {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  const { siteUrl } = getAppConfig();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: siteUrl },
  });
  if (error) throw error;
}

export async function signOut() {
  const client = await getSupabaseClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function onAuthStateChange(callback) {
  const client = await getSupabaseClient();
  if (!client) return { unsubscribe() {} };
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null, session || null);
  });
  return data.subscription;
}

export async function fetchRemoteProfile(userId) {
  const client = await getSupabaseClient();
  if (!client || !userId) return null;
  const { data, error } = await client
    .from('user_progress')
    .select('best_score, coins, owned_items, equipped_skin, active_powers, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return sanitizeProfile({
    best: data.best_score,
    coins: data.coins,
    owned: data.owned_items,
    equippedSkin: data.equipped_skin,
    activePowers: data.active_powers,
    updatedAt: data.updated_at,
  });
}

export async function saveRemoteProfile(userId, profile) {
  const client = await getSupabaseClient();
  if (!client || !userId) return null;
  const clean = sanitizeProfile({ ...defaultProfile(), ...profile, updatedAt: new Date().toISOString() });
  const payload = {
    user_id: userId,
    best_score: clean.best,
    coins: clean.coins,
    owned_items: clean.owned,
    equipped_skin: clean.equippedSkin,
    active_powers: clean.activePowers,
    updated_at: clean.updatedAt,
  };
  const { data, error } = await client
    .from('user_progress')
    .upsert(payload, { onConflict: 'user_id' })
    .select('best_score, coins, owned_items, equipped_skin, active_powers, updated_at')
    .single();

  if (error) throw error;
  return sanitizeProfile({
    best: data.best_score,
    coins: data.coins,
    owned: data.owned_items,
    equippedSkin: data.equipped_skin,
    activePowers: data.active_powers,
    updatedAt: data.updated_at,
  });
}
