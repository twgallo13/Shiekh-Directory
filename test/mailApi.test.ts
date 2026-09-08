import assert from "node:assert/strict";
import { once } from "node:events";
import { test, mock } from "node:test";
import express from "express";
import nodemailer from "nodemailer";
import { createMailRouter, createMailSender, DIAGNOSTIC_TEMPLATE, loadMailConfiguration, smtpTransportOptions, MailAuthenticationUnavailable, type MailApiOptions, type MailMessage } from "../server/mailApi";

const configuration = {
  host: "smtp.example.test", port: 587 as const, user: "server-user", password: "test-only-password",
  from: "directory@example.test", recipients: ["approved@example.test"],
};

async function harness(overrides: Partial<MailApiOptions> = {}) {
  const sent: MailMessage[] = [];
  const events: Record<string, string>[] = [];
  const app = express();
  app.use("/api/mail", createMailRouter({
    authenticate: async (token) => {
      if (token !== "test-firebase-token") throw new Error("invalid");
      return { uid: "test-admin", role: "System Administrator" };
    },
    configuration,
    send: async (message) => { sent.push(message); return true; },
    audit: (event) => events.push(event),
    ...overrides,
  }));
  app.use(express.json());
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    sent, events, origin,
    request: (route = "dispatch", body: unknown = { recipient: "approved@example.test", templateId: DIAGNOSTIC_TEMPLATE }, token = "test-firebase-token") => fetch(`${origin}/api/mail/${route}`, {
      method: route === "status" ? "GET" : "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
      ...(route === "status" ? {} : { body: JSON.stringify(body) }),
    }),
    async close() { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); },
  };
}

test("mail remains functional for an authorized identity with server-owned transport and template", async () => {
  const app = await harness();
  try {
    const response = await app.request();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "accepted");
    assert.equal(app.sent.length, 1);
    assert.equal(app.sent[0].from, configuration.from);
    assert.equal(app.sent[0].to, configuration.recipients[0]);
    assert.equal(app.sent[0].subject, "Shiekh Directory SMTP Relay Verification");
    assert.equal(app.sent[0].disableFileAccess, true);
  } finally { await app.close(); }
});

test("both mail endpoints require authentication and never expose transport metadata", async () => {
  const app = await harness();
  try {
    for (const route of ["status", "dispatch"]) {
      assert.equal((await app.request(route, undefined, "")).status, 401);
      assert.equal((await app.request(route, undefined, "invalid")).status, 401);
    }
    const status = await app.request("status");
    assert.deepEqual(await status.json(), { configured: true });
    assert.equal(app.sent.length, 0);
  } finally { await app.close(); }
});

test("only server-validated Administrator and Steward roles can dispatch", async () => {
  for (const role of ["System Administrator", "Directory Data Steward", "Store Manager", undefined, ["System Administrator"]]) {
    const app = await harness({ authenticate: async () => ({ uid: "user", role }) });
    try {
      const permitted = role === "System Administrator" || role === "Directory Data Steward";
      assert.equal((await app.request()).status, permitted ? 200 : 403);
      assert.equal(app.sent.length, permitted ? 1 : 0);
    } finally { await app.close(); }
  }
});

test("rejects every transport, sender, TLS, content, and nested override", async () => {
  for (const field of ["host", "port", "username", "password", "smtpHost", "smtpPort", "smtpUser", "smtpPassword", "from", "fromEmail", "fromName", "sender", "replyTo", "enforceTls", "tls", "secure", "smtpConfig", "subject", "html", "text", "attachments", "role"]) {
    const app = await harness();
    try {
      const response = await app.request("dispatch", { recipient: "approved@example.test", templateId: DIAGNOSTIC_TEMPLATE, [field]: "caller-value" });
      assert.equal(response.status, 400, field);
      assert.equal(app.sent.length, 0, field);
    } finally { await app.close(); }
  }
});

test("restricts exact recipients and server-defined templates", async () => {
  for (const [recipient, templateId, status] of [
    ["outside@example.test", DIAGNOSTIC_TEMPLATE, 403],
    ["approved@example.test.evil.test", DIAGNOSTIC_TEMPLATE, 403],
    ["approved@example.test,other@example.test", DIAGNOSTIC_TEMPLATE, 400],
    ["Display <approved@example.test>", DIAGNOSTIC_TEMPLATE, 400],
    ["approved@example.test\r\nBcc:outside@example.test", DIAGNOSTIC_TEMPLATE, 400],
    ["approved@example.test", "browser-edited-template", 400],
  ] as const) {
    const app = await harness();
    try {
      assert.equal((await app.request("dispatch", { recipient, templateId })).status, status);
      assert.equal(app.sent.length, 0);
    } finally { await app.close(); }
  }
});

