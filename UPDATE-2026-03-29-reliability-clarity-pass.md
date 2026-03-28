# Snake reliability + clarity pass

## What changed
- Replaced the loose `started/running/gameOver` flow with a clearer phase model: ready, countdown, running, paused, level-up, dead.
- Added a real 3-second countdown before movement starts for fresh runs/levels, and routed both swipe start and arrow start through the same direction-input path.
- Death now visually resets the board back to the centered ready pose before showing the game-over overlay.
- Reworked board sizing so the square board is measured against the actual available stage space instead of hardcoded viewport subtraction, protecting the mobile control area.
- Shop sheet now shows current coin balance, per-item affordability, and inline feedback for insufficient funds instead of relying on toast alone.
- Removed duplicate signed-out CTA buttons and removed the visible manual "Sync now" action.
- Cloud save messaging now emphasizes automatic sync, with sync attempts on login, purchases, level transitions, death/reset, and other meaningful save moments.
- Tightened player-facing copy toward simpler, more trustworthy wording.

## Quick verification
- `node --check js/main.js`
- Served locally with `python3 -m http.server 4173` and confirmed the app responds over HTTP.

## Notes
- I could smoke-test syntax and local serving here, but not do a full interactive phone-browser touch pass from this tool context. The layout fix is implemented via runtime measurement rather than brittle CSS height guesses, which should directly address the up-arrow coverage regression.
