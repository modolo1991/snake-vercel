# Snake UX pass 2 — 2026-03-29

## Done

- Reworked the account/save area into a cleaner mobile-style expandable panel.
- Made signed-out vs signed-in save states clearer.
- Kept password auth primary and moved magic link to a secondary action.
- Reduced in-play interruption by replacing minor overlays with lightweight toast messages.
- Changed level transitions so each new level resets the snake to the center and waits for the player's first direction.
- Moved the shop toward a between-level flow: it now opens automatically on level-up and can still be opened manually.
- Kept local save + Supabase sync wiring intact.

## Local verification

- `node --check js/main.js`
- `node --check js/catalog.js`
- `node --check js/storage.js`
- `node --check js/supabase.js`
- Served locally with `python3 -m http.server 4173`
- `curl -I http://127.0.0.1:4173/index.html` returned `200 OK`

## Repo state

- Working tree has uncommitted changes in `index.html`, `styles.css`, and `js/main.js`.
- Repo looks ready to commit/push after a quick browser sanity pass on a phone if desired.
