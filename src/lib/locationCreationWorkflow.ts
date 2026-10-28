import type { SessionState } from './authSession';
import type { LocationCreationCapabilities, LocationCreationCommand, LocationCreationList, LocationCreationOutcome } from './locationCreationContract';
import { createLocationCreationHttpPort, isLocationCreationCommand } from './locationCreationClient';
import { acquireOrganizationLease, organizationMarkerStore } from './organizationLeadershipRecovery';
import { OrganizationTransportError } from './organizationLeadershipClient';

export interface LocationCreationWorkflowState {
  phase: 'loading' | 'legacy' | 'editing' | 'recovery' | 'refresh-needed' | 'saved' | 'blocked';
  busy: boolean; error: string; capabilities: LocationCreationCapabilities | null;
  locationId: string | null; confirmedState: 'committed' | 'cancelled' | null;
  pending: LocationCreationList['operations'];
}
const initial = (): LocationCreationWorkflowState => ({phase:'loading',busy:true,error:'',capabilities:null,locationId:null,confirmedState:null,pending:[]});
type Auth = { currentSession(): SessionState; sessionGeneration(): number; onSessionBoundary(listener: () => void): () => void };

/** Create is one deliberate action, not an additional approval screen. Retain only its identity
 * before prepare, never retry a mutation, and require sealed cancellation before reapplying a draft. */
