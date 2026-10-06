# Copilot instructions for SBRYMS Finance

## Project shape

- This repository is a static finance web app, not a React/Vite/Next.js app or a backend service.
- The key entry points are the root-level HTML pages such as `index.html`, `FACE APP.html`, `dashboard.html`, `members.html`, and `team-meet.html`.
- The app is designed as a mobile-friendly, installable PWA using `manifest.json` and `sw.js`.
- Deployment is set up for static hosting through `vercel.json` (`@vercel/static`), with a catch-all route back to `index.html`.

## Commands

- Install dependencies: `npm install`
- Run the app locally: `npm start` (this runs `npx serve .`)
- Build check: `npm run build` (currently a no-op: `echo 'No build step required'`)
- No lint script is configured in `package.json`.
- No automated test runner or test files were found in the repository, so there is no `npm test` or single-test command to use.
- For manual validation, run `npm start` and verify the page in a browser; some features depend on the site being served over HTTP rather than opened directly as a file.
- The GitHub Actions workflow in `.github/workflows/auto-commit.yml` also does not run a real build/test step; it currently only echoes a placeholder message.

## High-level architecture

- The front end is organized as many standalone HTML pages with embedded CSS and inline JavaScript, rather than a shared component library or bundler-based app.
- Each page is mostly self-contained: styling and logic live in the same file, and navigation is done with relative links between HTML pages.
- Firebase powers the app's auth and data layer on the client side. Pages such as `members.html` and `team-meet.html` load `firebase-app-compat.js`, `firebase-auth-compat.js`, and `firebase-firestore-compat.js`, then gate access with `auth.onAuthStateChanged(...)`.
- User data is read from Firebase Firestore collections such as `users` rather than from a local server or API folder.
- `sw.js` caches assets for offline/standalone behavior, and `manifest.json` defines the app install metadata.
- This is a browser-first finance dashboard and member portal, not a server-rendered or API-driven application.

## Key conventions

- Keep changes compatible with a static HTML app: prefer relative links, inline script blocks, and CSS that does not depend on a bundler.
- Do not introduce a framework or build pipeline unless the project is explicitly being migrated to one.
- Preserve the existing page-by-page pattern instead of refactoring everything into shared modules; this repo is intentionally simple and file-centric.
- When editing auth or member flows, check the existing Firebase pattern used by pages like `members.html` and confirm auth state checks still match the current behavior.
- When adding static assets or new pages, keep them aligned with the PWA metadata and service-worker cache assumptions in `manifest.json` and `sw.js`.
- The app uses browser storage and Firestore directly; do not assume a backend API exists in this repository.
- Keep navigation consistent with the current pattern of links such as `window.location.href = 'members.html'` and page-level actions.

## Working rules for this repo

- Prefer small, page-local changes over broad refactors.
- Treat `index.html` and `FACE APP.html` as core entry points, and verify navigation when modifying shared app flows.
- If a change affects a protected page, confirm the login/auth gate still behaves as expected.
- Manual browser verification is the default validation path because there is no existing automated test suite for this static app.

## Build, test, and lint commands

- Install dependencies: `npm install`
- Run locally: `npm start` — this runs `npx serve .` and prints the local URL/port; open the printed address (for example `http://localhost:3000`) and then visit a single page such as `/index.html` for a focused check.
- Build check: `npm run build` (no-op in this repo: prints "No build step required").
- Lint: no lint script is configured in package.json.
- Tests: there are no automated tests in the repository. To validate a single page manually, start the server (`npm start`) and open the page in a browser or fetch it with curl: `curl -sS http://localhost:3000/index.html | head -n 40`.

## Testing & QA notes

- Service worker caching (sw.js) can make visual changes appear stale during local QA. Use DevTools → Application → Service Workers to unregister or use an incognito window when verifying edits.
- To smoke-test an auth flow: start the server, open `/index.html`, and exercise sign-in / sign-up. Pages edited during recent work include non-blocking toasts and an inline password error element; verify those behaviors in the browser.

## Repo-specific conventions (important to read across files)

- Static, multi-page architecture: each HTML file is generally self-contained (inline CSS/JS). Changes are intentionally page-local; avoid assuming shared modules unless a page explicitly includes them.
- Firebase usage is mixed: some pages use the compat SDK (firebase-*-compat.js) while others use the newer modular patterns. Be careful when copying auth/firestore snippets between pages.
- Alert-to-toast migration: several pages were updated to use a non-blocking showToast implementation and may override `window.alert` locally. The override is not yet global across every page — consider consolidating a small shared script if consistent behavior is desired.
- UI conventions introduced during recent UI updates:
  - Category icons in `FACE APP.html` use inline SVGs inside a thin bordered `.icon-box` rather than large image cards.
  - Sign-in / Sign-up buttons use a `.btn-outline` pill style (gradient border) in the edited pages.
  - The site has a dark/translucent theme applied by injected CSS in many pages; verify contrast on a per-page basis.
- PWA considerations: `manifest.json` and `sw.js` are active; when changing static assets during development, unregister the service worker or increment the cache name.

## Integration / other docs

- README.md is minimal (project title only). No CONTRIBUTING.md was found.
- No recognized AI assistant config files were found (CLAUDE.md, .cursorrules, AGENTS.md, .windsurfrules, CONVENTIONS.md, AIDER_CONVENTIONS.md, .clinerules), so no extra guidance was imported.


*If further expansion is wanted (example: adding a short shared `scripts/common-toasts.js` to include on every page), that can be added as a small staged change.*
