# playwright-session-kit

A reusable Playwright + TypeScript setup whose whole job is **session management**:
log in once, save the browser session to disk, and reuse it across every test
run and every test file until it expires - instead of every test (or every
run) re-doing a UI login.

Clone this repo into any project, point it at your app, and go.

## What it gives you

- **One login per session lifetime, not per test.** A `globalSetup` hook logs
  in once and saves Playwright's `storageState` (cookies + localStorage) to
  `.auth/<key>.session.json`. Every test project then starts already
  authenticated via `use.storageState`.
- **Session reuse across runs.** The saved session file is reused on the next
  `npm test` as long as it's younger than `SESSION_MAX_AGE_HOURS` - no
  re-login unless it's actually stale.
- **Env-first credentials, with a manual fallback.** Set `BASE_URL`,
  `USERNAME`, `PASSWORD` in `.env` and it just works. Leave any of them out
  and, on a local run, you're prompted for them in the terminal (password
  input is masked) with an option to save what you typed back into `.env`.
  On CI (`CI` env var set), missing values fail fast instead of prompting.
- **Multiple accounts side by side.** Set `SESSION_KEY` to namespace saved
  sessions (e.g. `admin`, `viewer`) so switching users doesn't clobber
  another session file.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` (or leave `USERNAME`/`PASSWORD` blank and answer the prompt on
first run):

```
BASE_URL=https://your-app.example.com
USERNAME=someone@example.com
PASSWORD=your-password
```

Then open `pages/login.page.ts` and paste in your app's real `data-testid`
locators for the email/password inputs and submit button - that's the one
file that talks to the actual login page, including SSO/MFA/multi-step flows.

## Running tests

```bash
npm test              # headless
npm run test:headed   # see the browser
npm run test:ui       # Playwright UI mode
npm run report        # open the last HTML report
```

The first run logs in and saves a session; every run after that (within
`SESSION_MAX_AGE_HOURS`) skips the login entirely.

Sessions clear themselves automatically - there's no manual reset step:

- A saved session untouched for `SESSION_TTL_DAYS` (default `7`) is discarded
  and a fresh login is forced.
- If login fails `LOGIN_FAILURE_THRESHOLD` (default `3`) times in a row for a
  given `SESSION_KEY` (e.g. after a password change or the app rejecting the
  saved session), the stale session file is wiped so the next run starts
  clean instead of retrying against bad state forever.
- A session file that isn't valid JSON (corrupted by a truncated write, disk
  issue, etc.) is deleted on sight, before it's ever handed to Playwright.

## Using this in your own tests

Nothing special - just write tests as usual. They start already authenticated:

```ts
import { test, expect } from "@playwright/test";

test("dashboard is visible", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
```

If a single test needs a *different* account than the global session, pull in
the `authedPage`/`authedContext` fixture instead of hand-rolling a context:

```ts
import { test } from "../../fixtures/auth.fixture";

test("as a different user", async ({ authedPage }) => {
  // authedPage is already authenticated for the resolved SESSION_KEY
  await authedPage.goto("/admin");
});
```

## Project layout

```
playwright.config.ts        Playwright config; wires storageState to the saved session

pages/                      Page Object Models - one file per major route
  base.page.ts              BasePage extended by all POMs
  login.page.ts             The actual UI login steps - customize this per app

tests/                      Spec files - mirror pages/ structure
  auth/
    login.spec.ts           Example test running with an already-authenticated page

fixtures/                   Reusable test setup (auth state injection)
  auth.fixture.ts           authedContext/authedPage fixtures for a non-default session

helpers/                    Env accessors, global auth setup, session persistence
  env.ts                    Reads .env, prompts for missing values, persists what you enter
  prompt.ts                 Small terminal-prompt helpers (masked password input)
  session-manager.ts        Session file read/write/freshness/auto-clear logic (the reusable core)
  auth-setup.ts             Playwright globalSetup entry: resolves config, ensures a session

.auth/                      Saved auth state (gitignored, auto-generated - never commit real sessions)
```

## CI

Set `BASE_URL`, `USERNAME`, `PASSWORD` as CI secrets/variables and set `CI=1`
(most CI providers set this automatically). No prompts will fire; missing
values throw a clear error instead of hanging the pipeline.

## Why not just log in inside every test?

Because a real UI login is slow and flaky compared to network calls, and
almost every test needs the *result* of logging in, not the login flow
itself. Doing it once per run (or once per `SESSION_MAX_AGE_HOURS`) and
sharing the resulting session across every test file is faster and more
stable, while still testing through the real UI at least once per session.
