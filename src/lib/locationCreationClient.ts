import { createOrganizationSessionTransport, OrganizationTransportError, parseOrganizationCapabilities } from './organizationLeadershipClient';
import type { LocationCreationCommand, LocationCreationOutcome, LocationCreationList, LocationCreationCapabilities } from './locationCreationContract';
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v: unknown, keys: string[]): v is Record<string, any> => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const json = (v: unknown, depth = 0): boolean => depth <= 20 && (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v) || Array.isArray(v) && Array.from(v).every(item => json(item,depth+1)) || object(v) && Object.values(v).every(item => json(item,depth+1)));
const invalid = (): never => { throw new OrganizationTransportError('The store creation could not be verified. Keep its identity and check recovery.'); };
export function parseLocationCreationCapabilities(v: unknown): LocationCreationCapabilities {
  if(!exact(v,['schemaVersion','catalogEnabled','recoveryEnabled','newCommandsEnabled','legacyCreationEnabled']) || typeof v.legacyCreationEnabled!=='boolean')return invalid();
  const base=parseOrganizationCapabilities({schemaVersion:v.schemaVersion,catalogEnabled:v.catalogEnabled,recoveryEnabled:v.recoveryEnabled,newCommandsEnabled:v.newCommandsEnabled});
  if(v.legacyCreationEnabled && (base.catalogEnabled || base.recoveryEnabled || base.newCommandsEnabled))return invalid();
  return {...base,legacyCreationEnabled:v.legacyCreationEnabled};
}
/** Validate before a controller persists an identity or sends any preparation/commit. */
export function isLocationCreationCommand(v: unknown): v is LocationCreationCommand {
  try {
    if (!exact(v,['write']) || !object(v.write)) return false;
    const w=v.write;
    if (Object.keys(w).some(k=>!['collection','id','operation','expectedVersion','data','expectedCustomMetadata','locationInboxAcknowledgment'].includes(k)) || w.collection!=='locations' || w.operation!=='set' || w.expectedVersion!==null || !id(w.id) || !object(w.data)
      || Object.hasOwn(w.data,'id') && w.data.id!==w.id || Object.hasOwn(w,'expectedCustomMetadata') && !object(w.expectedCustomMetadata)) return false;
    if(Object.hasOwn(w,'locationInboxAcknowledgment')) {const a=w.locationInboxAcknowledgment;if(!exact(a,['normalizedEmail','conflictDigest']) || typeof a.normalizedEmail!=='string' || !a.normalizedEmail.length || a.normalizedEmail.length>254 || typeof a.conflictDigest!=='string' || !a.conflictDigest.length || a.conflictDigest.length>20000)return false;}
    return json(v) && new TextEncoder().encode(JSON.stringify(v)).byteLength<=200000;
  } catch {return false;}
}
export function parseLocationCreationOutcome(v: unknown, locationId: string): LocationCreationOutcome {
  if(!object(v) || !id(locationId) || v.schemaVersion!==1 || v.locationId!==locationId) return invalid();
  const base=['schemaVersion','locationId','state'];
  if(v.state==='missing' && exact(v,base)) return v as LocationCreationOutcome;
  if(!instant(v.updatedAt))return invalid();
  if(v.state==='cancelled' && exact(v,[...base,'updatedAt']))return v as LocationCreationOutcome;
  if(v.state==='prepared' && exact(v,[...base,'updatedAt','expiresAt']) && instant(v.expiresAt) && Date.parse(v.expiresAt)-Date.parse(v.updatedAt)===600000)return v as LocationCreationOutcome;
  if(v.state==='committed' && exact(v,[...base,'updatedAt','auditId','createdVersion']) && v.createdVersion===1 && typeof v.auditId==='string' && /^location-creation-[a-f0-9]{64}$/.test(v.auditId))return v as LocationCreationOutcome;
  return invalid();
}
export function parseLocationCreationList(v: unknown): LocationCreationList {
  if(!exact(v,['schemaVersion','complete','operations']) || v.schemaVersion!==1 || v.complete!==true || !Array.isArray(v.operations) || v.operations.length>100)return invalid();
  const seen=new Set<string>();
  for(const row of v.operations){if(!object(row) || !id(row.locationId) || seen.has(row.locationId) || parseLocationCreationOutcome(row,row.locationId).state!=='prepared')return invalid();seen.add(row.locationId);}
  return v as LocationCreationList;
}
/** Fixed route, current session, bounded DTOs/deadlines and no automatic retry. Workflow must
 * retain its actor-scoped identity BEFORE mutation, and verify the actor audit digest on recovery. */
export function createLocationCreationHttpPort(options: Parameters<typeof createOrganizationSessionTransport>[0]) {
  const {call,dispose}=createOrganizationSessionTransport(options,'creation');
  return {capabilities:async()=>parseLocationCreationCapabilities(await call('capabilities')),list:async()=>parseLocationCreationList(await call('operations')),directory:()=>call('directory'),
    prepare:async(command:LocationCreationCommand)=>{if(!isLocationCreationCommand(command))return invalid();return parseLocationCreationOutcome(await call('prepare',command),command.write.id);},
    commit:async(command:LocationCreationCommand)=>{if(!isLocationCreationCommand(command))return invalid();return parseLocationCreationOutcome(await call('commit',command),command.write.id);},
    status:async(locationId:string)=>{if(!id(locationId))return invalid();return parseLocationCreationOutcome(await call('status',{locationId}),locationId);},
    cancel:async(locationId:string)=>{if(!id(locationId))return invalid();return parseLocationCreationOutcome(await call('cancel',{locationId}),locationId);},dispose};
}
