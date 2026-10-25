import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const PROJECT = 'gen-lang-client-0801664258';
const NAMESPACE = '1063064400866';
const SERVICE = 'shiekh-location-company-directory';
const PREVIEW = 'shiekh-directory-runtime-preview';
const IDENTITY = `shiekh-directory-runtime@${PROJECT}.iam.gserviceaccount.com`;
const object = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
function at(v: unknown, ...keys: string[]): unknown {
  for (const key of keys) v = object(v)?.[key];
  return v;
}
const annotations = (v: unknown) => object(at(v, 'spec', 'template', 'metadata', 'annotations'));
function stableAnnotations(v: unknown) {
  const result = { ...annotations(v) };
  for (const key of Object.keys(result)) {
    if (['autoscaling.knative.dev/minScale', 'autoscaling.knative.dev/maxScale',
      'run.googleapis.com/client-name', 'run.googleapis.com/client-version'].includes(key)
      || key.startsWith('client.knative.dev/')) delete result[key];
  }
  return result;
}
function privatePolicy(v: unknown): boolean {
  const policy = object(v);
  if (!policy || typeof policy.etag !== 'string' || !policy.etag) return false;
  const bindings = policy.bindings ?? [];
  return Array.isArray(bindings) && bindings.every(binding => {
    const members = at(binding, 'members');
    return typeof at(binding, 'role') === 'string' && Array.isArray(members)
      && members.every(member => typeof member === 'string'
        && !['allUsers', 'allAuthenticatedUsers'].includes(member));
  });
}

