// SHKDIR_KILL_SWITCH
// Ready-to-copy kill switch. Replace public/sw.js with this file.
// The build skips the build id only when the line above is the first line.
// It takes over, deletes Cache Storage, and unregisters. It never
// navigates clients and never reloads pages.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.registration.unregister();
  })());
});
