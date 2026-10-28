import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocationCreationCommand, normalizeLocationCreationMarker, assertLocationCreationActor, locationCreationKey, locationCreationAuditId, prepareLocationCreation } from '../server/locationCreationRecovery';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
const command=()=>({write:{collection:'locations',id:'loc-new',operation:'set',expectedVersion:null,data:{storeNumber:'008',name:'New Store',standardHours:{monday:{open:'10:00',close:'20:00',isClosed:false}}}}});
test('creation normalization admits only a bounded exact single create-only JSON command and detaches it',()=>{
  const input=command(), before=structuredClone(input), normalized=normalizeLocationCreationCommand(input);
  assert.deepEqual(input,before); normalized.write.data.name='Changed';assert.equal(input.write.data.name,'New Store');
  for(const change of [(c:any)=>{c.extra=true;},(c:any)=>{c.write.operation='delete';},(c:any)=>{c.write.expectedVersion=0;},(c:any)=>{c.write.collection='people';},(c:any)=>{c.write.secret='bad';},(c:any)=>{c.write.data.id='other';},(c:any)=>{c.write.data.value=NaN;},(c:any)=>{c.write.data.value=new Date();},(c:any)=>{c.write.data.notes='界'.repeat(70000);},(c:any)=>{c.write.locationInboxAcknowledgment={normalizedEmail:'store@example.test',conflictDigest:'hash',other:true};}]) {const c=command();change(c);assert.throws(()=>normalizeLocationCreationCommand(c));}
  const a=normalizeLocationCreationCommand({write:{data:{name:'Store',storeNumber:'008'},id:'loc-new',expectedVersion:null,operation:'set',collection:'locations'}});
  const b=normalizeLocationCreationCommand({write:{collection:'locations',operation:'set',id:'loc-new',data:{storeNumber:'008',name:'Store'},expectedVersion:null}});
  assert.equal(JSON.stringify(a),JSON.stringify(b));
});
test('creation marker and receipt domain bind an actor plus Location identity without accepting credentials/drafts',()=>{
  assert.deepEqual(normalizeLocationCreationMarker({locationId:'loc-008'}),{locationId:'loc-008'});
  assert.throws(()=>normalizeLocationCreationMarker({locationId:'loc-008',token:'secret'}));
  assert.throws(()=>normalizeLocationCreationMarker({locationId:'../bad'}));
  assert.notEqual(locationCreationKey(actor,'loc-008'),locationCreationKey({...actor,uid:'other'},'loc-008'));
  assert.match(locationCreationAuditId(actor,'loc-008'),/^location-creation-[a-f0-9]{64}$/);
  assert.throws(()=>assertLocationCreationActor({...actor,role:'Viewer'}));
  assert.throws(()=>assertLocationCreationActor({...actor,accessScope:'Store 008'}));
});
test('default-off creation preparation/commit performs no database call or generic fallback',async()=>{
  const keys=['ORGANIZATION_LEADERSHIP_CATALOG_ENABLED','ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED','ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED'], previous=keys.map(k=>process.env[k]);let calls=0;
  const db:any={runTransaction(){calls++;throw new Error('No I/O expected');}};
  try{keys.forEach(k=>delete process.env[k]);await assert.rejects(prepareLocationCreation(db,command(),actor),/disabled/);await assert.rejects(new FirestoreDirectoryStore(db).commitLocationCreation(command(),actor),/disabled/);assert.equal(calls,0);}
  finally{keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});
