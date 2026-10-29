import { organizationLeadershipCapabilities } from './organizationLeadershipConfiguration';
/** Independent enablement prevents roster activation from enabling removal/conversion.
 * Existing recovery remains available when new lifecycle work is paused. */
export function locationLifecycleCapabilities(environment:NodeJS.ProcessEnv=process.env){
  const base=organizationLeadershipCapabilities(environment),enabled=environment.LOCATION_LIFECYCLE_ENABLED==='true';
  return{schemaVersion:1 as const,catalogEnabled:enabled&&base.catalogEnabled,recoveryEnabled:base.recoveryEnabled,newCommandsEnabled:enabled&&base.newCommandsEnabled};
}
export function requireLocationLifecycleAdmission(kind:'catalog'|'command'|'recovery'){
  const c=locationLifecycleCapabilities();if(!(kind==='catalog'?c.catalogEnabled:kind==='command'?c.newCommandsEnabled:c.recoveryEnabled))throw new Error('Location lifecycle workflow is disabled.');
}
