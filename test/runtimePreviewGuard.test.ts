import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRuntimePreview } from '../scripts/runtimePreviewGuard';

function fixture() {
  const production = { apiVersion: 'serving.knative.dev/v1', kind: 'Service', metadata: {
    name: 'shiekh-location-company-directory', namespace: '1063064400866', generation: 1, annotations: { 'run.googleapis.com/ingress': 'all' } },
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
  ['IAM drift', f => { f.productionIamAfter.etag = 'changed'; }],
  ['wrong candidate target', f => { f.candidate.metadata.name = f.productionBefore.metadata.name; }],
  ['wrong project', f => { f.candidate.metadata.namespace = 'another-project'; }],
  ['wrong identity', f => { f.candidate.spec.template.spec.serviceAccountName = 'shared-runtime'; }],
  ['unpinned image', f => { f.candidate.spec.template.spec.containers[0].image = 'registry/image:latest'; }],
  ['changed startup secret/config', f => { f.candidate.spec.template.spec.containers[0].env[0].value = 'different'; }],
  ['unready service', f => { Object.assign(f.candidate.status, { conditions: [] }); }],
  ['stale Ready condition', f => { f.candidate.metadata.generation = 2; }],
  ['old candidate traffic', f => { f.candidate.status.traffic[0].revisionName = 'old-shared-identity'; }],
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
