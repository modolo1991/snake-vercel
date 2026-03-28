export function getAppConfig() {
  const raw = window.__SNAKE_CONFIG__ || {};
  return {
    supabaseUrl: String(raw.supabaseUrl || '').trim(),
    supabaseAnonKey: String(raw.supabaseAnonKey || '').trim(),
    siteUrl: String(raw.siteUrl || window.location.origin).trim(),
    enableMagicLink: raw.enableMagicLink !== false,
  };
}

export function hasSupabaseConfig(config = getAppConfig()) {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}
