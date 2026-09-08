import assert from "node:assert/strict";
import { test } from "node:test";
import type { Firestore } from "@google-cloud/firestore";
import { resolveEvent, resolveTemplate } from "../server/firestoreMail";
import type { MailConfiguration } from "../server/mailApi";

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

test("user invitation resolves the onboarding template with account and store data", async () => {
  const requestedDocuments: string[] = [];
  const records: Record<string, Record<string, unknown>> = {
    "users/usr-new": { email: "new.user@example.test", status: "Active", displayName: "New User", role: "Viewer", storeNumber: "07", accessScope: "Store 07" },
    "email_templates/tmpl-account-invite": { subject: "Welcome {{recipient_name}}", bodyHtml: "<p>{{role}} at {{store_number}} - {{store_name}}</p>" },
  };
  const firestore = {
    collection(name: string) {
      return {
        doc(id: string) {
          requestedDocuments.push(`${name}/${id}`);
          const data = records[`${name}/${id}`];
          return { get: async () => ({ exists: Boolean(data), data: () => data }) };
        },
        where(field: string, operator: string, value: string) {
          assert.deepEqual([name, field, operator, value], ["locations", "storeNumber", "==", "07"]);
          return { limit: () => ({ get: async () => ({ docs: [{ data: () => ({ name: "Test Store" }) }] }) }) };
        },
      };
    },
  } as unknown as Firestore;
  const configuration = { host: "smtp.test", port: 587, user: "user", password: "password", from: "sender@example.test", recipients: ["sender@example.test"] } as MailConfiguration;
  const message = await resolveEvent(firestore, "user-invitation", "usr-new", { uid: "admin", role: "System Administrator" }, configuration);
  assert.equal(message.to, "new.user@example.test");
  assert.equal(message.subject, "Welcome New User");
  assert.match(message.html || "", /Viewer at 07 - Test Store/);
  assert.ok(requestedDocuments.includes("email_templates/tmpl-account-invite"));
});