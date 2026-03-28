# Snake Deluxe + Supabase setup

## 1) Create Supabase project
- Create a new Supabase project.
- In **SQL Editor**, run `supabase/schema.sql`.
- In **Authentication > Providers**, keep Email enabled.
- If you want password signup without email confirmation during testing, disable confirmation temporarily.

## 2) Set auth redirect URL
In Supabase Auth URL settings, add:
- local dev URL, e.g. `http://localhost:8080`
- your Vercel URL, e.g. `https://your-app.vercel.app`
- your custom domain if you use one

## 3) Add public browser config
Edit `app-config.js`:

```js
window.__SNAKE_CONFIG__ = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
  siteUrl: 'https://your-app.vercel.app',
  enableMagicLink: true,
};
```

Notes:
- This uses the **anon public key**, not the service role key.
- The app is static and browser-only. No secret backend is required for this version.

## 4) Deploy to Vercel
This project is still static.
- Push the repo as normal.
- Vercel should serve `index.html` directly.
- No build command is required.

## 5) Test the flows
- Open the game.
- Create account or sign in.
- Buy a skin / earn coins.
- Refresh the page.
- Sign in on another device.
- Confirm progress loads there.
- Use **Start fresh** and confirm coins/upgrades/best score reset.

## Data model
Each user has one row in `public.user_progress` storing:
- `best_score`
- `coins`
- `owned_items`
- `equipped_skin`
- `active_powers`
- `updated_at`

## Merge behavior
- Local profile is always available.
- When logged in, the app compares local and remote `updated_at` values.
- Newer data wins.
- If the cloud row does not exist yet, the current local profile is uploaded.

## Important limitation
Because this is a static frontend, `app-config.js` contains public client config. That is okay for Supabase URL + anon key.
