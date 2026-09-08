import assert from "node:assert/strict";
import { test } from "node:test";
import type { Firestore } from "@google-cloud/firestore";
import { resolveEvent, resolveTemplate, sendFirebaseInvitationEmail } from "../server/firestoreMail";
import type { MailConfiguration } from "../server/mailApi";
import { INITIAL_EMAIL_TEMPLATES } from "../src/data/initialData";

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

test("Firebase invitation delivery uses the exact active Firestore email and records metadata only after acceptance", async () => {
  const metadataWrites: Record<string, unknown>[] = [];
  const firestore = {
    collection: () => ({ doc: () => ({
      get: async () => ({ exists: true, data: () => ({ email: "Authorized.User@Example.test", status: "Active" }) }),
      set: async (value: Record<string, unknown>) => { metadataWrites.push(value); },
    }) }),
  } as unknown as Firestore;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const request = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response("{}", { status: 200 });
  };
  await sendFirebaseInvitationEmail(firestore, "usr-new", { uid: "admin", role: "System Administrator" }, "public api key", "https://shiekh-dir.ai.studio/", request as typeof fetch);
  assert.match(requests[0].url, /accounts:sendOobCode\?key=public%20api%20key$/);
  assert.deepEqual(requests[0].body, {
    requestType: "EMAIL_SIGNIN",
    email: "authorized.user@example.test",
    continueUrl: "https://shiekh-dir.ai.studio/auth/email-link",
    canHandleCodeInApp: true,
  });
  assert.equal(metadataWrites.length, 1);
  assert.deepEqual(metadataWrites[0], {
    invitationStatus: "Pending",
    invitationDelivery: "Firebase email",
    invitationDeliveryStatus: "Submitted",
    invitedAt: metadataWrites[0].invitedAt,
    invitedBy: "admin",
  });
  assert.equal(JSON.stringify(metadataWrites).includes("api key"), false);

  metadataWrites.length = 0;
  await assert.rejects(() => sendFirebaseInvitationEmail(firestore, "usr-new", { uid: "admin", role: "System Administrator" }, "key", "https://shiekh-dir.ai.studio", async () => new Response("{}", { status: 400 })), /submission failed/);
  assert.equal(metadataWrites.length, 0);
});

test("seeded SMTP templates do not claim to control Firebase onboarding email", () => {
  assert.equal(INITIAL_EMAIL_TEMPLATES.some(item => item.id === "tmpl-account-invite"), false);
});