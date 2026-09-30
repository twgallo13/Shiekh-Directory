import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { rateLimit } from "express-rate-limit";

test("express-rate-limit groups IPv6 request IPs by the configured subnet", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(rateLimit({ limit: 1, windowMs: 60_000 }));
  app.get("/", (_request, response) => response.sendStatus(200));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/`;

  try {
    const first = await fetch(url, { headers: { "X-Forwarded-For": "2001:db8:abcd:12::1" } });
    const second = await fetch(url, { headers: { "X-Forwarded-For": "2001:db8:abcd:12::2" } });

    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});