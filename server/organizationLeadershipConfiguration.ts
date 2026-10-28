/** Server-only admission. All flags default off. Recovery stays available independently of new commands.
 * These flags do not replace runtime isolation and unit-activation acceptance. */
export function organizationLeadershipCapabilities(environment: NodeJS.ProcessEnv = process.env) {
  const catalogEnabled = environment.ORGANIZATION_LEADERSHIP_CATALOG_ENABLED === 'true';
  const recoveryEnabled = environment.ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED === 'true';
  return { schemaVersion: 1 as const, catalogEnabled, recoveryEnabled,
    newCommandsEnabled: catalogEnabled && recoveryEnabled && environment.ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED === 'true' };
}
/** Compatibility requires all three raw controls off, including a command-only partial setup. */
export function organizationLegacyCreationEnabled(environment: NodeJS.ProcessEnv = process.env){
  return ['ORGANIZATION_LEADERSHIP_CATALOG_ENABLED','ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED','ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED'].every(key=>environment[key]!=='true');
}
export function requireOrganizationLeadershipAdmission(kind: 'catalog' | 'command' | 'recovery') {
  const c = organizationLeadershipCapabilities();
  if (!(kind === 'catalog' ? c.catalogEnabled : kind === 'command' ? c.newCommandsEnabled : c.recoveryEnabled)) throw new Error('Organization workflow is disabled.');
}
