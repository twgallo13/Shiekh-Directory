import assert from "node:assert/strict";
import { test } from "node:test";
import type { Firestore } from "@google-cloud/firestore";
import type { Auth, UserRecord } from "firebase-admin/auth";
import { recordMailOutcome, resolveEvent, resolveSmtpInvitationEmail, resolveTemplate } from "../server/firestoreMail";
import type { MailConfiguration } from "../server/mailApi";
import { INITIAL_EMAIL_TEMPLATES } from "../src/data/initialData";

const configuration = { host: "smtp.test", port: 587, user: "user", password: "password", from: "sender@example.test", recipients: ["sender@example.test"] } as MailConfiguration;

test("Firestore mail templates replace escaped variables and produce text alternatives", async () => {
  const firestore = {
    collection(name: string) {
      assert.equal(name, "email_templates");
      return {
        doc(id: string) {
          assert.equal(id, "tmpl-test");
          return { get: async () => ({ exists: true, data: () => ({
            subject: "Welcome {{recipient_name}}\r\nBcc: ignored",
            bodyHtml: '<h1>Hello {{recipient_name}}</h1><a href="https://directory.shiekhshoes.com/sign-in">Sign in</a>',
          }) }) };
        },
      };
    },
  } as unknown as Firestore;
  const rendered = await resolveTemplate(firestore, "tmpl-test", { recipient_name: "<Theo & Team>" });
  assert.equal(rendered.subject, "Welcome <Theo & Team> Bcc: ignored");
  assert.match(rendered.html, /&lt;Theo &amp; Team&gt;/);
  assert.match(rendered.html, /https:\/\/shiekh-dir\.ai\.studio\/sign-in/);
  assert.equal(rendered.text.includes("<h1>"), false);
  assert.match(rendered.text, /Hello <Theo & Team>/);
});

test("SMTP invitation provisions Firebase identity and persists evidence without storing the secure link", async () => {
  const userWrites: Record<string, unknown>[] = [];
  const outboxWrites: Record<string, unknown>[] = [];
  const firestore = {
    collection(name: string) {
      return { doc: () => name === "users" ? {
        get: async () => ({ exists: true, data: () => ({ email: "Authorized.User@Example.test", displayName: "Authorized User", role: "Editor", status: "Active" }) }),
        set: async (value: Record<string, unknown>) => { userWrites.push(value); },
      } : {
        set: async (value: Record<string, unknown>) => { outboxWrites.push(value); },
      } };
    },
  } as unknown as Firestore;
  const created: Record<string, unknown>[] = [];
  const auth = {
    getUserByEmail: async () => { throw Object.assign(new Error("not found"), { code: "auth/user-not-found" }); },
    createUser: async (properties: Record<string, unknown>) => {
      created.push(properties);
      return { uid: "firebase-uid", email: properties.email, disabled: false } as UserRecord;
    },
  };
  const resolved = await resolveSmtpInvitationEmail(firestore, auth as unknown as Pick<Auth, "getUserByEmail" | "createUser">, "usr-new", { uid: "admin", role: "System Administrator" }, configuration, async email => {
    assert.equal(email, "authorized.user@example.test");
    return "https://secure.example.test/firebase-action-code";
  });
  assert.deepEqual(created, [{ email: "authorized.user@example.test", displayName: "Authorized User", disabled: false }]);
  assert.equal(resolved.message.to, "authorized.user@example.test");
  assert.match(resolved.message.html || "", /firebase-action-code/);
  assert.deepEqual(userWrites, [{ firebaseIdentityProvisioned: true }]);

  await resolved.recordOutcome("Queued", "request-1");
  await resolved.recordOutcome("Accepted", "request-1");
  assert.equal(outboxWrites.length, 2);
  assert.equal(outboxWrites[0].status, "Queued");
  assert.equal(outboxWrites[1].status, "Accepted");
  assert.equal(JSON.stringify(outboxWrites).includes("firebase-action-code"), false);
  const acceptedUserWrite = userWrites[1] as Record<string, unknown>;
  assert.deepEqual(userWrites[1], {
    invitationStatus: "Pending",
    invitationDelivery: "SMTP email",
    invitationDeliveryStatus: "Accepted",
    invitedAt: acceptedUserWrite.invitedAt,
    invitedBy: "admin",
  });
});

test("mail outcomes persist server evidence without transport credentials or message bodies", async () => {
  const writes: Record<string, unknown>[] = [];
  const firestore = { collection: (name: string) => {
    assert.equal(name, "outbox_logs");
    return { doc: (id: string) => {
      assert.equal(id, "out-request-2");
      return { set: async (value: Record<string, unknown>) => { writes.push(value); } };
    } };
  } } as unknown as Firestore;
  await recordMailOutcome(firestore, {
    requestId: "request-2",
    status: "Accepted",
    recipient: "Recipient@Example.test",
    subject: "Operational message",
    templateId: "request-approved",
    entityId: "req-1",
    requestedBy: "admin",
  });
  assert.equal(writes[0].recipient, "recipient@example.test");
  assert.equal(writes[0].status, "Accepted");
  assert.equal(writes[0].transport, "SMTP");
  assert.equal(JSON.stringify(writes).includes("password"), false);
  assert.equal(JSON.stringify(writes).includes("oobCode"), false);
});

test("seeded SMTP templates do not expose a stale editable onboarding template", () => {
  assert.equal(INITIAL_EMAIL_TEMPLATES.some(item => item.id === "tmpl-account-invite"), false);
});