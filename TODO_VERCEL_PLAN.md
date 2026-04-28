# Vercel Production Readiness Plan

## Step 1 – Delete `password/index.js` (CRITICAL)
- Action: Delete the file entirely.
- Why: It runs its own `app.listen()` and its routes (`/forgot`, `/reset`) are already fully handled by the main `server.js`. Having a second Express server causes Vercel serverless confusion and conflicts.

## Step 2 – Update `vercel.json` (CRITICAL)
- Action: Replace deprecated `builds` array with modern `rewrites`.
- Why: `builds` is deprecated in Vercel v2. New `rewrites` syntax is the standard.

## Step 3 – Clean `package.json` (CRITICAL)
- Action:
  1. Remove `crypto` and `path` from `dependencies` (they are built-in Node modules).
  2. Move `nodemon` from `dependencies` to `devDependencies`.
  3. Add `"engines": { "node": "18.x" }` for reproducible builds.
- Why: Prevents Vercel build errors and reduces production bundle size.

## Step 4 – Harden `supabase.js` (HIGH PRIORITY)
- Action:
  - Keep `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars.
  - Remove the hardcoded fallback `anonKey` and fallback Supabase URL from source.
  - Add a `console.warn` if credentials are missing, but do NOT default to public/test keys in production.
- Why: Hardcoded credentials are a major security risk.

## Step 5 – Lock down CORS in production (HIGH PRIORITY)
- Action: In `server.js`, change `origin: true` to check `process.env.APP_URL` or fallback to `true` only in dev.
- Why: `origin: true` allows any website to make authenticated requests to your API.

## Step 6 – Fix `public/index.js` forgot-password navigation (MEDIUM)
- Action: Change `window.location.href = "../password/forgot.html"` to `"/password/forgot.html"` to avoid routing issues on Vercel.

## Step 7 – Install / Test (Followup)
- Ensure `npm install` / `vercel --prod` works, verify OAuth flow end-to-end after deployment.

