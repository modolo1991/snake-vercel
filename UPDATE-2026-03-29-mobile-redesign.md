# Snake mobile redesign — 2026-03-29

## What changed

- Reworked the app into a phone-first single-screen layout that keeps the main game view inside the viewport.
- Added clear top-level tabs: **Game**, **Shop**, and **Account**.
- Moved account/save status to a prominent strip at the top so login/save state is obvious immediately.
- Simplified the game tab so the board and large tap controls are the focus.
- Kept swipe support on the board, but changed the UI to strongly favor tap arrows.
- Moved shop and account management out of the gameplay area so the mobile flow is less confusing.
- Kept Supabase auth/save wiring intact.

## Mobile-specific fixes

- Locked the page/app to viewport height with hidden body overflow to stop page scrolling during play.
- Added stronger touch prevention on the canvas (`pointer` + `touchmove` preventDefault, `touch-action: none`) to reduce Safari/browser movement during swipes.
- Updated viewport-height handling to use `visualViewport` when available for better iPhone Safari behavior around browser chrome.
- Kept account and shop content in separate scrollable tabs instead of forcing the main game screen to become a long page.

## Local checks

- `node --check js/main.js`
- `node --check js/catalog.js`
- `node --check js/storage.js`
- `node --check js/supabase.js`
- Served locally from `snake-vercel/`
- `curl -I http://127.0.0.1:4173/index.html` returned `200 OK`

## Files touched

- `index.html`
- `styles.css`
- `js/main.js`
