// Install-only service worker. It does not listen for fetch and does not
// touch Cache Storage. The Vite build replaces the quoted placeholder below
// in dist/sw.js and fails if that placeholder is still there.
// Kill switch: docs/PWA-KILL-SWITCH.md.
const BUILD_ID = "__BUILD_ID__";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "GET_BUILD_ID") return;
  const reply = { type: "BUILD_ID", buildId: BUILD_ID };
  const port = event.ports && event.ports[0];
  if (port && typeof port.postMessage === "function") {
    port.postMessage(reply);
    return;
  }
  if (event.source && typeof event.source.postMessage === "function") {
    event.source.postMessage(reply);
  }
});
