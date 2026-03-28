# Snake Deluxe

Static mobile-friendly Snake game for Vercel deployment, now structured as a small app and ready for Supabase auth + per-user cloud saves.

## Files
- `index.html` — app shell
- `styles.css` — styling
- `js/main.js` — game + auth UI orchestration
- `js/storage.js` — local profile persistence
- `js/supabase.js` — browser Supabase client + auth/save helpers
- `js/catalog.js` — game catalog, defaults, levels
- `app-config.js` — public client config placeholders
- `supabase/schema.sql` — database schema + RLS policies
- `docs/SETUP.md` — Joseph's setup/deploy checklist

## Local run
Serve the folder with any static server.

## Default mode
If `app-config.js` is empty, the game still works in local-only mode using browser storage.

## Cloud mode
Once Supabase URL + anon key are added, users can:
- sign up
- sign in
- use magic link login
- sync coins / skins / upgrades / best score across devices
- reset progress and wipe their saved progress
