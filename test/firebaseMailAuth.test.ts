import assert from "node:assert/strict";
import { test } from "node:test";
import { firebaseMailAuthenticator, createFirebaseMailAuthenticator } from "../server/firebaseMailAuth";
import { firebaseAuthenticator, createFirebaseAuthenticator, AuthenticationUnavailable } from "../server/authAuthority";
import { MailAuthenticationUnavailable } from "../server/mailApi";

test("mail shares the directory role authority and unavailable error boundary", () => {
  assert.equal(firebaseMailAuthenticator, firebaseAuthenticator);
  assert.equal(createFirebaseMailAuthenticator, createFirebaseAuthenticator);
  assert.equal(MailAuthenticationUnavailable, AuthenticationUnavailable);
});