test("missing auth or mail configuration and auth outages fail safely", async () => {
  for (const options of [{ authenticate: null }, { authenticate: async () => { throw new MailAuthenticationUnavailable(); } }, { configuration: null, send: null }]) {
    const app = await harness(options);
    try {
      assert.equal((await app.request()).status, 503);
      assert.equal(app.sent.length, 0);
      if ("configuration" in options) assert.deepEqual(await (await app.request("status")).json(), { configured: false });
    } finally { await app.close(); }
  }
});

test("mail rate limits cannot be bypassed by repeated requests", async () => {
  const app = await harness();
  try {
    for (let attempt = 0; attempt < 3; attempt++) assert.equal((await app.request()).status, 200);
    const blocked = await app.request();
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get("retry-after"));
    assert.equal(app.sent.length, 3);
  } finally { await app.close(); }
});

test("global dispatch limit caps multiple authorized users", async () => {
  const app = await harness({ authenticate: async (token) => ({ uid: token, role: "System Administrator" }) });
  try {
    for (let attempt = 0; attempt < 10; attempt++) assert.equal((await app.request("dispatch", undefined, `user-${attempt}`)).status, 200);
    assert.equal((await app.request("dispatch", undefined, "another-user")).status, 429);
    assert.equal(app.sent.length, 10);
  } finally { await app.close(); }
});

test("invalid JSON, oversized bodies and non-JSON content are rejected before transport", async () => {
  for (const [body, contentType, expected] of [["{broken", "application/json", 400], [JSON.stringify({ content: "x".repeat(3000) }), "application/json", 413], ["hello", "text/plain", 415]] as const) {
    const app = await harness();
    try {
      const response = await fetch(`${app.origin}/api/mail/dispatch`, { method: "POST", body, headers: { Authorization: "Bearer test-firebase-token", "Content-Type": contentType } });
      assert.equal(response.status, expected);
      assert.match(response.headers.get("content-type") || "", /^application\/json/);
      assert.equal(app.sent.length, 0);
    } finally { await app.close(); }
  }
});

test("delivery failures and audit events never contain SMTP details, tokens, or recipients", async () => {
  const app = await harness({ send: async () => { throw new Error("private.smtp.test private-password"); } });
  try {
    const response = await app.request();
    assert.equal(response.status, 502);
    const output = JSON.stringify({ body: await response.json(), events: app.events });
    for (const secret of ["private.smtp.test", "private-password", "test-firebase-token", "approved@example.test", configuration.host, configuration.password]) assert.equal(output.includes(secret), false);
    assert.equal(app.events[0].outcome, "mail_delivery_failed");
  } finally { await app.close(); }
});

test("configuration requires server-owned sender, exact allowlist and secure SMTP settings", () => {
  const environment = { SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "user", SMTP_PASSWORD: "test-only", SMTP_FROM_EMAIL: "sender@example.test", SMTP_ALLOWED_RECIPIENTS: "approved@example.test" };
  assert.ok(loadMailConfiguration(environment));
  for (const field of Object.keys(environment)) assert.equal(loadMailConfiguration({ ...environment, [field]: "" }), null, field);
  assert.equal(loadMailConfiguration({ ...environment, SMTP_PORT: "25" }), null);
  assert.equal(loadMailConfiguration({ ...environment, SMTP_ALLOWED_RECIPIENTS: "*@example.test" }), null);
  for (const port of [465, 587] as const) {
    const transport = smtpTransportOptions({ ...configuration, port });
    assert.equal(transport.secure, port === 465);
    assert.equal(transport.requireTLS, true);
    assert.equal(transport.tls.rejectUnauthorized, true);
    assert.equal(transport.tls.minVersion, "TLSv1.2");
  }
});

test("SMTP sender uses server transport and reports only acceptance for the requested recipient", async () => {
  const messages: unknown[] = [];
  let accepted = [configuration.recipients[0]];
  const replacement = mock.method(nodemailer, "createTransport", (options) => {
    assert.deepEqual(options, smtpTransportOptions(configuration));
    return { async sendMail(message: unknown) { messages.push(message); return { accepted }; } };
  });
  try {
    const send = createMailSender(configuration)!;
    const message: MailMessage = {
      from: configuration.from, to: configuration.recipients[0], subject: "Diagnostic", text: "Diagnostic",
      disableFileAccess: true, disableUrlAccess: true,
    };
    assert.equal(await send(message), true);
    accepted = [];
    assert.equal(await send(message), false);
    assert.deepEqual(messages, [message, message]);
  } finally { replacement.mock.restore(); }
});