/** Offline only: evaluates supplied v1 snapshots; never contacts or changes cloud resources. */
export function checkRuntimePreview(input: unknown) {
  const errors: string[] = [];
  const fail = (ok: boolean, code: string) => { if (!ok) errors.push(code); };
  const before = at(input, 'productionBefore');
  const after = at(input, 'productionAfter');
  const candidate = at(input, 'candidate');
  for (const [label, service, name] of [['baseline', before, SERVICE], ['production', after, SERVICE], ['candidate', candidate, PREVIEW]] as const) {
    fail(at(service, 'apiVersion') === 'serving.knative.dev/v1' && at(service, 'kind') === 'Service'
      && at(service, 'metadata', 'name') === name && at(service, 'metadata', 'namespace') === NAMESPACE
      && !!object(at(service, 'spec', 'template', 'spec'))
      && Array.isArray(at(service, 'status', 'traffic')), `${label}_snapshot_invalid`);
    const generation = at(service, 'metadata', 'generation');
    fail(typeof generation === 'number' && Number.isSafeInteger(generation) && generation > 0
      && at(service, 'status', 'observedGeneration') === generation, `${label}_stale_generation`);
  }
  fail(!!object(at(before, 'spec')) && isDeepStrictEqual(at(before, 'spec'), at(after, 'spec'))
    && isDeepStrictEqual(at(before, 'status', 'traffic'), at(after, 'status', 'traffic')), 'production_drift');
  fail(!!object(at(input, 'productionIamBefore')) && !!object(at(input, 'productionIamAfter'))
    && isDeepStrictEqual(at(input, 'productionIamBefore'), at(input, 'productionIamAfter')), 'production_iam_drift_or_missing');
  const ready = at(candidate, 'status', 'conditions');
  fail(Array.isArray(ready) && ready.some(c => at(c, 'type') === 'Ready' && at(c, 'status') === 'True'), 'candidate_not_ready');
  const revision = at(candidate, 'status', 'latestReadyRevisionName');
  const traffic = at(candidate, 'status', 'traffic');
  const serving = Array.isArray(traffic) ? traffic.filter(t => typeof at(t, 'percent') === 'number' && (at(t, 'percent') as number) > 0) : [];
  fail(typeof revision === 'string' && revision.startsWith(`${PREVIEW}-`)
    && at(candidate, 'status', 'latestCreatedRevisionName') === revision
    && serving.length === 1 && at(serving[0], 'revisionName') === revision
    && at(serving[0], 'percent') === 100, 'candidate_not_serving_tested_revision');
  const baselineTraffic = at(before, 'status', 'traffic');
  const baselineServing = Array.isArray(baselineTraffic) ? baselineTraffic.filter(t => typeof at(t, 'percent') === 'number' && (at(t, 'percent') as number) > 0) : [];
  fail(baselineServing.length === 1 && at(baselineServing[0], 'percent') === 100
    && typeof at(baselineServing[0], 'revisionName') === 'string', 'invalid_production_traffic_baseline');
  const spec = object(at(candidate, 'spec', 'template', 'spec'));
  const baseSpec = object(at(before, 'spec', 'template', 'spec'));
  fail(spec?.serviceAccountName === IDENTITY, 'candidate_identity');
  fail(!!spec && !!baseSpec && isDeepStrictEqual({ ...spec, serviceAccountName: null },
    { ...baseSpec, serviceAccountName: null }), 'candidate_runtime_config_drift');
  const containers = spec?.containers;
  fail(Array.isArray(containers) && containers.length === 1
    && typeof at(containers[0], 'image') === 'string'
    && /@sha256:[a-f0-9]{64}$/.test(at(containers[0], 'image') as string), 'image_not_pinned');
  fail(annotations(candidate)?.['autoscaling.knative.dev/minScale'] === '0'
    && annotations(candidate)?.['autoscaling.knative.dev/maxScale'] === '1', 'preview_capacity');
  fail(isDeepStrictEqual(stableAnnotations(before), stableAnnotations(candidate)), 'template_annotations_drift');
  fail(at(candidate, 'metadata', 'annotations', 'run.googleapis.com/ingress')
    === at(before, 'metadata', 'annotations', 'run.googleapis.com/ingress'), 'ingress_drift');
  const iamDisabled = at(candidate, 'metadata', 'annotations', 'run.googleapis.com/invoker-iam-disabled');
  fail(iamDisabled === undefined || iamDisabled === 'false', 'invoker_iam_disabled_or_unknown');
  fail(privatePolicy(at(input, 'candidateIamPolicy')) && privatePolicy(at(input, 'projectIamPolicy')), 'public_or_unproven_iam');
  fail(Array.isArray(at(input, 'candidateDomainMappings'))
    && (at(input, 'candidateDomainMappings') as unknown[]).length === 0, 'candidate_domain_mapping_or_missing_inventory');
  if (Array.isArray(containers)) for (const container of containers) {
    const env = at(container, 'env') ?? [];
    fail(Array.isArray(env), 'invalid_environment');
    if (Array.isArray(env)) for (const entry of env) {
      if (['PERSON_TRANSITION_RECOVERY_ENABLED', 'PERSON_TRANSITION_COMMANDS_ENABLED'].includes(at(entry, 'name') as string)) {
        fail(at(entry, 'value') === 'false' && at(entry, 'valueFrom') === undefined, 'workflow_activation_or_unknown_flag');
      }
    }
  }
  return { mechanicalChecksPassed: errors.length === 0, errors: [...new Set(errors)], releaseAuthorized: false,
    limitations: ['Supplied snapshots only: freshness and provenance require separate verification.',
      'Not effective-access isolation, signed-in user/consumer acceptance or permission to deploy.'] };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 3 || statSync(process.argv[2]).size > 10 * 1024 * 1024) throw new Error();
    const result = checkRuntimePreview(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    console.log(JSON.stringify(result));
    process.exitCode = result.mechanicalChecksPassed ? 0 : 1;
  } catch {
    // Input may contain environment values: never echo paths, input, or parser error text.
    console.error(JSON.stringify({ mechanicalChecksPassed: false, errors: ['input_unreadable_or_invalid'], releaseAuthorized: false }));
    process.exitCode = 1;
  }
}
