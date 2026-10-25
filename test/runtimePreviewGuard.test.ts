import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRuntimePreview, runtimePreviewEntry } from '../scripts/runtimePreviewGuard';

function fixture() {
  const production = { apiVersion: 'serving.knative.dev/v1', kind: 'Service', metadata: {
    name: 'shiekh-location-company-directory', namespace: '1063064400866', generation: 1,
    labels: { 'cloud.googleapis.com/location': 'us-west1' }, annotations: { 'run.googleapis.com/ingress': 'all' } },
  spec: { template: { metadata: { annotations: { 'run.googleapis.com/execution-environment': 'gen2' } }, spec: {
    serviceAccountName: 'existing-runtime', containers: [{ image: `registry/image@sha256:${'a'.repeat(64)}`, env: [{ name: 'UNRELATED', value: 'synthetic-sensitive-value' }] }] } } },
  status: { observedGeneration: 1, traffic: [{ revisionName: 'published', percent: 100 }, { revisionName: 'older', tag: 'retained' }] } };
  const candidate = structuredClone(production);
  candidate.metadata.name = 'shiekh-directory-runtime-preview';
  candidate.spec.template.spec.serviceAccountName = 'shiekh-directory-runtime@gen-lang-client-0801664258.iam.gserviceaccount.com';
  Object.assign(candidate.spec.template.metadata.annotations, { 'autoscaling.knative.dev/minScale': '0', 'autoscaling.knative.dev/maxScale': '1' });
  Object.assign(candidate.status, { conditions: [{ type: 'Ready', status: 'True' }],
    latestReadyRevisionName: 'shiekh-directory-runtime-preview-001', latestCreatedRevisionName: 'shiekh-directory-runtime-preview-001',
    traffic: [{ revisionName: 'shiekh-directory-runtime-preview-001', percent: 100 }] });
  return { productionBefore: production, productionAfter: structuredClone(production), candidate,
    productionIamBefore: { etag: 'same' }, productionIamAfter: { etag: 'same' }, candidateIamPolicy: { etag: 'service' }, projectIamPolicy: { etag: 'project' }, candidateDomainMappings: [] };
}
test('unchanged private preview passes mechanical checks but never authorizes release or mutates input', () => {
  const input = fixture(); const saved = structuredClone(input);
  const result = checkRuntimePreview(input);
  assert.equal(result.mechanicalChecksPassed, true); assert.equal(result.releaseAuthorized, false);
  assert.deepEqual(input, saved); assert(!JSON.stringify(result).includes('synthetic-sensitive-value'));
});
const cases: [string, (f: ReturnType<typeof fixture>) => void][] = [
  ['production traffic change', f => { f.productionAfter.status.traffic[0].percent = 90; }],
  ['historical tag loss', f => { f.productionAfter.status.traffic.pop(); }],
  ['production environment drift', f => { f.productionAfter.spec.template.spec.containers[0].env[0].value = 'changed'; }],
  ['production ingress drift', f => { f.productionAfter.metadata.annotations['run.googleapis.com/ingress'] = 'internal'; }],
  ['production labels drift', f => { Object.assign(f.productionAfter.metadata, { labels: { security: 'changed' } }); }],
  ['IAM drift', f => { f.productionIamAfter.etag = 'changed'; }],
  ['missing production IAM etags', f => { delete (f.productionIamBefore as Record<string, unknown>).etag; delete (f.productionIamAfter as Record<string, unknown>).etag; }],
  ['empty production IAM etags', f => { f.productionIamBefore.etag = ''; f.productionIamAfter.etag = ''; }],
  ['wrong production region', f => { for (const s of [f.productionBefore, f.productionAfter]) s.metadata.labels['cloud.googleapis.com/location'] = 'us-central1'; }],
  ['missing candidate region', f => { delete (f.candidate.metadata.labels as Record<string, unknown>)['cloud.googleapis.com/location']; }],
  ['wrong candidate target', f => { f.candidate.metadata.name = f.productionBefore.metadata.name; }],
  ['wrong project', f => { f.candidate.metadata.namespace = 'another-project'; }],
  ['wrong identity', f => { f.candidate.spec.template.spec.serviceAccountName = 'shared-runtime'; }],
  ['unpinned image', f => { f.candidate.spec.template.spec.containers[0].image = 'registry/image:latest'; }],
  ['changed startup secret/config', f => { f.candidate.spec.template.spec.containers[0].env[0].value = 'different'; }],
  ['unready service', f => { Object.assign(f.candidate.status, { conditions: [] }); }],
  ['stale Ready condition', f => { f.candidate.metadata.generation = 2; }],
  ['old candidate traffic', f => { f.candidate.status.traffic[0].revisionName = 'old-shared-identity'; }],
  ['zero-percent tagged old candidate', f => { f.candidate.status.traffic.push({ revisionName: 'old-shared-identity', percent: 0, tag: 'old-preview' }); }],
  ['zero-percent untagged old candidate', f => { f.candidate.status.traffic.push({ revisionName: 'old-shared-identity', percent: 0 }); }],
  ['tag on candidate serving revision', f => { f.candidate.status.traffic[0].tag = 'extra-route'; }],
  ['duplicate zero-percent candidate route', f => { f.candidate.status.traffic.push({ ...f.candidate.status.traffic[0], percent: 0 }); }],
  ['unobserved new revision', f => { Object.assign(f.candidate.status, { latestCreatedRevisionName: 'new-unready-revision' }); }],
  ['invalid traffic baseline', f => { f.productionBefore.status.traffic = []; f.productionAfter.status.traffic = []; }],
  ['capacity drift', f => { Object.assign(f.candidate.spec.template.metadata.annotations, { 'autoscaling.knative.dev/minScale': '1' }); }],
  ['network drift', f => { f.candidate.spec.template.metadata.annotations['run.googleapis.com/execution-environment'] = 'changed'; }],
  ['ingress drift', f => { f.candidate.metadata.annotations['run.googleapis.com/ingress'] = 'internal'; }],
  ['disabled invoker IAM', f => { Object.assign(f.candidate.metadata.annotations, { 'run.googleapis.com/invoker-iam-disabled': 'true' }); }],
  ['public service IAM', f => { Object.assign(f.candidateIamPolicy, { bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }] }); }],
  ['public inherited IAM', f => { Object.assign(f.projectIamPolicy, { bindings: [{ role: 'roles/run.invoker', members: ['allAuthenticatedUsers'] }] }); }],
  ['missing IAM evidence', f => { delete (f.projectIamPolicy as Record<string, unknown>).etag; }],
  ['malformed traffic percentage', f => { Object.assign(f.candidate.status.traffic[0], { percent: { toString: null, valueOf: null } }); }],
  ['domain mapping', f => { (f.candidateDomainMappings as unknown[]).push({ target: 'preview' }); }],
  ['workflow activation', f => { for (const s of [f.productionBefore, f.productionAfter, f.candidate]) s.spec.template.spec.containers[0].env.push({ name: 'PERSON_TRANSITION_RECOVERY_ENABLED', value: 'true' }); }],
];
for (const [name, mutate] of cases) test(`blocks ${name}`, () => {
  const input = fixture(); mutate(input); assert.equal(checkRuntimePreview(input).mechanicalChecksPassed, false);
});
test('CLI emits sanitized results and rejects malformed input without echoing its contents or path', () => {
  const directory = mkdtempSync(join(tmpdir(), 'directory-guard-test-'));
  try {
    const file = join(directory, 'private-sensitive-path.json');
    writeFileSync(file, JSON.stringify(fixture()));
    const run = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/runtimePreviewGuard.ts', file], { encoding: 'utf8' });
    const good = run(); assert.equal(good.status, 0); assert.equal(JSON.parse(good.stdout).releaseAuthorized, false);
    writeFileSync(file, '{"private":"do-not-echo", broken');
    const bad = run(); assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stderr).errors[0], 'input_unreadable_or_invalid');
    assert(!`${bad.stdout}${bad.stderr}`.includes('do-not-echo'));
    assert(!`${bad.stdout}${bad.stderr}`.includes('private-sensitive-path'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('missing, malformed and ambiguous evidence fails closed without exposing values', () => {
  for (const value of [null, [], {}, { candidate: { password: 'do-not-echo' } }]) {
    const result = checkRuntimePreview(value); assert.equal(result.mechanicalChecksPassed, false);
    assert(!JSON.stringify(result).includes('do-not-echo'));
  }
  const input = fixture(); Object.assign(input.projectIamPolicy, { bindings: [{ role: 'bad', members: 'allUsers' }] });
  assert.equal(checkRuntimePreview(input).mechanicalChecksPassed, false);
});

test('entry detection keeps imports inert and makes resolution failure explicitly fatal', () => {
  assert.deepEqual(runtimePreviewEntry(undefined, import.meta.url), { isMain: false, entryResolutionFailed: false });
  assert.deepEqual(runtimePreviewEntry('scripts/runtimePreviewGuard.ts', import.meta.url), { isMain: false, entryResolutionFailed: false });
  const missing = join(tmpdir(), `missing-entry-${process.pid}-${Date.now()}.ts`);
  assert.deepEqual(runtimePreviewEntry(missing, import.meta.url), { isMain: true, entryResolutionFailed: true });
});

test('CLI through a linked checkout executes checks with default and preserved symlink entry paths', () => {
  const directory = mkdtempSync(join(tmpdir(), 'directory-guard-link-test-'));
  const link = join(directory, 'checkout');
  let linked = false;
  try {
    symlinkSync(process.cwd(), link, process.platform === 'win32' ? 'junction' : 'dir'); linked = true;
    const file = join(directory, 'private-input.json');
    const script = join(link, 'scripts', 'runtimePreviewGuard.ts');
    for (const flags of [[], ['--preserve-symlinks-main']]) {
      writeFileSync(file, JSON.stringify(fixture()));
      const good = spawnSync(process.execPath, [...flags, '--import', 'tsx', script, file], { encoding: 'utf8' });
      assert.equal(good.status, 0, good.stderr); assert.equal(JSON.parse(good.stdout).mechanicalChecksPassed, true);
      writeFileSync(file, '{private-secret-invalid');
      const bad = spawnSync(process.execPath, [...flags, '--import', 'tsx', script, file], { encoding: 'utf8' });
      assert.equal(bad.status, 1); assert.equal(JSON.parse(bad.stderr).mechanicalChecksPassed, false);
      assert(!`${bad.stdout}${bad.stderr}`.includes('private-secret-invalid'));
    }
  } finally {
    // Remove only our link before cleaning our own temporary fixture directory.
    if (linked) unlinkSync(link);
    rmSync(directory, { recursive: true, force: true });
  }
});
