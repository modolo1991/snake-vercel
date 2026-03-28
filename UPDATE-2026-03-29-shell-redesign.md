# Snake shell redesign — 2026-03-29

## What changed

- Removed the persistent tab/page model entirely.
- Rebuilt the app as a single mobile game shell:
  - compact top HUD
  - dominant square board in the middle
  - thumb-first bottom control dock
- Moved shop/loadout into a bottom sheet instead of a peer screen.
- Moved account/auth/save controls into a separate bottom sheet instead of a large always-visible strip.
- Kept Supabase auth/save wiring intact, but demoted it to a secondary flow behind the account button.
- Preserved the better gameplay flow already added:
  - center reset between levels
  - no auto-move on level start
  - between-level shop flow
  - lighter toast-based interruptions

## UX intent

The game should now feel like a phone browser game first, not a small app shell wrapped around a game. The board owns the screen, persistent admin UI is gone, and secondary actions live in overlays.

## Files changed

- `index.html`
- `styles.css`
- `js/main.js`

## Local checks

- `node --check js/main.js`
- `node --check js/catalog.js`
- `node --check js/storage.js`
- `node --check js/supabase.js`
- `curl -I http://127.0.0.1:4173/index.html` returned `200 OK`

## Notes

- I did not change the game rules or data model beyond the shell/control flow.
- Shop and account now open as contextual sheets via HUD buttons.
- Fullscreen remains available on larger screens, but is no longer part of the mobile-first primary flow.
