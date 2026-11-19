# PWA kill switch

Use this only if the service worker misbehaves after a Hosting deploy. It is not the worker that ships in a normal release. `docs/sw-killswitch.js` is the ready-to-copy file. It is not in `public/`, so a normal build does not publish it.

The kill worker:

- On install, calls `skipWaiting()`.
- On activate, deletes every Cache Storage entry, then calls `self.registration.unregister()`.
- Has no `fetch` handler.
- Does not call `clients.navigate`, does not post a reload message, and does not reload any page.

## Same deploy, both changes

1. Replace `public/sw.js` with `docs/sw-killswitch.js` (copy the file over `public/sw.js` before the build). The first line of that file must be exactly `// SHKDIR_KILL_SWITCH`. Only that exact first line skips the build id. A later mention of `SHKDIR_KILL_SWITCH` does not. `npm run build`, which is also the Firebase predeploy build, publishes that worker as `dist/sw.js` and does not require a build id. The build still stops if `__BUILD_ID__` is left in the kill-switch file. A normal `public/sw.js` still has to contain that placeholder exactly once.
2. In that **same** Hosting deploy, remove the `registerServiceWorker` function from `src/main.tsx`, not only the call at the bottom of the file. Also remove `<PwaUpdateBanner />` and the `PwaUpdateBanner` import from `AppLayout`. `tsc` uses `noUnusedLocals`, so an unused function or an unused import fails the build. Do not ship the kill worker while `main.tsx` still registers `/sw.js`. The next navigation would install the kill worker again. Open tabs stop calling `registration.update()` once the banner is gone.

Removing the register call in a follow-up deploy is not enough. The register call comes out in the same deploy as the kill worker.

Keep the existing `Cache-Control: no-cache, no-store, must-revalidate` header on `/sw.js`. Open tabs pick up the new worker on the next navigation or `registration.update()` (`updateViaCache: 'none'` plus no-store). Because the worker never reloads clients, unsaved form work stays on screen. The next full page load has no controller.

Do not deploy this until the usual Hosting approval. This file is the recipe, not a deploy.