test("operational events resolve recipients and content on the server after role checks", async () => {
  const resolved: unknown[] = [];
  const app = await harness({
    authenticate: async () => ({ uid: "test-admin", role: "System Administrator" }),
    resolveEvent: async (event, entityId, identity) => {
      resolved.push([event, entityId, identity.uid]);
      return { to: "requester@example.test", subject: "Server subject", text: "Server body" };
    },
  });
  try {
    const response = await app.request("event", { event: "request-approved", entityId: "req-1" });
    assert.equal(response.status, 200);
    assert.deepEqual(resolved, [["request-approved", "req-1", "test-admin"]]);
    assert.equal(app.sent[0].to, "requester@example.test");
    assert.equal(app.sent[0].from, configuration.from);
  } finally { await app.close(); }

  const viewer = await harness({ authenticate: async () => ({ uid: "viewer", role: "Viewer" }), resolveEvent: async () => ({ to: "requester@example.test", subject: "Server", text: "Server" }) });
  try {
    assert.equal((await viewer.request("event", { event: "user-invitation", entityId: "usr-1" })).status, 403);
    assert.equal((await viewer.request("event", { event: "request-approved", entityId: "req-1" })).status, 403);
    assert.equal((await viewer.request("event", { event: "request-submitted", entityId: "req-1" })).status, 200);
  } finally { await viewer.close(); }
});

test("administrators can persist non-secret settings that immediately control delivery", async () => {
  let saved = null as import("../server/mailApi").MailSettings | null;
  const deliveredWith: unknown[] = [];
  const settings = {
    smtpHost: "smtp.changed.test", smtpPort: 465 as const, smtpUser: "changed-user", fromName: "Changed Directory",
    fromEmail: "changed@example.test", replyToEmail: "replies@example.test", stewardAlertRecipient: "steward@example.test",
    diagnosticRecipients: ["new-recipient@example.test"],
  };
  const app = await harness({
    settings: { read: async () => saved, write: async value => { saved = value; } },
    send: async (message, active) => { app.sent.push(message); deliveredWith.push(active); return true; },
  });
  try {
    const initial = await fetch(`${app.origin}/api/mail/settings`, { headers: { Authorization: "Bearer test-firebase-token" } });
    assert.equal(initial.status, 200);
    assert.equal(JSON.stringify(await initial.json()).includes(configuration.password), false);

    const savedResponse = await fetch(`${app.origin}/api/mail/settings`, {
      method: "PUT", headers: { Authorization: "Bearer test-firebase-token", "Content-Type": "application/json" }, body: JSON.stringify(settings),
    });
    assert.equal(savedResponse.status, 200);
    assert.deepEqual(saved, settings);
    assert.equal((await app.request("dispatch", { recipient: "new-recipient@example.test", templateId: DIAGNOSTIC_TEMPLATE })).status, 200);
    assert.deepEqual(deliveredWith[0], { host: settings.smtpHost, port: settings.smtpPort, user: settings.smtpUser, password: configuration.password, from: settings.fromEmail, recipients: settings.diagnosticRecipients, fromName: settings.fromName, replyTo: settings.replyToEmail, steward: settings.stewardAlertRecipient });
    assert.equal(app.sent[0].from, "Changed Directory <changed@example.test>");
    assert.equal(app.sent[0].replyTo, settings.replyToEmail);
  } finally { await app.close(); }
});

test("mail settings reject non-administrators, passwords, and invalid transport values", async () => {
  const store = { read: async () => null, write: async () => { throw new Error("must not write"); } };
  const viewer = await harness({ authenticate: async () => ({ uid: "viewer", role: "Directory Data Steward" }), settings: store });
  try {
    assert.equal((await fetch(`${viewer.origin}/api/mail/settings`, { method: "PUT", headers: { Authorization: "Bearer test-firebase-token", "Content-Type": "application/json" }, body: JSON.stringify({}) })).status, 403);
  } finally { await viewer.close(); }
  const admin = await harness({ settings: store });
  try {
    for (const body of [{ password: "browser-secret" }, { smtpHost: "smtp.test", smtpPort: 25 }]) {
      const response = await fetch(`${admin.origin}/api/mail/settings`, { method: "PUT", headers: { Authorization: "Bearer test-firebase-token", "Content-Type": "application/json" }, body: JSON.stringify(body) });
      assert.equal(response.status, 400);
    }
  } finally { await admin.close(); }
});