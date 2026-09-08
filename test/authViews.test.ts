import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AuthContext, type AuthContextValue } from "../src/context/AuthContext";
import { AuthGate } from "../src/components/auth/AuthGate";
import { AccountDetails } from "../src/components/auth/AccountView";
import { INITIAL_SESSION, type Account } from "../src/lib/authSession";

const account: Account = { uid: "test", email: "user@example.test", name: "Synthetic User", role: "Viewer", status: "Active", accessScope: "Company-wide", emailVerified: true, personId: "person-test", authenticationMethod: "google.com" };
function gated(state: Partial<AuthContextValue>) {
  const value: AuthContextValue = { ...INITIAL_SESSION, emailLink: null, clearEmailLink() {}, async signOut() {}, retry() {}, ...state };
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ["/admin"] }, React.createElement(AuthContext.Provider, { value }, React.createElement(AuthGate, null, React.createElement("div", null, "PROTECTED_DIRECTORY")))));
}
test("loading, signed-out and denied deep routes never render protected content", () => {
  for (const status of ["loading", "signed-out", "denied"] as const) {
    const html = gated({ status }); assert.equal(html.includes("PROTECTED_DIRECTORY"), false);
    if (status === "loading") assert.match(html, /Restoring secure session/);
    if (status === "signed-out") { assert.match(html, /Continue with Google/); assert.match(html, /type="password"/); assert.match(html, /Forgot password/); assert.match(html, /Email link/); }
    if (status === "denied") assert.match(html, /Sign out/);
  }
  assert.match(gated({ status: "authorized", account }), /PROTECTED_DIRECTORY/);
  assert.doesNotMatch(gated({ status: "authorized", account: null }), /PROTECTED_DIRECTORY/);
});
test("email link completion requests the email again without exposing action codes", () => {
  const html = gated({ status: "signed-out", emailLink: "https://directory.example.test/auth/email-link?oobCode=synthetic-secret" });
  assert.match(html, /Complete email sign-in/); assert.match(html, /type="email"/); assert.doesNotMatch(html, /synthetic-secret|type="password"|PROTECTED_DIRECTORY/);
});
test("profile renders server identity, verification, role, scope, method and linked person read-only", () => {
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(AccountDetails, { account, person: { id: "person-test", fullName: "Synthetic Person" } })));
  for (const text of ["Synthetic User", "user@example.test", "Verified", "Viewer", "Company-wide", "Google", "Synthetic Person", '/people/person-test']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<input|<select|contenteditable/);
});