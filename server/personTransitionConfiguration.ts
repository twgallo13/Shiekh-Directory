import { loadPersonTransitionReviewSigner } from './personTransitionReviewEnvelope';

/** Server-only gates. A signing key alone never enables staffing writes. Recovery needs no key. */
export function personTransitionCapabilities(environment: NodeJS.ProcessEnv = process.env) {
  const recoveryEnabled = environment.PERSON_TRANSITION_RECOVERY_ENABLED === 'true';
  let signingReady = false;
  try { signingReady = !!loadPersonTransitionReviewSigner(environment.PERSON_TRANSITION_REVIEW_KEYRING ?? ''); } catch { /* Invalid configuration never grants admission. */ }
  return { schemaVersion: 1 as const, newCommandsEnabled: recoveryEnabled && environment.PERSON_TRANSITION_COMMANDS_ENABLED === 'true' && signingReady, recoveryEnabled };
}
export function requirePersonTransitionAdmission(kind: 'command' | 'recovery') {
  const capabilities = personTransitionCapabilities();
  if (!(kind === 'command' ? capabilities.newCommandsEnabled : capabilities.recoveryEnabled)) throw new Error('Transition workflow is disabled.');
}
