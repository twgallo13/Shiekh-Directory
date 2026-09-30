import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apiClientErrorMessage } from "../src/lib/apiClientAdminClient";

const clientSource = readFileSync(new URL("../src/lib/apiClientAdminClient.ts", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/components/admin/ApiClientsPanel.tsx", import.meta.url), "utf8");
const adminSource = readFileSync(new URL("../src/components/admin/AdminIntegrationsView.tsx", import.meta.url), "utf8");
const contextSource = readFileSync(new URL("../src/context/DirectoryContext.tsx", import.meta.url), "utf8");

test("API client controls are SysAdmin-gated and credentials stay outside browser storage and directory context", () => {
  assert.match(adminSource, /currentUser\.role === 'System Administrator' && <ApiClientsPanel \/>/);
  assert.doesNotMatch(`${clientSource}\n${panelSource}`, /localStorage|sessionStorage|indexedDB|URLSearchParams/);
  assert.doesNotMatch(contextSource, /ApiClient|apiClient|issuedToken/);
  assert.match(panelSource, /setIssuedToken\(null\)/);
  assert.match(panelSource, /Dismiss one-time token/);
  assert.match(panelSource, /const controlsLocked = busy \|\| Boolean\(issuedToken\)/);
  assert.match(panelSource, /if \(controlsLocked \|\| !name\.trim\(\)\) return/);
  assert.match(panelSource, /if \(!pending \|\| controlsLocked\) return/);
  assert.match(panelSource, /disabled=\{controlsLocked \|\| !name\.trim\(\)\}/);
  assert.equal((panelSource.match(/disabled=\{controlsLocked\}/g) || []).length >= 6, true);
  const createHandler = panelSource.slice(panelSource.indexOf("const create ="), panelSource.indexOf("const enable ="));
  const lifecycleHandler = panelSource.slice(panelSource.indexOf("const confirmAction ="), panelSource.indexOf("const copyToken ="));
  assert.doesNotMatch(`${createHandler}\n${lifecycleHandler}`, /setIssuedToken\(null\)/);
});

test("browser requests use Firebase bearer authentication and fixed server management routes", () => {
  assert.match(clientSource, /getIdToken\(\)/);
  assert.match(clientSource, /Authorization: `Bearer \$\{/);
  assert.match(clientSource, /cache: "no-store"/);
  assert.doesNotMatch(clientSource, /scope\s*:/);
  assert.doesNotMatch(clientSource, /digest|fragment|personnel|request body/i);
});

test("management error codes produce accurate user-facing messages with a generic fallback", () => {
  const expected = new Map([
    ["invalid_token", "Your sign-in session is no longer valid. Sign in again."],
    ["access_denied", "Only System Administrators can manage API clients."],
    ["api_client_not_found", "This API client no longer exists. Refresh the client list."],
    ["api_client_conflict", "This API client changed and the requested action is no longer allowed. Refresh the client list."],
    ["invalid_request", "The API client request was invalid."],
    ["api_client_management_unavailable", "API client management is temporarily unavailable."],
  ]);
  for (const [code, message] of expected) assert.equal(apiClientErrorMessage({ error: { code } }), message);
  for (const payload of [{}, { error: {} }, { error: { code: "unknown" } }, null]) {
    assert.equal(apiClientErrorMessage(payload), "API client management request failed.");
  }
});