export async function openLocationCreationWorkflow(options: {
  auth: Auth; port: ReturnType<typeof createLocationCreationHttpPort>;
  storage: Pick<Storage,'getItem'|'setItem'|'removeItem'>; locks: Pick<LockManager,'request'>; subtle: SubtleCrypto;
  refreshSavedDirectory(): Promise<void>; onChange(value: LocationCreationWorkflowState): void;
  signal?: AbortSignal;
}) {
  const {auth,port}=options, start=auth.currentSession(), uid=start.user?.uid, generation=auth.sessionGeneration();
  let disposed=false, release=()=>{}, unsubscribe=()=>{}, state=initial();
  const check=()=>{const s=auth.currentSession();if(disposed || !uid || s.status!=='authorized' || s.user?.uid!==uid || s.account?.uid!==uid || !['System Administrator','Directory Data Steward','Editor'].includes(s.account.role) || s.account.status!=='Active' || s.account.accessScope!=='Company-wide' || auth.sessionGeneration()!==generation)throw new Error('Sign in again to recover this creation.');};
  const marker=organizationMarkerStore(options.storage,uid??'',check,'creation');
  const publish=(changes:Partial<LocationCreationWorkflowState>)=>{check();state={...state,...changes};options.onChange(structuredClone(state));};
  function dispose(){if(disposed)return;disposed=true;port.dispose();release();unsubscribe();options.signal?.removeEventListener('abort',dispose);}
  const block=(message:string)=>{state={...initial(),phase:'blocked',busy:false,error:message};options.onChange(structuredClone(state));dispose();};
  unsubscribe=auth.onSessionBoundary(()=>block('Your session changed. Sign in again to recover the creation.'));
  options.signal?.addEventListener('abort',dispose,{once:true});
  if(options.signal?.aborted)dispose();
  const settle=async(raw:LocationCreationOutcome)=>{
    check();if(!state.locationId || raw.locationId!==state.locationId || marker.read()!==raw.locationId)throw new Error('Creation identity changed.');
    if(raw.state==='committed'){
      const bytes=await options.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['location-creation-v1',uid,raw.locationId])));check();
      const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
      if(raw.auditId!==`location-creation-${digest}`)throw new Error('Creation confirmation could not be verified.');
    }
    if(raw.state==='committed' || raw.state==='cancelled'){
      publish({phase:'refresh-needed',confirmedState:raw.state});
      await options.refreshSavedDirectory();check();
      const list=await port.list();check();
      marker.resolve(raw.locationId);
      publish({phase:raw.state==='committed'?'saved':list.operations.length?'recovery':state.capabilities?.newCommandsEnabled?'editing':'blocked',locationId:null,pending:list.operations,error:raw.state==='cancelled'&&!list.operations.length&&!state.capabilities?.newCommandsEnabled?'New locations are temporarily paused.':''});
    }else publish({phase:'recovery',error:raw.state==='missing'?'The result is not confirmed. Cancel this creation before trying again.':'This creation was not completed. Cancel it before reapplying your draft.'});
  };
  const run=async(job:()=>Promise<void>)=>{
    check();if(state.busy)throw new Error('A creation action is already running.');publish({busy:true,error:''});
    try{await job();check();}
    catch(e){if(!disposed){if(e instanceof OrganizationTransportError && [401,403].includes(e.status??0))block('Your access changed. Sign in again to recover the creation.');else publish({phase:state.locationId?state.phase==='refresh-needed'?'refresh-needed':'recovery':state.phase,error:e instanceof Error?e.message:'The result could not be confirmed. Check recovery.'});}}
    finally{if(!disposed)publish({busy:false});}
  };
  try{
    // Let a synchronously discarded React effect cancel before requesting a non-waiting lease.
    // This is lifecycle fencing, not a retry or timed wait.
    await Promise.resolve();
    check();const lease=await acquireOrganizationLease(options.locks,uid!,'creation',options.signal);if(disposed){lease();throw new Error('Session changed.');}release=lease;check();
    const capabilities=await port.capabilities();check();const local=marker.read();publish({capabilities,locationId:local});
    if(capabilities.recoveryEnabled){
      const list=await port.list();check();publish({pending:list.operations});
      if(local)await settle(await port.status(local));
      else publish({phase:list.operations.length?'recovery':capabilities.newCommandsEnabled?'editing':'blocked',error:!list.operations.length&&!capabilities.newCommandsEnabled?'New locations are temporarily paused.':''});
    }else publish({phase:local?'recovery':capabilities.legacyCreationEnabled?'legacy':'blocked',error:local?'Recovery is temporarily unavailable. Keep this creation and return later.':capabilities.legacyCreationEnabled?'':'New locations are temporarily paused.'});
    publish({busy:false});
  }catch(e){if(!disposed)block('Store creation is unavailable. Reopen it to check recovery.');throw e;}
  return {snapshot:()=>structuredClone(state),dispose,
    legacy:(save:()=>Promise<void>)=>run(async()=>{
      if(state.phase!=='legacy'||state.locationId||marker.read()||state.pending.length)throw new Error('Recover the existing creation first.');
      const capabilities=await port.capabilities();check();publish({capabilities});
      if(!capabilities.legacyCreationEnabled){publish({phase:'blocked'});throw new Error('Store creation settings changed. Recheck availability before saving.');}
      await save();check();publish({phase:'saved'});
    }),
    create:(command:LocationCreationCommand)=>run(async()=>{
      if(state.phase!=='editing'||!state.capabilities?.newCommandsEnabled||state.locationId||state.pending.length||marker.read())throw new Error('Resolve the existing creation first.');
      if(!isLocationCreationCommand(command))throw new Error('Review the store details before creating it.');
      const frozen=structuredClone(command);marker.persist(frozen.write.id);publish({locationId:frozen.write.id,confirmedState:null});
      const preparation=await port.prepare(frozen);check();
      if(preparation.state==='prepared')await settle(await port.commit(frozen));else await settle(preparation);
    }),
    recover:(locationId:string)=>run(async()=>{
      if(!state.capabilities?.recoveryEnabled)throw new Error('Recovery is temporarily unavailable.');
      marker.persist(locationId);publish({locationId,...(state.locationId!==locationId?{confirmedState:null}:{})});await settle(await port.status(locationId));
    }),
    cancel:(locationId:string)=>run(async()=>{
      if(!state.capabilities?.recoveryEnabled)throw new Error('Recovery is temporarily unavailable.');
      marker.persist(locationId);publish({locationId,...(state.locationId!==locationId?{confirmedState:null}:{})});await settle(await port.cancel(locationId));
    }),
  };
}
