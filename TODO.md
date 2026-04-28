# Fix Plan for server.js bugs

## Step 1: Move isProd definition to top
- Move `const isProd = process.env.NODE_ENV === "production";` to the top before `const corsOrigin`.

## Step 2: Replace SESSION_SECRET fallback with required check
- Replace the `console.warn` block with `throw new Error("SESSION_SECRET is required in production")`.
- Replace `secret: process.env.SESSION_SECRET || "super_secret_key",` with `secret: process.env.SESSION_SECRET,`.

## Step 3: Fix createHmac fallback strings
- In `createPasswordResetToken`, replace `.createHmac("sha256", process.env.SESSION_SECRET || "super_secret_key")` with `.createHmac("sha256", process.env.SESSION_SECRET)`.
- In `verifyPasswordResetToken`, replace the same pattern.

